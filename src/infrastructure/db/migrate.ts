import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createPostgresPool } from './postgres.js';
import { env } from '../../config/env.js';

async function run(): Promise<void> {
  const pool = createPostgresPool(env.DATABASE_URL);
  const sql = await readFile(path.resolve('src/infrastructure/db/migrations/001_initial_schema.sql'), 'utf8');
  await pool.query(sql);
  await pool.end();
  console.log('Migrations applied');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
