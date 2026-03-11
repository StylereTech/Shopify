import { Pool } from 'pg';

export function createPostgresPool(connectionString: string): Pool {
  return new Pool({ connectionString });
}
