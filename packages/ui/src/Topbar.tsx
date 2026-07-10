import type { ReactNode } from 'react';

export interface TopbarProps {
  brand: ReactNode;
  nav?: ReactNode;
  actions?: ReactNode;
}

export function Topbar({ brand, nav, actions }: TopbarProps) {
  return (
    <header className="dr-topbar">
      <div className="dr-topbar__brand">{brand}</div>
      {nav ? <nav className="dr-topbar__nav">{nav}</nav> : null}
      <div className="dr-topbar__actions">{actions}</div>
    </header>
  );
}

export interface TopbarNavItemProps {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

export function TopbarNavItem({ active = false, onClick, children }: TopbarNavItemProps) {
  return (
    <button type="button" className={active ? 'is-active' : ''} onClick={onClick}>
      {children}
    </button>
  );
}

export function TopbarBrand({
  mark,
  title,
  subtitle,
}: {
  mark: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="dr-topbar-brand">
      <div className="dr-topbar-brand__mark">{mark}</div>
      <div className="dr-topbar-brand__text">
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
    </div>
  );
}
