export const MERCHANT_RECORD_SERVICE = 'merchant_record';
const customerServices = new Set(['logo_pickup', 'item_delivery']);

/** Merchant records hold a request, not an authorized payment or dispatch. */
export function isBookableService(value: unknown): value is 'logo_pickup' | 'item_delivery' {
  return typeof value === 'string' && customerServices.has(value);
}
