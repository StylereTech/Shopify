import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  color = '#F97316',
  className = '',
}) => {
  const sizes = { sm: 16, md: 32, lg: 48 };
  const px = sizes[size];

  return (
    <svg
      className={`animate-spin ${className}`}
      width={px}
      height={px}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke={color}
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill={color}
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
};

export const FullPageLoader: React.FC<{ message?: string }> = ({ message }) => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#FAFAF9]">
    <LoadingSpinner size="lg" />
    {message && <p className="text-[#78716C] text-sm">{message}</p>}
  </div>
);
