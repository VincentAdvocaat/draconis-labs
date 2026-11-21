import { expect, it, vi } from 'vitest';
import { createBrowserConnection } from '../src/browser-connection';

const ok = () => Response.json({ ok: true, value: [] });
const fail = () => Promise.reject(new TypeError('offline'));

it('pauses both clients until a real Planner response confirms reconnect', async () => {
  const request = vi.fn<typeof fetch>().mockImplementation(fail);
  const connection = createBrowserConnection('', request);
  await expect(connection.taskClient.create({ title: 'Draft' })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  expect(request).not.toHaveBeenCalled();
  await connection.reconnect();
  expect(connection.getSnapshot()).toEqual({ phase: 'offline', revision: 0 });
  await expect(connection.bookingClient.contacts.create({ name: 'Draft' }, 'fixture')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  expect(request).toHaveBeenCalledTimes(1);
  request.mockImplementation(async () => ok());
  await connection.reconnect();
  expect(connection.getSnapshot()).toEqual({ phase: 'online', revision: 1 });
  await connection.taskClient.list();
  expect(request.mock.calls.at(-1)?.[1]?.cache).toBe('no-store');
  expect(request.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
});

it('ignores a superseded probe and overdue failure after reconnect', async () => {
  let complete!: (response: Response) => void;
  let failRead!: (error: Error) => void;
  const request = vi.fn<typeof fetch>()
    .mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }))
    .mockImplementationOnce(async () => ok())
    .mockImplementationOnce(() => new Promise((_resolve, reject) => { failRead = reject; }))
    .mockImplementation(async () => ok());
  const connection = createBrowserConnection('', request);
  const earlier = connection.reconnect();
  connection.disconnected();
  complete(ok());
  await earlier;
  expect(connection.getSnapshot().phase).toBe('offline');
  await connection.reconnect();
  const obsolete = connection.taskClient.list();
  connection.disconnected();
  await connection.reconnect();
  failRead(new TypeError('previous network generation'));
  await expect(obsolete).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  expect(connection.getSnapshot()).toEqual({ phase: 'online', revision: 2 });
});
