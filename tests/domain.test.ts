import { describe, expect, it } from 'vitest';
import { quoteDeliveryOptions } from '../src/domain/pricing.js';
import { determineEligibleLevels } from '../src/domain/serviceability.js';
import { MerchantDeliveryConfig } from '../src/domain/types.js';

const config: MerchantDeliveryConfig = {
  merchantId: 'm-1',
  shopDomain: 'demo.myshopify.com',
  storreeMerchantId: 'storree-1',
  pickupLocation: { lat: 40.7128, lng: -74.006 },
  radiusKm: 12,
  oneHourEnabled: true,
  sameDayEnabled: true,
  oneHourCutoffHourLocal: 23,
  sameDayCutoffHourLocal: 23,
  baseFeeCents: 500,
  pricePerKmCents: 125,
  platformMarkupPercent: 5,
  timezone: 'UTC',
  isActive: true
};

describe('serviceability + pricing', () => {
  it('returns both one-hour and same-day levels when eligible', () => {
    const request = {
      merchantConfig: config,
      dropoffLocation: { lat: 40.73061, lng: -73.935242 },
      orderSubtotalCents: 10000,
      requestedAt: new Date('2024-01-01T10:00:00Z')
    };

    const levels = determineEligibleLevels(request);
    expect(levels).toEqual(['one_hour', 'same_day']);

    const quotes = quoteDeliveryOptions(request);
    expect(quotes).toHaveLength(2);
    expect(quotes[0].feeCents).toBeGreaterThan(0);
  });

  it('returns no options when outside radius', () => {
    const quotes = quoteDeliveryOptions({
      merchantConfig: config,
      dropoffLocation: { lat: 41.7128, lng: -74.006 },
      orderSubtotalCents: 3000,
      requestedAt: new Date('2024-01-01T10:00:00Z')
    });
    expect(quotes).toEqual([]);
  });
});
