import {ContactTemplateEditor,type ContactRecord,type ContactContent} from './contact-template';
import {SharedNavigationEditor,SharedNavigationSummary,type SharedNavigationDto,type SharedNavigationContent} from './shared-navigation';
import {apiErrorMessage, createCmsTranslator, formatUiMessage, message, type UiMessage, type UiLocale} from './i18n';
import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AppLauncherLink } from '@draconis/ui';
import '@draconis/ui/app-launcher.css';
import './style.css';
import { EnglishEditor, type EnglishDto, type EnglishContent } from './page-locales';
import { DocumentEditor } from './documents';
import type { PortfolioSelection, DocumentContent, DocumentDto, SitePlan, DocumentImageReference } from './documents';

interface ImageReference {
  assetId: string; fileVersion: number; usage: 'hero'; altText: Record<string, string>; decorative: boolean;
}
interface Values { title: string; intro: string; image?: ImageReference | null }
interface Page {
  revisionId: string; pageVersion: number; values: Values;
  activeReleaseId: string | null; activeVersion: number;
  uploadEnabled?: boolean;
  pagesEnabled?: boolean;
  sharedEnabled?: boolean;
  contactEnabled?:boolean;
}
interface UploadStatus { assetId: string; fileVersion: number; state: string; error: string | null; rights: string; metadataVersion?: number }
interface RightsMetadata { assetId: string; metadataVersion: number; rights: string }
interface Attempt { releaseId: string; status: string; errorCode: string | null; publicUrl: string | null }
interface PublishChoice { revisionId: string; expectedActiveVersion: number; key: string }
class ApiError extends Error {
  constructor(public status: number, public uiMessage: UiMessage) { super('literal' in uiMessage ? uiMessage.literal : uiMessage.key); }
}

function App() {
  const [uiLocale, setUiLocale] = useState<UiLocale>('nl');
  const {copy: t, code} = createCmsTranslator(uiLocale);
  useEffect(() => {document.documentElement.lang = uiLocale; document.title = t.appTitle;}, [uiLocale, t.appTitle]);
  const [token, setToken] = useState('');
  const [website, setWebsite] = useState('demo-cms');
  const [page, setPage] = useState<Page | null>(null);
  const [values, setValues] = useState<Values>({ title: '', intro: '' });
  const [status, setStatus] = useState<UiMessage>(message('initialStatus'));
  const [error, setError] = useState<UiMessage | null>(null);
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
  const [portfolioSelections, setPortfolioSelections] = useState<PortfolioSelection[]>([]);
  const [overview, setOverview] = useState<SitePlan | null>(null);
  const [newPage, setNewPage] = useState({ title: '', slug: '' });
  const [selectedDocument, setSelectedDocument] = useState<DocumentDto | null>(null);
  const [documentDraft, setDocumentDraft] = useState<DocumentContent | null>(null);
  const [documentConflict, setDocumentConflict] = useState<DocumentDto | null>(null);
  const [englishConfirmedStructure,setEnglishConfirmedStructure]=useState('');
  const [english, setEnglish] = useState<EnglishDto | null>(null);
  const [englishLatest, setEnglishLatest] = useState<EnglishDto | null>(null);
  const [englishDraft, setEnglishDraft] = useState<EnglishContent | null>(null);
  const [selectedLocales, setSelectedLocales] = useState<string[]>([]);
  const englishDirty = !!english && (JSON.stringify(englishDraft) !== JSON.stringify(english.content) || english.needsUpdate&&englishConfirmedStructure===english.structure);
  const [shared,setShared] = useState<SharedNavigationDto|null>(null);
  const [sharedDraft,setSharedDraft] = useState<SharedNavigationContent|null>(null);
  const [sharedLatest,setSharedLatest] = useState<SharedNavigationDto|null>(null);
  const [sharedChosen,setSharedChosen] = useState(false);
  const sharedDirty = !!shared && JSON.stringify(sharedDraft)!==JSON.stringify(shared.content);
  const [contact,setContact]=useState<ContactRecord|null>(null);
  const [contactDraft,setContactDraft]=useState<ContactContent|null>(null);
  const [contactLatest,setContactLatest]=useState<ContactRecord|null>(null);
  const [contactLocale,setContactLocale]=useState<'nl'|'en'>('en');
  const [contactPreview,setContactPreview]=useState('');
  const [contactChosen,setContactChosen]=useState(false);
  const contactDirty=!!contact&&JSON.stringify(contactDraft)!==JSON.stringify(contact.content);
  const [sitePlan, setSitePlan] = useState<SitePlan | null>(null);
  const [siteChoice, setSiteChoice] = useState<{ plan: SitePlan; locales: string[]; contact:boolean; key: string } | null>(null);
  // Scope generation prevents late responses from a previous token/site reaching this view.
  const generation = useRef(0);

  const base = `/api/v1/cms/websites/${website}`;
  const dirty = !!page && JSON.stringify(values) !== JSON.stringify(page.values);
  const documentDirty = !!selectedDocument && JSON.stringify(documentDraft) !== JSON.stringify(selectedDocument.content);
  const selectedImage = selectedDocument ? documentDraft?.blocks.find((block) => block.type === 'image')?.reference : values.image;
  const dc = t;
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const result = await fetch(base + path, { ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
    if (!result.ok) {
      const body: unknown = await result.json().catch(() => null);
      throw new ApiError(result.status, apiErrorMessage(result.status, body));
    }
    return result.json() as Promise<T>;
  }
  function reset() {
    generation.current++;
    setContact(null);setContactDraft(null);setContactLatest(null);setContactPreview('');
    setPage(null); setPreview(''); setAttempt(null); setDraftConflict(null);
    setPendingChoice(null); setPublicationConflict(false); setError(null); setBusy(false);
    setFile(null); setUploadJobId(''); setUploadStatus(null);
    setShared(null); setSharedDraft(null); setSharedLatest(null); setSharedChosen(false); setPortfolioSelections([]); setEnglishLatest(null); setEnglishConfirmedStructure(''); setEnglish(null); setEnglishDraft(null); setSelectedLocales([]); setOverview(null); setSelectedDocument(null); setDocumentDraft(null); setDocumentConflict(null); invalidateSiteChoice();
    setNewPage({ title: '', slug: '' });
    resetRights();
    setStatus(message('openWithToken'));
    // Keep unsaved text visible until the user explicitly opens another page.
  }
  async function perform(action: (current: () => boolean) => Promise<void>) {
    const epoch = generation.current;
    setBusy(true); setError(null);
    try { await action(() => epoch === generation.current); }
    catch (err) { if (epoch === generation.current) setError(err instanceof ApiError ? err.uiMessage : {literal: (err as Error).message}); }
    finally { if (epoch === generation.current) setBusy(false); }
  }
  function open(event?: FormEvent) {
    event?.preventDefault();
    if ((dirty || documentDirty || englishDirty || sharedDirty || contactDirty) && !window.confirm(t.confirmOpen)) return;
    void perform(async (current) => {
      const result = await request<Page>('/pages/home');
      if (!current()) return;
      setContact(null);setContactDraft(null);setContactLatest(null);setContactPreview('');
      setPage(result); setValues(result.values); setDraftConflict(null); setAttempt(null);
      setPendingChoice(null); setPublicationConflict(false); setPreview('');
      setEnglishLatest(null); setEnglishConfirmedStructure(''); setEnglish(null); setEnglishDraft(null); setSelectedLocales([]); setSelectedDocument(null); setDocumentDraft(null); setDocumentConflict(null); invalidateSiteChoice();
      resetRights();
      setStatus(message('loadedDraft',{version:result.pageVersion}));
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
        invalidateSiteChoice();
        setStatus(message('savedDraft',{version:result.pageVersion}));
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          const latest = await request<Page>('/pages/home');
          if (current()) { setDraftConflict(latest); setStatus(message('draftConflict')); }
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
        const problem: unknown = await response.json().catch(() => null);
        throw new ApiError(response.status, apiErrorMessage(response.status, problem, 'previewUnavailable'));
      }
      const html = await response.text();
      if (!current()) return;
      setPreview(html); setStatus(message('previewHome'));
    });
  }
  function useUpload(result: UploadStatus) {
    if (selectedDocument && documentDraft) {
      const prior = documentDraft.blocks.find((block) => block.type === 'image');
      if (!prior && documentDraft.blocks.length >= 16) throw new ApiError(400,message('blockLimit'));
      const blockId = prior?.blockId ?? crypto.randomUUID();
      const image = { blockId, type: 'image' as const, reference: { assetId: result.assetId, fileVersion: result.fileVersion,
        usage: `block-${blockId}`, decorative: prior?.reference.decorative ?? false, altText: prior?.reference.altText ?? { nl: '' } }, caption: prior?.caption ?? '' };
      changeDocument({ ...documentDraft, blocks: prior ? documentDraft.blocks.map((block) => block.blockId === blockId ? image : block) : [...documentDraft.blocks, image] });
    } else {
      setValues((prior) => ({ ...prior, image: { assetId: result.assetId, fileVersion: result.fileVersion,
        usage: 'hero', decorative: prior.image?.decorative ?? false, altText: prior.image?.altText ?? { nl: '' } } }));
    }
    setPreview('');
    resetRights();
  }
  function resetRights() {
    setRightsTarget(null); setRightsDecision({ owner: '', source: '', basis: '', confirmed: false });
  }
  function loadRights() {
    const assetId = selectedImage?.assetId;
    if (!assetId) return;
    void perform(async (current) => {
      const metadata = await request<RightsMetadata>(`/media/${encodeURIComponent(assetId)}/rights`);
      if (current()) {
        setRightsTarget(metadata); setRightsDecision((prior) => ({ ...prior, confirmed: false }));
        setStatus(message('rightsLoaded',{rights:metadata.rights}));
      }
    });
  }
  function decideRights(decision: 'cleared' | 'blocked') {
    const target = rightsTarget;
    if (!target || target.assetId !== selectedImage?.assetId || !rightsDecision.confirmed) return;
    void perform(async (current) => {
      const result = await request<{ rights: string; metadataVersion: number }>(`/media/${encodeURIComponent(target.assetId)}/rights`, {
        method: 'PUT', body: JSON.stringify({ ...rightsDecision, expectedVersion: target.metadataVersion, status: decision }),
      });
      if (!current()) return;
      setRightsTarget({ ...target, ...result }); setRightsDecision((prior) => ({ ...prior, confirmed: false }));
      setPendingChoice(null);
      setSiteChoice(null);
      setUploadStatus((prior) => prior?.assetId === target.assetId ? { ...prior, ...result } : prior);
      setStatus(decision === 'cleared' ? message('rightsCleared') : message('rightsBlocked'));
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
        setUploadStatus(result.assetId ? { assetId: result.assetId, fileVersion: 1, state: 'failed',
          error: typeof result.message === 'string' ? result.message.slice(0, 500) : null, rights: 'unknown' } : null);
        throw new ApiError(response.status, apiErrorMessage(response.status, result, 'uploadFailed'));
      }
      setUploadStatus(result); useUpload(result);
      setStatus(message('uploadSelected'));
    });
  }
  function loadUpload(retry = false) {
    if (!uploadJobId) return;
    void perform(async (current) => {
      const result = await request<UploadStatus>(`/media/${encodeURIComponent(uploadJobId)}${retry ? '/retry' : ''}`, retry ? { method: 'POST' } : {});
      if (!current()) return;
      setUploadStatus(result); setStatus(message('uploadStatusMessage',{state:result.state,rights:result.rights}));
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
        if (result.status === 'building') { setStatus(message('buildingPage')); return; }
        setPendingChoice(null);
        const latest = await request<Page>('/pages/home');
        if (!current()) return;
        // Preserve the selected saved revision, including if another editor saved meanwhile.
        setPage((prior) => prior ? { ...prior, activeReleaseId: latest.activeReleaseId, activeVersion: latest.activeVersion } : prior);
        setStatus(message('publishedPage',{version:latest.activeVersion}));
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          const latest = await request<Page>('/pages/home');
          if (current()) {
            setPage((prior) => prior ? { ...prior, activeReleaseId: latest.activeReleaseId, activeVersion: latest.activeVersion } : prior);
            setPendingChoice(null); setPublicationConflict(true);
            setStatus(message('publicationConflict'));
          }
        } else if (err instanceof ApiError && err.status === 422) {
          if (current()) setPendingChoice(null);
        }
        // Keep key on network/401 failure: a committed publish may have lost its response.
        throw err;
      }
    });
  }
  function invalidateSiteChoice() { setContactChosen(false); setSharedChosen(false); setSitePlan(null); setSiteChoice(null); }
  function changeDocument(content: DocumentContent) {
    const before = documentDraft?.blocks.find((block) => block.type === 'image')?.reference.assetId;
    const after = content.blocks.find((block) => block.type === 'image')?.reference.assetId;
    if (before !== after) resetRights();
    setDocumentDraft(content); setPreview(''); invalidateSiteChoice();
  }
  function refreshOverview() {
    void perform(async (current) => { const result = await request<SitePlan>('/site-plan'); if (current()) setOverview(result); });
  }
  function openDocument(pageId: string) {
    if (busy || dirty || documentDirty || englishDirty || sharedDirty || contactDirty) return;
    if (pageId === 'home') { open(); return; }
    void perform(async (current) => {
      const result = await request<DocumentDto>(`/documents/${pageId}`);
      if (!current()) return;
      setEnglishLatest(null); setEnglishConfirmedStructure(''); setEnglish(null); setEnglishDraft(null); setSelectedLocales([]); setSelectedDocument(result); setDocumentDraft(result.content); setDocumentConflict(null);
      setPreview(''); resetRights(); invalidateSiteChoice(); setStatus(message('selected'));
    });
  }
  function createDocument() {
    if (busy || dirty || documentDirty || englishDirty || sharedDirty || contactDirty) return;
    void perform(async (current) => {
      const result = await request<DocumentDto>('/documents', { method: 'POST', body: JSON.stringify(newPage) });
      if (!current()) return;
      setEnglishLatest(null); setEnglishConfirmedStructure(''); setEnglish(null); setEnglishDraft(null); setSelectedLocales([]); setSelectedDocument(result); setDocumentDraft(result.content); setDocumentConflict(null); setNewPage({ title: '', slug: '' });
      setPreview(''); resetRights(); invalidateSiteChoice(); setStatus(message('selected'));
      const list = await request<SitePlan>('/site-plan'); if (current()) setOverview(list);
    });
  }
  function saveDocument() {
    if (busy || !selectedDocument || !documentDraft) return;
    void perform(async (current) => {
      try {
        const result = await request<DocumentDto>(`/documents/${selectedDocument.pageId}/draft`, {
          method: 'PUT', body: JSON.stringify({ expectedVersion: selectedDocument.version, content: documentDraft }),
        });
        if (!current()) return;
        setEnglishLatest(null); setEnglishConfirmedStructure(''); setEnglish(null); setEnglishDraft(null); setSelectedLocales([]); setSelectedDocument(result); setDocumentDraft(result.content); setDocumentConflict(null);
        setPreview(''); invalidateSiteChoice(); setStatus(message('saved'));
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          const result = await request<DocumentDto>(`/documents/${selectedDocument.pageId}`);
          if (current() && result.version !== selectedDocument.version) { setDocumentConflict(result); setStatus(message('conflict')); }
        }
        throw err;
      }
    });
  }
  function previewDocument() {
    if (busy || !selectedDocument || documentDirty) return;
    void perform(async (current) => {
      const result = await fetch(`${base}/documents/${selectedDocument.pageId}/previews/${selectedDocument.revisionId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!result.ok) throw new ApiError(result.status, apiErrorMessage(result.status, await result.json().catch(() => null), 'previewUnavailable'));
      const html = await result.text(); if (current()) { setPreview(html); setStatus(message('previewPage')); }
    });
  }
  function openEnglish() {
    if (busy || dirty || documentDirty || englishDirty || !page?.pagesEnabled) return;
    void perform(async (current) => {
      const result = await request<EnglishDto>(`/documents/${selectedDocument?.pageId??'home'}/locales/en`);
      if (!current()) return;
      setEnglishLatest(null); setEnglishConfirmedStructure(''); setEnglish(result); setEnglishDraft(result.content); setPreview(''); invalidateSiteChoice();
    });
  }
  function saveEnglish() {
    if (busy || !english || !englishDraft) return;
    void perform(async (current) => {
      try { const result = await request<EnglishDto>(`/documents/${english.pageId}/locales/en`, {method: 'PUT',
        body: JSON.stringify({expectedVersion: english.version, expectedStructure: english.structure, confirmSourceChange:englishConfirmedStructure===english.structure, content: englishDraft})});
      if (!current()) return;
      setEnglishLatest(null); setEnglishConfirmedStructure(''); setEnglish(result); setEnglishDraft(result.content); setPreview(''); invalidateSiteChoice(); setStatus(message('englishSaved'));
      } catch (error) { if (error instanceof ApiError && error.status === 409) { const latest = await request<EnglishDto>(`/documents/${english.pageId}/locales/en`); if (current()) setEnglishLatest(latest); } throw error; }
    });
  }
  function previewEnglish() {
    if (busy || !english?.revisionId || englishDirty) return;
    void perform(async (current) => {
      const response = await fetch(`${base}/documents/${english.pageId}/locales/en/previews/${english.revisionId}`, {headers: {Authorization: `Bearer ${token}`}});
      if (!response.ok) throw new ApiError(response.status, apiErrorMessage(response.status, await response.json().catch(() => null), 'englishPreviewUnavailable'));
      const html = await response.text(); if (current()) {setPreview(html); setStatus(message('englishPreview'));}
    });
  }
  function openShared() {
    if(busy||sharedDirty||contactDirty)return;
    void perform(async(current)=>{const record=await request<SharedNavigationDto>('/shared-navigation');if(!current())return;
      setShared(record);setSharedDraft(record.content);setSharedLatest(null);setPreview('');invalidateSiteChoice();});
  }
  function saveShared() {
    if(busy||!shared||!sharedDraft)return;
    void perform(async(current)=>{try{
      const record=await request<SharedNavigationDto>('/shared-navigation',{method:'PUT',body:JSON.stringify({expectedVersion:shared.version,content:sharedDraft})});
      if(!current())return;setShared(record);setSharedDraft(record.content);setSharedLatest(null);setContactPreview('');setPreview('');invalidateSiteChoice();setStatus(message('sharedSaved'));
    }catch(error){if(error instanceof ApiError&&error.status===409){const latest=await request<SharedNavigationDto>('/shared-navigation');if(current())setSharedLatest(latest);}throw error;}});
  }
  function previewShared() {
    if(busy||!shared||sharedDirty||contactDirty||dirty||documentDirty||englishDirty||!page?.pagesEnabled||(english&&!english.revisionId))return;
    void perform(async(current)=>{
      const response=await fetch(base+'/shared-navigation/previews',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
        body:JSON.stringify({pageId:selectedDocument?.pageId??'home',revisionId:english?.revisionId??selectedDocument?.revisionId??page!.revisionId,locale:english?'en':'nl',sharedRevisionId:shared.revisionId,sharedVersion:shared.version})});
      if(!response.ok)throw new ApiError(response.status,apiErrorMessage(response.status,await response.json().catch(()=>null),'previewUnavailable'));
      const html=await response.text();if(current()){setPreview(html);setStatus(message('sharedPreview'));}
    });
  }
  function openContact(){
    if(busy||contactDirty||sharedDirty)return;
    void perform(async(current)=>{const [record,sr]=await Promise.all([request<ContactRecord>('/contact-template'),request<SharedNavigationDto>('/shared-navigation')]);if(!current())return;
      setContact(record);setContactDraft(record.content);setContactLatest(null);setShared(sr);setSharedDraft(sr.content);setSharedLatest(null);setContactPreview('');invalidateSiteChoice();});
  }
  function saveContact(){if(busy||!contact||!contactDraft)return;void perform(async(current)=>{try{
    const record=await request<ContactRecord>('/contact-template',{method:'PUT',body:JSON.stringify({expectedVersion:contact.version,content:contactDraft})});
    if(!current())return;setContact({...contact,...record});setContactDraft(record.content);setContactLatest(null);setContactPreview('');invalidateSiteChoice();setStatus(message('contactSaved'));
    }catch(error){if(error instanceof ApiError&&error.status===409){const latest=await request<ContactRecord>('/contact-template');if(current())setContactLatest(latest);}throw error;}});}
  function previewContact(){if(busy||!contact||!shared||contactDirty||sharedDirty)return;void perform(async(current)=>{
    const selected=await request<{previewId:string}>('/contact-template/previews',{method:'POST',body:JSON.stringify({revisionId:contact.revisionId,version:contact.version,templateHash:contact.template.hash,sharedRevisionId:shared.revisionId,sharedVersion:shared.version,locale:contactLocale})});
    const response=await fetch(`${base}/contact-template/previews/${selected.previewId}`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)throw new ApiError(response.status,apiErrorMessage(response.status,await response.json().catch(()=>null),'previewUnavailable'));
    const html=await response.text();if(current()){setContactPreview(html);setStatus(message('contactPreviewReady'));}
  });}
  function prepareSite() {
    if (busy || dirty || documentDirty || englishDirty || sharedDirty || contactDirty || documentConflict || draftConflict) return;
    void perform(async (current) => {
      const plan = await request<SitePlan>('/site-plan');
      if (!current()) return;
      const home = plan.pages.find((item) => item.pageId === 'home');
      const selected = selectedDocument ? plan.pages.find((item) => item.pageId === selectedDocument.pageId) : null;
      if (!page || home?.revisionId !== page.revisionId || home.version !== page.pageVersion ||
          (selectedDocument && (selected?.revisionId !== selectedDocument.revisionId || selected.version !== selectedDocument.version))) {
        invalidateSiteChoice(); setStatus(message('planConflict'));
        throw new ApiError(409, message('unseenPage'));
      }
      const chosenEnglish = english ? plan.localeVariants?.find((item) => item.pageId === english.pageId) : null;
      if (english && english.version > 0 && (chosenEnglish?.revisionId !== english.revisionId || chosenEnglish.version !== english.version || chosenEnglish.structure !== english.structure)) { invalidateSiteChoice(); throw new ApiError(409, message('unseenEnglish')); }
      if(shared&&plan.shared&&(shared.revisionId!==plan.shared.revisionId||shared.version!==plan.shared.version)){invalidateSiteChoice();throw new ApiError(409,message('sharedUnseen'));}
      if(contact&&(!plan.contactTemplate||contact.revisionId!==plan.contactTemplate.revisionId||contact.version!==plan.contactTemplate.version||contact.template.hash!==plan.contactTemplate.template.hash)){invalidateSiteChoice();throw new ApiError(409,message('contactUnseen'));}
      setContactChosen(false);setSharedChosen(false); setSitePlan(plan); setSelectedLocales([]); setSiteChoice(null); setStatus(message('planTitle'));
    });
  }
  function publishSite() {
    if (busy || !sitePlan || dirty || documentDirty || englishDirty || sharedDirty || contactDirty || (sitePlan.shared&&!sharedChosen) || documentConflict || draftConflict) return;
    const choice = siteChoice ?? { plan: sitePlan, locales: selectedLocales, contact:contactChosen, key: crypto.randomUUID() };
    setSiteChoice(choice);
    void perform(async (current) => {
      try {
        const plan = choice.plan;
        const result = await request<Attempt>('/releases', { method: 'POST', headers: { 'Idempotency-Key': choice.key },
          body: JSON.stringify({ revisionId: plan.pages.find((item) => item.pageId === 'home')!.revisionId,
            expectedActiveVersion: plan.activeVersion, ...(choice.contact&&plan.contactTemplate?{expectedContact:{revisionId:plan.contactTemplate.revisionId,version:plan.contactTemplate.version,templateHash:plan.contactTemplate.template.hash,locales:['nl','en']}}:{}), ...(plan.shared?{expectedShared:{revisionId:plan.shared.revisionId,version:plan.shared.version}}:{}), expectedLocales: (plan.localeVariants ?? []).filter((item) => choice.locales.includes(item.pageId)).map(({pageId, locale, revisionId, version, structure}) => ({pageId, locale, revisionId, version, structure})), expectedPages: plan.pages.map(({ pageId, revisionId, version }) => ({ pageId, revisionId, version })) }),
        });
        if (!current()) return;
        setAttempt(result);
        if (result.status === 'building') { setStatus(message('buildingSite')); return; }
        const latestDocument = selectedDocument ? await request<DocumentDto>(`/documents/${selectedDocument.pageId}`) : null;
        if (!current()) return;
        invalidateSiteChoice();
        setPage((prior) => prior ? { ...prior, activeReleaseId: result.releaseId, activeVersion: plan.activeVersion + 1 } : prior);
        if (latestDocument) setSelectedDocument((prior) => prior ? {
          ...prior, published: latestDocument.published, publishedFile: latestDocument.publishedFile,
        } : prior);
        setStatus(message('publishedSite',{version:plan.activeVersion+1}));
      } catch (err) {
        if (err instanceof ApiError && [409, 422, 428].includes(err.status) && current()) {
          invalidateSiteChoice(); setStatus(message(err.status === 422 ? 'planFailed' : 'planConflict'));
        }
        throw err;
      }
    });
  }
  const availableImage: DocumentImageReference | null = uploadStatus?.state === 'ready'
    ? { assetId: uploadStatus.assetId, fileVersion: uploadStatus.fileVersion, usage: 'hero', decorative: false, altText: { nl: '' } }
    : values.image ?? null;
  const publicUrl = selectedDocument ? selectedDocument.publishedFile ? `/sites/${website}/${selectedDocument.publishedFile}` : null
    : attempt?.publicUrl ?? (page?.activeReleaseId ? `/sites/${website}/index.html` : null);
  return <main lang={uiLocale}><label>{t.uiLanguage}<select value={uiLocale} onChange={(event) => setUiLocale(event.target.value as UiLocale)}><option value="nl" lang="nl">Nederlands</option><option value="en" lang="en">English</option></select></label>
    <header>
      <AppLauncherLink href={import.meta.env.VITE_DRACONIS_HOME_URL} locale={uiLocale} />
      <p className="eyebrow">{t.brand}</p><h1>{t.editPage}</h1><p>{t.introHelp}</p></header>
    <section aria-labelledby="access-title"><h2 id="access-title">{t.openWebsite}</h2>
      <form onSubmit={open}>
        <label>{t.website}<select value={website} disabled={busy} onChange={(event) => {
          if ((dirty || documentDirty || englishDirty || sharedDirty || contactDirty) && !window.confirm(t.confirmSite)) return;
          reset(); setWebsite(event.target.value);
        }}><option value="demo-cms">{t.trialSite}</option><option value="demo-other">{t.otherSite}</option></select></label>
        <label>{t.testToken}<input type="password" autoComplete="off" value={token} onChange={(event) => {
          generation.current++; setBusy(false); setPreview(''); setError(null); setToken(event.target.value);
          setStatus(message('tokenChanged'));
        }} /></label>
        <button disabled={busy || !token}>{t.openPage}</button>
      </form><p className="hint">{t.tokenHelp}</p>
    </section>
    <p role="status" aria-live="polite" className="status">{formatUiMessage(uiLocale,status)}</p>
    {error && <p role="alert" className="error">{formatUiMessage(uiLocale,error)}</p>}
    {page?.sharedEnabled&&<section><h2>{t.sharedTitle}</h2><button disabled={busy||sharedDirty||contactDirty} onClick={openShared}>{t.openShared}</button>
      {shared&&sharedDraft&&<SharedNavigationEditor record={shared} draft={sharedDraft} onChange={(content)=>{setSharedDraft(content);setContactPreview('');setPreview('');invalidateSiteChoice();}} busy={busy} dirty={sharedDirty} onSave={saveShared} onPreview={previewShared}
        previewDisabled={!page?.pagesEnabled||dirty||documentDirty||englishDirty||!!english&&!english.revisionId} uiLocale={uiLocale}/>}
      {sharedLatest&&<aside><p>{t.sharedConflictHelp}</p><button disabled={busy} onClick={()=>{if(busy)return;setShared(sharedLatest);setSharedDraft(sharedLatest.content);setSharedLatest(null);setPreview('');invalidateSiteChoice();}}>{t.adoptShared}</button></aside>}
    </section>}
    {page?.contactEnabled&&<section><button disabled={busy||contactDirty||sharedDirty} onClick={openContact}>{t.openContact}</button>
      {contact&&contactDraft&&sharedDraft&&<ContactTemplateEditor record={contact} draft={contactDraft} sharedDraft={sharedDraft} busy={busy} dirty={contactDirty} sharedDirty={sharedDirty} uiLocale={uiLocale} locale={contactLocale} onLocaleChange={(locale)=>{setContactLocale(locale);setContactPreview('');}} preview={contactPreview}
        onChange={content=>{setContactDraft(content);setContactPreview('');invalidateSiteChoice();}} onSharedChange={content=>{setSharedDraft(content);setContactPreview('');invalidateSiteChoice();}} onSave={saveContact} onSaveShared={saveShared} onPreview={previewContact}/>}
      {contactLatest&&<aside><p>{t.contactConflict}</p><button disabled={busy} onClick={()=>{setContact(contactLatest);setContactDraft(contactLatest.content);setContactLatest(null);setContactPreview('');invalidateSiteChoice();}}>{t.adoptContact}</button></aside>}
    </section>}
    {page?.pagesEnabled && <section><h2>{dc.pages}</h2>
      <button disabled={busy} onClick={refreshOverview}>{dc.refresh}</button>
      {overview && <ul>{overview.pages.map((item) => <li key={item.pageId}>{item.title} · {item.file} · v{item.version}{' '}
        <button disabled={busy || dirty || documentDirty || englishDirty} onClick={() => openDocument(item.pageId)}>{item.pageId === 'home' ? dc.openHome : dc.openPage}</button></li>)}</ul>}
      <fieldset disabled={busy}><legend>{dc.create}</legend>
        <label>{dc.newTitle}<input value={newPage.title} maxLength={200} onChange={(event) => setNewPage({ ...newPage, title: event.target.value })} /></label>
        <label>{dc.newSlug}<input value={newPage.slug} maxLength={80} onChange={(event) => setNewPage({ ...newPage, slug: event.target.value })} /></label>
        <button disabled={!newPage.title.trim() || !newPage.slug.trim() || dirty || documentDirty} onClick={createDocument}>{dc.create}</button>
      </fieldset>
    </section>}
    {page && <section aria-labelledby="content-title"><h2 id="content-title">{selectedDocument ? documentDraft?.title : t.homeDutch}</h2>
      <p>{t.versionDraft} {selectedDocument?.version ?? page.pageVersion} {t.versionActive} {page.activeVersion}{(selectedDocument ? documentDirty : dirty) ? t.unsaved : ''}</p>
      {!selectedDocument && !english && <>
      <label>{t.homeTitle}<input value={values.title} maxLength={200} disabled={busy} onChange={(event) => setValues({ ...values, title: event.target.value })} /></label>
      <label>{t.homeIntro}<textarea value={values.intro} maxLength={4000} rows={5} disabled={busy} onChange={(event) => setValues({ ...values, intro: event.target.value })} /></label>
      </>}
      {page.uploadEnabled && !english && <fieldset disabled={busy}><legend>{t.uploadOwn}</legend>
        <label>{t.imageFile}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
        <button disabled={!file} onClick={upload}>{t.uploadFile}</button>
        <p className="hint">{t.uploadHelp}</p>
        <details><summary>{t.uploadRecovery}</summary>
          <label>{t.uploadId}<input value={uploadJobId} onChange={(event) => setUploadJobId(event.target.value)} /></label>
          <div className="actions"><button disabled={!uploadJobId} onClick={() => loadUpload()}>{t.loadStatus}</button>
            <button disabled={uploadStatus?.state !== 'failed' || uploadStatus.assetId !== uploadJobId} onClick={() => loadUpload(true)}>{t.retryProcessing}</button></div>
        </details>
        {uploadStatus && <aside><p>{t.lastUpload} {code(uploadStatus.state)} {t.rightsInline} {code(uploadStatus.rights)}</p>
          {uploadStatus.error && <p>{uploadStatus.error}</p>}
          {uploadStatus.state === 'ready' && <button onClick={() => useUpload(uploadStatus)}>{t.useUpload}</button>}
        </aside>}
      </fieldset>}
      {page.pagesEnabled && <div className="actions"><button disabled={busy || englishDirty} onClick={() => {setEnglishLatest(null); setEnglishConfirmedStructure(''); setEnglish(null); setEnglishDraft(null); setPreview('');}}>{t.editDutch}</button>
        <button disabled={busy || dirty || documentDirty || englishDirty} onClick={openEnglish}>{t.editEnglish}</button>
        {english && <button disabled={busy} onClick={() => { if (englishDirty && !window.confirm(t.confirmDiscardEnglish)) return;
          setEnglishConfirmedStructure(''); setEnglishDraft(english.content); }}>{t.discardEnglish}</button>}
      </div>}
      {englishLatest && <aside><p>{t.englishConflictHelp}</p>
        {english && englishLatest.version===english.version && englishLatest.revisionId===english.revisionId && englishLatest.structure!==english.structure &&
          <button disabled={busy} onClick={() => {if(busy)return; setEnglishConfirmedStructure(''); setEnglish({...englishLatest,needsUpdate:true}); setEnglishLatest(null); setPreview(''); invalidateSiteChoice();}}>{t.reloadEnglishSource}</button>}
        <button disabled={busy} onClick={() => {if (busy) return; setEnglishConfirmedStructure(''); setEnglish(englishLatest); setEnglishDraft(englishLatest.content); setEnglishLatest(null); setPreview(''); invalidateSiteChoice();}}>{t.adoptEnglish}</button></aside>}
      {english && englishDraft && <EnglishEditor portfolioSelections={portfolioSelections} onLoadPortfolio={() => {if(busy)return;void perform(async(current)=>{const selections=await request<PortfolioSelection[]>('/portfolio-snapshots');if(current())setPortfolioSelections(selections);});}} uiLocale={uiLocale} sourceConfirmed={!!english&&englishConfirmedStructure===english.structure} onAlign={()=>{if(english)setEnglishConfirmedStructure(english.structure);}} record={english} draft={englishDraft} onChange={(content) => {setEnglishDraft(content); setPreview(''); invalidateSiteChoice();}} busy={busy} dirty={englishDirty} onSave={saveEnglish} onPreview={previewEnglish} />}
      {selectedDocument && !english && documentDraft && <DocumentEditor uiLocale={uiLocale} draft={documentDraft} onChange={changeDocument} busy={busy} dirty={documentDirty} publishedFile={selectedDocument.publishedFile}
        onSave={saveDocument} onPreview={previewDocument} availableImage={availableImage} portfolioSelections={portfolioSelections}
        onLoadPortfolio={() => { if (busy) return; void perform(async (current) => { const selections = await request<PortfolioSelection[]>('/portfolio-snapshots'); if (current()) setPortfolioSelections(selections); }); }} />}
      {documentConflict && <aside><p>{dc.conflict}</p><p>{documentConflict.content.title}</p>
        <button disabled={busy} onClick={() => { if (busy) return; setSelectedDocument(documentConflict); setDocumentDraft(documentConflict.content);
          setDocumentConflict(null); setPreview(''); resetRights(); invalidateSiteChoice(); }}>{dc.latest}</button></aside>}
      {!selectedDocument && !english && <fieldset disabled={busy}><legend>{t.imageInDraft}</legend>
        <p className="hint">{page.uploadEnabled ? t.imageHelpUploads
          : t.imageHelpFixture}</p>
        <label>{t.imageSelect}<select value={values.image ? `${values.image.assetId}:${values.image.fileVersion}` : ''} onChange={(event) => {
          resetRights();
          const [assetId, version] = event.target.value.split(':');
          setValues({ ...values, image: assetId ? { assetId, fileVersion: Number(version), usage: 'hero',
            altText: values.image?.altText ?? { nl: '' }, decorative: values.image?.decorative ?? false } : null });
        }}><option value="">{t.noImage}</option>
          {values.image && !['photo', 'unlicensed', 'pending'].includes(values.image.assetId) && <option value={`${values.image.assetId}:${values.image.fileVersion}`}>{t.uploadedVersion} {values.image.fileVersion}</option>}
          <option value="photo:1">{t.fixtureOne}</option><option value="photo:2">{t.fixtureTwo}</option>
          <option value="unlicensed:1">{t.fixtureUnlicensed}</option><option value="pending:1">{t.fixturePending}</option></select></label>
        {values.image && <>
          <label className="check"><input type="checkbox" checked={values.image.decorative} onChange={(event) => {
            setValues({ ...values, image: { ...values.image!, decorative: event.target.checked,
              altText: event.target.checked ? { nl: '' } : values.image!.altText } });
          }} />{t.imageDecorative}</label>
          <label>{t.altDutch}<input value={values.image.altText.nl ?? ''} maxLength={2000} disabled={values.image.decorative} onChange={(event) => {
            setValues({ ...values, image: { ...values.image!, altText: { ...values.image!.altText, nl: event.target.value } } });
          }} /></label>
          <p className="hint">{values.image.decorative ? t.decorativeHelp : t.altHelp}</p>
        </>}
      </fieldset>}
      {page.uploadEnabled && selectedImage && <fieldset disabled={busy}><legend>{t.reviewRights}</legend>
        <p>{t.rightsHelp}</p>
        <button onClick={loadRights}>{t.loadRights}</button>
        {rightsTarget?.assetId === selectedImage.assetId && <>
          <p>{t.currentStatus} {code(rightsTarget.rights)} {t.versionInline} {rightsTarget.metadataVersion}</p>
          <label>{t.rightsOwner}<input value={rightsDecision.owner} onChange={(event) => setRightsDecision({ ...rightsDecision, owner: event.target.value })} /></label>
          <label>{t.rightsSource}<input value={rightsDecision.source} onChange={(event) => setRightsDecision({ ...rightsDecision, source: event.target.value })} /></label>
          <label>{t.rightsBasis}<textarea rows={3} value={rightsDecision.basis} onChange={(event) => setRightsDecision({ ...rightsDecision, basis: event.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={rightsDecision.confirmed} onChange={(event) => setRightsDecision({ ...rightsDecision, confirmed: event.target.checked })} />{t.rightsConfirm}</label>
          <p className="hint">{t.rightsActorHelp}</p>
          <div className="actions"><button disabled={!rightsDecision.confirmed} onClick={() => decideRights('cleared')}>{t.clearRights}</button>
            <button disabled={!rightsDecision.confirmed} className="secondary" onClick={() => decideRights('blocked')}>{t.blockPublication}</button></div>
        </>}
      </fieldset>}
      {!selectedDocument && !english && draftConflict && <aside><h3>{t.latestText}</h3><p>{draftConflict.values.title}</p><p>{draftConflict.values.intro}</p>
        <button disabled={busy} onClick={() => {
          if (busy) return;
          setPage(draftConflict); setValues(draftConflict.values); setDraftConflict(null); setPreview('');
          resetRights();
          setPendingChoice(null); setPublicationConflict(false); setAttempt(null);
          setStatus(message('adoptedLatest'));
        }}>{t.adoptLatest}</button>
        <p>{t.keepInputHelp}</p></aside>}
      {!selectedDocument && !english && <div className="actions"><button disabled={busy || !dirty || !!draftConflict} onClick={save}>{t.saveHome}</button>
        <button className="secondary" disabled={busy || dirty || !!draftConflict} onClick={previewDraft}>{t.previewHomeButton}</button>
        {!page.pagesEnabled && <button disabled={busy || dirty || !!draftConflict || publicationConflict} onClick={publish}>{pendingChoice ? t.retryPage : t.publishPage}</button>}</div>}
      {!page.pagesEnabled && publicationConflict && <aside><p>{t.confirmRevision}</p><button disabled={busy} onClick={() => { if (busy) return; setPublicationConflict(false); setStatus(message('revisionConfirmed')); }}>{t.rechooseRevision}</button></aside>}
      {page.pagesEnabled && <fieldset disabled={busy}><legend>{dc.planTitle}</legend>
        <button disabled={dirty || documentDirty || !!draftConflict || !!documentConflict || englishDirty || sharedDirty || contactDirty} onClick={prepareSite}>{dc.plan}</button>
        {sitePlan && <>{sitePlan.contactTemplate&&<aside><p>{t.contactPin} · {sitePlan.contactTemplate.version} · {sitePlan.contactTemplate.template.hash}</p><label className="check"><input type="checkbox" checked={contactChosen} onChange={event=>{setContactChosen(event.target.checked);setSiteChoice(null);}}/>{t.contactPick}</label></aside>}{sitePlan.shared&&<aside><p>{t.sharedRevision} {sitePlan.shared.revisionId} · v{sitePlan.shared.version}</p>
          <SharedNavigationSummary record={sitePlan.shared} uiLocale={uiLocale}/>
          <label className="check"><input type="checkbox" checked={sharedChosen} onChange={(event)=>{setSharedChosen(event.target.checked);setSiteChoice(null);}}/>{t.chooseShared}</label></aside>}<ul>{sitePlan.pages.map((item) => <li key={item.pageId}>{item.title} · {item.file} · v{item.version}</li>)}</ul>
          <button disabled={dirty || documentDirty || !!draftConflict || !!documentConflict || englishDirty || sharedDirty || contactDirty || !!sitePlan.shared&&!sharedChosen} onClick={publishSite}>{siteChoice ? dc.retry : dc.publish}</button></>}
      </fieldset>}
      {sitePlan && <fieldset disabled={busy}><legend>{t.explicitLocales}</legend>
        <p>{t.retainedHelp}</p>
        {(sitePlan.retainedLocales ?? []).map((item) => <p key={item.pageId}>{t.retainedEnglish} {item.title} · {item.file}</p>)}
        {(sitePlan.localeVariants ?? []).map((item) => <label key={item.pageId} className="check"><input type="checkbox" checked={selectedLocales.includes(item.pageId)} disabled={!item.supported || item.needsUpdate}
          onChange={(event) => {setSelectedLocales((prior) => event.target.checked ? [...prior, item.pageId] : prior.filter((id) => id !== item.pageId)); setSiteChoice(null);}} />{t.publishEnglish} {item.title ?? t.missingTitle} · en/{item.slug ?? t.missingSlug}.html{item.needsUpdate ? t.structureNeeded : ''}{!item.supported ? t.onlyText : ''}
        </label>)}
      </fieldset>}
      {publicUrl && <p><a href={publicUrl} target="_blank" rel="noreferrer">{t.openPublic}</a></p>}
      {preview && <div><h3>{t.previewHeading}</h3><iframe title={t.previewFrame} sandbox="" srcDoc={preview} /></div>}
    </section>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
