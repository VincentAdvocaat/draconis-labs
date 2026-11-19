import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button.js';

function hasHiddenDisplayAncestor(element: HTMLElement, panel: HTMLElement): boolean {
  for (let current: HTMLElement | null = element; current && current !== panel; current = current.parentElement) {
    if (getComputedStyle(current).display === 'none') return true;
  }
  return false;
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
  size?: 'md' | 'lg';
  closeOnBackdrop?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  closeLabel = 'Close',
  size = 'md',
  closeOnBackdrop = true,
}: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]',
      )].filter(element => element.tabIndex >= 0 && !element.matches(':disabled, input[type="hidden"]') &&
        !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
        getComputedStyle(element).visibility !== 'hidden' &&
        !hasHiddenDisplayAncestor(element, panel));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!first || !panel.contains(active) || active === panel ||
          (event.shiftKey ? active === first : active === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
        if (!first) panel.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="dr-modal-backdrop"
      role="presentation"
      onMouseDown={() => { if (closeOnBackdrop) onClose(); }}
    >
      <div
        ref={panelRef}
        className={`dr-modal dr-modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dr-modal__heading">
          <div>
            {eyebrow ? <span className="dr-eyebrow">{eyebrow}</span> : null}
            <h2 id={titleId}>{title}</h2>
          </div>
          <Button variant="icon" onClick={onClose} aria-label={closeLabel}>×</Button>
        </div>
        <div className="dr-modal__body">{children}</div>
        {footer ? <div className="dr-modal__footer">{footer}</div> : null}
      </div>
    </div>
  );
}
