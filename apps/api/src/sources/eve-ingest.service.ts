import { Injectable, Logger } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Eve Ingest Service — proxies upload lifecycle to Eve's Ingest API
//
// Two-phase protocol:
//   1. create()  → POST /projects/{id}/ingest       → presigned upload URL
//   2. confirm() → POST /projects/{id}/ingest/{id}/confirm → triggers workflow
//
// When EVE_API_URL is not configured, methods return null so callers can
// fall back to local-only behavior (safe for local Docker development).
// ---------------------------------------------------------------------------

export interface EveIngestCreateResponse {
  ingest_id: string;
  upload_url: string;
  upload_method: string;
  upload_expires_at: string;
  max_bytes: number;
  storage_key: string;
}

export interface EveIngestConfirmResponse {
  ingest_id: string;
  status: string;
  event_id: string | null;
  job_id: string | null;
}

export interface EveWorkflowInvokeResponse {
  job_id: string;
  status: string;
  step_jobs?: Array<{
    job_id: string;
    step_name: string;
    depends_on?: string[];
  }>;
}

export interface IngestionWorkflowPayload {
  ingest_id: string;
  file_name: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  storage_key?: string | null;
}

@Injectable()
export class EveIngestService {
  private readonly logger = new Logger(EveIngestService.name);
  private readonly eveApiUrl = process.env.EVE_API_URL;
  private readonly eveProjectId = process.env.EVE_PROJECT_ID;
  private readonly eveServiceToken = process.env.EVE_SERVICE_TOKEN;
  private readonly edenApiUrl = process.env.EDEN_API_URL;

  get available(): boolean {
    return Boolean(this.eveApiUrl && this.eveProjectId);
  }

  /**
   * Create an ingest session in Eve and get a presigned upload URL.
   * Returns null when Eve is not configured (local dev).
   */
  async createIngest(
    filename: string,
    mimeType: string,
    sizeBytes: number,
  ): Promise<EveIngestCreateResponse | null> {
    if (!this.available) {
      this.logger.log(`Ingest (local): create ${filename} — Eve not configured`);
      return null;
    }

    const callbackUrl = this.edenApiUrl
      ? `${this.edenApiUrl}/webhooks/ingest-complete`
      : undefined;

    return this.post<EveIngestCreateResponse>(
      `/projects/${this.eveProjectId}/ingest`,
      {
        file_name: filename,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        source_channel: 'upload',
        ...(callbackUrl ? { callback_url: callbackUrl } : {}),
      },
    );
  }

  /**
   * Confirm an upload and trigger the ingestion-pipeline workflow.
   * Returns null when Eve is not configured (local dev).
   */
  async confirmIngest(
    eveIngestId: string,
    token?: string,
  ): Promise<EveIngestConfirmResponse | null> {
    if (!this.available) {
      this.logger.log(`Ingest (local): confirm ${eveIngestId} — Eve not configured`);
      return null;
    }

    return this.post<EveIngestConfirmResponse>(
      `/projects/${this.eveProjectId}/ingest/${eveIngestId}/confirm`,
      undefined,
      token,
    );
  }

  /**
   * Fallback when confirm() reports success but does not emit an event/job.
   * This invokes the ingestion workflow directly so Eden can still correlate
   * the source to a concrete Eve job instead of leaving it stranded.
   */
  async invokeIngestionWorkflow(
    payload: IngestionWorkflowPayload,
    token?: string,
  ): Promise<EveWorkflowInvokeResponse | null> {
    if (!this.available) {
      this.logger.log(
        `Ingest (local): invoke workflow ${payload.ingest_id} — Eve not configured`,
      );
      return null;
    }

    return this.post<EveWorkflowInvokeResponse>(
      `/projects/${this.eveProjectId}/workflows/ingestion-pipeline/invoke?wait=false`,
      { payload },
      token,
    );
  }

  /**
   * Build the download redirect URL for an ingested file.
   * Eve serves the file via 302 → presigned S3 URL.
   */
  downloadUrl(eveIngestId: string): string | null {
    if (!this.available || !eveIngestId) return null;
    return `${this.eveApiUrl}/projects/${this.eveProjectId}/ingest/${eveIngestId}/download`;
  }

  // -------------------------------------------------------------------------
  // HTTP helper
  // -------------------------------------------------------------------------

  private async post<T>(
    path: string,
    body?: unknown,
    token?: string,
  ): Promise<T> {
    const url = `${this.eveApiUrl}${path}`;
    this.logger.debug(`POST ${url}`);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (this.eveServiceToken) {
      headers['Authorization'] = `Bearer ${this.eveServiceToken}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.error(`Eve ingest error: POST ${path} → ${response.status} ${text}`);
      throw new Error(`Eve ingest API returned ${response.status}: ${text}`);
    }

    return response.json() as Promise<T>;
  }
}
