import {createCmsTranslator, type UiLocale} from './i18n';
export interface EnglishContent {
  schemaVersion: 1; locale: 'en'; title: string | null; slug: string | null; seoTitle: string | null; seoDescription: string | null;
  blocks: Array<{blockId:string;type:'text';heading:string|null;body:string|null}|{blockId:string;type:'image';altText:string|null;caption:string|null}>;
}
export interface EnglishDto {
  pageId: string; revisionId: string | null; version: number; structure: string; savedStructure: string;
  supported: boolean; needsUpdate: boolean; sourceImages?:Array<{blockId:string;assetId:string;fileVersion:number;usage:string;decorative:boolean}>; sourceBlocks: Array<{blockId: string; type: string}>; content: EnglishContent;
}
export interface LocaleChoice {
  pageId: string; locale: 'en'; revisionId: string; version: number; structure: string;
  title: string | null; slug: string | null; needsUpdate: boolean; supported: boolean;
}
export function EnglishEditor({record, draft, onChange, busy, onSave, onPreview, dirty, uiLocale = 'nl',onAlign,sourceConfirmed=false}: {
  uiLocale?: UiLocale; record: EnglishDto; draft: EnglishContent; onChange: (content: EnglishContent) => void; busy: boolean;
  onAlign?:()=>void;sourceConfirmed?:boolean;onSave: () => void; onPreview: () => void; dirty: boolean;
}) {
  const {copy: t, text} = createCmsTranslator(uiLocale);
  const field = (label: string, value: string | null, change: (value: string | null) => void, max: number, multiline = false, disabled=false) =>
    <div><label>{label}{multiline ? <textarea rows={4} maxLength={max} value={value ?? ''} onChange={(event) => change(event.target.value)} />
      : <input disabled={disabled} maxLength={max} value={value ?? ''} onChange={(event) => change(event.target.value)} />}</label>
      <label className="check"><input type="checkbox" checked={value === null} onChange={(event) => change(event.target.checked ? null : '')} />{text('missingField',{label})}</label></div>;
  return <fieldset disabled={busy}><legend>{t.englishIdentity} {record.pageId}</legend>
    <p>{t.englishHelp}</p>
    {!record.supported ? <p role="alert">{t.englishUnsupported}</p> : <>
      {record.needsUpdate && <aside><p>{t.englishStructureHelp}</p>
        <button onClick={() => {onChange({...draft, blocks: record.sourceBlocks.flatMap<EnglishContent['blocks'][number]>(({blockId,type}) => {
          const existing=draft.blocks.find((block)=>block.blockId===blockId&&block.type===type);
          if(existing)return [existing];
          return type==='text'?[{blockId,type:'text',heading:null,body:null}]:type==='image'?[{blockId,type:'image',altText:null,caption:null}]:[];
        })});onAlign?.();}}>{t.alignEnglish}</button></aside>}
      {field(t.englishTitle, draft.title, (title) => onChange({...draft, title}), 200)}
      {field(t.englishSlug, draft.slug, (slug) => onChange({...draft, slug}), 80)}
      {field(t.englishSeoTitle, draft.seoTitle, (seoTitle) => onChange({...draft, seoTitle}), 200)}
      {field(t.englishSeoDescription, draft.seoDescription, (seoDescription) => onChange({...draft, seoDescription}), 1000, true)}
      {draft.blocks.map((block,index)=>block.type==='text'?<fieldset key={block.blockId}><legend>{t.englishTextBlock} {index+1}</legend>
        {field(text('englishHeading',{number:index+1}),block.heading,(heading)=>onChange({...draft,blocks:draft.blocks.map((item)=>item.blockId===block.blockId?{...block,heading}:item)}),200)}
        {field(text('englishBody',{number:index+1}),block.body,(body)=>onChange({...draft,blocks:draft.blocks.map((item)=>item.blockId===block.blockId?{...block,body}:item)}),10_000,true)}
      </fieldset>:<fieldset key={block.blockId}><legend>{t.englishImageBlock} {index+1}</legend>
        <p>{t.englishSourceImage} {record.sourceImages?.find((image)=>image.blockId===block.blockId)?.assetId} {t.versionInline} {record.sourceImages?.find((image)=>image.blockId===block.blockId)?.fileVersion}</p>
        <p>{record.sourceImages?.find((image)=>image.blockId===block.blockId)?.decorative?t.englishDecorativeImage:t.englishMeaningfulImage}</p>
        {field(t.englishImageAlt,block.altText,(altText)=>onChange({...draft,blocks:draft.blocks.map((item)=>item.blockId===block.blockId?{...block,altText}:item)}),2000,false,record.sourceImages?.find((image)=>image.blockId===block.blockId)?.decorative??false)}
        {field(t.englishImageCaption,block.caption,(caption)=>onChange({...draft,blocks:draft.blocks.map((item)=>item.blockId===block.blockId?{...block,caption}:item)}),1000,true)}
      </fieldset>)}
      <button disabled={!dirty||record.needsUpdate&&!sourceConfirmed} onClick={onSave}>{t.saveEnglish}</button>
      <button disabled={dirty || !record.revisionId || record.needsUpdate} onClick={onPreview}>{t.previewEnglishButton}</button>
    </>}
  </fieldset>;
}
