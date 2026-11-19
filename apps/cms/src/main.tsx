import { createRoot } from 'react-dom/client';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import './style.css';

interface ImageReference {
  assetId: string; fileVersion: number; usage: 'hero'; altText: Record<string, string>; decorative: boolean;
}
interface Values { title: string; intro: string; image?: ImageReference | null }
interface Page {
  revisionId: string; pageVersion: number; values: Values;
  activeReleaseId: string | null; activeVersion: number;
  uploadEnabled?: boolean;
}
interface UploadStatus { assetId: string; fileVersion: number; state: string; error: string | null; rights: string; metadataVersion?: number }
interface RightsMetadata { assetId: string; metadataVersion: number; rights: string }
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
  const [file, setFile] = useState<File | null>(null);
  const [uploadJobId, setUploadJobId] = useState('');
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null);
  const [rightsTarget, setRightsTarget] = useState<RightsMetadata | null>(null);
  const [rightsDecision, setRightsDecision] = useState({ owner: '', source: '', basis: '', confirmed: false });
  // Scope generation prevents late responses from a previous token/site reaching this view.
  const generation = useRef(0);

  const base = `/api/v1/cms/websites/${website}`;
  const dirty = !!page && JSON.stringify(values) !== JSON.stringify(page.values);
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const result = await fetch(base + path, { ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
    if (!result.ok) {
      const body = await result.json().catch(() => ({ message: 'Verzoek mislukt' }));
      throw new ApiError(result.status, body.errorCode === 'media_not_publishable'
        ? 'Afbeelding is niet publiceerbaar. Controleer alt-tekst, gereedstatus en rechten.'
        : body.errorCode === 'media_unavailable' ? 'Mediaopslag niet beschikbaar. Herstel de mediamap en herstart de proef.'
        : body.message ?? body.errorCode ?? `Verzoek mislukt (${result.status})`);
    }
    return result.json() as Promise<T>;
  }
  function reset() {
    generation.current++;
    setPage(null); setPreview(''); setAttempt(null); setDraftConflict(null);
    setPendingChoice(null); setPublicationConflict(false); setError(''); setBusy(false);
    setFile(null); setUploadJobId(''); setUploadStatus(null);
    resetRights();
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
      resetRights();
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
      if (!response.ok) {
        const problem = await response.json().catch(() => ({ message: 'Preview niet beschikbaar' }));
        throw new ApiError(response.status, problem.message ?? 'Preview niet beschikbaar');
      }
      const html = await response.text();
      if (!current()) return;
      setPreview(html); setStatus('Privépreview van de opgeslagen conceptversie.');
    });
  }
  function useUpload(result: UploadStatus) {
    setValues((prior) => ({ ...prior, image: { assetId: result.assetId, fileVersion: result.fileVersion,
      usage: 'hero', decorative: prior.image?.decorative ?? false, altText: prior.image?.altText ?? { nl: '' } } }));
    setPreview('');
    resetRights();
  }
  function resetRights() {
    setRightsTarget(null); setRightsDecision({ owner: '', source: '', basis: '', confirmed: false });
  }
  function loadRights() {
    const assetId = values.image?.assetId;
    if (!assetId) return;
    void perform(async (current) => {
      const metadata = await request<RightsMetadata>(`/media/${encodeURIComponent(assetId)}/rights`);
      if (current()) {
        setRightsTarget(metadata); setRightsDecision((prior) => ({ ...prior, confirmed: false }));
        setStatus(`Rechtenstatus opgehaald: ${metadata.rights}.`);
      }
    });
  }
  function decideRights(decision: 'cleared' | 'blocked') {
    const target = rightsTarget;
    if (!target || target.assetId !== values.image?.assetId || !rightsDecision.confirmed) return;
    void perform(async (current) => {
      const result = await request<{ rights: string; metadataVersion: number }>(`/media/${encodeURIComponent(target.assetId)}/rights`, {
        method: 'PUT', body: JSON.stringify({ ...rightsDecision, expectedVersion: target.metadataVersion, status: decision }),
      });
      if (!current()) return;
      setRightsTarget({ ...target, ...result }); setRightsDecision((prior) => ({ ...prior, confirmed: false }));
      setPendingChoice(null);
      setUploadStatus((prior) => prior?.assetId === target.assetId ? { ...prior, ...result } : prior);
      setStatus(decision === 'cleared' ? 'Rechten expliciet vrijgegeven. Sla eventuele conceptwijzigingen op en kies daarna bewust Publiceren.' : 'Afbeelding geblokkeerd voor nieuwe publicaties.');
    });
  }
  function upload() {
    if (!file) return;
    void perform(async (current) => {
      const response = await fetch(`${base}/media`, { method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': file.type,
          'X-Media-Filename': encodeURIComponent(file.name) }, body: await file.arrayBuffer() });
      const result = await response.json();
      if (!current()) return;
      if (result.assetId) setUploadJobId(result.assetId);
      if (!response.ok) {
        setUploadStatus(result.assetId ? { assetId: result.assetId, fileVersion: 1, state: 'failed', error: result.message, rights: 'unknown' } : null);
        throw new ApiError(response.status, result.message ?? 'Upload mislukt');
      }
      setUploadStatus(result); useUpload(result);
      setStatus('Upload verwerkt en geselecteerd. Sla het concept op; publicatie blijft geblokkeerd totdat de rechten expliciet zijn vrijgegeven.');
    });
  }
  function loadUpload(retry = false) {
    if (!uploadJobId) return;
    void perform(async (current) => {
      const result = await request<UploadStatus>(`/media/${encodeURIComponent(uploadJobId)}${retry ? '/retry' : ''}`, retry ? { method: 'POST' } : {});
      if (!current()) return;
      setUploadStatus(result); setStatus(`Uploadstatus: ${result.state}. Rechten: ${result.rights}.`);
    });
  }
  function publish() {
    if (!page || dirty || draftConflict) return;
    const choice = pendingChoice?.revisionId === page.revisionId ? pendingChoice
      : { revisionId: page.revisionId, expectedActiveVersion: page.activeVersion, key: crypto.randomUUID() };
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
      {page.uploadEnabled && <fieldset disabled={busy}><legend>Eigen afbeelding uploaden</legend>
        <label>PNG-, JPEG- of WebP-bestand<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
        <button disabled={!file} onClick={upload}>Bestand uploaden</button>
        <p className="hint">Maximaal 20 MB. Alleen geschoonde beeldvarianten kunnen naar de website; het origineel blijft privé. Een upload geeft geen publicatierechten.</p>
        <details><summary>Uploadstatus controleren of herstellen</summary>
          <label>Uploadnummer<input value={uploadJobId} onChange={(event) => setUploadJobId(event.target.value)} /></label>
          <div className="actions"><button disabled={!uploadJobId} onClick={() => loadUpload()}>Status ophalen</button>
            <button disabled={uploadStatus?.state !== 'failed' || uploadStatus.assetId !== uploadJobId} onClick={() => loadUpload(true)}>Verwerking opnieuw proberen</button></div>
        </details>
        {uploadStatus && <aside><p>Laatste upload: {uploadStatus.state} · Rechten: {uploadStatus.rights}</p>
          {uploadStatus.error && <p>{uploadStatus.error}</p>}
          {uploadStatus.state === 'ready' && <button onClick={() => useUpload(uploadStatus)}>Deze upload gebruiken</button>}
        </aside>}
      </fieldset>}
      <fieldset disabled={busy}><legend>Afbeelding in concept</legend>
        <p className="hint">{page.uploadEnabled ? 'Kies je upload of een vaste testafbeelding. De vaste testafbeeldingen zijn vergrote pixels; je eigen upload gebruikt geschoonde beeldvarianten.'
          : 'De testafbeelding is één gekleurde pixel, hier vergroot. Kies expliciet een bestandsversie; uploads zijn niet aangesloten.'}</p>
        <label>Afbeelding<select value={values.image ? `${values.image.assetId}:${values.image.fileVersion}` : ''} onChange={(event) => {
          resetRights();
          const [assetId, version] = event.target.value.split(':');
          setValues({ ...values, image: assetId ? { assetId, fileVersion: Number(version), usage: 'hero',
            altText: values.image?.altText ?? { nl: '' }, decorative: values.image?.decorative ?? false } : null });
        }}><option value="">Geen afbeelding</option>
          {values.image && !['photo', 'unlicensed', 'pending'].includes(values.image.assetId) && <option value={`${values.image.assetId}:${values.image.fileVersion}`}>Geüploade afbeelding · versie {values.image.fileVersion}</option>}
          <option value="photo:1">Testafbeelding · versie 1</option><option value="photo:2">Testafbeelding · versie 2</option>
          <option value="unlicensed:1">Rechten onbekend · blokkeert publicatie</option><option value="pending:1">Nog in verwerking · blokkeert publicatie</option></select></label>
        {values.image && <>
          <label className="check"><input type="checkbox" checked={values.image.decorative} onChange={(event) => {
            setValues({ ...values, image: { ...values.image!, decorative: event.target.checked,
              altText: event.target.checked ? { nl: '' } : values.image!.altText } });
          }} />Deze afbeelding is decoratief</label>
          <label>Alt-tekst Nederlands<input value={values.image.altText.nl ?? ''} maxLength={2000} disabled={values.image.decorative} onChange={(event) => {
            setValues({ ...values, image: { ...values.image!, altText: { ...values.image!.altText, nl: event.target.value } } });
          }} /></label>
          <p className="hint">{values.image.decorative ? 'De export krijgt een leeg alt-attribuut.' : 'Vul een beschrijving in voordat je previewt of publiceert.'}</p>
        </>}
      </fieldset>
      {page.uploadEnabled && values.image && <fieldset disabled={busy}><legend>Rechten beoordelen</legend>
        <p>Een gereed beeld kan privé bekeken worden. Publiceren vereist een expliciete vrijgave; een upload alleen geeft geen toestemming.</p>
        <button onClick={loadRights}>Rechtenstatus ophalen</button>
        {rightsTarget?.assetId === values.image.assetId && <>
          <p>Huidige status: {rightsTarget.rights} · versie {rightsTarget.metadataVersion}</p>
          <label>Rechthebbende<input value={rightsDecision.owner} onChange={(event) => setRightsDecision({ ...rightsDecision, owner: event.target.value })} /></label>
          <label>Bron<input value={rightsDecision.source} onChange={(event) => setRightsDecision({ ...rightsDecision, source: event.target.value })} /></label>
          <label>Onderbouwing van de rechtenbeslissing<textarea rows={3} value={rightsDecision.basis} onChange={(event) => setRightsDecision({ ...rightsDecision, basis: event.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={rightsDecision.confirmed} onChange={(event) => setRightsDecision({ ...rightsDecision, confirmed: event.target.checked })} />Ik bevestig deze rechtenbeslissing met bovenstaande onderbouwing</label>
          <p className="hint">Je beslissing wordt met je proefaccount vastgelegd. Alleen een Publisher kan deze stap uitvoeren.</p>
          <div className="actions"><button disabled={!rightsDecision.confirmed} onClick={() => decideRights('cleared')}>Rechten vrijgeven</button>
            <button disabled={!rightsDecision.confirmed} className="secondary" onClick={() => decideRights('blocked')}>Nieuwe publicatie blokkeren</button></div>
        </>}
      </fieldset>}
      {draftConflict && <aside><h3>Nieuwste opgeslagen tekst</h3><p>{draftConflict.values.title}</p><p>{draftConflict.values.intro}</p>
        <button disabled={busy} onClick={() => {
          if (busy) return;
          setPage(draftConflict); setValues(draftConflict.values); setDraftConflict(null); setPreview('');
          resetRights();
          setPendingChoice(null); setPublicationConflict(false); setAttempt(null);
          setStatus('Nieuwste versie overgenomen. Kies Lokaal publiceren om deze revisie te publiceren.');
        }}>Nieuwste versie overnemen</button>
        <p>Jouw invoer blijft hierboven staan totdat je deze keuze maakt. Kopieer tekst die je wilt bewaren.</p></aside>}
      <div className="actions"><button disabled={busy || !dirty || !!draftConflict} onClick={save}>Concept opslaan</button>
        <button className="secondary" disabled={busy || dirty || !!draftConflict} onClick={previewDraft}>Privépreview openen</button>
        <button disabled={busy || dirty || !!draftConflict || publicationConflict} onClick={publish}>{pendingChoice ? 'Publicatie opnieuw controleren' : 'Lokaal publiceren'}</button></div>
      {publicationConflict && <aside><p>Een andere publicatie is inmiddels actief. Wil je nog steeds deze opgeslagen conceptversie publiceren?</p><button disabled={busy} onClick={() => { if (busy) return; setPublicationConflict(false); setStatus('Nieuwe publicatiekeuze bevestigd. Klik Lokaal publiceren.'); }}>Deze revisie opnieuw kiezen</button></aside>}
      {publicUrl && <p><a href={publicUrl} target="_blank" rel="noreferrer">Gepubliceerde lokale pagina openen</a></p>}
      {preview && <div><h3>Privépreview</h3><iframe title="Privépreview opgeslagen concept" sandbox="" srcDoc={preview} /></div>}
    </section>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
