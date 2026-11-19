import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPlannerClient, LOCAL_WORKSPACE_ID, type Task } from '@draconis/shared';
import './bridge.js';

const client = createPlannerClient(window.plannerProbe.invoke, LOCAL_WORKSPACE_ID);
// The local probe runner exercises the exact client used by the UI.
window.plannerClient = client;
async function listTasks() {
  const result = await client.list();
  if (!Array.isArray(result)) throw new Error('Unexpected paginated result');
  return result;
}

function Probe() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState('Fictieve lokale taak');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    listTasks().then(async items => {
      setTasks(items);
      await window.plannerProbe.ready();
    }).catch(e => setError(String(e)));
  }, []);
  return <main>
    <h1>Planner desktopproef</h1>
    <p>Werkruimte {client.workspaceId}. SQLite op dit apparaat.</p>
    <form onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError('');
      try {
        await client.create({ title });
        setTasks(await listTasks()); setTitle('');
      } catch (err) { setError(String(err)); }
      finally { setBusy(false); }
    }}>
      <label>Taak <input value={title} onChange={e => setTitle(e.target.value)} required maxLength={240} /></label>
      <button disabled={busy}>Lokaal opslaan</button>
    </form>
    <p role="alert">{error}</p>
    <ul>{tasks.map(task => <li key={task.id}>{task.title} · {task.lane} · versie {task.version}
      <button disabled={busy} onClick={async () => {
        setBusy(true); setError('');
        try {
          await client.update(task.id, { lane: task.lane === 'todo' ? 'doing' : task.lane === 'doing' ? 'done' : 'todo', version: task.version });
          setTasks(await listTasks());
        } catch (err) { setError(String(err)); }
        finally { setBusy(false); }
      }}>Verplaatsen</button>
    </li>)}</ul>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Probe />);
