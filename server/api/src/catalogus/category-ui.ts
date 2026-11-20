import { categoryCopy } from './category-copy.js';
const copy = categoryCopy.nl;
export const categoryMarkup = `<fieldset><legend>${copy.heading}</legend><p>${copy.help}</p>
<label>${copy.managed}<select id="categories"><option value="">${copy.fresh}</option></select></label>
<label>${copy.nameNl}<input id="categoryNl" maxlength="200"></label><label>${copy.nameEn}<input id="categoryEn" maxlength="200"></label>
<label><input id="categoryEnMissing" type="checkbox" checked>${copy.missingEn}</label>
<button id="saveCategory">${copy.save}</button><button id="cancelCategory">${copy.cancel}</button><button id="archiveCategory">${copy.archive}</button>
<label><input id="confirmCategoryDelete" type="checkbox">${copy.confirm}</label><button id="removeCategory">${copy.remove}</button><p id="categoryMessage" role="status"></p></fieldset>`;

export const categoryScript = `
let categories=[],editingCategory,categorySite=site();
const categoryText=${JSON.stringify(copy)};
function categoryReport(id,action){const run=report(action,categoryText.saved);return async()=>{await run();el('categoryMessage').textContent=el('message').textContent;el(id).focus()}}
function fillCategoryEditor(){el('categoryNl').value=editingCategory?.labels.nl??'';el('categoryEn').value=editingCategory?.labels.en??'';el('categoryEnMissing').checked=editingCategory?.labels.en==null;el('confirmCategoryDelete').checked=false}
function renderCategories(preferred=el('category').value){
 el('categories').replaceChildren(new Option(categoryText.fresh,''));el('category').replaceChildren();
 categories.forEach(category=>{const label=category.labels.nl+(category.archived?' / '+categoryText.archived:'');el('categories').add(new Option(label,category.categoryId));
 if(!category.archived||category.categoryId===preferred){const option=new Option(label,category.categoryId);option.disabled=category.archived;el('category').add(option)}});
 if(preferred&&!categories.some(category=>category.categoryId===preferred)){const missing=new Option(preferred+' / '+categoryText.unavailable,preferred);missing.disabled=true;el('category').add(missing)}
 el('category').value=preferred||'algemeen';
 if(editingCategory&&!categories.some(category=>category.categoryId===editingCategory.categoryId)){const missing=new Option(editingCategory.labels.nl+' / '+categoryText.unavailable,editingCategory.categoryId);missing.disabled=true;el('categories').add(missing)}
 el('categories').value=editingCategory?.categoryId??'';
}
async function refreshCategories(preferredId){const preserved=el('category').value;categories=await api('/catalogus/api/'+site()+'/categories');renderCategories(preserved);editingCategory=categories.find(category=>category.categoryId===preferredId);el('categories').value=editingCategory?.categoryId??'';fillCategoryEditor()}
function categoryFormChanged(){return el('categoryNl').value!==(editingCategory?.labels.nl??'')||el('categoryEn').value!==(editingCategory?.labels.en??'')||el('categoryEnMissing').checked!==(editingCategory?.labels.en==null)}
function requireCleanCategory(){if(categoryFormChanged())throw Error(categoryText.unsaved)}
el('cancelCategory').onclick=()=>{fillCategoryEditor();el('categoryNl').focus()};
el('categories').onchange=()=>{if(categoryFormChanged()){el('categories').value=editingCategory?.categoryId??'';el('message').textContent=categoryText.unsaved;return}editingCategory=categories.find(category=>category.categoryId===el('categories').value);fillCategoryEditor()};
el('saveCategory').onclick=categoryReport('saveCategory',async()=>{const saved=await api('/catalogus/api/'+site()+'/categories'+(editingCategory?'/'+editingCategory.categoryId:''),json(editingCategory?'PUT':'POST',{expectedVersion:editingCategory?.version??0,labels:{nl:el('categoryNl').value,en:el('categoryEnMissing').checked?null:el('categoryEn').value}}));await refreshCategories(saved.categoryId)});
el('archiveCategory').onclick=categoryReport('archiveCategory',async()=>{if(!editingCategory)throw Error(categoryText.pick);requireCleanCategory();await api('/catalogus/api/'+site()+'/categories/'+editingCategory.categoryId+'/archive',json('POST',{expectedVersion:editingCategory.version}));await refreshCategories(editingCategory.categoryId)});
el('removeCategory').onclick=categoryReport('removeCategory',async()=>{if(!editingCategory)throw Error(categoryText.pick);requireCleanCategory();if(!el('confirmCategoryDelete').checked)throw Error(categoryText.confirm);await api('/catalogus/api/'+site()+'/categories/'+editingCategory.categoryId,json('DELETE',{expectedVersion:editingCategory.version}));await refreshCategories()});
const categorySiteChange=el('site').onchange;el('site').onchange=()=>{if(categoryFormChanged()){el('site').value=categorySite;el('message').textContent=categoryText.unsaved;el('categoryMessage').textContent=categoryText.unsaved;return}categorySiteChange();categorySite=site();categories=[];editingCategory=undefined;renderCategories('algemeen');fillCategoryEditor();el('categoryMessage').textContent=''};
`;
