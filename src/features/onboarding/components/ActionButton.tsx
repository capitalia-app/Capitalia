import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type ActionButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'ghost';
  }
>;

export function ActionButton({
  children,
  className = '',
  variant = 'primary',
  ...props
}: ActionButtonProps) {
  return (
    <button className={`action-button action-button--${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
