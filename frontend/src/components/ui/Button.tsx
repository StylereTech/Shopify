import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  children,
  disabled,
  className = '',
  ...props
}) => {
  const base = 'inline-flex items-center justify-center font-bold rounded-2xl transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98] min-h-[44px]';

  const variants = {
    primary: 'bg-[#1C1917] hover:bg-[#2C2825] text-white focus:ring-[#1C1917] shadow-[0_4px_16px_rgba(28,25,23,0.18)]',
    secondary: 'bg-white border border-[#EEEBE8] hover:bg-[#FAF9F7] text-[#1C1917] focus:ring-[#E8621A]',
    ghost: 'bg-transparent hover:bg-[#FFF3EE] text-[#E8621A] focus:ring-[#E8621A]',
    danger: 'bg-red-500 hover:bg-red-600 text-white focus:ring-red-500',
  };

  const sizes = {
    sm: 'px-4 py-2 text-[13px] gap-1.5',
    md: 'px-5 py-3 text-[14px] gap-2',
    lg: 'px-7 py-4 text-[15px] gap-2',
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
};
