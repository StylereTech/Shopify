const EARTH_RADIUS_KM = 6371;
function toRad(degrees) {
    return (degrees * Math.PI) / 180;
}
export function distanceKm(a, b) {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const x = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
export function isWithinServiceRadius(config, dropoff) {
    return distanceKm(config.pickupLocation, dropoff) <= config.radiusKm;
}
/**
 * Get the current local hour in the merchant's timezone.
 * Falls back to UTC if the timezone is invalid.
 */
export function getLocalHourInTimezone(date, timezone) {
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
    }
    catch {
        // Fallback to UTC if timezone is bogus
        return date.getUTCHours();
    }
}
export function isServiceWindowOpen(requestedAt, config, level) {
    const localHour = getLocalHourInTimezone(requestedAt, config.timezone);
    if (level === 'one_hour') {
        return config.oneHourEnabled && localHour < config.oneHourCutoffHourLocal;
    }
    return config.sameDayEnabled && localHour < config.sameDayCutoffHourLocal;
}
export function determineEligibleLevels(request) {
    if (!request.merchantConfig.isActive) {
        return [];
    }
    if (!isWithinServiceRadius(request.merchantConfig, request.dropoffLocation)) {
        return [];
    }
    return ['one_hour', 'same_day'].filter((level) => isServiceWindowOpen(request.requestedAt, request.merchantConfig, level));
}
