import React from 'react';
import type { OrderStatus } from '../../types';
import { Badge } from './Badge';

export function statusBadge(status: OrderStatus): React.ReactElement {
  const map: Record<OrderStatus, { label: string; variant: 'orange' | 'green' | 'blue' | 'yellow' | 'red' | 'gray' }> = {
    pending: { label: 'Pending', variant: 'yellow' },
    confirmed: { label: 'Confirmed', variant: 'blue' },
    assigned: { label: 'Assigned', variant: 'blue' },
    picked_up: { label: 'Picked Up', variant: 'orange' },
    in_transit: { label: 'In Transit', variant: 'orange' },
    delivered: { label: 'Delivered', variant: 'green' },
    cancelled: { label: 'Cancelled', variant: 'red' },
    failed: { label: 'Failed', variant: 'red' },
  };

  const { label, variant } = map[status] ?? { label: status, variant: 'gray' };
  return <Badge variant={variant}>{label}</Badge>;
}
