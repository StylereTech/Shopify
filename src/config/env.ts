import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().default('http://localhost:3000'),
  SHOPIFY_API_KEY: z.string(),
  SHOPIFY_API_SECRET: z.string(),
  SHOPIFY_SCOPES: z.string().default('write_shipping,read_orders,read_locations'),
  STORREE_API_BASE_URL: z.string().url(),
  STORREE_API_KEY: z.string(),
  STORREE_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  STORREE_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/storree_shopify'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_QUEUE_KEY: z.string().default('storree:dispatch:queue'),
  REDIS_DEAD_LETTER_KEY: z.string().default('storree:dispatch:dlq'),
  WORKER_MAX_RETRIES: z.coerce.number().int().min(1).default(3),
  TOKEN_ENCRYPTION_KEY_HEX: z.string().length(64).default('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
  // Admin alert phone for critical dispatch failures (Twilio-format E.164)
  ADMIN_PHONE_NUMBER: z.string().optional(),
  // Twilio credentials for SMS alerts
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional()
});

export const env = schema.parse(process.env);
