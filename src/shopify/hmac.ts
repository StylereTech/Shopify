import { createHmac, timingSafeEqual } from 'node:crypto';

function sign(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function canonicalizeQuery(query: Record<string, string | undefined>): string {
  return Object.entries(query)
    .filter(([key, value]) => value !== undefined && key !== 'hmac' && key !== 'signature')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

export function verifyShopifyQueryHmac(query: Record<string, string | undefined>, secret: string): boolean {
  const given = query.hmac;
  if (!given) return false;
  const payload = canonicalizeQuery(query);
  const expected = sign(secret, payload);
  const left = Buffer.from(given);
  const right = Buffer.from(expected);
  if (left.length != right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifyShopifyWebhookHmac(rawBody: Buffer, hmacHeader: string | undefined, secret: string): boolean {
  if (!hmacHeader) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('base64');
  const left = Buffer.from(hmacHeader);
  const right = Buffer.from(expected);
  if (left.length != right.length) return false;
  return timingSafeEqual(left, right);
}
