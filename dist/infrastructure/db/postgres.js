import { Pool } from 'pg';
export function createPostgresPool(connectionString) {
    return new Pool({ connectionString });
}
