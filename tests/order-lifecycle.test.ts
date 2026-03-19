import { describe, expect, it } from 'vitest';
import { isValidTransition, isStatusRegression, mapProviderStatus } from '../src/domain/order-lifecycle.js';

describe('order lifecycle state machine', () => {
  it('allows valid forward transitions', () => {
    expect(isValidTransition('pending', 'accepted')).toBe(true);
    expect(isValidTransition('accepted', 'driver_assigned')).toBe(true);
    expect(isValidTransition('picked_up', 'delivered')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(isValidTransition('delivered', 'pending')).toBe(false);
    expect(isValidTransition('pending', 'delivered')).toBe(false);
    expect(isValidTransition('canceled', 'accepted')).toBe(false);
  });

  it('allows cancellation from any active state', () => {
    expect(isValidTransition('pending', 'canceled')).toBe(true);
    expect(isValidTransition('picked_up', 'canceled')).toBe(true);
    expect(isValidTransition('en_route_dropoff', 'canceled')).toBe(true);
  });

  it('detects status regressions (out-of-order webhooks)', () => {
    expect(isStatusRegression('delivered', 'picked_up')).toBe(true);
    expect(isStatusRegression('picked_up', 'accepted')).toBe(true);
    expect(isStatusRegression('en_route_dropoff', 'en_route_pickup')).toBe(true);
  });

  it('does not flag non-regression transitions', () => {
    expect(isStatusRegression('pending', 'accepted')).toBe(false);
    expect(isStatusRegression('accepted', 'delivered')).toBe(false);
  });

  it('maps provider status strings to internal statuses', () => {
    expect(mapProviderStatus('accepted')).toBe('accepted');
    expect(mapProviderStatus('picked_up')).toBe('picked_up');
    expect(mapProviderStatus('delivered')).toBe('delivered');
    expect(mapProviderStatus('delivery_cancelled')).toBe('canceled');
    expect(mapProviderStatus('ENROUTE_TO_PICKUP')).toBe('en_route_pickup'); // case-insensitive
  });

  it('returns undefined for unknown provider statuses (fail-closed)', () => {
    expect(mapProviderStatus('unknown_status')).toBeUndefined();
    expect(mapProviderStatus('')).toBeUndefined();
    expect(mapProviderStatus('BOGUS')).toBeUndefined();
  });
});
