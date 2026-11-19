import { createRoot } from 'react-dom/client';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import './style.css';

interface Values { title: string; intro: string }
interface Page {
  revisionId: string; pageVersion: number; values: Values;
  activeReleaseId: string | null; activeVersion: number;
}
interface Attempt { releaseId: string; status: string; errorCode: string | null; publicUrl: string | null }
interface PublishChoice { revisionId: string; expectedActiveVersion: number; key: string }
class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function App() {
  const [token, setToken] = useState('');
  const [website, setWebsite] = useState('demo-cms');
  const [page, setPage] = useState<Page | null>(null);
  const [values, setValues] = useState<Values>({ title: '', intro: '' });
  const [status, setStatus] = useState('Voer een lokaal testtoken in en open de pagina.');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState('');
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [draftConflict, setDraftConflict] = useState<Page | null>(null);
  const [pendingChoice, setPendingChoice] = useState<PublishChoice | null>(null);
  const [publicationConflict, setPublicationConflict] = useState(false);
  // Scope generation prevents late responses from a previous token/site reaching this view.
  const generation = useRef(0);

  const base = `/api/v1/cms/websites/${website}`;
  const dirty = !!page && JSON.stringify(values) !== JSON.stringify(page.values);
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const result = await fetch(base + path, { ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
    if (!result.ok) {
      const body = await result.json().catch(() => ({ message: 'Verzoek mislukt' }));
      throw new ApiError(result.status, body.message ?? body.errorCode ?? `Verzoek mislukt (${result.status})`);
    }
    return result.json() as Promise<T>;
  }
  function reset() {
    generation.current++;
    setPage(null); setPreview(''); setAttempt(null); setDraftConflict(null);
    setPendingChoice(null); setPublicationConflict(false); setError(''); setBusy(false);
    setStatus('Open de pagina met dit token.');
    // Keep unsaved text visible until the user explicitly opens another page.
  }
  async function perform(action: (current: () => boolean) => Promise<void>) {
    const epoch = generation.current;
    setBusy(true); setError('');
    try { await action(() => epoch === generation.current); }
    catch (err) { if (epoch === generation.current) setError((err as Error).message); }
    finally { if (epoch === generation.current) setBusy(false); }
  }
  function open(event: FormEvent) {
    event.preventDefault();
    if (dirty && !window.confirm('Je hebt onopgeslagen tekst. Nieuwste opgeslagen versie openen?')) return;
    void perform(async (current) => {
      const result = await request<Page>('/pages/home');
      if (!current()) return;
      setPage(result); setValues(result.values); setDraftConflict(null); setAttempt(null);
      setPendingChoice(null); setPublicationConflict(false); setPreview('');
      setStatus(`Conceptversie ${result.pageVersion} geladen.`);
    });
  }
  function save() {
    if (!page) return;
    const choice = page;
    void perform(async (current) => {
      try {
        const result = await request<Page>('/pages/home/draft', { method: 'PUT', body: JSON.stringify({ expectedVersion: choice.pageVersion, values }) });
        if (!current()) return;
        setPage(result); setValues(result.values); setPreview(''); setPendingChoice(null);
        setStatus(`Conceptversie ${result.pageVersion} opgeslagen. De publieke pagina blijft ongewijzigd.`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          const latest = await request<Page>('/pages/home');
          if (current()) { setDraftConflict(latest); setStatus('Versieconflict. Jouw invoer staat nog in de velden.'); }
        }
        throw err;
      }
    });
  }
  function previewDraft() {
    if (!page) return;
    void perform(async (current) => {
      const response = await fetch(`${base}/previews/${page.revisionId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new ApiError(response.status, 'Preview niet beschikbaar. Controleer je token.');
      const html = await response.text();
      if (!current()) return;
      setPreview(html); setStatus('Privépreview van de opgeslagen conceptversie.');
    });
  }
  function publish() {
    if (!page || dirty || draftConflict) return;
    const choice = pendingChoice ?? { revisionId: page.revisionId, expectedActiveVersion: page.activeVersion, key: crypto.randomUUID() };
    setPendingChoice(choice);
    void perform(async (current) => {
      try {
        const result = await request<Attempt>('/releases', { method: 'POST',
          headers: { 'Idempotency-Key': choice.key }, body: JSON.stringify({ revisionId: choice.revisionId, expectedActiveVersion: choice.expectedActiveVersion }) });
        if (!current()) return;
        setAttempt(result);
        if (result.status === 'building') { setStatus('Publicatie wordt gebouwd. Controleer opnieuw met dezelfde knop.'); return; }
        setPendingChoice(null);
        const latest = await request<Page>('/pages/home');
        if (!current()) return;
        // Preserve the selected saved revision, including if another editor saved meanwhile.
        setPage((prior) => prior ? { ...prior, activeReleaseId: latest.activeReleaseId, activeVersion: latest.activeVersion } : prior);
        setStatus(`Gepubliceerd naar lokale website. Actieve versie ${latest.activeVersion}.`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          const latest = await request<Page>('/pages/home');
          if (current()) {
            setPage((prior) => prior ? { ...prior, activeReleaseId: latest.activeReleaseId, activeVersion: latest.activeVersion } : prior);
            setPendingChoice(null); setPublicationConflict(true);
            setStatus('Publicatieconflict. Actuele publicatiestatus opgehaald; kies opnieuw om deze revisie te publiceren.');
          }
        } else if (err instanceof ApiError && err.status === 422) {
          if (current()) setPendingChoice(null);
        }
        // Keep key on network/401 failure: a committed publish may have lost its response.
        throw err;
      }
    });
  }
  const publicUrl = attempt?.publicUrl ?? (page?.activeReleaseId ? `/sites/${website}/index.html` : null);
  return <main>
    <header><p className="eyebrow">Draconis Labs · lokale proef</p><h1>Pagina bewerken</h1><p>Fictieve inhoud. Bewaar je concept en publiceer daarna naar de lokale website.</p></header>
    <section aria-labelledby="access-title"><h2 id="access-title">Website openen</h2>
      <form onSubmit={open}>
        <label>Website<select value={website} disabled={busy} onChange={(event) => {
          if (dirty && !window.confirm('Onopgeslagen tekst behouden tot je de andere pagina opent?')) return;
          reset(); setWebsite(event.target.value);
        }}><option value="demo-cms">Proeftuin</option><option value="demo-other">Tweede testwebsite</option></select></label>
        <label>Lokaal testtoken<input type="password" autoComplete="off" value={token} onChange={(event) => {
          generation.current++; setBusy(false); setPreview(''); setError(''); setToken(event.target.value);
          setStatus('Token aangepast. Je invoer blijft bewaard; probeer opslaan opnieuw of open de nieuwste versie.');
        }} /></label>
        <button disabled={busy || !token}>Pagina openen</button>
      </form><p className="hint">Gebruik de editor- of publishergegevens uit het lokale toegangsbestand. Het token blijft alleen in dit tabbladgeheugen.</p>
    </section>
    <p role="status" aria-live="polite" className="status">{status}</p>
    {error && <p role="alert" className="error">{error}</p>}
    {page && <section aria-labelledby="content-title"><h2 id="content-title">Home · Nederlands</h2>
      <p>Conceptversie {page.pageVersion} · Actieve publicatieversie {page.activeVersion}{dirty ? ' · Onopgeslagen wijzigingen' : ''}</p>
      <label>Titel<input value={values.title} maxLength={200} disabled={busy} onChange={(event) => setValues({ ...values, title: event.target.value })} /></label>
      <label>Introductie<textarea value={values.intro} maxLength={4000} rows={5} disabled={busy} onChange={(event) => setValues({ ...values, intro: event.target.value })} /></label>
      {draftConflict && <aside><h3>Nieuwste opgeslagen tekst</h3><p>{draftConflict.values.title}</p><p>{draftConflict.values.intro}</p>
        <button onClick={() => { setPage(draftConflict); setValues(draftConflict.values); setDraftConflict(null); setPreview(''); setStatus('Nieuwste versie overgenomen.'); }}>Nieuwste versie overnemen</button>
        <p>Jouw invoer blijft hierboven staan totdat je deze keuze maakt. Kopieer tekst die je wilt bewaren.</p></aside>}
      <div className="actions"><button disabled={busy || !dirty || !!draftConflict} onClick={save}>Concept opslaan</button>
        <button className="secondary" disabled={busy || dirty || !!draftConflict} onClick={previewDraft}>Privépreview openen</button>
        <button disabled={busy || dirty || !!draftConflict || publicationConflict} onClick={publish}>{pendingChoice ? 'Publicatie opnieuw controleren' : 'Lokaal publiceren'}</button></div>
      {publicationConflict && <aside><p>Een andere publicatie is inmiddels actief. Wil je nog steeds deze opgeslagen conceptversie publiceren?</p><button onClick={() => { setPublicationConflict(false); setStatus('Nieuwe publicatiekeuze bevestigd. Klik Lokaal publiceren.'); }}>Deze revisie opnieuw kiezen</button></aside>}
      {publicUrl && <p><a href={publicUrl} target="_blank" rel="noreferrer">Gepubliceerde lokale pagina openen</a></p>}
      {preview && <div><h3>Privépreview</h3><iframe title="Privépreview opgeslagen concept" sandbox="" srcDoc={preview} /></div>}
    </section>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
