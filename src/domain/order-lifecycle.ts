/**
 * Order Lifecycle / State Machine
 *
 * Style.re 1.1 parity: single source of truth for valid status transitions.
 * Prevents out-of-order webhook updates from regressing delivery state.
 */

export type DeliveryStatus =
  | 'quoted'
  | 'pending'
  | 'accepted'
  | 'driver_assigned'
  | 'en_route_pickup'
  | 'picked_up'
  | 'en_route_dropoff'
  | 'delivered'
  | 'failed'
  | 'canceled';

/** Valid forward transitions per status */
export const VALID_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  quoted: ['pending', 'canceled'],
  pending: ['accepted', 'failed', 'canceled'],
  accepted: ['driver_assigned', 'en_route_pickup', 'picked_up', 'failed', 'canceled'],
  driver_assigned: ['en_route_pickup', 'picked_up', 'canceled'],
  en_route_pickup: ['picked_up', 'canceled'],
  picked_up: ['en_route_dropoff', 'delivered', 'canceled'],
  en_route_dropoff: ['delivered', 'canceled'],
  delivered: [],
  failed: ['pending'], // watchdog can retry
  canceled: []
};

/** Numeric rank for regression detection */
const STATUS_RANK: Record<DeliveryStatus, number> = {
  quoted: 0,
  pending: 1,
  accepted: 2,
  driver_assigned: 3,
  en_route_pickup: 4,
  picked_up: 5,
  en_route_dropoff: 6,
  delivered: 7,
  failed: -1,
  canceled: -1
};

export function isValidTransition(from: DeliveryStatus, to: DeliveryStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isStatusRegression(current: DeliveryStatus, next: DeliveryStatus): boolean {
  const currentRank = STATUS_RANK[current];
  const nextRank = STATUS_RANK[next];
  if (currentRank < 0 || nextRank < 0) return false; // terminal states skip regression check
  return nextRank < currentRank;
}

/**
 * Map a Storree/DoorDash provider status string to our internal DeliveryStatus.
 * Unknown statuses are rejected (fail-closed).
 */
export function mapProviderStatus(providerStatus: string): DeliveryStatus | undefined {
  const normalized = providerStatus.toLowerCase().trim();
  const mapping: Record<string, DeliveryStatus> = {
    // Storree statuses
    accepted: 'accepted',
    driver_assigned: 'driver_assigned',
    en_route_pickup: 'en_route_pickup',
    enroute_to_pickup: 'en_route_pickup',
    picked_up: 'picked_up',
    en_route_dropoff: 'en_route_dropoff',
    enroute_to_dropoff: 'en_route_dropoff',
    delivered: 'delivered',
    failed: 'failed',
    canceled: 'canceled',
    cancelled: 'canceled',
    // DoorDash statuses
    created: 'accepted',
    confirmed: 'accepted',
    enroute_to_pickup_doordash: 'en_route_pickup',
    picked_up_doordash: 'picked_up',
    enroute_to_dropoff_doordash: 'en_route_dropoff',
    delivered_doordash: 'delivered',
    delivery_cancelled: 'canceled',
    dasher_cancelled: 'canceled'
  };
  return mapping[normalized];
}
