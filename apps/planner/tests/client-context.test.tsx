// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES, PlannerConflictError, type PlannerClient, type Task, type UserPreferences } from '@draconis/shared';
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
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
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

let root: Root;
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  document.body.innerHTML = '<div id="test-root"></div>';
  root = createRoot(document.getElementById('test-root')!);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
});

describe('Planner startup view', () => {
  it.each(['?q=inspection&page=2', '?q=inspection&page=2&view=unknown'])('loads the saved default view for %s', async (search) => {
    window.history.replaceState(null, '', `/${search}`);
    const { client } = fixture('Task A');
    const pending = deferred<UserPreferences>();
    client.preferences.get = vi.fn(() => pending.promise);
    await act(async () => root.render(<App client={client} />));
    expect(document.querySelector('h1')?.textContent).toBe('Vandaag');
    expect(window.location.search).toBe('?q=inspection&page=2');

    await act(async () => pending.resolve({ ...DEFAULT_PREFERENCES, defaultView: 'scheduled' }));
    expect(document.querySelector('h1')?.textContent).toBe('Gepland');
    expect(window.location.search).toBe('?q=inspection&page=2');
  });

  it('honors a valid URL view before and after preferences load', async () => {
    window.history.replaceState(null, '', '/?view=history');
    const { client } = fixture('Task A');
    const pending = deferred<UserPreferences>();
    client.preferences.get = vi.fn(() => pending.promise);
    await act(async () => root.render(<App client={client} />));
    expect(document.querySelector('h1')?.textContent).toBe('Geschiedenis');

    await act(async () => pending.resolve({ ...DEFAULT_PREFERENCES, defaultView: 'scheduled' }));
    expect(document.querySelector('h1')?.textContent).toBe('Geschiedenis');
    expect(window.location.search).toBe('?view=history');
  });

  it.each([
    ['Geschiedenis', 'history', 'History'],
    ['Vandaag', 'board', 'Today'],
  ])('keeps an explicit click on %s when preferences load late', async (label, view, translatedHeading) => {
    const { client } = fixture('Task A');
    const pending = deferred<UserPreferences>();
    client.preferences.get = vi.fn(() => pending.promise);
    await act(async () => root.render(<App client={client} />));
    await click(button(label));
    expect(window.location.search).toBe(`?view=${view}`);

    await act(async () => pending.resolve({ ...DEFAULT_PREFERENCES, locale: 'en', defaultView: 'scheduled' }));
    expect(document.querySelector('h1')?.textContent).toBe(translatedHeading);
    expect(window.location.search).toBe(`?view=${view}`);
  });

  it('loads the replacement client default and ignores the previous preference response', async () => {
    const a = fixture('Task A'), b = fixture('Task B');
    const pending = deferred<UserPreferences>();
    a.client.preferences.get = vi.fn(() => pending.promise);
    b.client.preferences.get = vi.fn(async () => ({ ...DEFAULT_PREFERENCES, defaultView: 'scheduled' }));
    await act(async () => root.render(<App client={a.client} />));
    await act(async () => root.render(<App client={b.client} />));
    expect(document.querySelector('h1')?.textContent).toBe('Gepland');

    await act(async () => pending.resolve({ ...DEFAULT_PREFERENCES, locale: 'en', defaultView: 'history' }));
    expect(document.querySelector('h1')?.textContent).toBe('Gepland');
    expect(window.location.search).toBe('');
  });
});

describe('client identity owns all open Planner UI', () => {
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

  it('preserves the editor draft after a failed save and saves it on retry', async () => {
    const { client, task } = fixture('Task A');
    client.update = vi.fn<typeof client.update>().mockRejectedValueOnce(new Error('Connection lost'))
      .mockResolvedValueOnce({ ...task, title: 'Saved draft', version: 2 });
    await act(async () => root.render(<App client={client} />));
    await openTask();
    await editTitle('Saved draft');
    await click(button('Opslaan'));
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Connection lost');
    expect(document.querySelector<HTMLInputElement>('[role="dialog"] input')?.value).toBe('Saved draft');
    expect(document.querySelector('.task-card')?.textContent).toContain('Task A');
    await click(button('Opnieuw proberen'));
    expect(client.update).toHaveBeenCalledTimes(2);
    expect(client.update).toHaveBeenLastCalledWith(task.id, expect.objectContaining({ title: 'Saved draft', version: task.version }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('.task-card')?.textContent).toContain('Saved draft');
  });

  it('retries a failed confirmed deletion without sending a task update', async () => {
    const { client, task } = fixture('Task A');
    client.remove = vi.fn<typeof client.remove>().mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce(undefined);
    await act(async () => root.render(<App client={client} />));
    await openTask();
    await click(button('Verwijderen'));
    await click(button('Definitief verwijderen'));
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Connection lost');
    expect(document.querySelector('.task-card')).not.toBeNull();
    await click(button('Opnieuw proberen'));
    expect(client.remove).toHaveBeenCalledTimes(2);
    expect(client.remove).toHaveBeenLastCalledWith(task.id);
    expect(client.update).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('.task-card')).toBeNull();
  });

  it('uses the current version after explicitly loading the server copy', async () => {
    const { client, task } = fixture('Task A');
    const serverTask = { ...task, title: 'Server task', version: 2 };
    client.update = vi.fn<typeof client.update>()
      .mockRejectedValueOnce(new PlannerConflictError({ status: 409, code: 'VERSION_CONFLICT', message: 'Stale version', task: serverTask }))
      .mockResolvedValueOnce({ ...serverTask, title: 'Merged title', version: 3 });
    await act(async () => root.render(<App client={client} />));
    await openTask();
    await editTitle('Draft A');
    await click(button('Opslaan'));
    expect(document.querySelector<HTMLInputElement>('[role="dialog"] input')?.value).toBe('Draft A');
    await click(document.querySelector('.editor-error-actions button')!);
    expect(document.querySelector<HTMLInputElement>('[role="dialog"] input')?.value).toBe('Server task');
    await editTitle('Merged title');
    await click(button('Opslaan'));
    expect(client.update).toHaveBeenLastCalledWith(task.id, expect.objectContaining({ title: 'Merged title', version: 2 }));
    expect(document.querySelector('.task-card')?.textContent).toContain('Merged title');
  });

  it('waits for the owned update before another change to the same card', async () => {
    const { client, task } = fixture('Task A');
    const pending = deferred<Task>();
    client.update = vi.fn(() => pending.promise);
    await act(async () => root.render(<App client={client} />));
    const moveRight = async () => {
      await act(async () => {
        document.querySelector('.task-card')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }));
      });
    };
    await moveRight();
    await moveRight();
    expect(client.update).toHaveBeenCalledOnce();
    expect(client.update).toHaveBeenCalledWith(task.id, { lane: 'doing', version: task.version });
    expect(document.body.textContent).toContain('Deze kaart wordt nog bijgewerkt.');
    await act(async () => pending.reject(new Error('Move failed')));
    await moveRight();
    expect(client.update).toHaveBeenCalledTimes(2);
    expect(client.update).toHaveBeenLastCalledWith(task.id, { lane: 'doing', version: task.version });
  });

  it('keeps a separate card update after a concurrent editor save fails', async () => {
    const { client, task } = fixture('Task A');
    const other = fixture('Task B').task;
    const moved = { ...other, title: 'Task B (updated)', lane: 'doing' as const, version: 2 };
    const move = deferred<Task>();
    const save = deferred<Task>();
    client.list = vi.fn<typeof client.list>().mockResolvedValueOnce([task, other]).mockResolvedValue([task, moved]);
    client.update = vi.fn((id) => (id === other.id ? move.promise : save.promise));
    await act(async () => root.render(<App client={client} />));
    const secondCard = document.querySelectorAll('.task-card')[1];
    await act(async () => {
      secondCard.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }));
    });
    await openTask();
    await editTitle('Draft A');
    await click(button('Opslaan'));
    expect(client.update).toHaveBeenCalledTimes(2);
    await act(async () => move.resolve(moved));
    await act(async () => save.reject(new Error('Save failed')));
    const cards = [...document.querySelectorAll('.task-card')].map(card => card.textContent);
    expect(cards.some(text => text?.includes('Task B (updated)'))).toBe(true);
    expect(cards.some(text => text?.includes('Task A'))).toBe(true);
    expect(document.querySelector<HTMLInputElement>('[role="dialog"] input')?.value).toBe('Draft A');
  });
});
