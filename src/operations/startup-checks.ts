import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { Logger } from '../observability/logger.js';
import { StorreeClient } from '../infrastructure/storree/storree-client.js';

export interface StartupCheckResult {
  dbOk: boolean;
  redisOk: boolean;
  storreeOk: boolean;
}

export async function runStartupChecks(
  pool: Pool,
  redis: Redis,
  storreeClient: StorreeClient,
  logger: Logger,
  mode: 'api' | 'worker'
): Promise<StartupCheckResult> {
  let dbOk = false;
  let redisOk = false;
  let storreeOk = false;

  try {
    await pool.query('SELECT 1');
    dbOk = true;
  } catch (error) {
    logger.error('Startup DB check failed', { mode, error: String(error) });
  }

  try {
    const pong = await redis.ping();
    redisOk = pong === 'PONG';
  } catch (error) {
    logger.error('Startup Redis check failed', { mode, error: String(error) });
  }

  try {
    storreeOk = await storreeClient.checkConnectivity();
    if (!storreeOk) {
      logger.error('Startup Storree connectivity check failed', { mode });
    }
  } catch (error) {
    logger.error('Startup Storree check errored', { mode, error: String(error) });
  }

  logger.info('Startup checks complete', { mode, dbOk, redisOk, storreeOk });
  return { dbOk, redisOk, storreeOk };
}
