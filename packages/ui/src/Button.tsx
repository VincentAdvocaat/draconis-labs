import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'dr-btn dr-btn--primary',
  secondary: 'dr-btn dr-btn--secondary',
  danger: 'dr-btn dr-btn--danger',
  ghost: 'dr-btn dr-btn--ghost',
  icon: 'dr-btn dr-btn--icon',
};

export function Button({
  variant = 'secondary',
  className = '',
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={`${variantClass[variant]} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
