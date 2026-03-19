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

/**
 * Get the current local hour in the merchant's timezone.
 * Falls back to UTC if the timezone is invalid.
 */
export function getLocalHourInTimezone(date: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false
    });
    const hourStr = formatter.format(date);
    const hour = parseInt(hourStr, 10);
    // Intl can return '24' at midnight — normalize
    return hour === 24 ? 0 : hour;
  } catch {
    // Fallback to UTC if timezone is bogus
    return date.getUTCHours();
  }
}

export function isServiceWindowOpen(
  requestedAt: Date,
  config: MerchantDeliveryConfig,
  level: DeliveryServiceLevel
): boolean {
  const localHour = getLocalHourInTimezone(requestedAt, config.timezone);
  if (level === 'one_hour') {
    return config.oneHourEnabled && localHour < config.oneHourCutoffHourLocal;
  }
  return config.sameDayEnabled && localHour < config.sameDayCutoffHourLocal;
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
