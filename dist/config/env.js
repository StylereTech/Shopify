import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({
    PORT: z.string().default('3000'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_URL: z.string().default('http://localhost:3000'),
    SHOPIFY_API_KEY: z.string(),
    SHOPIFY_API_SECRET: z.string(),
    SHOPIFY_SCOPES: z.string().default('write_shipping,read_orders,read_locations'),
    // Storree (kept for legacy/test; use DoorDash in prod)
    STORREE_API_BASE_URL: z.string().url().optional().default('https://storree-placeholder.invalid'),
    STORREE_API_KEY: z.string().optional().default('placeholder'),
    STORREE_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    STORREE_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
    // DoorDash Drive credentials
    DOORDASH_DEVELOPER_ID: z.string().optional(),
    DOORDASH_KEY_ID: z.string().optional(),
    DOORDASH_SIGNING_SECRET: z.string().optional(),
    DOORDASH_BASE_URL: z.string().optional().default('https://openapi.doordash.com'),
    // Merchant pickup (used as DoorDash pickup origin when not in merchant config)
    DEFAULT_PICKUP_ADDRESS: z.string().optional(),
    DEFAULT_PICKUP_PHONE: z.string().optional(),
    DEFAULT_PICKUP_NAME: z.string().optional(),
    // Google Maps for geocoding
    GOOGLE_MAPS_API_KEY: z.string().optional(),
    // Stripe
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
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
    TWILIO_FROM_NUMBER: z.string().optional(),
    // Dispatch provider (doordash | storree | fake)
    DISPATCH_PROVIDER: z.enum(['doordash', 'storree', 'fake']).default('doordash'),
    // Merchant platform
    MERCHANT_JWT_SECRET: z.string().optional().default('dev-merchant-jwt-secret-change-in-production'),
    MERCHANT_STRIPE_PRICE_ACCESS: z.string().optional(),
    MERCHANT_STRIPE_PRICE_GROWTH: z.string().optional(),
    FRONTEND_URL: z.string().optional().default('https://stylere-shopify-delivery.vercel.app'),
});
export const env = schema.parse(process.env);
