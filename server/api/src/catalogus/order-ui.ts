export const orderCopy = {
  nl: { heading: 'Redactionele itemvolgorde', help: 'Verplaats bestaande actieve items en sla de volledige volgorde expliciet op. Bestaande snapshots blijven gelijk.',
    up: 'Omhoog', down: 'Omlaag', save: 'Volgorde opslaan', cancel: 'Volgordewijzigingen annuleren', empty: 'Geen actieve items.',
    pending: 'Volgorde gewijzigd, nog niet opgeslagen.', saved: 'Volgorde opgeslagen. Het open item is behouden.',
    stale: 'De collectie is gewijzigd. Kies Laden voor de actuele itemset; de voorgestelde volgorde is behouden.', unsaved: 'Sla de volgorde eerst op of annuleer de wijzigingen.' },
  en: { heading: 'Editorial item order', help: 'Move existing active items and save the entire order explicitly. Existing snapshots stay unchanged.',
    up: 'Move up', down: 'Move down', save: 'Save order', cancel: 'Cancel order changes', empty: 'No active items.',
    pending: 'Order changed, not saved yet.', saved: 'Order saved. The open item is preserved.',
    stale: 'The collection changed. Load the current item set; the proposed order is preserved.', unsaved: 'Save or cancel the order changes first.' },
};
const copy = orderCopy.nl;
export const orderMarkup = `<fieldset><legend>${copy.heading}</legend><p>${copy.help}</p><ol id="orderItems"></ol><button id="saveOrder" disabled>${copy.save}</button><button id="cancelOrder" disabled>${copy.cancel}</button><p id="orderMessage" role="status"></p></fieldset>`;
export const orderScript = `
const orderText=${JSON.stringify(copy)};
let orderDraft=[],orderVersion=0,orderDirty=false,orderSite=site(),orderBaseline=[],orderControls=[],orderLoaded=false;
function syncOrderControls(){orderControls.forEach(control=>control.button.disabled=busy||control.boundary);el('saveOrder').disabled=busy||!orderLoaded;el('cancelOrder').disabled=busy||!orderLoaded}
function renderOrder(focusId,direction){
 el('orderItems').replaceChildren();orderControls=[];let focusButton,focusAlternative;
 orderDraft.forEach((item,index)=>{const li=document.createElement('li');li.textContent=item.title+' ';el('orderItems').append(li);
 for(const delta of [-1,1]){const button=document.createElement('button');button.textContent=(delta<0?orderText.up:orderText.down)+' '+item.title;
 const boundary=index+delta<0||index+delta>=orderDraft.length;orderControls.push({button,boundary});button.disabled=busy||boundary;
 button.onclick=()=>{const target=index+delta;if(busy||target<0||target>=orderDraft.length)return;[orderDraft[index],orderDraft[target]]=[orderDraft[target],orderDraft[index]];orderDirty=true;renderOrder(item.itemId,delta);el('orderMessage').textContent=orderText.pending};li.append(button);
 if(item.itemId===focusId&&delta===direction)focusButton=button;
 if(item.itemId===focusId&&!boundary)focusAlternative=button;
 }});
 if(!orderDraft.length)el('orderItems').textContent=orderText.empty;
 syncOrderControls();
 if(focusButton){(focusButton.disabled?(focusAlternative||el('cancelOrder')):focusButton).focus()}
}
function loadOrderFromItems(force=false){if(orderDirty&&!force)return;orderBaseline=items.map(item=>({itemId:item.itemId,title:item.title}));orderDraft=orderBaseline.map(item=>({...item}));orderVersion=collectionVersion;orderDirty=false;orderLoaded=true;renderOrder();el('orderMessage').textContent=''}
el('saveOrder').onclick=async()=>{if(busy)return;const run=report(async()=>{let saved;try{saved=await api('/catalogus/api/'+site()+'/order',json('PUT',{expectedVersion:orderVersion,itemIds:orderDraft.map(item=>item.itemId)}))}catch(error){throw Error(orderText.stale+' '+error.message)}
 orderBaseline=orderDraft.map(item=>({...item}));orderVersion=saved.version;collectionVersion=saved.version;orderDirty=false;renderOrder();},orderText.saved);await run();el('orderMessage').textContent=el('message').textContent;el('saveOrder').focus()};
el('cancelOrder').onclick=()=>{orderDraft=orderBaseline.map(item=>({...item}));orderDirty=false;renderOrder();el('orderMessage').textContent='';el('saveOrder').focus()};
const orderSiteChange=el('site').onchange;el('site').onchange=()=>{if(orderDirty){el('site').value=orderSite;el('orderMessage').textContent=orderText.unsaved;return}orderSiteChange();if(site()!==orderSite){orderSite=site();orderDraft=[];orderBaseline=[];orderVersion=0;orderDirty=false;orderLoaded=false;renderOrder();el('orderMessage').textContent=''}};
`;
