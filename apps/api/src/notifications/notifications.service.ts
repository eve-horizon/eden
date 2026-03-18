import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService, DbContext } from '../common/database.service';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface Notification {
  id: string;
  org_id: string;
  project_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateNotificationInput {
  project_id: string;
  user_id: string;
  type: string;
  title: string;
  body?: string;
  entity_type?: string;
  entity_id?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class NotificationsService {
  constructor(private readonly db: DatabaseService) {}

  async list(
    ctx: DbContext,
    userId: string,
    limit = 50,
    offset = 0,
  ): Promise<Notification[]> {
    return this.db.query<Notification>(
      ctx,
      `SELECT * FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
  }

  async markRead(ctx: DbContext, id: string): Promise<Notification> {
    return this.db.withClient(ctx, async (client) => {
      const { rows } = await client.query<Notification>(
        `UPDATE notifications SET read = true WHERE id = $1 RETURNING *`,
        [id],
      );
      const notif = rows[0];
      if (!notif) throw new NotFoundException('Notification not found');
      return notif;
    });
  }

  async markAllRead(ctx: DbContext, userId: string): Promise<number> {
    return this.db.withClient(ctx, async (client) => {
      const { rowCount } = await client.query(
        `UPDATE notifications SET read = true WHERE user_id = $1 AND read = false`,
        [userId],
      );
      return rowCount ?? 0;
    });
  }

  /**
   * Create a notification. Intended to be called from other services
   * to alert users of relevant events.
   */
  async createNotification(
    ctx: DbContext,
    input: CreateNotificationInput,
  ): Promise<Notification> {
    return this.db.withClient(ctx, async (client) => {
      const { rows } = await client.query<Notification>(
        `INSERT INTO notifications (org_id, project_id, user_id, type, title, body, entity_type, entity_id)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
        [
          ctx.org_id,
          input.project_id,
          input.user_id,
          input.type,
          input.title,
          input.body ?? null,
          input.entity_type ?? null,
          input.entity_id ?? null,
        ],
      );
      return rows[0];
    });
  }
}
