# @draconis/ui accessibility

Core controls follow these keyboard and focus requirements:

## Button

- Native `<button>` elements only (no `div` click targets).
- Visible focus ring via browser default; do not remove `outline` without a replacement.
- `disabled` state blocks activation and shows reduced opacity.

## Modal

- `role="dialog"` and `aria-modal="true"`.
- Title referenced via `aria-labelledby`.
- **Escape** closes the dialog when `onClose` is provided.
- Initial focus moves to the dialog panel on open.
- Backdrop click closes when `closeOnBackdrop` is true (default).

## Topbar

- Navigation uses `<button>` elements for view switching.
- Active tab indicated with `.is-active` class (style + implicit pressed state).

## Future work (E6)

- Full focus trap inside modals.
- `aria-live` regions for async save/error feedback.
- WCAG 2.2 AA audit across composed apps.
