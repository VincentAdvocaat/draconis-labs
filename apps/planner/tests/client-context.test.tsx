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
  await editInput(input, value);
}
async function editInput(input: HTMLInputElement, value: string) {
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

describe('Planner planning and saved filters', () => {
  it.each([
    ['nl', 'werk, persoonlijk'],
    ['en', 'work, personal'],
  ] as const)('uses localized label examples in the %s task editor', async (locale, placeholder) => {
    const { client } = fixture('Task A');
    client.preferences.get = vi.fn(async () => ({ ...DEFAULT_PREFERENCES, locale }));
    await act(async () => root.render(<App client={client} />));
    await act(async () => document.querySelector('.task-card')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(document.querySelector(`[role="dialog"] input[placeholder="${placeholder}"]`)).not.toBeNull();
  });

  it('preserves the active view and a failed draft while storing, applying, renaming and deleting filters', async () => {
    const { client } = fixture('Task A');
    window.history.replaceState(null, '', '/?view=scheduled&lane=doing');
    let preferences = await client.preferences.get();
    client.preferences.update = vi.fn<typeof client.preferences.update>()
      .mockRejectedValueOnce(new Error('Opslag tijdelijk onbereikbaar'))
      .mockImplementation(async (update) => {
        preferences = { ...preferences, ...update };
        return preferences;
      });
    await act(async () => root.render(<App client={client} />));
    await click(button('Geavanceerde filters'));
    const name = document.querySelector<HTMLInputElement>('input[placeholder="Naam van view"]')!;
    await editInput(name, 'Onderweg');
    await click(button('View opslaan'));
    expect(document.querySelector('.error-banner')?.textContent).toContain('Opslag tijdelijk onbereikbaar');
    expect(name.value).toBe('Onderweg');
    await click(button('View opslaan'));
    expect(document.querySelector('.timeline')).not.toBeNull();
    expect(name.value).toBe('');
    expect(client.preferences.update).toHaveBeenLastCalledWith({
      savedViews: [expect.objectContaining({ name: 'Onderweg', filter: expect.objectContaining({ lane: 'doing' }) })],
    });

    const lane = document.querySelector<HTMLSelectElement>('.filter-grid select')!;
    await act(async () => { lane.value = ''; lane.dispatchEvent(new Event('change', { bubbles: true })); });
    await click(button('Onderweg'));
    expect(lane.value).toBe('doing');
    expect(client.list).toHaveBeenLastCalledWith(expect.objectContaining({ lane: 'doing', page: 1 }));
    await click(button('Hernoemen'));
    await editInput(document.querySelector<HTMLInputElement>('.saved-view-row input')!, 'In uitvoering');
    await click(button('Opslaan'));
    expect(button('In uitvoering')).toBeTruthy();
    await click(button('Verwijderen'));
    expect(document.querySelector('.saved-view-row')).toBeNull();
    expect(client.preferences.update).toHaveBeenLastCalledWith({ savedViews: [] });
    expect(new URLSearchParams(window.location.search).get('view')).toBe('scheduled');
  });

  it('indicates an overdue task and saves independent planned date, due date and time from the editor', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-20T10:00:00.000Z'));
    try {
      const { client, task } = fixture('Inspectie op afspraak');
      const overdue = { ...task, dueDate: '2026-11-20', dueTime: '10:30', timezone: 'Europe/Amsterdam' };
      client.list = vi.fn(async () => [overdue]);
      client.update = vi.fn(async (_id, changes) => ({ ...overdue, ...changes, version: 2 }));
      await act(async () => root.render(<App client={client} />));
      expect(document.querySelector('.task-card .overdue-pill')?.textContent).toBe('Te laat');
      await act(async () => document.querySelector('.task-card')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
      const dates = document.querySelectorAll<HTMLInputElement>('[role="dialog"] input[type="date"]');
      const time = document.querySelector<HTMLInputElement>('[role="dialog"] input[type="time"]')!;
      expect(dates[1].value).toBe('2026-11-20');
      expect(time.value).toBe('10:30');
      await editInput(dates[0], '2026-11-19');
      await editInput(dates[1], '2026-11-21');
      await editInput(time, '14:45');
      await click(button('Opslaan'));
      expect(client.update).toHaveBeenCalledWith(task.id, expect.objectContaining({
        plannedDate: '2026-11-19', dueDate: '2026-11-21', dueTime: '14:45', timezone: 'Europe/Amsterdam',
      }));
      expect(document.querySelector('.task-card .overdue-pill')).toBeNull();
    } finally { vi.useRealTimers(); }
  });
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

  it('shows a pending save and keeps the editor open until the update resolves', async () => {
    const { client, task } = fixture('Task A');
    const save = deferred<Task>();
    client.update = vi.fn(() => save.promise);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      await act(async () => root.render(<App client={client} />));
      await openTask();
      await editTitle('Draft A');
      await click(button('Opslaan'));

      expect(button('Opslaan…').disabled).toBe(true);
      expect(button('Verwijderen').disabled).toBe(true);
      expect(button('Annuleren').disabled).toBe(true);
      expect(document.querySelector<HTMLInputElement>('[role="dialog"] input')?.disabled).toBe(true);
      await act(async () => {
        document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      expect(confirm).not.toHaveBeenCalled();
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      expect(client.update).toHaveBeenCalledOnce();
      await act(async () => save.resolve({ ...task, title: 'Draft A', version: 2 }));
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    } finally { confirm.mockRestore(); }
  });

  it('names the selected card and deletes only after explicit confirmation', async () => {
    const { client, task } = fixture('Inspectie 17');
    await act(async () => root.render(<App client={client} />));
    await openTask();
    await click(button('Verwijderen'));
    expect(document.querySelector('.delete-confirm')?.textContent).toContain('«Inspectie 17»');
    expect(client.remove).not.toHaveBeenCalled();

    await click(button('Annuleren'));
    expect(document.querySelector('.delete-confirm')).toBeNull();
    expect(document.querySelector('.task-card')).not.toBeNull();
    expect(client.remove).not.toHaveBeenCalled();

    await click(button('Verwijderen'));
    await click(button('Definitief verwijderen'));
    expect(client.remove).toHaveBeenCalledExactlyOnceWith(task.id);
    expect(document.querySelector('.task-card')).toBeNull();
  });

  it('prompts before discarding a dirty draft and leaves it intact when dismissed', async () => {
    const { client } = fixture('Task A');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    try {
      await act(async () => root.render(<App client={client} />));
      await openTask();
      await click(button('Annuleren'));
      expect(confirm).not.toHaveBeenCalled();

      await openTask();
      await editTitle('Unsaved A');
      await click(button('Annuleren'));
      expect(confirm).toHaveBeenCalledWith('Je hebt ongeslagen wijzigingen. Sluiten zonder opslaan?');
      expect(document.querySelector<HTMLInputElement>('[role="dialog"] input')?.value).toBe('Unsaved A');
      await click(button('Annuleren'));
      expect(confirm).toHaveBeenCalledTimes(2);
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(document.querySelector('.task-card')?.textContent).toContain('Task A');
      expect(client.update).not.toHaveBeenCalled();
    } finally { confirm.mockRestore(); }
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

  it('keeps writes enabled when a lane update finishes after reconnect refresh', async () => {
    const { client, task } = fixture('Task A');
    const pending = deferred<Task>();
    const moved = { ...task, lane: 'doing' as const, version: 2 };
    client.update = vi.fn(() => pending.promise);
    await act(async () => root.render(<App client={client} refreshVersion={1} />));
    await act(async () => {
      document.querySelector('.task-card')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }));
    });
    expect(client.update).toHaveBeenCalledOnce();

    client.list = vi.fn(async () => [moved]);
    await act(async () => root.render(<App client={client} refreshVersion={2} />));
    expect(document.querySelector<HTMLButtonElement>('.quick-add button')?.disabled).toBe(false);
    await act(async () => pending.resolve(moved));
    expect(document.querySelector<HTMLButtonElement>('.quick-add button')?.disabled).toBe(false);
    await editInput(document.querySelector<HTMLInputElement>('.quick-add input')!, 'After reconnect');
    await click(document.querySelector('.quick-add button')!);
    expect(client.create).toHaveBeenCalledOnce();
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
