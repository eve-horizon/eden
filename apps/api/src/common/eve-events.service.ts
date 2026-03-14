import { Injectable, Logger } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Eve Events Service
//
// Emits app.* events to Eve's event spine. In production, these events are
// consumed by workflows and agents. When EVE_API_URL is not configured, events
// are logged but not sent (safe for local development).
// ---------------------------------------------------------------------------

@Injectable()
export class EveEventsService {
  private readonly logger = new Logger(EveEventsService.name);
  private readonly eveApiUrl = process.env.EVE_API_URL;
  private readonly eveProjectId = process.env.EVE_PROJECT_ID;
  private readonly eveServiceToken = process.env.EVE_SERVICE_TOKEN;

  async emit(event: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.eveApiUrl || !this.eveProjectId) {
      this.logger.log(`Event (local): ${event} ${JSON.stringify(payload)}`);
      return;
    }

    const url = `${this.eveApiUrl}/projects/${this.eveProjectId}/events`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.eveServiceToken
            ? { Authorization: `Bearer ${this.eveServiceToken}` }
            : {}),
        },
        body: JSON.stringify({
          type: event,
          source: 'app',
          payload_json: payload,
        }),
      });

      if (!response.ok) {
        this.logger.warn(
          `Event emit failed: ${event} → ${response.status} ${response.statusText}`,
        );
      } else {
        this.logger.log(`Event emitted: ${event}`);
      }
    } catch (err) {
      this.logger.warn(`Event emit error: ${event} → ${(err as Error).message}`);
    }
  }
}
