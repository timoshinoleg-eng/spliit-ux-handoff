const RUB_ONLY=new Set(['RUB','USD','EUR','CNY','TRY','THB','AED','KZT','GEL','AMD']);
import {recordSettlement} from './settlement-recovery.js';
export {recordSettlement} from './settlement-recovery.js';
const money=(n,cur)=>((n||0)/100).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+cur;
export function validatedDraft(doc){
 if(!doc||!Number.isSafeInteger(doc.totalAmount)||doc.totalAmount<1)throw Error('Модель не смогла определить сумму. Загрузите более чёткое фото.');
 if(!RUB_ONLY.has(doc.currency))throw Error('Валюта документа не поддерживается для автоматического заполнения');
 if(!['receipt','transfer','booking','purchase','unknown','voice'].includes(doc.kind))throw Error('Неизвестный тип документа');
 return doc;
}
export async function photoData(file){
 if(!(file instanceof Blob)||!/^image\//.test(file.type)||file.size>12_000_000)throw Error('Выберите фото JPG/PNG/WebP не больше 12 МБ');
 const bmp=await createImageBitmap(file);
 try{
  const scale=Math.min(1,1600/Math.max(bmp.width,bmp.height));
  const cv=document.createElement('canvas');cv.width=Math.round(bmp.width*scale);cv.height=Math.round(bmp.height*scale);
  const c=cv.getContext('2d');c.drawImage(bmp,0,0,cv.width,cv.height);
  const quality=0.75;
  const blob=await new Promise((ok,fail)=>cv.toBlob(x=>x?ok(x):fail(Error('Не удалось обработать изображение')),'image/jpeg',quality));
  if(blob.size>1_300_000)throw Error('Фото слишком большое после сжатия. Обрежьте лишний фон.');
  return {mimeType:'image/jpeg',data:(await new Promise((ok,fail)=>{const r=new FileReader();r.onerror=fail;r.onload=()=>ok(String(r.result).split(',')[1]);r.readAsDataURL(blob)}))};
 }finally{bmp.close?.()}
}
export function installAiUI({S,call,onReceipt}){
 const root=document.getElementById('app');let selectedKind='receipt';
 function render(){
  if(S.page!=='expense'||!S.boot?.features?.aiEnabled||!S.group)return;
  const form=root.querySelector('#expense-form');
  if(!form||form.querySelector('[data-ai="receipt"]'))return;
  const controls=document.createElement('div');controls.className='field';
  controls.innerHTML='<div class="advanced-actions"><button class="btn ghost" type="button" data-ai="receipt">ИИ · фото чека</button><button class="btn ghost" type="button" data-ai="document">ИИ · скрин/бронь</button></div>'+
   '<input type="file" id="ai-photo" accept="image/jpeg,image/png,image/webp" style="display:none">'+
   '<p class="form-hint">Фотография отправляется в Google Gemini только после вашего согласия. Распознанные суммы нужно проверить. Фото не сохраняются в Spliit.</p>';
  const tools=form.querySelector('.expense-tools-content');
  if(tools)tools.append(controls);
  else form.querySelector('button[type=submit]')?.before(controls);
 }
 root.addEventListener('click',e=>{
  const button=e.target.closest('[data-ai]');
  if(!button)return;
  e.preventDefault();e.stopImmediatePropagation();
  selectedKind=button.dataset.ai;
  root.querySelector('#ai-photo')?.click();
 },true);
 root.addEventListener('change',async e=>{
  if(e.target.id!=='ai-photo')return;
  e.stopImmediatePropagation();
  const file=e.target.files?.[0];e.target.value='';
  if(!file)return;
  if(!confirm('Отправить фото для распознавания на сервер Gemini (Google)? Удалите или закройте персональные банковские данные, которые не нужны для учёта.'))return;
  const controls=root.querySelectorAll('[data-ai]');
  controls.forEach(b=>b.disabled=true);
  try{
   const image=await photoData(file);
   const result=await call('ai_analyze',{groupId:S.groupId,kind:selectedKind,mimeType:image.mimeType,data:image.data,consent:true});
   const draft=validatedDraft(result.draft);
   let rate=1,source='исходная валюта';
   const cur=S.group.group.currencyCode;
   if(draft.currency!==cur){
    const fx=await call('fx_rates',{groupId:S.groupId,from:draft.currency,to:cur});rate=Number(fx.rate);source=fx.source;
    if(!Number.isFinite(rate)||rate<=0)throw Error('Курс валют недоступен; используйте ручной ввод');
   }
   if(draft.kind==='receipt'&&draft.items?.length){
    const amount=Math.round(draft.totalAmount*rate);
    const parts=draft.items.map(x=>({name:x.name,amount:Math.max(1,Math.round(x.amount*rate))}));
    const subtotal=parts.reduce((sum,x)=>sum+x.amount,0),difference=amount-subtotal;
    if(!confirm('Распознано '+draft.items.length+' позиций. '+money(draft.totalAmount,draft.currency)+'.'+(draft.currency!==cur?' Курс: '+source+'.':'')+(difference?' Внимание: позиции не совпадают с итогом на '+money(Math.abs(difference),cur)+'.':'')+' Проверьте распределение перед сохранением.'))return;
    onReceipt({title:draft.title,items:parts,totalAmount:amount,difference});
    return;
   }
   if(draft.kind==='transfer'){
    const dues=S.group.settlements.filter(x=>x.from===S.group.me);
    if(draft.status!=='paid'||!dues.length){alert('Перевод нельзя автоматически сопоставить с текущими долгами. Проверьте его вручную.');return;}
    const nameById=id=>S.group.participants.find(p=>p.id===id)?.name||'Участник';
    const index=prompt('Подтвердите, что перевод реально выполнен. Кому перевели? Выберите номер:\n'+dues.map((x,i)=>(i+1)+'. '+nameById(x.to)+' · долг '+money(x.amount,cur)).join('\n'));
    if(index===null)return;
    const debt=dues[Number(index)-1],sum=Math.round(draft.totalAmount*rate);
    if(!debt||sum>debt.amount)throw Error('Перевод превышает текущий долг. Укажите его вручную.');
    if(!confirm('Записать подтверждённый возврат '+money(sum,cur)+' получателю '+nameById(debt.to)+'?'))return;
    await recordSettlement({S,call,toParticipantId:debt.to,amount:sum});
    alert('Возврат записан. Проверьте баланс.');return;
   }
   if(draft.status==='pending')throw Error('Документ не подтверждает оплату. Трата не добавлена.');
   const amount=Math.round(draft.totalAmount*rate);
   if(!confirm('Распознано: '+draft.title+'\n'+money(draft.totalAmount,draft.currency)+(rate!==1?' → '+money(amount,cur)+' ('+source+')':'')+'\nЗаполнить форму? Сохранение останется за вами.'))return;
   root.querySelector('#e-title').value=draft.title.slice(0,150);
   root.querySelector('#e-amount').value=(amount/100).toFixed(2);
   if(rate!==1){
    root.querySelector('#foreign-amount').value=(draft.totalAmount/100).toFixed(2);
    root.querySelector('#foreign-currency').value=draft.currency;
   }
   root.querySelector('#e-amount').dispatchEvent(new Event('input',{bubbles:true}));
   const notes=root.querySelector('#expense-form textarea[name=notes]');
   if(notes)notes.value=('Распознано по '+(draft.kind==='booking'?'брони':'скриншоту')+'; дата '+(draft.date||'не определена')+'. Подтвердите оплату и участников.').slice(0,990);
  }catch(err){alert(err?.message||String(err));}finally{controls.forEach(b=>b.disabled=false);}
 },true);
 return {render};
}