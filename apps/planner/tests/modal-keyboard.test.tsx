// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Modal } from '@draconis/ui';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let opener: HTMLButtonElement;
beforeEach(() => {
  document.body.innerHTML = '<button id="opener">Open</button><div id="root"></div>';
  opener = document.querySelector<HTMLButtonElement>('#opener')!;
  opener.focus();
  root = createRoot(document.getElementById('root')!);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); });
async function render(open = true, onClose = () => {}) {
  await act(async () => root.render(<Modal open={open} onClose={onClose} title="Edit">
    <input aria-label="Title" /><button disabled>Disabled</button><button hidden>Hidden</button><button id="last">Save</button>
  </Modal>));
}
function key(key: string, shiftKey = false) {
  const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
  document.activeElement!.dispatchEvent(event);
  return event;
}
it('wraps Tab and Shift+Tab inside the dialog, including initial panel focus', async () => {
  await render();
  const panel = document.querySelector<HTMLElement>('[role="dialog"]')!;
  const first = panel.querySelector('button')!;
  const last = document.getElementById('last')!;
  expect(document.activeElement).toBe(panel);
  expect(key('Tab').defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(first);
  key('Tab', true);
  expect(document.activeElement).toBe(last);
  key('Tab');
  expect(document.activeElement).toBe(first);
  panel.focus(); key('Tab', true);
  expect(document.activeElement).toBe(last);
});
it('keeps field focus across callback changes and Escape calls the latest callback', async () => {
  const oldClose = vi.fn(), newClose = vi.fn();
  await render(true, oldClose);
  const input = document.querySelector('input')!;
  input.focus();
  await render(true, newClose);
  expect(document.activeElement).toBe(input);
  key('Escape');
  expect(oldClose).not.toHaveBeenCalled();
  expect(newClose).toHaveBeenCalledOnce();
});
it('restores opener focus when closed and when unmounted', async () => {
  await render(); await render(false);
  expect(document.activeElement).toBe(opener);
  await render();
  await act(async () => root.render(null));
  expect(document.activeElement).toBe(opener);
});
it('uses the panel when every control is disabled and tolerates a removed opener', async () => {
  await render();
  opener.remove();
  const panel = document.querySelector<HTMLElement>('[role="dialog"]')!;
  panel.querySelectorAll('button, input').forEach(element => { (element as HTMLButtonElement).disabled = true; });
  expect(key('Tab').defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(panel);
  expect(key('Tab', true).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(panel);
  await render(false);
});
