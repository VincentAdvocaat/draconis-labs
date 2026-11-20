import {createCmsTranslator, type UiLocale} from './i18n';
export interface DocumentImageReference { assetId: string; fileVersion: number; usage: string; altText: Record<string, string>; decorative: boolean }
export interface TextBlock { blockId: string; type: 'text'; heading: string; body: string }
export interface ImageBlock { blockId: string; type: 'image'; reference: DocumentImageReference; caption: string }
export interface PortfolioSelection { ref: {websiteId: string; collectionId: 'portfolio'; snapshotId: string}; checksum: string; localeContext: {defaultLocale: 'nl' | 'en'; locale: 'nl' | 'en'; fallbackLocale?: 'nl' | 'en'}; itemCount?: number }
export interface PortfolioBlock extends PortfolioSelection { blockId: string; type: 'portfolio'; labels?: {heading: Partial<Record<'nl' | 'en', string | null>>; empty: Partial<Record<'nl' | 'en', string | null>>} }
export interface DocumentContent { schemaVersion: 1; locale: 'nl'; title: string; slug: string; seoTitle: string; seoDescription: string; blocks: Array<TextBlock | ImageBlock | PortfolioBlock> }
export interface DocumentDto { pageId: string; revisionId: string; version: number; content: DocumentContent; published: boolean }
export interface SitePlan {contactTemplate?:import('./contact-template').ContactRecord; shared?: import('./shared-navigation').SharedNavigationDto; localeVariants?: import('./page-locales').LocaleChoice[]; retainedLocales?: Array<{pageId: string; title: string; file: string}>; activeReleaseId: string | null; activeVersion: number; pages: Array<{ pageId: string; revisionId: string; version: number; title: string; file: string }> }

export function DocumentEditor({ draft, onChange, busy, dirty, onSave, onPreview, availableImage, portfolioSelections = [], onLoadPortfolio, uiLocale = 'nl' }: {
  uiLocale?: UiLocale; draft: DocumentContent; onChange: (value: DocumentContent) => void; busy: boolean; dirty: boolean;
  onSave: () => void; onPreview: () => void; availableImage: DocumentImageReference | null; portfolioSelections?: PortfolioSelection[]; onLoadPortfolio?: () => void;
}) {
  const {copy: t, text} = createCmsTranslator(uiLocale);
  const move = (position: number, offset: number) => {
    const blocks = [...draft.blocks];
    [blocks[position], blocks[position + offset]] = [blocks[position + offset], blocks[position]];
    onChange({ ...draft, blocks });
  };
  return <fieldset disabled={busy}><legend>{draft.title}</legend>
    <label>{t.title}<input value={draft.title} maxLength={200} onChange={(event) => onChange({ ...draft, title: event.target.value })} /></label>
    <label>{t.slug}<input value={draft.slug} maxLength={80} onChange={(event) => onChange({ ...draft, slug: event.target.value })} /></label>
    <label>{t.seoTitle}<input value={draft.seoTitle} maxLength={200} onChange={(event) => onChange({ ...draft, seoTitle: event.target.value })} /></label>
    <label>{t.seoDescription}<textarea rows={2} value={draft.seoDescription} maxLength={1000} onChange={(event) => onChange({ ...draft, seoDescription: event.target.value })} /></label>
    {draft.blocks.map((block, index) => <fieldset key={block.blockId}><legend>{block.type === 'text' ? t.text : block.type === 'image' ? t.image : t.portfolio} {index + 1}</legend>
      {block.type === 'text' ? <>
        <label>{t.heading}<input value={block.heading} maxLength={200} onChange={(event) => onChange({ ...draft, blocks: draft.blocks.map((item) => item.blockId === block.blockId ? { ...block, heading: event.target.value } : item) })} /></label>
        <label>{t.body}<textarea rows={4} value={block.body} maxLength={10_000} onChange={(event) => onChange({ ...draft, blocks: draft.blocks.map((item) => item.blockId === block.blockId ? { ...block, body: event.target.value } : item) })} /></label>
      </> : block.type === 'portfolio' ? <>
        <p>{t.pageLanguage} {draft.locale} {t.blockLanguage} {block.localeContext.locale}</p>
        <p>{t.snapshot} {block.ref.snapshotId} · {block.localeContext.locale} · {t.fallback} {block.localeContext.fallbackLocale ?? t.none} · {t.checksum} {block.checksum}</p>
        {(['nl', 'en'] as const).map((locale) => (['heading', 'empty'] as const).map((field) => {
          const labels = block.labels ?? { heading: { nl: 'Portfolio', en: 'Portfolio' }, empty: { nl: 'Er zijn nog geen projecten.', en: 'No projects yet.' } };
          const value = labels[field][locale];
          const update = (value: string | null) => onChange({ ...draft, blocks: draft.blocks.map((item) => item.blockId === block.blockId
            ? { ...block, labels: { ...labels, [field]: { ...labels[field], [locale]: value } } } : item) });
          return <div key={`${locale}-${field}`}><label>{field === 'heading' ? t.portfolioHeading : t.portfolioEmpty} {locale}
            <input maxLength={500} value={value ?? ''} onChange={(event) => update(event.target.value)} /></label>
            <label className="check"><input type="checkbox" checked={value == null} onChange={(event) => update(event.target.checked ? null : '')} />{text('missingLabel',{field:field === 'heading' ? t.headingWord : t.emptyWord,locale})}</label>
          </div>;
        }))}
      </> : <>
        <label className="check"><input type="checkbox" checked={block.reference.decorative} onChange={(event) => onChange({ ...draft, blocks: draft.blocks.map((item) => item.blockId === block.blockId ? { ...block,
          reference: { ...block.reference, decorative: event.target.checked, altText: event.target.checked ? { nl: '' } : block.reference.altText } } : item) })} />{t.decorative}</label>
        <label>{t.alt}<input value={block.reference.altText.nl ?? ''} maxLength={2000} disabled={block.reference.decorative} onChange={(event) => onChange({ ...draft, blocks: draft.blocks.map((item) => item.blockId === block.blockId ? { ...block,
          reference: { ...block.reference, altText: { ...block.reference.altText, nl: event.target.value } } } : item) })} /></label>
        <label>{t.caption}<input value={block.caption} maxLength={1000} onChange={(event) => onChange({ ...draft, blocks: draft.blocks.map((item) => item.blockId === block.blockId ? { ...block, caption: event.target.value } : item) })} /></label>
      </>}
      <div className="actions"><button disabled={index === 0} onClick={() => move(index, -1)}>{t.block} {index + 1} {t.up}</button>
        <button disabled={index === draft.blocks.length - 1} onClick={() => move(index, 1)}>{t.block} {index + 1} {t.down}</button></div>
    </fieldset>)}
    <div className="actions"><button disabled={draft.blocks.length >= 16} onClick={() => onChange({ ...draft,
      blocks: [...draft.blocks, { blockId: crypto.randomUUID(), type: 'text', heading: '', body: '' }] })}>{t.addText}</button>
      <button disabled={!availableImage || draft.blocks.some((block) => block.type === 'image') || draft.blocks.length >= 16} onClick={() => {
        if (!availableImage) return; const blockId = crypto.randomUUID();
        onChange({ ...draft, blocks: [...draft.blocks, { blockId, type: 'image', reference: { ...availableImage, usage: `block-${blockId}` }, caption: '' }] });
      }}>{t.addImage}</button></div>
    {onLoadPortfolio && <fieldset><legend>{t.pinnedPortfolio}</legend>
      <button onClick={onLoadPortfolio}>{t.loadSnapshots}</button>
      {portfolioSelections.map((selection) => <p key={selection.ref.snapshotId}>
        {selection.ref.snapshotId} · {selection.localeContext.locale} · {t.fallback} {selection.localeContext.fallbackLocale ?? t.none} · {selection.itemCount} {t.items} · {t.checksum} {selection.checksum}
        <button disabled={draft.blocks.length >= 16 && !draft.blocks.some((block) => block.type === 'portfolio')} onClick={() => {
          const prior = draft.blocks.find((block) => block.type === 'portfolio');
          const block = { blockId: prior?.blockId ?? crypto.randomUUID(), type: 'portfolio' as const,
            ref: selection.ref, checksum: selection.checksum, localeContext: selection.localeContext, labels: prior?.type === 'portfolio' ? prior.labels : undefined };
          onChange({ ...draft, blocks: prior ? draft.blocks.map((item) => item.blockId === prior.blockId ? block : item) : [...draft.blocks, block] });
        }}>{text('chooseSnapshot',{locale:selection.localeContext.locale})}</button>
      </p>)}
    </fieldset>}
    <div className="actions"><button disabled={!dirty} onClick={onSave}>{t.save}</button><button disabled={dirty} className="secondary" onClick={onPreview}>{t.preview}</button></div>
  </fieldset>;
}
