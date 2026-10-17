import { Pool } from 'pg';

export function createPostgresPool(connectionString: string): Pool {
  return new Pool({ connectionString, max: 10, connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000, lock_timeout: 15_000, idleTimeoutMillis: 30_000 });
}
