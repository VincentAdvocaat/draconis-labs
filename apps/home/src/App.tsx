import { useEffect, useState } from 'react';
import { Topbar, TopbarBrand } from '@draconis/ui';
import { catalogPath, type CatalogApp } from './catalog.js';

type CatalogState = { apps: CatalogApp[]; phase: 'loading' | 'ready' | 'error' };

export function App() {
  const [state, setState] = useState<CatalogState>({ apps: [], phase: 'loading' });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const request = new AbortController();
    async function load() {
      try {
        const response = await fetch(catalogPath, { signal: request.signal });
        if (!response.ok) throw new Error('Catalog request failed');
        const { apps } = await response.json() as { apps: CatalogApp[] };
        if (!Array.isArray(apps)) throw new Error('Invalid catalog response');
        if (!request.signal.aborted) setState({ apps, phase: 'ready' });
      } catch {
        if (!request.signal.aborted) setState({ apps: [], phase: 'error' });
      }
    }
    void load();
    return () => request.abort();
  }, [revision]);

  const checking = state.phase === 'loading';
  function refresh() {
    if (checking) return;
    setState({ apps: state.apps, phase: 'loading' });
    setRevision(revision + 1);
  }

  return (
    <div className="home">
      <Topbar brand={<TopbarBrand mark={<span aria-hidden="true">D</span>} title="Draconis Labs" />} />
      <main className="catalog">
        <div className="catalog-heading">
          <div>
            <h1>Apps</h1>
            <p>Open een app in je lokale omgeving.</p>
          </div>
          <button type="button" className="refresh" aria-disabled={checking} onClick={refresh}>
            Status vernieuwen
          </button>
        </div>
        <p className="catalog-message" role="status">
          {checking && 'Apps en status ophalen…'}
          {state.phase === 'error' && 'De appcatalogus is onbereikbaar. Probeer opnieuw.'}
          {state.phase === 'ready' && (state.apps.length
            ? `${state.apps.filter((app) => app.status === 'reachable').length} van ${state.apps.length} apps bereikbaar.`
            : 'Er zijn geen apps beschikbaar voor dit lokale profiel.')}
        </p>
        {state.apps.length > 0 && (
          <ul className="app-list" role="list" aria-label="Beschikbare apps">
            {state.apps.map((app) => (
              <li className="app-card" key={app.id}>
                <div className={`app-status ${app.status}`}>
                  {app.status === 'reachable' ? 'Bereikbaar' : 'Onbereikbaar'}
                </div>
                <h2>{app.name}</h2>
                <p>{app.description}</p>
                <dl>
                  <div><dt>Eigenaar</dt><dd>{app.owner}</dd></div>
                  <div><dt>Adres</dt><dd>{app.launchUrl}</dd></div>
                </dl>
                <a className="app-link" href={app.launchUrl}>Open {app.name} <span aria-hidden="true">→</span></a>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
