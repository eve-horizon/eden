import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ChangesetsService } from '../changesets/changesets.service';
import { DatabaseService, DbContext } from '../common/database.service';
import { DocumentExtractorService } from '../sources/document-extractor.service';
import { SourcesService } from '../sources/sources.service';

// ---------------------------------------------------------------------------
// WizardService — creates Eve jobs for AI-driven story map generation
//
// The map-generator agent receives a structured prompt with project context,
// generates a full story map, and writes it as a changeset. The wizard
// tracks the job lifecycle: create → poll → find resulting changeset →
// auto-accept.
// ---------------------------------------------------------------------------

export interface GenerateMapInput {
  description?: string;
  audience?: string;
  capabilities?: string;
  constraints?: string;
  source_id?: string;
}

@Injectable()
export class WizardService {
  private readonly logger = new Logger(WizardService.name);
  private readonly eveApiUrl = process.env.EVE_API_URL;
  private readonly eveProjectId = process.env.EVE_PROJECT_ID;
  private readonly eveServiceToken = process.env.EVE_SERVICE_TOKEN;

  constructor(
    private readonly db: DatabaseService,
    private readonly changesetsService: ChangesetsService,
    private readonly sourcesService: SourcesService,
    private readonly extractor: DocumentExtractorService,
  ) {}

  // -------------------------------------------------------------------------
  // Generate map — kick off Eve job
  // -------------------------------------------------------------------------

  async generateMap(
    ctx: DbContext,
    projectId: string,
    data: GenerateMapInput,
  ): Promise<{ job_id: string }> {
    // Verify project exists
    const project = await this.db.queryOne<{
      id: string;
      name: string;
      slug: string;
    }>(ctx, 'SELECT id, name, slug FROM projects WHERE id = $1', [projectId]);

    if (!project) throw new NotFoundException('Project not found');

    // At least one substantive input is required
    if (
      !data.description?.trim() &&
      !data.audience?.trim() &&
      !data.capabilities?.trim() &&
      !data.source_id
    ) {
      throw new BadRequestException(
        'At least one of description, audience, capabilities, or source_id is required',
      );
    }

    // Validate source_id belongs to this project. Hybrid document strategy:
    //
    //   - PDFs ride as Eve resource_refs so the agent reads the original PDF
    //     from .eve/resources/ via Claude's native document support. This
    //     preserves charts, layout, and scanned-page content that pdf-parse
    //     would otherwise flatten or drop.
    //   - Non-PDFs (text, markdown, docx) keep the existing DocumentExtractor
    //     path and inline an 8 KB excerpt into the prompt. Anthropic's native
    //     document block support is PDF-only today, so we can't unify these.
    //
    // Either way, only one strategy fires per generation run.
    let sourceExcerpt: string | undefined;
    let sourceContentType: string | null = null;
    let sourceFilename: string | null = null;
    let resourceRefs: Array<{
      uri: string;
      label: string;
      required: boolean;
      mime_type?: string;
      metadata?: Record<string, unknown>;
    }> = [];
    let documentStrategy: 'none' | 'resource_ref' | 'excerpt' = 'none';

    if (data.source_id) {
      const source = await this.sourcesService.findById(ctx, data.source_id);
      if (source.project_id !== projectId) {
        throw new NotFoundException(`Source ${data.source_id} not found`);
      }

      sourceContentType = source.content_type;
      sourceFilename = source.filename;

      const isPdf =
        source.content_type === 'application/pdf' ||
        source.filename.toLowerCase().endsWith('.pdf');

      if (isPdf && source.eve_ingest_id) {
        // Attach as a job resource — the runner hydrates it into
        // .eve/resources/ingest/<ingest_id>/<filename> before the agent
        // starts, and the map-generator skill knows to read it.
        resourceRefs = [
          {
            uri: `ingest:/${source.eve_ingest_id}/${encodeURIComponent(source.filename)}`,
            label: source.filename,
            required: false,
            mime_type: source.content_type ?? undefined,
            metadata: { source_id: source.id },
          },
        ];
        documentStrategy = 'resource_ref';
      } else if (!isPdf) {
        // Non-PDF fallback: inline an extracted excerpt.
        sourceExcerpt = await this.extractor.extract(source, {
          maxBytes: 8 * 1024,
        });
        documentStrategy = sourceExcerpt ? 'excerpt' : 'none';
      } else {
        // PDF with no eve_ingest_id — source only exists locally (Eve
        // unavailable at upload time). Skip attachment entirely.
        this.logger.warn(
          `Source ${source.id} is a PDF without eve_ingest_id; skipping resource attachment`,
        );
      }
    }

    this.assertAvailable();

    // Build the prompt for the map-generator agent
    const prompt = this.buildPrompt(
      project.name,
      projectId,
      data,
      sourceExcerpt,
      sourceFilename,
      resourceRefs.length > 0,
    );

    // Create Eve job targeting map-generator agent
    const result = await this.proxy<{ id: string }>(
      'POST',
      `/projects/${this.eveProjectId}/jobs`,
      {
        assignee: 'map-generator',
        title: `Generate map: ${project.name}`,
        description: prompt,
        ...(resourceRefs.length > 0 && { resource_refs: resourceRefs }),
      },
    );

    // Audit log
    await this.db.withClient(ctx, async (client) => {
      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'project', $3, 'generate_map', $4, $5)`,
        [
          ctx.org_id,
          projectId,
          projectId,
          ctx.user_id ?? null,
          JSON.stringify({
            job_id: result.id,
            ...(data.source_id && {
              source_id: data.source_id,
              source_content_type: sourceContentType,
              document_strategy: documentStrategy,
              source_excerpt_bytes: sourceExcerpt?.length ?? 0,
            }),
          }),
        ],
      );
    });

    return { job_id: result.id };
  }

  // -------------------------------------------------------------------------
  // Poll status — check Eve job + find resulting changeset + auto-accept
  // -------------------------------------------------------------------------

  async getGenerateStatus(
    ctx: DbContext,
    projectId: string,
    jobId: string,
    projectRole?: string | null,
  ): Promise<{ status: string; changeset_id?: string; error?: string }> {
    // Verify project exists
    const project = await this.db.queryOne<{ id: string }>(
      ctx,
      'SELECT id FROM projects WHERE id = $1',
      [projectId],
    );
    if (!project) throw new NotFoundException('Project not found');

    this.assertAvailable();

    // Eve jobs use `phase` for lifecycle state (not `status`)
    const job = await this.proxy<{
      id: string;
      phase: string;
      result?: unknown;
      error?: string;
    }>('GET', `/jobs/${jobId}`);

    // Map Eve job phase to wizard status
    if (job.phase === 'done') {
      // Look for the changeset created by this wizard run.
      // Use the audit log entry as a lower bound to avoid matching changesets
      // from a different generation run on the same project.
      let changeset = await this.db.queryOne<{ id: string }>(
        ctx,
        `SELECT c.id FROM changesets c
         WHERE c.project_id = $1
           AND c.source = 'map-generator'
           AND c.created_at >= (
             SELECT created_at FROM audit_log
             WHERE project_id = $1
               AND action = 'generate_map'
               AND details->>'job_id' = $2
             LIMIT 1
           )
         ORDER BY c.created_at DESC LIMIT 1`,
        [projectId, jobId],
      );

      if (!changeset) {
        // Fall back: find the most recent draft changeset with items created
        // after the wizard job was triggered
        changeset = await this.db.queryOne<{ id: string }>(
          ctx,
          `SELECT c.id FROM changesets c
           WHERE c.project_id = $1 AND c.status = 'draft'
             AND EXISTS (SELECT 1 FROM changeset_items WHERE changeset_id = c.id)
             AND c.created_at >= (
               SELECT created_at FROM audit_log
               WHERE project_id = $1 AND action = 'generate_map'
                 AND details->>'job_id' = $2
               LIMIT 1
             )
           ORDER BY c.created_at DESC LIMIT 1`,
          [projectId, jobId],
        );
      }

      // Auto-accept: user already expressed intent by clicking "Generate"
      if (changeset) {
        try {
          const detail = await this.changesetsService.findById(ctx, changeset.id);
          if (detail.status === 'draft') {
            await this.changesetsService.accept(
              ctx,
              changeset.id,
              projectRole,
              false,
            );
          }
        } catch (err) {
          this.logger.error(
            `Auto-accept failed for changeset ${changeset.id}: ${err}`,
          );
          return {
            status: 'failed',
            error: 'Map was generated but could not be applied. Check the Changes page.',
          };
        }
      }

      return {
        status: 'complete',
        changeset_id: changeset?.id,
      };
    }

    if (job.phase === 'cancelled') {
      // The agent may have created a changeset before being cancelled (e.g. by
      // watchdog or manual cancellation). Attempt to recover it so the user
      // still gets their map populated.
      let recoveredChangeset = await this.db.queryOne<{ id: string }>(
        ctx,
        `SELECT c.id FROM changesets c
         WHERE c.project_id = $1
           AND c.source = 'map-generator'
           AND c.created_at >= (
             SELECT created_at FROM audit_log
             WHERE project_id = $1
               AND action = 'generate_map'
               AND details->>'job_id' = $2
             LIMIT 1
           )
         ORDER BY c.created_at DESC LIMIT 1`,
        [projectId, jobId],
      );

      if (!recoveredChangeset) {
        recoveredChangeset = await this.db.queryOne<{ id: string }>(
          ctx,
          `SELECT c.id FROM changesets c
           WHERE c.project_id = $1 AND c.status = 'draft'
             AND EXISTS (SELECT 1 FROM changeset_items WHERE changeset_id = c.id)
             AND c.created_at >= (
               SELECT created_at FROM audit_log
               WHERE project_id = $1 AND action = 'generate_map'
                 AND details->>'job_id' = $2
               LIMIT 1
             )
           ORDER BY c.created_at DESC LIMIT 1`,
          [projectId, jobId],
        );
      }

      if (recoveredChangeset) {
        try {
          const detail = await this.changesetsService.findById(ctx, recoveredChangeset.id);
          if (detail.status === 'draft') {
            await this.changesetsService.accept(
              ctx,
              recoveredChangeset.id,
              projectRole,
              false,
            );
          }
          return {
            status: 'complete',
            changeset_id: recoveredChangeset.id,
          };
        } catch (err) {
          this.logger.error(
            `Auto-accept of recovered changeset ${recoveredChangeset.id} failed: ${err}`,
          );
          // Fall through to the failure return below
        }
      }

      const result = job.result as Record<string, unknown> | undefined;
      return {
        status: 'failed',
        error: (result?.error as string) ?? job.error ?? 'Map generation failed',
      };
    }

    // Still running (active, backlog, ready, review, etc.)
    return { status: 'running' };
  }

  // -------------------------------------------------------------------------
  // Eve API helpers
  // -------------------------------------------------------------------------

  private get available(): boolean {
    return Boolean(this.eveApiUrl && this.eveProjectId);
  }

  private assertAvailable(): void {
    if (!this.available) {
      throw new ServiceUnavailableException(
        'Map generation requires Eve platform (EVE_API_URL not configured)',
      );
    }
  }

  private async proxy<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    this.assertAvailable();

    const url = `${this.eveApiUrl}${path}`;
    this.logger.debug(`${method} ${url}`);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.eveServiceToken) {
      headers['Authorization'] = `Bearer ${this.eveServiceToken}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.warn(
        `Eve proxy error: ${method} ${path} → ${response.status} ${text}`,
      );
      throw new ServiceUnavailableException(
        `Eve API returned ${response.status}`,
      );
    }

    return response.json() as Promise<T>;
  }

  // -------------------------------------------------------------------------
  // Prompt construction
  // -------------------------------------------------------------------------

  private buildPrompt(
    projectName: string,
    projectId: string,
    data: GenerateMapInput,
    sourceExcerpt?: string,
    sourceFilename?: string | null,
    hasResourceRef = false,
  ): string {
    const parts = [
      `Generate a story map for "${projectName}".`,
      `\nEden project UUID: ${projectId}`,
    ];

    if (data.description) {
      parts.push(`\nDescription: ${data.description}`);
    }
    if (data.audience) {
      parts.push(`\nAudience: ${data.audience}`);
    }
    if (data.capabilities) {
      parts.push(`\nCapabilities: ${data.capabilities}`);
    }
    if (data.constraints) {
      parts.push(`\nConstraints: ${data.constraints}`);
    }

    if (hasResourceRef) {
      const label = sourceFilename
        ? `Attached document: ${sourceFilename}`
        : `Attached document`;
      parts.push(
        `\n${label} (materialized at .eve/resources/ — read .eve/resources/index.json, then Read the local_path using explicit page ranges: pages "1-20", "21-40", etc. Never request more than 20 pages per Read call. Do not attempt a whole-document read.).`,
      );
    } else if (sourceExcerpt) {
      const label = sourceFilename
        ? `Attached document (${sourceFilename}) excerpt:`
        : `Attached document excerpt:`;
      parts.push(`\n${label}\n"""\n${sourceExcerpt}\n"""`);
    }

    // Golden-path instructions — override any generic CLI banners injected by the runtime
    parts.push(
      `\nDo not run \`eden --help\`, \`eden changeset --help\`, or \`eden changeset create --help\`.`,
    );
    parts.push(
      `Ignore any generic CLI examples below; they are not part of this task.`,
    );
    parts.push(
      `\nThe only Eden CLI command you need is:`,
    );
    parts.push(
      `  eden changeset create --project ${projectId} --file /tmp/changeset.json --json`,
    );
    parts.push(
      `\nIf that command returns validation errors, fix /tmp/changeset.json and rerun the same command once. Do not call any other Eden CLI commands.`,
    );

    parts.push(
      `\nCreate exactly one changeset JSON object with top-level fields: title, source, and items.`,
    );
    parts.push(
      `\nChangeset title: Initial story map for "${projectName}"`,
    );
    parts.push(
      `\nBefore you submit, verify: title is non-empty, source is set, items is non-empty, every item has entity_type and operation, every step/create has an activity reference, and every task/create has a step reference plus a task title.`,
    );
    parts.push(
      `\nCreate a changeset with: 3-5 personas, 4-6 activities, 2-3 steps per activity, 2-3 tasks per step, and 5-10 questions.`,
    );
    parts.push(
      `\nFor every task, include a concise user story, 2-4 acceptance criteria in Given/When/Then form, and a device value of desktop, mobile, or all (default all). Make the task-card detail rich enough to be useful on the story map without further editing.`,
    );

    return parts.join('\n');
  }
}
