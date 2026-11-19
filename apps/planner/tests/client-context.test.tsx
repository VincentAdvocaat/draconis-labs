// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES, type PlannerClient, type Task } from '@draconis/shared';
import { newTask } from '@draconis/planner-core';
import App from '../src/App';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function fixture(name: string) {
  const task = newTask({ title: name }, { id: name, now: '2026-11-19T10:00:00.000Z', actorName: 'user', maxTodoPosition: 0 });
  const preferences = { ...DEFAULT_PREFERENCES, locale: 'nl' as const, timezone: 'Europe/Amsterdam', savedViews: [] };
  const client: PlannerClient = {
    workspaceId: 'local', list: vi.fn(async () => [task]), history: vi.fn(async () => []),
    create: vi.fn(async () => task), update: vi.fn(async () => task), remove: vi.fn(async () => undefined),
    preferences: { get: vi.fn(async () => preferences), update: vi.fn(async value => ({ ...preferences, ...value })) },
  };
  return { client, task };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function button(text: string) {
  const found = [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === text);
  if (!found) throw new Error(`Missing button ${text}`);
  return found;
}
async function click(element: Element) {
  await act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
async function editTitle(value: string) {
  const input = document.querySelector('[role="dialog"] input') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('client identity owns all open Planner UI', () => {
  let root: Root;
  beforeEach(() => { document.body.innerHTML = '<div id="test-root"></div>'; root = createRoot(document.getElementById('test-root')!); });
  afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); });
  const openTask = async () => {
    await act(async () => { document.querySelector('.task-card')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
  };

  it('discards an open preference draft when the client changes, including the same workspace ID', async () => {
    const a = fixture('Task A'), b = fixture('Task B');
    await act(async () => root.render(<App client={a.client} />));
    await click(document.querySelector('.prefs-button')!);
    const select = document.querySelector('[role="dialog"] select') as HTMLSelectElement;
    await act(async () => { select.value = 'en'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => root.render(<App client={b.client} />));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(b.client.preferences.update).not.toHaveBeenCalled();
    await click(document.querySelector('.prefs-button')!);
    expect((document.querySelector('[role="dialog"] select') as HTMLSelectElement).value).toBe('nl');
  });

  it.each(['save', 'delete'])('a late %s from A does not close the B editor or lose its draft', async operation => {
    const a = fixture('Task A'), b = fixture('Task B');
    const pending = deferred<Task | void>();
    if (operation === 'save') a.client.update = vi.fn(() => pending.promise as Promise<Task>);
    else a.client.remove = vi.fn(() => pending.promise as Promise<void>);
    await act(async () => root.render(<App client={a.client} />));
    await openTask();
    if (operation === 'save') { await editTitle('Draft A'); await click(button('Opslaan')); }
    else { await click(button('Verwijderen')); await click(button('Definitief verwijderen')); }
    await act(async () => root.render(<App client={b.client} />));
    await openTask();
    await editTitle('Unsaved B');
    await act(async () => pending.resolve(operation === 'save' ? { ...a.task, title: 'Draft A', version: 2 } : undefined));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect((document.querySelector('[role="dialog"] input') as HTMLInputElement).value).toBe('Unsaved B');
    expect(b.client.update).not.toHaveBeenCalled();
    expect(b.client.remove).not.toHaveBeenCalled();
  });
});
