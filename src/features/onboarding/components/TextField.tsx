import type { InputHTMLAttributes } from 'react';

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

export function TextField({ label, ...props }: TextFieldProps) {
  return (
    <label className="text-field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}
