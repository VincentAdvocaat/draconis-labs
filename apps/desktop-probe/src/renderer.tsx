import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Task } from '@draconis/shared';
import './bridge.js';

function Probe() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState('Fictieve lokale taak');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    window.plannerProbe.list().then(async items => {
      setTasks(items);
      await window.plannerProbe.ready();
    }).catch(e => setError(String(e)));
  }, []);
  return <main>
    <h1>Planner desktopproef</h1>
    <p>Lokale proefwerkruimte. SQLite op dit apparaat.</p>
    <form onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError('');
      try {
        await window.plannerProbe.create({ title });
        setTasks(await window.plannerProbe.list()); setTitle('');
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
          await window.plannerProbe.update(task.id, { lane: task.lane === 'todo' ? 'doing' : task.lane === 'doing' ? 'done' : 'todo', version: task.version });
          setTasks(await window.plannerProbe.list());
        } catch (err) { setError(String(err)); }
        finally { setBusy(false); }
      }}>Verplaatsen</button>
    </li>)}</ul>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Probe />);
