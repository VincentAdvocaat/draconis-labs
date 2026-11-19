import {createCmsTranslator, type UiLocale} from './i18n';

export interface SharedNavigationContent {schemaVersion:1;fields:{
  'navigation.languageLabel':{values:Partial<Record<'nl'|'en',string|null>>};
  'navigation.locale.nl':{value:string|null;sourceLocale:'nl'};
  'navigation.locale.en':{value:string|null;sourceLocale:'en'};
}}
export interface SharedNavigationDto {revisionId:string;version:number;content:SharedNavigationContent}
export function SharedNavigationSummary({record,uiLocale}:{record:SharedNavigationDto;uiLocale:UiLocale}) {
  const {copy:t}=createCmsTranslator(uiLocale);
  const value=(text:string|null|undefined)=>text==null?t.sharedAbsent:text===''?t.sharedEmpty:text;
  return <dl>{(['nl','en'] as const).map((locale)=><div key={locale}>
    <dt>{t.sharedLanguageHeading} {locale}</dt><dd>{value(record.content.fields['navigation.languageLabel'].values[locale])}</dd>
    <dt>{t.sharedLanguageName} {locale} · {t.sharedSourceLocale} {record.content.fields[`navigation.locale.${locale}`].sourceLocale}</dt>
    <dd>{value(record.content.fields[`navigation.locale.${locale}`].value)}</dd>
  </div>)}</dl>;
}
export function SharedNavigationEditor({record,draft,onChange,busy,dirty,onSave,onPreview,previewDisabled,uiLocale}: {
  record:SharedNavigationDto;draft:SharedNavigationContent;onChange:(content:SharedNavigationContent)=>void;
  busy:boolean;dirty:boolean;onSave:()=>void;onPreview:()=>void;previewDisabled:boolean;uiLocale:UiLocale;
}) {
  const {copy:t,text}=createCmsTranslator(uiLocale);
  const field=(label:string,value:string|null|undefined,update:(value:string|null)=>void) => <div><label>{label}
    <input maxLength={200} value={value??''} onChange={(event)=>update(event.target.value)}/></label>
    <label className="check"><input type="checkbox" checked={value==null} onChange={(event)=>update(event.target.checked?null:'')}/>{text('missingField',{label})}</label></div>;
  return <fieldset disabled={busy}><legend>{t.sharedTitle}</legend><p>{t.versionDraft} {record.version}</p>
    <p>{t.sharedHelp}</p>
    {(['nl','en'] as const).map((locale)=><div key={locale}>{field(`${t.sharedLanguageHeading} ${locale}`,draft.fields['navigation.languageLabel'].values[locale],(value)=>
      onChange({...draft,fields:{...draft.fields,'navigation.languageLabel':{values:{...draft.fields['navigation.languageLabel'].values,[locale]:value}}}}))}</div>)}
    {(['nl','en'] as const).map((locale)=>{
      const id=`navigation.locale.${locale}` as const;const current=draft.fields[id];
      return <div key={locale}><p>{t.sharedSourceLocale} {current.sourceLocale}</p>{field(`${t.sharedLanguageName} ${locale}`,current.value,(value)=>
        onChange({...draft,fields:{...draft.fields,[id]:{...current,value}}}))}</div>;
    })}
    <button disabled={!dirty} onClick={onSave}>{t.saveShared}</button>
    <button disabled={dirty||previewDisabled} onClick={onPreview}>{t.previewShared}</button>
    {previewDisabled&&<p>{t.sharedPickPage}</p>}
  </fieldset>;
}
