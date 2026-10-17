import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string; error?: string; hint?: string; leftIcon?: ReactNode; rightIcon?: ReactNode;
}
export function Input({ label, error, hint, leftIcon, rightIcon, className = '', id, 'aria-describedby': describedBy, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const detailId = inputId + '-detail';
  return <div className="customer-field">
    {label && <label htmlFor={inputId}>{label}{props.required && <span aria-hidden="true"> *</span>}</label>}
    <div className="customer-input-wrap">{leftIcon && <span aria-hidden="true">{leftIcon}</span>}
      <input {...props} id={inputId} className={className} aria-invalid={error ? true : props['aria-invalid']} aria-describedby={[describedBy, (error || hint) && detailId].filter(Boolean).join(' ') || undefined} />
      {rightIcon && <span aria-hidden="true">{rightIcon}</span>}
    </div>
    {(error || hint) && <p id={detailId} className={error ? 'customer-field-error' : 'customer-muted'}>{error || hint}</p>}
  </div>;
}
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { label?: string; error?: string; hint?: string }
export function Textarea({ label, error, hint, className = '', id, 'aria-describedby': describedBy, ...props }: TextareaProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const detailId = inputId + '-detail';
  return <div className="customer-field">
    {label && <label htmlFor={inputId}>{label}{props.required && <span aria-hidden="true"> *</span>}</label>}
    <textarea rows={3} {...props} id={inputId} className={className} aria-invalid={error ? true : props['aria-invalid']} aria-describedby={[describedBy, (error || hint) && detailId].filter(Boolean).join(' ') || undefined} />
    {(error || hint) && <p id={detailId} className={error ? 'customer-field-error' : 'customer-muted'}>{error || hint}</p>}
  </div>;
}