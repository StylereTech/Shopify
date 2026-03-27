import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-[13px] font-semibold text-[#1C1917]">
          {label}
          {props.required && <span className="text-[#E8621A] ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#78716C]">
            {leftIcon}
          </div>
        )}
        <input
          id={inputId}
          className={`
            w-full rounded-2xl border bg-white px-4 py-3 text-[#1C1917] text-[14px]
            placeholder:text-[#C4BFB9]
            focus:outline-none focus:border-[#E8621A] focus:ring-2 focus:ring-[#E8621A]/10
            disabled:bg-[#FAF9F7] disabled:opacity-60
            transition-all duration-150 min-h-[48px]
            ${error ? 'border-red-400 focus:border-red-400 focus:ring-red-400/10' : 'border-[#EEEBE8]'}
            ${leftIcon ? 'pl-11' : ''}
            ${rightIcon ? 'pr-11' : ''}
            ${className}
          `}
          {...props}
        />
        {rightIcon && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#78716C]">
            {rightIcon}
          </div>
        )}
      </div>
      {error && (
        <p className="text-[12px] text-red-500 flex items-center gap-1 font-medium">
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </p>
      )}
      {hint && !error && <p className="text-[12px] text-[#A8A29E]">{hint}</p>}
    </div>
  );
};

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea: React.FC<TextareaProps> = ({
  label,
  error,
  hint,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-[13px] font-semibold text-[#1C1917]">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        rows={3}
        className={`
          w-full rounded-2xl border bg-white px-4 py-3 text-[#1C1917] text-[14px]
          placeholder:text-[#C4BFB9] resize-none
          focus:outline-none focus:border-[#E8621A] focus:ring-2 focus:ring-[#E8621A]/10
          disabled:bg-[#FAF9F7] disabled:opacity-60
          transition-all duration-150
          ${error ? 'border-red-400' : 'border-[#EEEBE8]'}
          ${className}
        `}
        {...props}
      />
      {error && <p className="text-[12px] text-red-500 font-medium">⚠ {error}</p>}
      {hint && !error && <p className="text-[12px] text-[#A8A29E]">{hint}</p>}
    </div>
  );
};
