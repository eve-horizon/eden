import { Injectable, Logger } from '@nestjs/common';
import { ChangesetsService } from '../changesets/changesets.service';
import { DatabaseService, DbContext } from '../common/database.service';

// ---------------------------------------------------------------------------
// WizardReconcileService — heals wizard-orphaned draft changesets
//
// The wizard's auto-accept path runs inside getGenerateStatus(), which is
// only called by the browser polling loop. If the user closes the tab or
// the 10-minute poll cap fires before Eve reaches a terminal phase, the
// agent-written changeset stays in `draft` and the map is empty.
//
// This service runs at the top of MapService.getMap() and reconciles those
// orphans on the next visit. Audit-bounded query → Eve job probe → accept.
// ---------------------------------------------------------------------------

interface OrphanCandidate {
  changeset_id: string;
  job_id: string;
  triggered_at: string;
}

export interface ReconcileResult {
  accepted: string[];
  skipped: string[];
}

@Injectable()
export class WizardReconcileService {
  private readonly logger = new Logger(WizardReconcileService.name);
  private readonly eveApiUrl = process.env.EVE_API_URL;
  private readonly eveServiceToken = process.env.EVE_SERVICE_TOKEN;

  constructor(
    private readonly db: DatabaseService,
    private readonly changesetsService: ChangesetsService,
  ) {}

  /**
   * Reconcile wizard-orphaned drafts on this project.
   *
   * Best-effort and idempotent. Never throws — caller (MapService.getMap)
   * must continue even if every probe fails.
   */
  async reconcileOrphans(
    ctx: DbContext,
    projectId: string,
  ): Promise<ReconcileResult> {
    const result: ReconcileResult = { accepted: [], skipped: [] };

    // Without Eve we can't probe job phase — skip silently.
    if (!this.eveApiUrl) return result;

    let candidates: OrphanCandidate[];
    try {
      candidates = await this.findOrphanCandidates(ctx, projectId);
    } catch (err) {
      this.logger.warn(
        `reconcileOrphans: candidate query failed for project ${projectId}: ${err}`,
      );
      return result;
    }

    if (candidates.length === 0) return result;

    for (const candidate of candidates) {
      try {
        const phase = await this.probeJobPhase(candidate.job_id);
        const isTerminal =
          phase === 'done' || phase === 'cancelled' || phase === 'failed';

        if (!isTerminal) {
          this.logger.debug(
            `reconcileOrphans: skip ${candidate.changeset_id} (job ${candidate.job_id} phase=${phase})`,
          );
          result.skipped.push(candidate.changeset_id);
          continue;
        }

        // Recheck status — another reconcile or in-flight poll may have
        // already accepted it between the candidate query and now.
        const detail = await this.changesetsService.findById(
          ctx,
          candidate.changeset_id,
        );
        if (detail.status !== 'draft') {
          result.skipped.push(candidate.changeset_id);
          continue;
        }

        await this.changesetsService.accept(
          ctx,
          candidate.changeset_id,
          ctx.project_role,
          false,
        );

        // Tag the recovery so analytics can distinguish recovered accepts
        // from in-poll auto-accepts. The accept() call above already wrote
        // an 'accept' audit row; this is a parallel breadcrumb.
        await this.db.withClient(ctx, async (client) => {
          await client.query(
            `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
                  VALUES ($1, $2, 'changeset', $3, 'wizard_orphan_recovered', $4, $5)`,
            [
              ctx.org_id,
              projectId,
              candidate.changeset_id,
              ctx.user_id ?? null,
              JSON.stringify({
                job_id: candidate.job_id,
                job_phase: phase,
                recovered_from: 'wizard-orphan',
              }),
            ],
          );
        });

        this.logger.log(
          `reconcileOrphans: recovered changeset ${candidate.changeset_id} (job ${candidate.job_id}, phase=${phase})`,
        );
        result.accepted.push(candidate.changeset_id);
      } catch (err) {
        this.logger.warn(
          `reconcileOrphans: failed for changeset ${candidate.changeset_id}: ${err}`,
        );
        result.skipped.push(candidate.changeset_id);
      }
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Find wizard-generated drafts on this project that look orphaned:
   *
   * - source = 'map-generator'
   * - status = 'draft'
   * - has at least one item (the agent finished writing)
   * - older than 30 seconds (don't race an in-flight poll)
   * - has a matching `generate_map` audit entry within 15 minutes prior
   *   so we can bind it to the triggering job_id
   *
   * LIMIT 5 caps blast radius if something goes wrong.
   */
  private async findOrphanCandidates(
    ctx: DbContext,
    projectId: string,
  ): Promise<OrphanCandidate[]> {
    return this.db.query<OrphanCandidate>(
      ctx,
      `SELECT c.id                  AS changeset_id,
              a.details->>'job_id'  AS job_id,
              a.created_at          AS triggered_at
         FROM changesets c
         JOIN audit_log a
           ON a.project_id = c.project_id
          AND a.action = 'generate_map'
          AND a.details->>'job_id' IS NOT NULL
          AND a.created_at <= c.created_at
          AND a.created_at >= c.created_at - interval '15 minutes'
        WHERE c.project_id = $1
          AND c.source = 'map-generator'
          AND c.status = 'draft'
          AND EXISTS (SELECT 1 FROM changeset_items WHERE changeset_id = c.id)
          AND c.created_at < now() - interval '30 seconds'
        ORDER BY c.created_at DESC
        LIMIT 5`,
      [projectId],
    );
  }

  private async probeJobPhase(jobId: string): Promise<string | null> {
    if (!this.eveApiUrl) return null;

    const url = `${this.eveApiUrl}/jobs/${jobId}`;
    const headers: Record<string, string> = {};
    if (this.eveServiceToken) {
      headers['Authorization'] = `Bearer ${this.eveServiceToken}`;
    }

    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) {
      throw new Error(`Eve job probe ${jobId} returned ${response.status}`);
    }

    const job = (await response.json()) as { phase?: string };
    return job.phase ?? null;
  }
}
