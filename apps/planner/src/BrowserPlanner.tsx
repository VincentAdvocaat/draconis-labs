import { useEffect, useState, useSyncExternalStore } from 'react';
import { Planner } from './Planner';
import { createBrowserConnection } from './browser-connection';

export function BrowserPlanner({ baseUrl, launcherUrl }: { baseUrl: string; launcherUrl?: string }) {
  const [connection] = useState(() => createBrowserConnection(baseUrl));
  const { phase, revision } = useSyncExternalStore(connection.subscribe, connection.getSnapshot);
  useEffect(() => {
    const check = () => { void connection.reconnect(); };
    window.addEventListener('online', check);
    window.addEventListener('offline', connection.disconnected);
    const timer = window.setInterval(() => {
      if (connection.getSnapshot().phase === 'offline') check();
    }, 8000);
    check();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', check);
      window.removeEventListener('offline', connection.disconnected);
      connection.stop();
    };
  }, [connection]);

  return <>
    {phase !== 'online' && <aside className="planner-connection">
      <span role="status">{phase === 'offline'
        ? 'Planner is niet bereikbaar. Eerder geladen gegevens blijven zichtbaar. Opslaan is gepauzeerd.'
        : 'Verbinding met Planner controleren…'}</span>
      {phase === 'offline' && <button type="button" onClick={() => void connection.reconnect()}>Verbinding opnieuw controleren</button>}
    </aside>}
    <Planner
      taskClient={connection.taskClient}
      bookingClient={connection.bookingClient}
      launcherUrl={launcherUrl}
      readOnly={phase !== 'online'}
      refreshVersion={revision}
    />
  </>;
}
