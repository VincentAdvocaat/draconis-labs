export const galleryMarkup = `<fieldset><legend>Beelden bij het item</legend>
<button id="loadGallery">Beeldgalerij openen</button>
<div id="galleryEditor" hidden>
<p>Het omslagbeeld verschijnt in het raster. Op de detailpagina staan ook de extra beelden.</p>
<label>Extra afbeelding<select id="galleryAsset"></select></label>
<button id="addGalleryPhoto">Afbeelding toevoegen</button>
<div id="galleryPhotos"></div>
<label>Omslagbeeld<select id="galleryCover"></select></label>
<button id="saveGallery">Beeldgalerij opslaan</button>
</div></fieldset>`;

export const galleryScript = `
let galleryDraft, galleryVersion;
function clearGallery() {
  galleryDraft = undefined;
  galleryVersion = undefined;
  el('galleryEditor').hidden = true;
}
function renderGallery() {
  const list = el('galleryPhotos');
  const cover = el('galleryCover');
  const selectedCover = cover.value;
  list.replaceChildren();
  cover.replaceChildren(new Option('Huidig omslagbeeld · '+current.media.assetId+' v'+current.media.fileVersion, ''));
  for (const photo of galleryDraft) {
    const row = document.createElement('fieldset');
    const heading = document.createElement('legend');
    heading.textContent = photo.assetId+' v'+photo.fileVersion;
    row.append(heading);
    cover.add(new Option(heading.textContent, photo.usage));
    const altInputs = [];
    for (const locale of ['nl','en']) {
      const label = document.createElement('label');
      label.textContent = 'Alttekst '+locale.toUpperCase();
      const input = document.createElement('input');
      input.maxLength = 2000;
      input.value = photo.altText[locale] ?? '';
      input.readOnly = photo.decorative;
      altInputs.push(input);
      input.oninput = () => { photo.altText[locale] = input.value; };
      label.append(input);
      row.append(label);
    }
    const decorativeLabel = document.createElement('label');
    decorativeLabel.textContent = 'Decoratief beeld';
    const decorative = document.createElement('input');
    decorative.type = 'checkbox';
    decorative.checked = photo.decorative;
    decorative.onchange = () => {
      photo.decorative = decorative.checked;
      if (photo.decorative) photo.altText = { nl: '', en: '' };
      for (const alt of altInputs) {
        alt.readOnly = photo.decorative;
        if (photo.decorative) alt.value = '';
      }
    };
    decorativeLabel.append(decorative);
    row.append(decorativeLabel);
    const creditLabel = document.createElement('label');
    creditLabel.textContent = 'Publieke fotocredit';
    const credit = document.createElement('input');
    credit.maxLength = 200;
    credit.value = photo.publicPhotoCredit ?? '';
    credit.oninput = () => { photo.publicPhotoCredit = credit.value; };
    creditLabel.append(credit);
    row.append(creditLabel);
    const remove = document.createElement('button');
    remove.textContent = 'Verwijder '+heading.textContent+' uit galerij';
    remove.onclick = report(async () => {
      galleryDraft = galleryDraft.filter(entry => entry !== photo);
      renderGallery();
      el('galleryAsset').focus();
    });
    row.append(remove);
    list.append(row);
  }
  cover.value = galleryDraft.some(photo => photo.usage === selectedCover) ? selectedCover : '';
}
el('loadGallery').onclick = report(async () => {
  if (!current) throw Error('Kies een bewaard item');
  if (defaultFormChanged()) throw Error('Sla wijzigingen aan het item eerst op');
  galleryDraft = (current.gallery ?? []).map(photo => ({ ...photo, altText: { ...photo.altText } }));
  galleryVersion = current.version;
  const options = el('galleryAsset');
  options.replaceChildren(new Option('Kies een afbeelding', ''));
  assets.forEach(asset => {
    if (asset.state === 'ready' && !sameFile(asset,current.media))
      options.add(new Option(asset.assetId+' v'+asset.fileVersion, asset.assetId+'/'+asset.fileVersion));
  });
  el('galleryCover').value = '';
  renderGallery();
  el('galleryEditor').hidden = false;
  options.focus();
});
el('addGalleryPhoto').onclick = report(async () => {
  const selected = el('galleryAsset').value;
  const asset = assets.find(candidate => candidate.assetId+'/'+candidate.fileVersion === selected);
  if (!galleryDraft || !asset || asset.state !== 'ready') throw Error('Kies een gereed beeld');
  if (galleryDraft.length >= 4) throw Error('Kies maximaal vier extra beelden');
  if (galleryDraft.some(photo => sameFile(photo,asset))) throw Error('Dit beeld staat al in de galerij');
  galleryDraft.push({ assetId: asset.assetId, fileVersion: asset.fileVersion,
    usage: 'gallery-'+crypto.randomUUID(), altText: {}, decorative: false });
  renderGallery();
  el('galleryCover').focus();
});
el('saveGallery').onclick = report(async () => {
  if (!current || !galleryDraft || galleryVersion !== current.version) throw Error('Open de actuele beeldgalerij');
  if (defaultFormChanged()) throw Error('Sla wijzigingen aan het item eerst op');
  const itemId = current.itemId;
  const coverUsage = el('galleryCover').value;
  await api('/catalogus/api/'+site()+'/items/'+itemId+'/gallery', json('PUT', {
    expectedVersion: galleryVersion, gallery: galleryDraft, ...(coverUsage ? { coverUsage } : {}),
  }));
  await load({ itemId });
  el('loadGallery').focus();
}, 'Beeldgalerij opgeslagen. De volgende snapshot gebruikt deze beeldkeuze.');
`;
