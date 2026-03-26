import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

// ---------------------------------------------------------------------------
// ChatGatewayService — proxies chat requests to Eve Gateway API
//
// Uses Eve's thread + chat simulate endpoints:
//   List threads:   GET  /projects/:eveProjectId/threads
//   Create thread:  POST /projects/:eveProjectId/chat/simulate
//   Get messages:   GET  /threads/:threadId/messages
//   Send message:   POST /projects/:eveProjectId/chat/simulate (with thread_id)
// ---------------------------------------------------------------------------

export interface SimulateResponse {
  thread_id: string;
  route_id: string;
  target: string;
  job_ids: string[];
  event_id: string;
}

export interface ThreadMessage {
  id: string;
  thread_id: string;
  direction: 'inbound' | 'outbound';
  actor_type: string;
  actor_id: string | null;
  body: string;
  job_id: string | null;
  created_at: string;
}

export interface EveThread {
  id: string;
  project_id: string;
  key: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class ChatGatewayService {
  private readonly logger = new Logger(ChatGatewayService.name);
  private readonly eveApiUrl = process.env.EVE_API_URL;
  private readonly eveProjectId = process.env.EVE_PROJECT_ID;

  private get available(): boolean {
    return Boolean(this.eveApiUrl && this.eveProjectId);
  }

  private assertAvailable(): void {
    if (!this.available) {
      throw new ServiceUnavailableException(
        'Chat requires Eve platform (EVE_API_URL not configured)',
      );
    }
  }

  private async proxy<T>(
    method: string,
    path: string,
    body?: unknown,
    token?: string,
  ): Promise<T> {
    this.assertAvailable();

    const url = `${this.eveApiUrl}${path}`;
    this.logger.debug(`${method} ${url}`);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.warn(`Eve proxy error: ${method} ${path} → ${response.status} ${text}`);
      throw new ServiceUnavailableException(
        `Eve Gateway returned ${response.status}`,
      );
    }

    return response.json() as Promise<T>;
  }

  // -------------------------------------------------------------------------
  // Threads
  // -------------------------------------------------------------------------

  async listThreads(token?: string, edenProjectId?: string): Promise<EveThread[]> {
    const result = await this.proxy<{ threads: EveThread[] }>(
      'GET',
      `/projects/${this.eveProjectId}/threads`,
      undefined,
      token,
    );
    // Filter to user-facing threads for the specific Eden project.
    // Thread keys include the Eden project ID as channel_id:
    //   api:eden-web:<edenProjectId>
    // Exclude internal coordination threads (coord:*).
    return (result.threads ?? []).filter((t) => {
      if (t.key.startsWith('coord:')) return false;
      if (edenProjectId && !t.key.includes(edenProjectId)) return false;
      return true;
    });
  }

  async createThread(
    message: string,
    userId: string,
    email?: string,
    token?: string,
    edenProjectId?: string,
  ): Promise<SimulateResponse> {
    // Include Eden project context so agents know which project to modify
    const context = edenProjectId
      ? `[eden-project:${edenProjectId}] `
      : '';
    return this.proxy<SimulateResponse>(
      'POST',
      `/projects/${this.eveProjectId}/chat/simulate`,
      {
        text: `@eve pm ${context}${message}`,
        team_id: 'eden-web',
        provider: 'api',
        user_id: userId,
        external_email: email,
        // Include Eden project ID as channel_id so the platform thread key
        // is scoped per Eden project: "api:eden-web:<edenProjectId>"
        channel_id: edenProjectId,
      },
      token,
    );
  }

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------

  async listMessages(threadId: string, token?: string): Promise<ThreadMessage[]> {
    const result = await this.proxy<{ messages: ThreadMessage[]; total: number }>(
      'GET',
      `/threads/${threadId}/messages`,
      undefined,
      token,
    );
    return result.messages ?? [];
  }

  async sendMessage(
    threadId: string,
    message: string,
    userId: string,
    email?: string,
    token?: string,
    edenProjectId?: string,
  ): Promise<SimulateResponse> {
    const context = edenProjectId
      ? `[eden-project:${edenProjectId}] `
      : '';
    return this.proxy<SimulateResponse>(
      'POST',
      `/projects/${this.eveProjectId}/chat/simulate`,
      {
        text: `@eve pm ${context}${message}`,
        team_id: 'eden-web',
        provider: 'api',
        user_id: userId,
        external_email: email,
        thread_id: threadId,
        channel_id: edenProjectId,
      },
      token,
    );
  }

  // -------------------------------------------------------------------------
  // Job follow — poll for agent response via job status
  // -------------------------------------------------------------------------

  async getJobStatus(jobId: string, token?: string): Promise<unknown> {
    return this.proxy<unknown>(
      'GET',
      `/jobs/${jobId}`,
      undefined,
      token,
    );
  }
}
