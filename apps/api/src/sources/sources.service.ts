import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService, DbContext } from '../common/database.service';
import { EveIngestService } from './eve-ingest.service';

// ---------------------------------------------------------------------------
// Row type — mirrors the ingestion_sources DB table
// ---------------------------------------------------------------------------

export interface IngestionSourceRow {
  id: string;
  org_id: string;
  project_id: string;
  filename: string;
  storage_key: string | null;
  status: string;
  content_type: string | null;
  eve_ingest_id: string | null;
  eve_job_id: string | null;
  file_size: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceResponse extends IngestionSourceRow {
  download_url: string | null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class SourcesService {
  private readonly logger = new Logger(SourcesService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly eveIngest: EveIngestService,
  ) {}

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  async list(ctx: DbContext, projectId: string): Promise<SourceResponse[]> {
    const rows = await this.db.query<IngestionSourceRow>(
      ctx,
      `SELECT * FROM ingestion_sources
        WHERE project_id = $1
        ORDER BY created_at DESC`,
      [projectId],
    );
    return rows.map((r) => this.toResponse(r));
  }

  async findById(ctx: DbContext, id: string): Promise<SourceResponse> {
    const source = await this.db.queryOne<IngestionSourceRow>(
      ctx,
      'SELECT * FROM ingestion_sources WHERE id = $1',
      [id],
    );

    if (!source) {
      throw new NotFoundException(`Source ${id} not found`);
    }

    return this.toResponse(source);
  }

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  async create(
    ctx: DbContext,
    projectId: string,
    input: { filename: string; content_type?: string; file_size?: number },
  ): Promise<SourceResponse & { upload_url: string }> {
    // Call Eve ingest API first — get presigned upload URL and ingest ID.
    // When Eve is not configured (local dev), returns null and we skip.
    // If the Eve API fails, continue anyway — the source is still useful locally.
    let eveResult: Awaited<ReturnType<typeof this.eveIngest.createIngest>>;
    try {
      eveResult = await this.eveIngest.createIngest(
        input.filename,
        input.content_type ?? 'application/octet-stream',
        input.file_size ?? 0,
      );
    } catch (err) {
      this.logger.error(`Eve ingest create failed: ${(err as Error).message}`);
      eveResult = null;
    }

    return this.db.withClient(ctx, async (client) => {
      const result = await client.query<IngestionSourceRow>(
        `INSERT INTO ingestion_sources
              (org_id, project_id, filename, content_type, file_size, status,
               eve_ingest_id, storage_key)
         VALUES ($1, $2, $3, $4, $5, 'uploaded', $6, $7)
         RETURNING *`,
        [
          ctx.org_id,
          projectId,
          input.filename,
          input.content_type ?? null,
          input.file_size ?? null,
          eveResult?.ingest_id ?? null,
          eveResult?.storage_key ?? null,
        ],
      );

      const source = result.rows[0];

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'ingestion_source', $3, 'create', $4, $5)`,
        [
          ctx.org_id,
          projectId,
          source.id,
          ctx.user_id ?? null,
          JSON.stringify({
            filename: input.filename,
            eve_ingest_id: eveResult?.ingest_id ?? null,
          }),
        ],
      );

      const upload_url = eveResult?.upload_url ?? `data:,placeholder-${source.id}`;

      return { ...this.toResponse(source), upload_url };
    });
  }

  async confirm(
    ctx: DbContext,
    id: string,
    eveToken?: string,
  ): Promise<SourceResponse> {
    return this.db.withClient(ctx, async (client) => {
      const result = await client.query<IngestionSourceRow>(
        `UPDATE ingestion_sources
            SET status = 'processing'
          WHERE id = $1 AND status = 'uploaded'
          RETURNING *`,
        [id],
      );

      const source = result.rows[0];
      if (!source) {
        throw new NotFoundException(
          `Source ${id} not found or not in 'uploaded' status`,
        );
      }

      // Confirm with Eve to trigger the ingestion-pipeline workflow.
      // Eve emits system.doc.ingest which the orchestrator picks up.
      if (source.eve_ingest_id) {
        try {
          const eveResult = await this.eveIngest.confirmIngest(
            source.eve_ingest_id,
            eveToken,
          );
          if (eveResult?.job_id) {
            await client.query(
              `UPDATE ingestion_sources SET eve_job_id = $1 WHERE id = $2`,
              [eveResult.job_id, id],
            );
            source.eve_job_id = eveResult.job_id;
          } else if (eveResult?.status === 'done' && !eveResult.event_id) {
            this.logger.warn(
              `Eve confirm returned done without event/job for source ${id}; emitting fallback doc.ingest event`,
            );

            const fallback = await this.eveIngest.emitDocIngestEvent(
              {
                org_id: source.org_id,
                ingest_id: source.eve_ingest_id,
                file_name: source.filename,
                mime_type: source.content_type,
                size_bytes: source.file_size,
                storage_key: source.storage_key,
              },
              eveToken,
            );

            const fallbackJobId = fallback?.job_id
              ?? (fallback?.id
                ? await this.waitForEventJob(fallback.id, eveToken)
                : null);

            if (fallbackJobId) {
              await client.query(
                `UPDATE ingestion_sources SET eve_job_id = $1 WHERE id = $2`,
                [fallbackJobId, id],
              );
              source.eve_job_id = fallbackJobId;
            } else {
              this.logger.warn(
                `Fallback doc.ingest event returned no job for source ${id}`,
              );
            }
          }
        } catch (err) {
          this.logger.error(`Eve confirm failed for source ${id}: ${(err as Error).message}`);
          // Don't block the confirm — status is already 'processing'.
          // The callback will update status when Eve catches up.
        }
      }

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'ingestion_source', $3, 'confirm', $4, $5)`,
        [
          source.org_id,
          source.project_id,
          source.id,
          ctx.user_id ?? null,
          JSON.stringify({
            status: 'processing',
            eve_job_id: source.eve_job_id,
          }),
        ],
      );

      return this.toResponse(source);
    });
  }

  async updateStatus(
    ctx: DbContext,
    id: string,
    status: string,
    extra?: { eve_job_id?: string; error_message?: string },
  ): Promise<SourceResponse> {
    return this.db.withClient(ctx, async (client) => {
      const setClauses = ['status = $2'];
      const params: unknown[] = [id, status];

      if (extra?.eve_job_id !== undefined) {
        params.push(extra.eve_job_id);
        setClauses.push(`eve_job_id = $${params.length}`);
      }
      if (extra?.error_message !== undefined) {
        params.push(extra.error_message);
        setClauses.push(`error_message = $${params.length}`);
      }

      const result = await client.query<IngestionSourceRow>(
        `UPDATE ingestion_sources
            SET ${setClauses.join(', ')}
          WHERE id = $1
          RETURNING *`,
        params,
      );

      const source = result.rows[0];
      if (!source) {
        throw new NotFoundException(`Source ${id} not found`);
      }

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'ingestion_source', $3, 'update_status', $4, $5)`,
        [
          source.org_id,
          source.project_id,
          source.id,
          ctx.user_id ?? null,
          JSON.stringify({ status, ...extra }),
        ],
      );

      return this.toResponse(source);
    });
  }

  /**
   * List tasks created from a specific source document.
   */
  async listTasks(
    ctx: DbContext,
    sourceId: string,
  ): Promise<
    { id: string; display_id: string; title: string; priority: string; status: string }[]
  > {
    return this.db.query(
      ctx,
      `SELECT id, display_id, title, priority, status
         FROM tasks
        WHERE source_id = $1
        ORDER BY created_at`,
      [sourceId],
    );
  }

  /**
   * Find a source by its Eve ingest ID (used by the callback webhook).
   * Uses a direct query without RLS since callbacks arrive without org context.
   */
  async findByEveIngestId(
    eveIngestId: string,
  ): Promise<IngestionSourceRow | null> {
    const rows = await this.db.queryDirect<IngestionSourceRow>(
      'SELECT * FROM ingestion_sources WHERE eve_ingest_id = $1',
      [eveIngestId],
    );
    return rows[0] ?? null;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private toResponse(row: IngestionSourceRow): SourceResponse {
    return {
      ...row,
      download_url: row.eve_ingest_id
        ? this.eveIngest.downloadUrl(row.eve_ingest_id)
        : null,
    };
  }

  private async waitForEventJob(
    eventId: string,
    eveToken?: string,
  ): Promise<string | null> {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const event = await this.eveIngest.getEvent(eventId, eveToken);
      if (event?.job_id) {
        return event.job_id;
      }

      if (event?.status === 'failed') {
        return null;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return null;
  }
}
