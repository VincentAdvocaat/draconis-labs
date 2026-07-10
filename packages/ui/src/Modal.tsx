import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button.js';

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

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

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
