import { DeliveryServiceLevel, DeliveryQuoteRequest, MerchantDeliveryConfig } from './types.js';

const EARTH_RADIUS_KM = 6371;

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function isWithinServiceRadius(config: MerchantDeliveryConfig, dropoff: { lat: number; lng: number }): boolean {
  return distanceKm(config.pickupLocation, dropoff) <= config.radiusKm;
}

export function isServiceWindowOpen(
  requestedAt: Date,
  config: MerchantDeliveryConfig,
  level: DeliveryServiceLevel
): boolean {
  const hour = requestedAt.getUTCHours();
  if (level === 'one_hour') {
    return config.oneHourEnabled && hour < config.oneHourCutoffHourLocal;
  }
  return config.sameDayEnabled && hour < config.sameDayCutoffHourLocal;
}

export function determineEligibleLevels(request: DeliveryQuoteRequest): DeliveryServiceLevel[] {
  if (!request.merchantConfig.isActive) {
    return [];
  }

  if (!isWithinServiceRadius(request.merchantConfig, request.dropoffLocation)) {
    return [];
  }

  return (['one_hour', 'same_day'] as DeliveryServiceLevel[]).filter((level) =>
    isServiceWindowOpen(request.requestedAt, request.merchantConfig, level)
  );
}
