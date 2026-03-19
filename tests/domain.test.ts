import { describe, expect, it } from 'vitest';
import { quoteDeliveryOptions } from '../src/domain/pricing.js';
import { determineEligibleLevels, getLocalHourInTimezone, isServiceWindowOpen } from '../src/domain/serviceability.js';
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

  it('uses merchant timezone for cutoff (not UTC)', () => {
    // 22:00 UTC = 17:00 Eastern (America/New_York)
    const nyConfig: MerchantDeliveryConfig = {
      ...config,
      timezone: 'America/New_York',
      oneHourCutoffHourLocal: 18, // cutoff at 6pm Eastern
      sameDayCutoffHourLocal: 18
    };
    const requestAt22UTC = new Date('2024-06-01T22:00:00Z'); // 18:00 Eastern (DST) → cutoff edge

    // At exactly 18:00 local (22 UTC in summer), we're NOT before 18 → closed
    const localHour = getLocalHourInTimezone(requestAt22UTC, 'America/New_York');
    // In summer EST (UTC-4), 22 UTC = 18 local — exactly at cutoff hour
    expect(localHour).toBe(18);

    const windowOpen = isServiceWindowOpen(new Date('2024-06-01T21:00:00Z'), nyConfig, 'one_hour');
    // 21 UTC = 17 Eastern — should be open (17 < 18)
    expect(windowOpen).toBe(true);

    const windowClosed = isServiceWindowOpen(requestAt22UTC, nyConfig, 'one_hour');
    // 22 UTC = 18 Eastern — NOT open (18 < 18 = false)
    expect(windowClosed).toBe(false);
  });

  it('falls back gracefully when timezone is invalid', () => {
    const invalidTzConfig: MerchantDeliveryConfig = { ...config, timezone: 'Invalid/Timezone' };
    // Should not throw — falls back to UTC
    const result = determineEligibleLevels({
      merchantConfig: invalidTzConfig,
      dropoffLocation: { lat: 40.73061, lng: -73.935242 },
      orderSubtotalCents: 1000,
      requestedAt: new Date('2024-01-01T10:00:00Z')
    });
    expect(Array.isArray(result)).toBe(true);
  });
});
