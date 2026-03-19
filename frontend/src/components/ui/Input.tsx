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
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-[#1C1917]">
          {label}
          {props.required && <span className="text-[#F97316] ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#78716C]">
            {leftIcon}
          </div>
        )}
        <input
          id={inputId}
          className={`
            w-full rounded-xl border bg-white px-4 py-2.5 text-[#1C1917]
            placeholder:text-[#A8A29E] text-sm
            focus:outline-none focus:ring-2 focus:ring-[#F97316] focus:border-transparent
            disabled:bg-[#FAFAF9] disabled:opacity-60
            transition-all duration-150
            ${error ? 'border-red-400 focus:ring-red-400' : 'border-[#E7E5E4]'}
            ${leftIcon ? 'pl-10' : ''}
            ${rightIcon ? 'pr-10' : ''}
            ${className}
          `}
          {...props}
        />
        {rightIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#78716C]">
            {rightIcon}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-500 flex items-center gap-1">⚠ {error}</p>}
      {hint && !error && <p className="text-xs text-[#78716C]">{hint}</p>}
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
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-[#1C1917]">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        rows={3}
        className={`
          w-full rounded-xl border bg-white px-4 py-2.5 text-[#1C1917]
          placeholder:text-[#A8A29E] text-sm resize-none
          focus:outline-none focus:ring-2 focus:ring-[#F97316] focus:border-transparent
          disabled:bg-[#FAFAF9] disabled:opacity-60
          transition-all duration-150
          ${error ? 'border-red-400' : 'border-[#E7E5E4]'}
          ${className}
        `}
        {...props}
      />
      {error && <p className="text-xs text-red-500">⚠ {error}</p>}
      {hint && !error && <p className="text-xs text-[#78716C]">{hint}</p>}
    </div>
  );
};
