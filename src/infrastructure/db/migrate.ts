import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createPostgresPool } from './postgres.js';
import { env } from '../../config/env.js';

async function run(): Promise<void> {
  const pool = createPostgresPool(env.DATABASE_URL);

  // Ensure migrations tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // Support both dev (src/) and prod (dist/) paths
  const migrationsDir = path.resolve(
    process.env.NODE_ENV === 'production'
      ? 'dist/infrastructure/db/migrations'
      : 'src/infrastructure/db/migrations'
  );
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

  const { rows: applied } = await pool.query<{ version: string }>('SELECT version FROM schema_migrations');
  const appliedSet = new Set(applied.map((r: { version: string }) => r.version));

  let count = 0;
  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`[migrate] Skipping ${file} (already applied)`);
      continue;
    }

    const sql = await readFile(path.join(migrationsDir, file), 'utf8');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[migrate] Applied ${file}`);
      count++;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  await pool.end();
  console.log(`Migrations complete. ${count} new migration(s) applied.`);
}

run().catch((error) => {
  console.error('[migrate] Error:', error);
  process.exit(1);
});
