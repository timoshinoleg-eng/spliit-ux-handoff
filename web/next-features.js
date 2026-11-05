import {installNativeUX,saveSbp,loadSbp,clearSbp} from './native-ux.js';
const money=(v,c)=>(v/100).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+c;
const escapeHtml=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const say=text=>{const t=window.Telegram?.WebApp;if(t?.showAlert)t.showAlert(String(text));else alert(text)};
export default function installNext({S,call,render,openGroup}){
 const root=document.querySelector('#app'),native=installNativeUX({S});
 function deco(){
  native.render();
  if(S.page==='group'&&S.group){
   const d=S.group,area=root.querySelector('.group-tools-content');
   if(area&&!root.querySelector('[data-next="family"]')){
     const controls=document.createElement('div');controls.className='advanced-actions next-tools';
     controls.innerHTML='<button class="btn ghost" data-next="family">Семейный бюджет / пары</button>'+
      (d.isCreator?'<button class="btn ghost" data-next="fxConfig">Реальный курс обмена</button>'+
       '<button class="btn ghost" data-next="lock">'+(d.group.isLocked?'Разморозить чеки':'Заморозить чеки')+'</button>':'') ;
     area.append(controls);
   }
   if(d.group.isLocked&&!root.querySelector('.locked-note')){
     const el=document.createElement('div');el.className='notice locked-note';el.textContent='История чеков защищена. Можно погашать долги, но нельзя добавлять, изменять и удалять траты.';
     root.querySelector('.summary')?.after(el);
     for(const b of root.querySelectorAll('[data-action="expense"],[data-action="editExpense"],[data-action="deleteExpenseDirect"]'))b.disabled=true;
   }
   if(d.isCreator&&d.deletedExpenses?.length&&!root.querySelector('.deleted-bin')){
     const bin=document.createElement('section');bin.className='deleted-bin';
     bin.innerHTML='<h3>Корзина расходов</h3>'+d.deletedExpenses.slice(0,15).map(e=>
       '<div class="card"><span>'+escapeHtml(e.title)+' · '+money(e.amount,d.group.currencyCode)+'</span>'+
       '<button class="btn small ghost" data-next="restore" data-id="'+escapeHtml(e.id)+'">Восстановить</button></div>').join('');
     area?.append(bin);
   }
  }
  if(S.page==='settings'&&S.group&&!root.querySelector('[data-next="cloudLoad"]')){
    const f=root.querySelector('#sbp-form');
    if(f){
      const el=document.createElement('div');el.className='field';
      el.innerHTML='<button type="button" class="btn ghost" data-next="cloudLoad">Подставить мои сохранённые СБП-реквизиты</button>'+
       '<label class="check-item"><input type="checkbox" name="rememberSbp" value="yes"/> Сохранять мои СБП-реквизиты в Telegram CloudStorage (по желанию)</label>'+
       '<button class="btn ghost small" type="button" data-next="cloudClear">Очистить сохранённые реквизиты</button>';
      f.querySelector('button[type="submit"]')?.before(el);
    }
  }
  if(S.page==='expense'&&!root.querySelector('[data-next="nights"]')){
    const form=root.querySelector('#expense-form');
    if(form){
      const btn=document.createElement('button');btn.className='btn ghost full';btn.type='button';btn.dataset.next='nights';
      btn.textContent='Разделить аренду по количеству ночей';
      form.querySelector('.expense-tools-content')?.append(btn);
    }
  }
 }
 async function actionFamily(){
  const state=await call('family_link',{groupId:S.groupId,action:'list'});
  const me=S.group.participants.find(p=>p.id===S.group.me);
  const relations=S.group.participants.filter(p=>p.id!==S.group.me&&p.tgUserId);
  let info='Семья: личные доли и история расходов не меняются, а конечные переводы объединяются. Оба человека должны согласиться.';
  if(me.linkedToParticipantId){info+='\nВаш казначей: '+(S.group.participants.find(p=>p.id===me.linkedToParticipantId)?.name||'участник')+'.';}
  if(state.links?.length)info+='\nВы казначей для: '+state.links.map(x=>x.name).join(', ')+'.';
  if(me.pendingFamilyToId)info+='\nВаш запрос отправлен, ожидание подтверждения.';
  if(state.requests.length){
    const p=state.requests[0];
    if(confirm(info+'\n\n'+p.name+' хочет объединить баланс с вами. Принять?')){
      await call('family_link',{groupId:S.groupId,action:'accept',sourceId:p.id});await openGroup(S.groupId);say('Семейная пара подтверждена.');
    }
    return;
  }
  if(me.linkedToParticipantId||state.links?.length||me.pendingFamilyToId){
    if(confirm(info+'\n\nНажмите ОК, чтобы отменить свой запрос/разорвать свою связь.')){
      await call('family_link',{groupId:S.groupId,action:me.pendingFamilyToId?'cancel':'unlink'});
      await openGroup(S.groupId);
    }
    return;
  }
  const options=relations.filter(p=>!p.linkedToParticipantId&&!p.pendingFamilyToId);
  if(!options.length){say('В группе нет доступных пользователей Telegram для связи.');return;}
  const choice=prompt(info+'\n\nВыберите номер казначея:\n'+options.map((p,i)=>(i+1)+'. '+p.name).join('\n'));
  if(choice===null)return;
  const target=options[Number(choice)-1];if(!target)throw Error('Нужно выбрать номер участника');
  await call('family_link',{groupId:S.groupId,action:'request',targetId:target.id});
  await openGroup(S.groupId);say('Запрос отправлен. '+target.name+' должен подтвердить его в этом же меню.');
 }
 async function fxConfig(){
  const g=S.group.group;
  const spread=prompt('Комиссия обменника к курсу ЦБ (0–25%, до двух знаков). Фиксированный курс имеет приоритет.',String((g.fxSpreadBps||0)/100));
  if(spread===null)return;
  const promptRates='Фактические курсы: один курс в '+g.currencyCode+' за единицу валюты.\nПример: USD=98.5, THB=3.15.\nОставьте пустым, чтобы использовать ЦБ + комиссию.';
  const defaults=Object.entries(g.fxManualRates||{}).map(([k,v])=>k+'='+v).join(', ');
  const raw=prompt(promptRates,defaults);if(raw===null)return;
  const rates={};
  for(const part of raw.split(/[,;\n]+/).filter(Boolean)){
    const match=/^\s*([A-Z]{3})\s*=\s*(\d+(?:\.\d+)?)\s*$/.exec(part);
    if(!match)throw Error('Курс должен быть в формате USD=98.5');
    rates[match[1]]=Number(match[2]);
  }
  await call('group_fx_settings',{groupId:S.groupId,spreadPercent:Number(spread.replace(',','.')),rates});
  await openGroup(S.groupId);say('Курсы группы обновлены. Конвертация новых трат будет использовать их.');
 }
 async function nights(){
  const list=root.querySelectorAll('#paidfor-list .check-item');
  if(!list.length)return;
  const mode=root.querySelector('#e-mode');mode.value='BY_SHARES';mode.dispatchEvent(new Event('change',{bubbles:true}));
  for(const row of list){
    const who=row.querySelector('label')?.textContent||'Участник';
    const input=row.querySelector('input[type=number]');
    const value=prompt('Сколько ночей проживал(а) '+who+'? 0 — исключить из разделения',input?.value||'7');
    if(value===null)return;
    const n=Number(value);if(!Number.isInteger(n)||n<0||n>365)throw Error('Количество ночей: от 0 до 365');
    input.value=String(n);
    const ck=row.querySelector('input[type=checkbox]');ck.checked=n>0;
  }
  say('Количество ночей установлено. Проверьте итоговую сумму и сохраните расход.');
 }
 root.addEventListener('click',async e=>{
  const b=e.target.closest('[data-next], [data-action="deleteExpenseDirect"], [data-action="deleteExpense"]');
  if(!b)return;
  e.stopImmediatePropagation();e.preventDefault();
  const cmd=b.dataset.next||b.dataset.action;
  try{
   if(cmd==='family')await actionFamily();
   if(cmd==='fxConfig')await fxConfig();
   if(cmd==='lock'){
    const next=!S.group.group.isLocked;
    if(!confirm(next?'Заморозить чеки? Внесение и редактирование остановятся.':'Снять заморозку чеков?'))return;
    await call('group_safety',{groupId:S.groupId,action:'lock',locked:next});await openGroup(S.groupId);
   }
   if(cmd==='restore'){await call('group_safety',{groupId:S.groupId,action:'restore',expenseId:b.dataset.id});await openGroup(S.groupId);say('Расход восстановлен.');}
   if(cmd==='nights')await nights();
   if(cmd==='cloudLoad'){
    const info=await loadSbp();if(!info?.phone){say('Реквизитов в Telegram CloudStorage пока нет.');return;}
    const f=root.querySelector('#sbp-form');if(!f)return;
    f.elements.sbpPhone.value=info.phone;
    if(info.bank)f.elements.sbpBank.value=info.bank;
    f.elements.sbpConsent.checked=true;
    say('Реквизиты подставлены. Нажмите «Сохранить», чтобы применить их в группе.');
   }
   if(cmd==='cloudClear'){if(confirm('Очистить только сохранённые в CloudStorage реквизиты?')){await clearSbp();say('Сохранённые реквизиты очищены.');}}
   if(cmd==='deleteExpense' || cmd==='deleteExpenseDirect'){
    const id=cmd==='deleteExpense'?S.edit?.id:b.dataset.id;
    if(!id||!confirm('Переместить расход в корзину? Его можно будет восстановить.'))return;
    await call('expense_delete',{groupId:S.groupId,expenseId:id});
    S.edit=null;await openGroup(S.groupId);
    say('Расход в корзине. Создатель группы может восстановить его через раздел «Корзина расходов».');
   }
  }catch(err){say(err?.message||String(err));}
 },true);
 return {render:deco};
}
