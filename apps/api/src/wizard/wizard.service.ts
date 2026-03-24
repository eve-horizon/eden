import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DatabaseService, DbContext } from '../common/database.service';

// ---------------------------------------------------------------------------
// WizardService — creates Eve jobs for AI-driven story map generation
//
// The map-generator agent receives a structured prompt with project context,
// generates a full story map, and writes it as a changeset. The wizard
// tracks the job lifecycle: create → poll → find resulting changeset.
// ---------------------------------------------------------------------------

export interface GenerateMapInput {
  description?: string;
  audience?: string;
  capabilities?: string;
  constraints?: string;
}

@Injectable()
export class WizardService {
  private readonly logger = new Logger(WizardService.name);
  private readonly eveApiUrl = process.env.EVE_API_URL;
  private readonly eveProjectId = process.env.EVE_PROJECT_ID;
  private readonly eveServiceToken = process.env.EVE_SERVICE_TOKEN;

  constructor(private readonly db: DatabaseService) {}

  // -------------------------------------------------------------------------
  // Generate map — kick off Eve job
  // -------------------------------------------------------------------------

  /**
   * Create an Eve job to generate a story map structure.
   * The map-generator agent will create a changeset with personas,
   * activities, steps, tasks, and questions.
   */
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

    // At least a description is required to generate a meaningful map
    if (
      !data.description?.trim() &&
      !data.audience?.trim() &&
      !data.capabilities?.trim()
    ) {
      throw new BadRequestException(
        'At least one of description, audience, or capabilities is required',
      );
    }

    this.assertAvailable();

    // Build the prompt for the map-generator agent
    const prompt = this.buildPrompt(project.name, data);

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
          JSON.stringify({ job_id: result.id }),
        ],
      );
    });

    return { job_id: result.id };
  }

  // -------------------------------------------------------------------------
  // Poll status — check Eve job + find resulting changeset
  // -------------------------------------------------------------------------

  /**
   * Poll the status of a map generation job.
   */
  async getGenerateStatus(
    ctx: DbContext,
    projectId: string,
    jobId: string,
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
      // Prefer source='map-generator', fall back to any draft changeset with items
      // created after the job's audit log entry (wizard always logs generate_map).
      let changeset = await this.db.queryOne<{ id: string }>(
        ctx,
        `SELECT id FROM changesets
         WHERE project_id = $1 AND source = 'map-generator'
         ORDER BY created_at DESC LIMIT 1`,
        [projectId],
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

      return {
        status: 'complete',
        changeset_id: changeset?.id,
      };
    }

    if (job.phase === 'cancelled') {
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
    data: GenerateMapInput,
  ): string {
    const parts = [
      `Generate an initial story map for the project "${projectName}".`,
    ];

    if (data.description) {
      parts.push(`\nProject description: ${data.description}`);
    }
    if (data.audience) {
      parts.push(`\nTarget audience / personas: ${data.audience}`);
    }
    if (data.capabilities) {
      parts.push(`\nKey capabilities / goals: ${data.capabilities}`);
    }
    if (data.constraints) {
      parts.push(`\nConstraints or requirements: ${data.constraints}`);
    }

    parts.push(
      `\nCreate a comprehensive story map as a changeset. Include 3-6 personas, 4-8 activities, 2-5 steps per activity, 1-3 tasks per step (with user stories and acceptance criteria), and 5-10 clarifying questions.`,
    );

    return parts.join('\n');
  }
}
