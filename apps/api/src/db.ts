import { Pool } from 'pg';

// ---------------------------------------------------------------------------
// Connection pool
// ---------------------------------------------------------------------------

const databaseUrl = process.env.DATABASE_URL;
const isLocal =
  databaseUrl?.includes('localhost') || databaseUrl?.includes('127.0.0.1');

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// ---------------------------------------------------------------------------
// Startup health check
// ---------------------------------------------------------------------------

export interface DbStatus {
  connected: boolean;
  version?: string;
  error?: string;
}

export async function getDbStatus(): Promise<DbStatus> {
  try {
    const result = await pool.query<{ version: string }>(
      'SELECT version() AS version',
    );
    return { connected: true, version: result.rows[0]?.version };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { connected: false, error: message };
  }
}
