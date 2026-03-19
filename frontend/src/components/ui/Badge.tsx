import React from 'react';
import type { OrderStatus } from '../../types';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'orange' | 'green' | 'blue' | 'yellow' | 'red' | 'gray';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'orange',
  size = 'sm',
}) => {
  const variants = {
    orange: 'bg-[#FED7AA] text-[#C2410C]',
    green: 'bg-green-100 text-green-800',
    blue: 'bg-blue-100 text-blue-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    red: 'bg-red-100 text-red-800',
    gray: 'bg-stone-100 text-stone-600',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
  };

  return (
    <span className={`inline-flex items-center font-medium rounded-full ${variants[variant]} ${sizes[size]}`}>
      {children}
    </span>
  );
};

export function statusBadge(status: OrderStatus): React.ReactElement {
  const map: Record<OrderStatus, { label: string; variant: BadgeProps['variant'] }> = {
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
