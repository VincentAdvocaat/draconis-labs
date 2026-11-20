import {createCmsTranslator,contactFieldLabels,type UiLocale} from './i18n';
import type {ContactValues,SharedNavigationContent} from './shared-navigation';
export interface ContactContent {schemaVersion:1;fields:Record<string,ContactValues>}
export interface ContactRecord {revisionId:string;version:number;content:ContactContent;template:{id:string;schemaVersion:number;hash:string;sourceDefaultLocale:'en'}}
export function ContactTemplateEditor({record,draft,sharedDraft,onChange,onSharedChange,busy,dirty,sharedDirty,onSave,onSaveShared,onPreview,locale,onLocaleChange,uiLocale,preview}: {
 record:ContactRecord;draft:ContactContent;sharedDraft:SharedNavigationContent;onChange:(value:ContactContent)=>void;onSharedChange:(value:SharedNavigationContent)=>void;
 busy:boolean;dirty:boolean;sharedDirty:boolean;onSave:()=>void;onSaveShared:()=>void;onPreview:()=>void;locale:'nl'|'en';onLocaleChange:(locale:'nl'|'en')=>void;uiLocale:UiLocale;preview:string;
}){
 const {copy:t,text}=createCmsTranslator(uiLocale);
 const fields=(values:Record<string,ContactValues>,update:(value:Record<string,ContactValues>)=>void)=>Object.entries(values).map(([key,map])=>{
  const label=`${contactFieldLabels[uiLocale][key as keyof typeof contactFieldLabels.nl]??key} ${locale}`;
  const set=(value:string|null)=>update({...values,[key]:{...map,[locale]:value}});
  return <div key={key}><label>{label}<textarea rows={key==='intro'?4:1} maxLength={5000} value={map[locale]??''} onChange={event=>set(event.target.value)}/></label>
   <label className="check"><input type="checkbox" checked={map[locale]==null} onChange={event=>set(event.target.checked?null:'')}/>{text('missingField',{label})}</label></div>;
 });
 return <section><h2>{t.contactTemplate}</h2><p>{t.contactEditHelp}</p><p>{t.contactSource} {record.template.sourceDefaultLocale}</p>
  <p>{t.contactPageRevision} {record.revisionId} · {record.version}</p><p>{t.contactTemplateHash} <code>{record.template.hash}</code></p>
  <label>{t.contactLocale}<select value={locale} disabled={busy} onChange={event=>onLocaleChange(event.target.value as 'nl'|'en')}><option value="nl">Nederlands</option><option value="en">English</option></select></label>
  <fieldset disabled={busy}><legend>{t.contactPageTexts}</legend>{fields(draft.fields,fields=>onChange({...draft,fields}))}<button disabled={!dirty} onClick={onSave}>{t.saveContact}</button></fieldset>
  <fieldset disabled={busy}><legend>{t.contactSharedTexts}</legend>{fields(sharedDraft.contact??{},contact=>onSharedChange({...sharedDraft,contact}))}<button disabled={!sharedDirty} onClick={onSaveShared}>{t.saveContactShared}</button></fieldset>
  <button disabled={busy||dirty||sharedDirty} onClick={onPreview}>{t.contactPreview}</button>
  {preview&&<iframe title={t.contactPreviewFrame} sandbox="allow-scripts" srcDoc={preview}/>}
 </section>;
}
