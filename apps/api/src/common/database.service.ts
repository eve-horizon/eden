import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { pool } from '../db';

import type { Pool, PoolClient, QueryResultRow } from 'pg';

// ---------------------------------------------------------------------------
// Context passed to every DB operation — drives RLS via set_config
// ---------------------------------------------------------------------------

export interface DbContext {
  org_id: string;
  user_id?: string;
  /**
   * Resolved project role for this request: 'owner' | 'editor' | 'viewer' | null.
   * `null` means the role is unknown (non-project route or agent bypass).
   * Set by ProjectRoleMiddleware via dbContext() and read by services that
   * need to honor two-stage approval (owner vs editor).
   */
  project_role?: string | null;
}

// ---------------------------------------------------------------------------
// RLS-aware database service
//
// Every query runs inside a transaction that first calls
//   SET LOCAL app.org_id = $org_id
// so Postgres RLS policies see the caller's org. The setting is local to the
// transaction and automatically cleared on COMMIT/ROLLBACK — no risk of
// leaking across pooled connections.
// ---------------------------------------------------------------------------

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool = pool;

  async onModuleDestroy() {
    await this.pool.end();
  }

  /**
   * Acquire a connection, open a transaction with RLS context, run the
   * callback, then COMMIT (or ROLLBACK on error). The caller never touches
   * the raw pool or worries about connection lifecycle.
   */
  async withClient<T>(
    ctx: DbContext,
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.org_id', $1, true)", [
        ctx.org_id,
      ]);
      if (ctx.user_id) {
        await client.query("SELECT set_config('app.user_id', $1, true)", [
          ctx.user_id,
        ]);
      }
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Run a parameterised query inside an RLS-scoped transaction.
   * Returns all matching rows.
   */
  async query<T extends QueryResultRow = QueryResultRow>(
    ctx: DbContext,
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    return this.withClient(ctx, async (client) => {
      const result = await client.query<T>(sql, params);
      return result.rows;
    });
  }

  /**
   * Run a parameterised query and return the first row, or null.
   */
  async queryOne<T extends QueryResultRow = QueryResultRow>(
    ctx: DbContext,
    sql: string,
    params: unknown[] = [],
  ): Promise<T | null> {
    const rows = await this.query<T>(ctx, sql, params);
    return rows[0] ?? null;
  }

  /**
   * Run a query without RLS context — for system-level operations like
   * webhook callbacks where there is no user/org scope. The table owner
   * bypasses RLS by default (no FORCE ROW LEVEL SECURITY).
   */
  async queryDirect<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<T>(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  }
}
