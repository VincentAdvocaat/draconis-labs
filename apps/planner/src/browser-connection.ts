import {
  LOCAL_WORKSPACE_ID, createBookingClient, createBookingHttpTransport, createPlannerClient, createPlannerHttpTransport,
} from '@draconis/shared';

const unavailable = {
  ok: false,
  error: { code: 'UNAVAILABLE', status: 503, message: 'Planner is offline. Vernieuw eerst de verbinding.' },
} as const;

type Phase = 'checking' | 'offline' | 'online';
type Reply = { ok: true } | { ok: false; error: { code: string } };

export function createBrowserConnection(baseUrl: string, fetcher: typeof fetch = fetch) {
  const requestFresh: typeof fetch = (input, init) => fetcher(input, { ...init, cache: 'no-store' });
  const request = createPlannerHttpTransport(baseUrl, requestFresh);
  const bookingRequest = createBookingHttpTransport(baseUrl, requestFresh);
  let snapshot = { phase: 'checking' as Phase, revision: 0 };
  let checkGeneration = 0;
  const listeners = new Set<() => void>();

  function publish(phase: Phase, revision = snapshot.revision) {
    if (snapshot.phase === phase && snapshot.revision === revision) return;
    snapshot = { phase, revision };
    for (const notify of listeners) notify();
  }

  function disconnected() {
    checkGeneration++;
    publish('offline');
  }

  async function reconnect() {
    const generation = ++checkGeneration;
    publish('checking');
    const probe = createPlannerHttpTransport(baseUrl, (input, init) =>
      fetcher(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(5000) }));
    const outcome = await probe({ type: 'preferences.get', workspaceId: LOCAL_WORKSPACE_ID });
    if (generation !== checkGeneration) return;
    if (!outcome.ok && outcome.error.code === 'UNAVAILABLE') publish('offline');
    else publish('online', snapshot.revision + 1);
  }

  function guard<Command, Result extends Reply>(
    transport: (command: Command) => Promise<Result>, writes: (command: Command) => boolean,
  ) {
    return async (command: Command) => {
      if (writes(command) && snapshot.phase !== 'online') return unavailable;
      const revision = snapshot.revision;
      const outcome = await transport(command);
      if (!outcome.ok && outcome.error.code === 'UNAVAILABLE'
        && snapshot.revision === revision && snapshot.phase === 'online') disconnected();
      return outcome;
    };
  }

  const stop = () => { checkGeneration++; };
  return {
    taskClient: createPlannerClient(guard(request, command =>
      command.type === 'tasks.create' || command.type === 'tasks.update' ||
      command.type === 'tasks.remove' || command.type === 'preferences.update'), LOCAL_WORKSPACE_ID),
    bookingClient: createBookingClient(guard(bookingRequest, command => 'key' in command), LOCAL_WORKSPACE_ID),
    getSnapshot: () => snapshot,
    subscribe(notify: () => void) {
      listeners.add(notify);
      return () => { listeners.delete(notify); };
    },
    reconnect, disconnected, stop,
  };
}
