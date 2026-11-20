export const versionCopy = {
  nl: { heading: 'Nieuw bestand bij hetzelfde asset', disclosure: 'Een nieuwe gereedgemaakte versie vereist opnieuw vrijgave voor nieuw gebruik van ALLE versies van dit asset. Reeds gepubliceerde bestanden en snapshots blijven intact. Een bestaande rechtenblokkade blijft gelden. Mislukte verwerking verandert de rechten niet.',
    file: 'Bestand voor volgende versie', confirm: 'Ik begrijp dat nieuw gebruik van alle versies opnieuw rechtenbevestiging vereist.', upload: 'Nieuwe bestandsversie uploaden', retry: 'Mislukte verwerking opnieuw proberen',
    select: 'Kies een bestand en bevestig de rechtenherbevestiging.', ready: 'Nieuwe versie gereed. Bevestig de rechten opnieuw en kies de nieuwe fileVersion bewust in het item. Het open item is niet gewijzigd.',
    job: 'Verwerkingsstatus', latest: 'Nieuwste versie', attempts: 'Pogingen', waiting: 'Bestand wordt verwerkt...', unavailable: 'Open eerst een actueel assetdetail.', failed: 'Verwerking mislukt. De oude versies en rechten zijn behouden.' },
  en: { heading: 'New file for the same asset', disclosure: 'A completed new version requires renewed approval for new use of ALL versions of this asset. Already published files and snapshots remain intact. An existing rights block stays in force. Failed processing does not change rights.',
    file: 'File for next version', confirm: 'I understand that new use of all versions requires renewed rights approval.', upload: 'Upload new file version', retry: 'Retry failed processing',
    select: 'Choose a file and confirm rights reapproval.', ready: 'New version ready. Approve rights again and deliberately select the new fileVersion for the item. The open item is unchanged.',
    job: 'Processing status', latest: 'Latest version', attempts: 'Attempts', waiting: 'Processing file...', unavailable: 'Open current asset details first.', failed: 'Processing failed. Previous versions and rights are retained.' },
};
const copy = versionCopy.nl;
export const versionMarkup = `<fieldset><legend>${copy.heading}</legend><p>${copy.disclosure}</p><p id="versionTarget"></p><label>${copy.file}<input id="versionFile" type="file" accept="image/png,image/jpeg,image/webp"></label><label><input id="versionConfirm" type="checkbox">${copy.confirm}</label><button id="uploadVersion">${copy.upload}</button><button id="retryVersion" disabled>${copy.retry}</button><p id="versionMessage" role="status"></p></fieldset>`;
export const versionScript = `
const versionText=${JSON.stringify(copy)};let versionAsset,versionWebsite,versionContext,versionJob;
function clearVersionDetail(){versionAsset=undefined;versionJob=undefined;el('versionConfirm').checked=false;el('versionFile').value='';el('versionTarget').textContent='';el('versionMessage').textContent='';syncVersionControls()}
function setVersionDetail(detail,website){versionAsset=detail;versionWebsite=website;versionContext=libraryContext();versionJob=detail.versions[0]?.job;
 el('versionConfirm').checked=false;el('versionFile').value='';el('versionTarget').textContent=detail.assetId+' / '+versionText.latest+' '+(detail.versions[0]?.fileVersion??'—')+' / '+detail.rights;
 showVersionJob();syncVersionControls()}
function syncVersionControls(){const unavailable=busy||!versionAsset||Boolean(versionAsset.archived)||versionAsset.versions.some(v=>v.state==='processing');for(const id of ['uploadVersion','versionFile','versionConfirm'])el(id).disabled=unavailable;el('retryVersion').disabled=busy||versionJob?.state!=='failed'||versionJob.attempts>=versionJob.maxAttempts}
function showVersionJob(){el('versionMessage').textContent=versionJob?versionText.job+': '+versionJob.state+' / '+versionText.attempts+' '+versionJob.attempts+'/'+versionJob.maxAttempts+(versionJob.error?' / '+versionJob.error:''):''}
async function updateVersionDetails(assetId,jobId){
 const context=versionContext,website=versionWebsite;if(context!==libraryContext()||versionAsset?.assetId!==assetId)return;
 await showLibraryDetail(assetId,libraryOpener);if(context!==libraryContext()||versionAsset?.assetId!==assetId)return;
 if(jobId){const status=await api('/websites/'+website+'/media/jobs/'+jobId);if(context!==libraryContext()||versionAsset?.assetId!==assetId)return;versionJob={...status,jobId:status.jobId};showVersionJob()}
 await refreshAssets(selected());syncVersionControls();
}
async function versionAction(retry){
 if(!versionAsset||versionContext!==libraryContext())throw Error(versionText.unavailable);
 const asset=versionAsset,website=versionWebsite,file=el('versionFile').files[0];
 if(!retry&&(!file||!el('versionConfirm').checked))throw Error(versionText.select);
 if(retry&&(!versionJob||versionJob.state!=='failed'))throw Error(versionText.unavailable);
 const path='/websites/'+website+'/media/'+(retry?versionJob.jobId+'/retry':encodeURIComponent(asset.assetId)+'/versions');
 el('versionMessage').textContent=versionText.waiting;
 const response=await fetch(path,{method:'POST',headers:{Authorization:'Bearer '+el('token').value,...(retry?{}:{'Content-Type':file.type,'x-media-filename':file.name,'x-media-metadata-version':String(asset.metadataVersion),'x-media-file-version':String(asset.versions[0].fileVersion),'x-media-confirm-invalidation':'true'})},...(retry?{}:{body:file})});
 const result=await response.json();await updateVersionDetails(asset.assetId,result.jobId||(retry?versionJob?.jobId:undefined));
 if(!response.ok)throw Error(result.message||versionText.failed);
 el('versionMessage').textContent=versionText.ready;
}
for(const [id,retry] of [['uploadVersion',false],['retryVersion',true]])el(id).onclick=async()=>{if(busy)return;const run=report(()=>versionAction(retry),versionText.ready);await run();if(el('message').textContent!==versionText.ready)el('versionMessage').textContent=el('message').textContent;syncVersionControls();const target=el(id).disabled?el('uploadVersion'):el(id);(target.disabled?el('libraryDetailTitle'):target).focus()};
`;
