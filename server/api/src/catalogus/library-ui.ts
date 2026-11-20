import { versionMarkup } from './version-ui.js';

export const libraryMarkup = `<fieldset><legend>Bibliotheek</legend>
<p>Zoek op asset-ID. Status geldt voor de nieuwste bestandsversie. Bladeren verandert het open item niet; de afbeelding en versie kies je bij Afbeelding en rechten.</p>
<label>Zoek asset-ID<input id="libraryQuery" maxlength="100"></label>
<label>Rechtenfilter<select id="libraryRights"><option value="">Alle rechten</option><option value="unknown">Onbekend</option><option value="cleared">Vrijgegeven</option><option value="blocked">Geblokkeerd</option></select></label>
<label>Status nieuwste versie<select id="libraryState"><option value="">Alle statussen</option><option value="ready">Gereed</option><option value="processing">Wordt verwerkt</option><option value="failed">Mislukt</option></select></label>
<button id="librarySearch">Zoeken / verversen</button><p id="libraryMessage" role="status"></p><ul id="libraryResults"></ul><button id="libraryPrevious" disabled>Vorige 10</button><button id="libraryNext" disabled>Volgende 10</button>
<section id="libraryDetail" hidden aria-labelledby="libraryDetailTitle"><h2 id="libraryDetailTitle" tabindex="-1">Afbeeldingdetails</h2><button id="libraryClose">Details sluiten</button><p id="libraryInfo"></p>${versionMarkup}<ul id="libraryVersions"></ul><img id="libraryPreview" alt="Privévoorbeeld van de schone derivative" hidden><h3>Behouden gebruik</h3><p>Ook historische revisies en releases tellen mee. Dit overzicht geeft geen verwijzingen vrij.</p><ul id="libraryUsages"></ul></section></fieldset>`;

export const libraryScript = `
let libraryPage,libraryOffset=0,libraryListSequence=0,libraryDetailSequence=0,libraryPreviewUrl,libraryOpener;
const libraryContext=()=>site()+'|'+el('token').value;
function syncLibraryControls(){el('libraryPrevious').disabled=busy||!libraryPage||libraryOffset===0;el('libraryNext').disabled=busy||!libraryPage||libraryOffset+10>=libraryPage.total}
function closeLibraryDetail(focus=true){libraryDetailSequence++;clearVersionDetail();el('libraryDetail').hidden=true;el('libraryPreview').hidden=true;if(libraryPreviewUrl){URL.revokeObjectURL(libraryPreviewUrl);libraryPreviewUrl=undefined}if(focus&&libraryOpener)libraryOpener.focus()}
function resetLibrary(){libraryListSequence++;libraryPage=undefined;libraryOffset=0;el('libraryResults').replaceChildren();el('libraryMessage').textContent='Zoek in de geselecteerde website.';closeLibraryDetail(false);syncLibraryControls()}
function libraryLine(parent,text){const li=document.createElement('li');li.textContent=text;parent.append(li);return li}
async function showLibraryDetail(assetId,opener){
 clearVersionDetail();
 const context=libraryContext(),website=site(),sequence=++libraryDetailSequence;libraryOpener=opener;
 el('libraryDetail').hidden=false;el('libraryDetailTitle').textContent='Afbeeldingdetails: '+assetId;el('libraryDetailTitle').focus();el('libraryInfo').textContent='Details laden...';el('libraryVersions').replaceChildren();el('libraryUsages').replaceChildren();el('libraryPreview').hidden=true;
 if(libraryPreviewUrl){URL.revokeObjectURL(libraryPreviewUrl);libraryPreviewUrl=undefined}
 const valid=()=>context===libraryContext()&&sequence===libraryDetailSequence;
 try{const detail=await api('/catalogus/api/'+website+'/library/'+encodeURIComponent(assetId));if(!valid())return;
 setVersionDetail(detail,website);
 el('libraryInfo').textContent=detail.assetId+' / rechten: '+detail.rights+' / metadataversie '+detail.metadataVersion+(detail.archived?' / gearchiveerd':'');
 detail.versions.forEach(version=>{const row=libraryLine(el('libraryVersions'),'Versie '+version.fileVersion+' / '+version.state+' / '+version.variants.map(v=>v.width+'×'+v.height+' '+v.mime).join(', '));
 if(version.state==='ready'&&version.variants.length){const button=document.createElement('button');button.textContent='Privévoorbeeld versie '+version.fileVersion;row.append(button);button.onclick=async()=>{const previewSequence=++libraryDetailSequence;
 try{const response=await fetch('/catalogus/api/'+website+'/preview/'+encodeURIComponent(assetId)+'/'+version.fileVersion,{headers:{Authorization:'Bearer '+el('token').value}});if(!response.ok)throw Error('Voorbeeld niet beschikbaar');const blob=await response.blob();if(context!==libraryContext()||previewSequence!==libraryDetailSequence)return;if(libraryPreviewUrl)URL.revokeObjectURL(libraryPreviewUrl);libraryPreviewUrl=URL.createObjectURL(blob);el('libraryPreview').src=libraryPreviewUrl;el('libraryPreview').hidden=false}catch(error){if(context===libraryContext()&&previewSequence===libraryDetailSequence)el('libraryInfo').textContent=error.message}}}
 });
 detail.usages.forEach(usage=>libraryLine(el('libraryUsages'),usage.kind+' / '+usage.owner+' / versie '+usage.fileVersion+' / '+usage.slot));
 if(!detail.usages.length)libraryLine(el('libraryUsages'),'Geen behouden verwijzingen.');
 }catch(error){if(valid())el('libraryInfo').textContent=error.message}
}
async function loadLibrary(offset=0){
 const context=libraryContext(),website=site(),sequence=++libraryListSequence;
 const query=new URLSearchParams({q:el('libraryQuery').value,offset:String(offset),limit:'10'});
 if(el('libraryRights').value)query.set('rights',el('libraryRights').value);if(el('libraryState').value)query.set('state',el('libraryState').value);
 libraryPage=undefined;syncLibraryControls();closeLibraryDetail(false);el('libraryResults').replaceChildren();el('libraryMessage').textContent='Bibliotheek laden...';
 try{const result=await api('/catalogus/api/'+website+'/library?'+query);if(sequence!==libraryListSequence||context!==libraryContext())return;
 libraryPage=result;libraryOffset=result.offset;el('libraryResults').replaceChildren();result.items.forEach(asset=>{const row=libraryLine(el('libraryResults'),asset.assetId+' / nieuwste versie '+(asset.fileVersion??'ontbreekt')+' / '+(asset.state??'geen bestand')+' / '+asset.rights+' ');const button=document.createElement('button');button.textContent='Details '+asset.assetId;button.onclick=()=>showLibraryDetail(asset.assetId,button);row.append(button)});
 el('libraryMessage').textContent=result.items.length?'Resultaten '+(result.offset+1)+'–'+(result.offset+result.items.length)+' van '+result.total:result.total?'Deze pagina is leeg; ga terug of ververs.':'Geen afbeeldingen gevonden.';
 }catch(error){if(sequence===libraryListSequence&&context===libraryContext())el('libraryMessage').textContent=error.message}finally{if(sequence===libraryListSequence&&context===libraryContext())syncLibraryControls()}
}
el('librarySearch').onclick=()=>loadLibrary(0);
el('libraryQuery').oninput=()=>resetLibrary();
for(const id of ['libraryQuery','libraryRights','libraryState'])el(id).onchange=()=>loadLibrary(0);
el('libraryPrevious').onclick=()=>{if(libraryPage&&libraryOffset>0)return loadLibrary(Math.max(0,libraryOffset-10))};
el('libraryNext').onclick=()=>{if(libraryPage&&libraryOffset+10<libraryPage.total)return loadLibrary(libraryOffset+10)};
el('libraryClose').onclick=()=>closeLibraryDetail();
const librarySiteChange=el('site').onchange;el('site').onchange=()=>{librarySiteChange();resetLibrary()};
`;
