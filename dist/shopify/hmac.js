import { createHmac, timingSafeEqual } from 'node:crypto';
function sign(secret, value) {
    return createHmac('sha256', secret).update(value).digest('hex');
}
export function canonicalizeQuery(query) {
    return Object.entries(query)
        .filter(([key, value]) => value !== undefined && key !== 'hmac' && key !== 'signature')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join('&');
}
export function verifyShopifyQueryHmac(query, secret) {
    const given = query.hmac;
    if (!given)
        return false;
    const payload = canonicalizeQuery(query);
    const expected = sign(secret, payload);
    const left = Buffer.from(given);
    const right = Buffer.from(expected);
    if (left.length != right.length)
        return false;
    return timingSafeEqual(left, right);
}
export function verifyShopifyWebhookHmac(rawBody, hmacHeader, secret) {
    if (!hmacHeader)
        return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('base64');
    const left = Buffer.from(hmacHeader);
    const right = Buffer.from(expected);
    if (left.length != right.length)
        return false;
    return timingSafeEqual(left, right);
}
