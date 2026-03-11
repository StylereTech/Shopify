import { DeliveryQuote, DeliveryQuoteRequest } from './types.js';
import { determineEligibleLevels, distanceKm } from './serviceability.js';

function levelMultiplier(level: 'one_hour' | 'same_day'): number {
  return level === 'one_hour' ? 1.5 : 1;
}

function etaMinutesFor(level: 'one_hour' | 'same_day', km: number): number {
  if (level === 'one_hour') {
    return Math.min(60, Math.max(25, Math.round(km * 6)));
  }
  return Math.min(360, Math.max(90, Math.round(km * 15)));
}

export function quoteDeliveryOptions(request: DeliveryQuoteRequest): DeliveryQuote[] {
  const levels = determineEligibleLevels(request);
  const km = distanceKm(request.merchantConfig.pickupLocation, request.dropoffLocation);

  return levels.map((serviceLevel) => {
    const variable = request.merchantConfig.pricePerKmCents * km * levelMultiplier(serviceLevel);
    const markup = 1 + request.merchantConfig.platformMarkupPercent / 100;
    const feeCents = Math.round((request.merchantConfig.baseFeeCents + variable) * markup);
    return {
      serviceLevel,
      feeCents,
      etaMinutes: etaMinutesFor(serviceLevel, km),
      message:
        serviceLevel === 'one_hour'
          ? `Arrives in approximately ${etaMinutesFor(serviceLevel, km)} minutes`
          : 'Delivered today within the same business day'
    };
  });
}
