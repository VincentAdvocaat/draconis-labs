import { Topbar, TopbarBrand } from '@draconis/ui';
import { useState } from 'react';

export function App() {
  const [status, setStatus] = useState('ready');

  return (
    <div className="app-shell">
      <Topbar
        brand={<TopbarBrand mark="D" title="{{AppName}}" subtitle="Draconis app" />}
        actions={<span className="status-pill">{status}</span>}
      />
      <main>
        <h1>{{AppName}}</h1>
        <p>Independent deployable app using @draconis/ui and @draconis/shared.</p>
        <button type="button" onClick={() => setStatus('ok')}>Mark healthy</button>
      </main>
    </div>
  );
}
