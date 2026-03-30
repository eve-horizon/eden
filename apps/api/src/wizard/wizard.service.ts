import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ChangesetsService } from '../changesets/changesets.service';
import { DatabaseService, DbContext } from '../common/database.service';
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

    // Validate source_id belongs to this project
    let sourceExcerpt: string | undefined;
    if (data.source_id) {
      const source = await this.sourcesService.findById(ctx, data.source_id);
      if (source.project_id !== projectId) {
        throw new NotFoundException(`Source ${data.source_id} not found`);
      }

      // For text-like files, fetch content and inline into prompt
      sourceExcerpt = await this.fetchSourceExcerpt(source);
    }

    this.assertAvailable();

    // Build the prompt for the map-generator agent
    const prompt = this.buildPrompt(project.name, projectId, data, sourceExcerpt);

    // Create Eve job targeting map-generator agent
    const result = await this.proxy<{ id: string }>(
      'POST',
      `/projects/${this.eveProjectId}/jobs`,
      {
        assignee: 'map-generator',
        title: `Generate map: ${project.name}`,
        description: prompt,
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
            ...(data.source_id && { source_id: data.source_id }),
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
  // Source content fetching (for prompt enrichment)
  // -------------------------------------------------------------------------

  private async fetchSourceExcerpt(source: {
    download_url: string | null;
    content_type: string | null;
    filename: string;
  }): Promise<string | undefined> {
    // Only inline text-like files into the prompt
    const textTypes = ['text/plain', 'text/markdown', 'text/x-markdown'];
    const textExtensions = ['.md', '.txt', '.markdown'];
    const isTextLike =
      textTypes.includes(source.content_type ?? '') ||
      textExtensions.some((ext) => source.filename.toLowerCase().endsWith(ext));

    if (!isTextLike || !source.download_url) return undefined;

    try {
      const headers: Record<string, string> = {};
      if (this.eveServiceToken) {
        headers['Authorization'] = `Bearer ${this.eveServiceToken}`;
      }

      const response = await fetch(source.download_url, {
        headers,
        redirect: 'follow',
      });
      if (!response.ok) return undefined;

      const text = await response.text();
      // Limit to ~8KB to keep the prompt reasonable
      const maxLen = 8 * 1024;
      return text.length > maxLen
        ? text.slice(0, maxLen) + '\n\n[...truncated]'
        : text;
    } catch (err) {
      this.logger.warn(`Failed to fetch source content: ${err}`);
      return undefined;
    }
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

    if (sourceExcerpt) {
      parts.push(`\nAttached document excerpt:\n"""\n${sourceExcerpt}\n"""`);
    }

    parts.push(
      `\nCreate a changeset with: 3-5 personas, 4-6 activities, 2-3 steps per activity, 1-2 tasks per step (brief user stories), and 5-8 questions.`,
    );

    return parts.join('\n');
  }
}
