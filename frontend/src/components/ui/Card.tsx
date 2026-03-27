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
    sm: 'p-4',
    md: 'p-5',
    lg: 'p-6',
  };

  return (
    <div
      onClick={onClick}
      className={`
        bg-white rounded-3xl transition-all duration-150
        ${paddings[padding]}
        ${hoverable || onClick ? 'cursor-pointer active:scale-[0.99]' : ''}
        ${selected
          ? 'border-2 border-[#E8621A] shadow-[0_4px_20px_rgba(232,98,26,0.12)]'
          : 'shadow-[0_2px_12px_rgba(28,25,23,0.06)]'
        }
        ${className}
      `}
    >
      {children}
    </div>
  );
};
