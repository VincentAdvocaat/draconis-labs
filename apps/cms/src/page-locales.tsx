export interface EnglishContent {
  schemaVersion: 1; locale: 'en'; title: string | null; slug: string | null; seoTitle: string | null; seoDescription: string | null;
  blocks: Array<{blockId: string; type: 'text'; heading: string | null; body: string | null}>;
}
export interface EnglishDto {
  pageId: string; revisionId: string | null; version: number; structure: string; savedStructure: string;
  supported: boolean; needsUpdate: boolean; sourceBlocks: Array<{blockId: string; type: string}>; content: EnglishContent;
}
export interface LocaleChoice {
  pageId: string; locale: 'en'; revisionId: string; version: number; structure: string;
  title: string | null; slug: string | null; needsUpdate: boolean; supported: boolean;
}
export function EnglishEditor({record, draft, onChange, busy, onSave, onPreview, dirty}: {
  record: EnglishDto; draft: EnglishContent; onChange: (content: EnglishContent) => void; busy: boolean;
  onSave: () => void; onPreview: () => void; dirty: boolean;
}) {
  const field = (label: string, value: string | null, change: (value: string | null) => void, max: number, multiline = false) =>
    <div><label>{label}{multiline ? <textarea rows={4} maxLength={max} value={value ?? ''} onChange={(event) => change(event.target.value)} />
      : <input maxLength={max} value={value ?? ''} onChange={(event) => change(event.target.value)} />}</label>
      <label className="check"><input type="checkbox" checked={value === null} onChange={(event) => change(event.target.checked ? null : '')} />{label} ontbreekt</label></div>;
  return <fieldset disabled={busy}><legend>English · dezelfde pagina-ID {record.pageId}</legend>
    <p>Standaardtaal: Nederlands. Inhoudstaal: English. Geen automatische vertaling of NL-fallback.</p>
    {!record.supported ? <p role="alert">EN ondersteunt in deze stap alleen tekstblokken. Afbeeldingen en portfolio worden niet weggelaten. Bewerk en publiceer deze pagina in NL.</p> : <>
      {record.needsUpdate && <aside><p>EN moet worden bijgewerkt: de NL-blokstructuur is gewijzigd. Je opgeslagen EN-tekst blijft behouden.</p>
        <button onClick={() => onChange({...draft, blocks: record.sourceBlocks.map(({blockId}) => draft.blocks.find((block) => block.blockId === blockId)
          ?? {blockId, type: 'text', heading: null, body: null})})}>EN-blokstructuur bijwerken</button></aside>}
      {field('EN-paginatitel', draft.title, (title) => onChange({...draft, title}), 200)}
      {field('EN-slug', draft.slug, (slug) => onChange({...draft, slug}), 80)}
      {field('EN-SEO-titel', draft.seoTitle, (seoTitle) => onChange({...draft, seoTitle}), 200)}
      {field('EN-SEO-beschrijving', draft.seoDescription, (seoDescription) => onChange({...draft, seoDescription}), 1000, true)}
      {draft.blocks.map((block, index) => <fieldset key={block.blockId}><legend>EN-tekstblok {index + 1}</legend>
        {field(`EN-blokkop ${index + 1}`, block.heading, (heading) => onChange({...draft, blocks: draft.blocks.map((item) => item.blockId === block.blockId ? {...block, heading} : item)}), 200)}
        {field(`EN-bloktekst ${index + 1}`, block.body, (body) => onChange({...draft, blocks: draft.blocks.map((item) => item.blockId === block.blockId ? {...block, body} : item)}), 10_000, true)}
      </fieldset>)}
      <button disabled={!dirty} onClick={onSave}>EN-concept opslaan</button>
      <button disabled={dirty || !record.revisionId || record.needsUpdate} onClick={onPreview}>English privé bekijken</button>
    </>}
  </fieldset>;
}
