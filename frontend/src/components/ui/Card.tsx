import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
  hoverable?: boolean;
  selected?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  padding = 'md',
  onClick,
  hoverable = false,
  selected = false,
}) => {
  const paddings = {
    none: '',
    sm: 'p-3',
    md: 'p-5',
    lg: 'p-7',
  };

  return (
    <div
      onClick={onClick}
      className={`
        bg-white rounded-2xl border transition-all duration-150
        ${paddings[padding]}
        ${hoverable || onClick ? 'cursor-pointer hover:shadow-md hover:border-[#F97316]/40' : 'shadow-sm'}
        ${selected ? 'border-[#F97316] ring-2 ring-[#F97316]/20 shadow-md' : 'border-[#E7E5E4]'}
        ${className}
      `}
    >
      {children}
    </div>
  );
};
