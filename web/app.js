import {splitExpense} from './expense-money.js';
import {pendingSettlement,cancelPendingSettlement} from './settlement-recovery.js';
import {recordSettlement} from './ai-ui.js';
import { BOT_USERNAME, MINI_APP_SHORT_NAME } from './config.js';
import { decodeQrFile } from './qr.js';
import installEnhancements from './advanced-ui.js';
const tg=window.Telegram?.WebApp;
const root=document.querySelector('#app');
let renderedScreen;
const S={page:'home',tab:'expenses',boot:null,group:null,groupId:null,invitation:null,loading:false,notice:null, demo:false,edit:null};
const CURRENCIES=['RUB','USD','EUR','CNY','TRY','THB','AED','KZT','GEL','AMD'];
const CURRENCY={RUB:'₽',USD:'$',EUR:'€',CNY:'¥',TRY:'₺',THB:'฿',AED:'د.إ',KZT:'₸',GEL:'₾',AMD:'֏'};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(v,code='RUB')=>(Number(v||0)/100).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+(CURRENCY[code]||code);
const betaFree=()=>S.boot?.features?.betaFree===true;
const extrasEnabled=()=>betaFree() || (S.group?.group?.proUntil > Date.now());
const haptic=type=>{try{tg?.HapticFeedback?.notificationOccurred(type||'success');}catch{}};
const fmtDate=ts=>new Date(ts).toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
const amountInt=value=>{const s=String(value).trim().replace(/\s/g,'').replace(',','.');if(!/^(\d{1,9})(\.\d{1,2})?$/.test(s))throw Error('Нужна положительная сумма с точностью до копейки');const [a,b='']=s.split('.'); const n=Number(a)*100+Number(b.padEnd(2,'0'));if(!Number.isSafeInteger(n)||n<=0)throw Error('Некорректная сумма');return n;};
const errText=e=>String(e?.message||e||'Неизвестная ошибка');
function configLink(token){ if(!BOT_USERNAME)return null;return MINI_APP_SHORT_NAME ? `https://t.me/${BOT_USERNAME}/${MINI_APP_SHORT_NAME}?startapp=${encodeURIComponent(token)}` : `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(token)}`; }
async function call(name,input={}){
 if(S.demo)return demoCall(name,input);
 const srv=tg?.Serverless;
 if(typeof srv?.call!=='function')throw Error('Откройте Spleet через бота в Telegram или попробуйте демоверсию');
 return new Promise((resolve,reject)=>srv.call(name,input,(error,data)=>error?reject(new Error(error.message||error.type||'Ошибка API')):resolve(data)));
}
async function busy(fn,preserveForm=false){try{S.loading=true;await fn();}catch(e){toast(errText(e),true);if(S.page==='create'||S.page==='expense'||S.page==='join'||S.page==='settings')preserveForm=true;}finally{try{await refreshPending();}catch(e){toast(errText(e),true);}S.loading=false;if(!preserveForm)render();else {root.querySelectorAll('button').forEach(x=>x.disabled=false);updateExpensePreview();}}}
function toast(msg,bad=false){const notice={msg,bad};S.notice=notice;document.querySelectorAll('.toast').forEach(el=>el.remove());const el=document.createElement('div');el.className='toast'+(bad?' error':'');el.setAttribute('role','alert');el.textContent=msg;root.appendChild(el);setTimeout(()=>{if(S.notice===notice){S.notice=null;document.querySelectorAll('.toast').forEach(x=>x.remove());}},3500);}
function header(){const letter=(S.boot?.user?.name||'Г').charAt(0).toUpperCase();return `<header class="header"><div class="brand">spliit<span>.</span></div><div class="flex">${S.demo?'<span class="badge demo">ДЕМО</span>':''}<div class="avatar" title="${esc(S.boot?.user?.name||'Гость')}">${esc(letter)}</div></div></header>`;}
function bottom(){return `<nav class="footbar"><button class="${S.page==='home'?'active':''}" data-action="home"><b>⌂</b>Группы</button><button class="${S.page==='create'?'active':''}" data-action="create"><b>＋</b>Создать</button><button class="${S.page==='group'?'active':''}" data-action="openCurrent"><b>≡</b>Расходы</button></nav>`;}
function viewHome(){
 const groups=S.boot?.groups||[];
 return `<h1 class="title">Ваши группы</h1>
 ${groups.length||S.invitation?'':'<p class="lead">Создайте группу для поездки, ужина или домашних расходов. Добавляйте траты, а Spleet посчитает, кто кому должен.</p>'}
 ${S.inviteUnavailable?'<p class="notice">Приглашение не найдено. Попросите организатора отправить новую ссылку.</p>':''}
 ${S.invitation?.alreadyMember?`<div class="join-box"><h2>${esc(S.invitation.groupName)}</h2><p>Вы уже в этой группе.</p><button class="btn primary" data-action="group" data-id="${esc(S.invitation.groupId)}">Открыть группу</button></div>`:''}
 ${S.invitation&&!S.invitation.alreadyMember?`<div class="join-box"><div class="eyebrow">ВАС ПРИГЛАСИЛИ</div><h3>${esc(S.invitation.groupName)}</h3><p class="note">Валюта группы: ${esc(S.invitation.currencyCode)}</p><button class="btn primary full" data-action="join">Присоединиться</button></div>`:''}
 ${S.homeLoadFailed?'<p class="notice error" role="alert">Не удалось загрузить группы. Проверьте связь и попробуйте снова.</p><button class="btn ghost" data-action="home">Обновить список</button>':''}
 <div class="home-create"><button class="btn primary" data-action="create">Создать группу</button></div>
 <div class="stack">${groups.length?groups.map(g=>`<button class="card group-card" data-action="group" data-id="${esc(g.id)}"><span class="group-icon">◈</span><span class="group-text"><strong>${esc(g.name)}</strong><small>${esc(g.currencyCode)} ${g.proUntil>Date.now()?'· Pro активен':betaFree()?'· Бета':''}</small></span><span class="chevron">›</span></button>`).join(''):S.invitation?'':'<div class="card empty">Групп пока нет. Если вас пригласили, откройте ссылку от организатора.</div>'}</div>
 ${!tg?.Serverless&&!S.demo?'<div class="spacer"></div><button class="btn ghost full" data-action="demo">Посмотреть демоверсию без Telegram</button>':''}`;
}
function back(title,subtitle=''){return `<div class="mini-nav"><button class="back" data-action="${['expense','invite','settings','pro'].includes(S.page)?'openCurrent':'home'}" aria-label="Назад">‹</button><div><h1 class="subheading">${esc(title)}</h1>${subtitle?`<div class="subtitle">${esc(subtitle)}</div>`:''}</div></div>`;}
function viewCreate(){return `${back('Новая группа','Укажите основные параметры')}<form class="form" id="create-form"><div class="field"><label for="g-name">Название группы</label><input id="g-name" name="name" type="text" autocomplete="off" autocapitalize="sentences" maxlength="80" required aria-label="Название группы" placeholder="Например, Шерегеш 2026"/></div><div class="field"><label for="g-cur">Валюта учёта</label><select id="g-cur" name="currencyCode">${CURRENCIES.map(x=>`<option value="${x}" ${x==='RUB'?'selected':''}>${x} · ${CURRENCY[x]}</option>`).join('')}</select></div><div class="field"><label for="g-desc">Описание (необязательно)</label><textarea id="g-desc" name="information" maxlength="1000" placeholder="Общая поездка или расходы квартиры"></textarea></div><div class="notice">Вы автоматически добавитесь в группу. Чтобы позвать остальных, после создания нажмите «Пригласить» и отправьте ссылку через Telegram. Имена заранее вводить не нужно.</div><button class="btn primary full" type="submit">Создать группу</button></form>`;}
function viewGroup(){const data=S.group;if(!data)return '<div class="card empty">Загрузка группы…</div>';
 const g=data.group,code=g.currencyCode,balance=data.balances?.[data.me]?.total||0;
 const own=balance<0?'Вы должны':balance>0?'Вам должны':'Ваш баланс';
 return `${back(g.name,`${data.participants.length} участников · ${code}`)}<div class="summary"><div class="metric"><span>${own}</span><strong class="${balance>=0?'positive':'negative'}">${money(Math.abs(balance),code)}</strong></div><div class="metric"><span>Всего расходов</span><strong>${money((data.expenses||[]).filter(e=>!e.isReimbursement).reduce((a,b)=>a+b.amount,0),code)}</strong></div></div>
 <div class="actions group-primary"><button class="btn primary" data-action="expense">+ Добавить трату</button><button class="btn ghost" data-action="invite">Пригласить</button></div>
 <div class="tabs">${[['expenses','Расходы'],['balances','Долги'],['members','Участники']].map(([t,label])=>`<button class="tab ${S.tab===t?'active':''}" data-action="tab" aria-pressed="${S.tab===t}" data-tab="${t}">${label}</button>`).join('')}</div>
 ${recoveryPanel(data)}${S.tab==='expenses'?renderExpenses(data):S.tab==='balances'?renderBalances(data):renderMembers(data)}
 <details class="group-tools"><summary>Ещё действия с группой</summary><div class="group-tools-content">
 ${extrasEnabled()?'<button class="btn ghost" data-action="exportCsv">Скачать расходы для Excel</button>':''}</div></details>`;
}
function recoveryPanel(d){
 if(S.settlementStorageError)return `<section class="card notice" role="alert">${esc(S.settlementStorageError)}</section>`;
 const row=S.pendingSettlement;if(!row)return '';

 const name=d.participants.find(p=>p.id===row.toParticipantId)?.name||'Участник';
 return `<section class="card notice" role="status"><strong>Проверьте запись возврата</strong><p>${esc(name)} · ${money(row.amount,row.currency)}. Ответ о сохранении не был подтверждён. Проверка использует исходную запись.</p><div class="advanced-actions"><button class="btn primary" data-action="recoverSettlement">Проверить запись</button><button class="btn ghost" data-action="cancelSettlement">Отменить незавершённую запись</button></div></section>`;
}
async function refreshPending(){
 const groupId=S.groupId,member=S.group?.me,uid=S.boot?.user?.id;
 if(!groupId||!member)return;
 let pending,error;try{pending=await pendingSettlement(S);}catch(e){error=errText(e);}
 if(S.groupId===groupId&&S.group?.me===member&&S.boot?.user?.id===uid){S.pendingSettlement=pending;S.settlementStorageError=error;}
}
function renderExpenses(d){return d.expenses.length?`<div class="stack">${d.expenses.map(e=>{const payer=d.participants.find(p=>p.id===e.paidById)?.name||'Участник';return `<div class="card expense"><div class="expense-icon">${e.isReimbursement?'⇄':'◈'}</div><div style="flex:1;min-width:0"><strong>${esc(e.title)}</strong><small>${esc(payer)} · ${fmtDate(e.expenseDate)}</small></div><div class="amount">${money(e.amount,d.group.currencyCode)}${(e.createdByTgId===S.boot?.user?.id||d.isCreator)?`<div><button class="btn small ghost" data-action="${e.isReimbursement?'deleteExpenseDirect':'editExpense'}" data-id="${esc(e.id)}">${e.isReimbursement?'Удалить':'Изменить'}</button></div>`:''}</div></div>`}).join('')}</div>`:'<div class="card empty">Расходов пока нет. Добавьте первый чек.</div>';}
function renderBalances(data){
 const transfers=data.settlements||[];
 if(!transfers.length)return '<div class="card empty">Долгов нет. Все расчёты закрыты.</div>';
 const rows=transfers.map(transfer=>{
  const sender=data.participants.find(person=>person.id===transfer.from);
  const recipient=data.participants.find(person=>person.id===transfer.to);
  const outgoing=transfer.from===data.me;
  const incoming=transfer.to===data.me;
  const senderName=esc(sender?.name||'Участник');
  const recipientName=esc(recipient?.name||'Участник');
  const title=outgoing?'Вы должны':incoming?'Вам должны':'Долг между участниками';
  const direction=outgoing?`Получатель: ${recipientName}`:incoming?`От кого: ${senderName}`:`${senderName} → ${recipientName}`;
  const details=outgoing&&recipient?.sbpPhone?`<small>СБП ${esc(recipient.sbpPhone)}${recipient.sbpBank?' · '+esc(recipient.sbpBank):''}</small>`:'';
  const action=outgoing&&!S.pendingSettlement&&!S.settlementStorageError
   ?`<button class="btn small primary" data-action="settle" data-to="${esc(transfer.to)}" data-amount="${transfer.amount}">Отметить возврат</button>`
   :incoming&&sender?.tgUserId?`<button class="btn small ghost" data-action="remind" data-debtor="${esc(transfer.from)}">Напомнить о долге</button>`:'';
  return `<article class="card debt-card"><div><strong>${title}</strong><small>${direction}</small>${details}</div><strong class="debt-amount">${money(transfer.amount,data.group.currencyCode)}</strong>${action}</article>`;
 });
 return `<div class="section-head"><h2>Кому и сколько вернуть</h2></div><p class="note">Переведите деньги в своём банке, затем отметьте возврат здесь.</p><div class="stack">${rows.join('')}</div>`;
}
function renderMembers(d){return `<div class="section-head"><h2>Участники</h2><button class="btn small primary" data-action="invite">Пригласить</button></div>
<p class="note">Чтобы человек присоединился через Telegram, отправьте ему приглашение. Не нужно добавлять его имя вручную.</p>
${d.participants.map(p=>`<div class="card person"><div class="avatar">${esc(p.name[0]?.toUpperCase()||'?')}</div><div style="flex:1;min-width:0"><strong>${esc(p.name)}${p.id===d.me?' · вы':''}</strong><small>${p.tgUserId?'В группе через Telegram':'Добавлен для расчётов'}${p.sbpBank?' · '+esc(p.sbpBank):''}</small>${d.isCreator&&p.claimToken?`<small>Код привязки: <code class="claim-code">${esc(p.claimToken)}</code></small>`:''}</div><div class="member-controls">${p.id===d.me?'<span class="pill">Это вы</span>':d.isCreator?`<button class="btn small ghost member-remove" data-action="removeMember" data-id="${esc(p.id)}" data-name="${esc(p.name)}">Удалить</button>`:''}</div></div>`).join('')}
${d.isCreator?'<button class="btn ghost full" data-action="addMember">+ Добавить без Telegram (для учёта расходов)</button><p class="note">Этот участник появится в расчётах, но не получит приглашение или уведомления автоматически.</p>':''}
<div class="spacer"></div><button class="btn ghost full" data-action="settings">Мой телефон для переводов</button>${d.isCreator?'<div class="spacer"></div><button class="btn danger full" data-action="deleteGroup">Удалить группу</button>':''}`;}
function viewExpense(){
 const data=S.group;if(!data)return '';
 const expense=S.edit,currency=data.group.currencyCode;
 const mode=expense?.splitMode||'EVENLY';
 const allocations=expense?.paidFor;
 const payer=expense?.paidById||data.me;
 const payerOptions=data.participants.map(person=>`<option value="${esc(person.id)}" ${person.id===payer?'selected':''}>${person.id===data.me?'Я ('+esc(person.name)+')':esc(person.name)}</option>`).join('');
 const participants=data.participants.map(person=>{
  const allocation=allocations?.find(item=>item.participantId===person.id);
  const selected=!allocations||!!allocation;
  const value=allocation?.shares??(mode==='BY_SHARES'?1:0);
  return `<div class="check-item"><label><input type="checkbox" name="participant" value="${esc(person.id)}" ${selected?'checked':''}/>${esc(person.name)}</label><input aria-label="Доля участника ${esc(person.name)}" type="number" name="weight_${esc(person.id)}" min="0" step="${mode==='BY_SHARES'?'1':'0.01'}" value="${mode==='BY_PERCENTAGE'||mode==='BY_AMOUNT'?(value/100).toFixed(2):value}" ${mode==='EVENLY'||!selected?'disabled':''}/></div>`;
 }).join('');
 const fx=extrasEnabled()?`<details class="form-details" ${expense?.originalCurrency?'open':''}><summary>Другая валюта</summary><div class="form-grid">
 <div class="field"><label for="foreign-amount">Исходная сумма</label><input name="originalAmount" id="foreign-amount" inputmode="decimal" value="${expense?.originalAmount?(expense.originalAmount/100).toFixed(2):''}"/></div>
 <div class="field"><label for="foreign-currency">Валюта оплаты</label><select id="foreign-currency" name="originalCurrency"><option value="">Валюта группы</option>${CURRENCIES.filter(code=>code!==currency).map(code=>`<option value="${code}" ${expense?.originalCurrency===code?'selected':''}>${code}</option>`).join('')}</select></div></div>
 <button type="button" class="btn small ghost" data-action="fxPreview">Посчитать по курсу группы</button></details>`:'';
 return `${back(expense?'Изменить трату':'Добавить трату',data.group.name)}<form class="form expense-form" id="expense-form">
 <section class="form-section"><h2>Оплата</h2>
 <div class="field amount-field"><label for="e-amount">Сумма · ${esc(currency)}</label><input id="e-amount" name="amount" inputmode="decimal" required value="${expense?(expense.amount/100).toFixed(2):''}" placeholder="0,00"/></div>
 <div class="field"><label for="e-title">За что заплатили</label><input id="e-title" name="title" required maxlength="150" value="${esc(expense?.title||'')}" placeholder="Например, ужин"/></div>
 <div class="field"><label for="e-paid">Кто оплатил</label><select id="e-paid" name="paidById">${payerOptions}</select></div>${fx}</section>
 <section class="form-section"><h2>Как разделить</h2><div class="field"><label for="e-mode">Способ деления</label><select id="e-mode" name="splitMode">${[['EVENLY','Поровну'],['BY_SHARES','По долям'],['BY_PERCENTAGE','По процентам'],['BY_AMOUNT','Точные суммы']].map(([key,label])=>`<option value="${key}" ${mode===key?'selected':''}>${label}</option>`).join('')}</select><p class="form-hint" id="mode-hint">${modeHint(mode)}</p></div>
 <div class="field"><span class="field-label">Между кем разделить</span><div class="check-list" id="paidfor-list">${participants}</div></div>
 <section class="allocation-preview" aria-labelledby="allocation-title"><h3 id="allocation-title">Доли участников</h3><div id="allocation-preview" aria-live="polite"></div></section></section>
 <button type="submit" class="btn primary full">${expense?'Сохранить изменения':'Добавить расход'}</button>
 <details class="form-details expense-tools" ${expense?.notes||expense?.categoryId?'open':''}><summary>Чек, категория и комментарий</summary><div class="expense-tools-content">
 <div class="field"><label for="expense-notes">Комментарий к трате</label><textarea id="expense-notes" name="notes" maxlength="1000" placeholder="Что важно знать">${esc(expense?.notes||'')}</textarea></div>
 ${extrasEnabled()?'<div class="qr-tools"><button class="btn ghost full" type="button" data-action="scanQr">Считать сумму с QR-кода чека</button><label class="btn ghost full qr-file-label" for="qr-photo">Выбрать фото QR-кода</label><input type="file" id="qr-photo" accept="image/*" class="qr-hidden-file"/></div>':S.boot?.features?.billingEnabled?'<button class="btn ghost" type="button" data-action="buyPro">Открыть Pro · 75 Stars</button>':''}
</div></details>${expense?'<button type="button" class="btn danger full" data-action="deleteExpense">Удалить расход</button>':''}</form>`;
}
function updateExpensePreview(){
 const target=root.querySelector('#allocation-preview');
 if(!target)return;
 const form=root.querySelector('#expense-form');
 const note=message=>{target.innerHTML=`<p class="form-hint">${esc(message)}</p>`;};
 if(form.elements.originalCurrency?.value){note('При сохранении пересчитаем доли по курсу группы.');return;}
 if(!form.elements.amount.value.trim()){note('Введите сумму, чтобы увидеть долю каждого.');return;}
 try{
  const payload=expensePayload();
  const names=new Map(S.group.participants.map(person=>[person.id,person.name]));
  const shares=splitExpense({...payload,id:payload.expenseId});
  target.innerHTML=`<ul>${shares.map(share=>`<li><span>${esc(names.get(share.participantId))}</span><strong>${esc(money(share.amount,S.group.group.currencyCode))}</strong></li>`).join('')}</ul>`;
 }catch(error){note(error.message);}
}
function updateSplitControls(reset){
 const form=root.querySelector('#expense-form');
 const mode=form.elements.splitMode.value;
 const rows=[...form.querySelectorAll('#paidfor-list .check-item')];
 const selected=rows.filter(row=>row.querySelector('input[type=checkbox]').checked);
 for(const row of rows){
  const weight=row.querySelector('input[type=number]');
  const index=selected.indexOf(row);
  weight.disabled=mode==='EVENLY'||index===-1;
  weight.step=mode==='BY_SHARES'||mode==='EVENLY'?'1':'0.01';
  if(!reset)continue;
  if(mode==='BY_PERCENTAGE'&&index>=0){
   const units=Math.floor(10000/selected.length)+(index<10000%selected.length?1:0);
   weight.value=(units/100).toFixed(2);
  }else weight.value=mode==='BY_PERCENTAGE'||mode==='BY_AMOUNT'?'0.00':'1';
 }
 form.querySelector('#mode-hint').textContent=modeHint(mode);
 updateExpensePreview();
}
function modeHint(m){return ({EVENLY:'Вся сумма будет распределена поровну между выбранными участниками.',BY_SHARES:'Укажите доли. Доля 2 означает вдвое больше, чем доля 1.',BY_PERCENTAGE:'Укажите проценты с точностью 0,01%; сумма должна быть 100%.',BY_AMOUNT:'Укажите точные суммы; итог должен совпасть с чеком.'})[m]||'';}
function viewSettings(){const d=S.group,p=d.participants.find(x=>x.id===d.me);return `${back('Мои реквизиты','Только для участников группы')}<form class="form" id="sbp-form"><div class="field"><label>Телефон СБП</label><input name="sbpPhone" placeholder="+79991234567" value="${esc(p?.sbpPhone||'')}" inputmode="tel"/></div><div class="field"><label>Банк</label><select name="sbpBank">${['','Т-Банк','Сбербанк','Альфа-Банк','ВТБ','Другой банк'].map(x=>`<option ${x===(p?.sbpBank||'')?'selected':''}>${esc(x)}</option>`).join('')}</select></div><label class="check-item"><input type="checkbox" name="sbpConsent" value="yes" ${p?.sbpPhone?'checked':''}/> Я согласен показывать этот телефон всем участникам группы</label><p class="form-hint">Номер будет виден участникам этой группы. Переводы выполняются в банковском приложении, а не через Spliit.</p><button type="submit" class="btn primary full">Сохранить</button>${d.isCreator?'':'<button type="button" class="btn danger full" data-action="leaveGroup">Выйти из группы</button>'}</form>`;}
function viewInvite(){const d=S.group,url=configLink(d.group.inviteToken);return `${back('Пригласить друзей',d.group.name)}<div class="card"><p>Отправьте друзьям ссылку на Mini App, чтобы они могли присоединиться к общему бюджету.</p>${url?`<div class="field"><label>Ссылка на группу</label><input readonly value="${esc(url)}" id="invite-url"/></div><div class="spacer"></div><button class="btn primary full" data-action="share">Поделиться ссылкой</button>`:`<div class="notice">Ссылка пока недоступна. Попробуйте открыть группу заново.</div>`}</div>`;}
function viewJoin(){
 const invitation=S.invitation;
 const seats=invitation?.unclaimed||[];
 return `${back('Вступить в группу',invitation?.groupName||'')}<form class="form" id="join-form">
 <section class="form-section"><div class="field"><label for="join-name">Как вас зовут?</label><input id="join-name" name="name" maxlength="60" autocomplete="name" value="${esc(S.boot.user.name)}" required/></div>
 ${seats.length?`<div class="field"><label for="join-seat">Организатор уже добавил вас?</label><select id="join-seat" name="participantId"><option value="">Нет, я новый участник</option>${seats.map(person=>`<option value="${esc(person.id)}">Я — ${esc(person.name)}</option>`).join('')}</select></div>
 <div id="join-claim" class="field" hidden><label for="join-code">Личный код от организатора</label><input id="join-code" name="claimToken" autocomplete="off"/><p class="form-hint">Попросите у организатора код, чтобы занять своё место и сохранить уже внесённые траты.</p></div>`:''}</section>
 <button type="submit" class="btn primary full">Присоединиться к группе</button></form>`;
}
function viewPay(){return `${back('Pro для группы','30 дней · 75 Stars')}<div class="hero"><div class="eyebrow" style="color:#d4dcff">ГРУППОВОЙ ПРОПУСК</div><h2>Больше возможностей для всей компании</h2><p>Распознавание фискального QR с суммой чека и курсы валют ЦБ РФ.</p></div><div class="card"><p>Покупка активирует функции для всех участников вашей группы на 30 дней.</p><button class="btn primary full" data-action="pay">Оплатить 75 Stars</button><p class="fine">Фото-OCR пока не подключён. Сканирование QR считывает сумму и фискальные признаки, но не перечень товаров.</p></div>`;}
function render(){document.body.classList.toggle('spliit-form-open',['expense','create','join','settings'].includes(S.page));let body='';if(S.page==='home')body=viewHome();else if(S.page==='create')body=viewCreate();else if(S.page==='group')body=viewGroup();else if(S.page==='expense')body=viewExpense();else if(S.page==='settings')body=viewSettings();else if(S.page==='invite')body=viewInvite();else if(S.page==='join')body=viewJoin();else if(S.page==='pro')body=viewPay();
 const screen=S.page==='group'?`group:${S.groupId}`:S.page;
 const moved=renderedScreen!==screen;
 renderedScreen=screen;
 root.innerHTML=`<main class="page">${header()}${body}</main>${bottom()}${S.notice?`<div role="alert" class="toast ${S.notice.bad?'error':''}">${esc(S.notice.msg)}</div>`:''}`;
 document.querySelectorAll('button').forEach(x=>x.disabled=!!S.loading);
 window.__spliitEnhancements?.render?.();
 updateExpensePreview();
 if(moved){
  window.scrollTo(0,0);
  const title=root.querySelector('h1');
  if(title){title.tabIndex=-1;title.focus({preventScroll:true});}
 }
}
async function loadHome(){const start=tg?.initDataUnsafe?.start_param||new URLSearchParams(location.search).get('startapp')||'';S.boot=await call('bootstrap',{startParam:start});S.homeLoadFailed=false;S.invitation=S.boot.invitation;S.inviteUnavailable=start.startsWith('inv_')&&!S.invitation;S.page='home';render();}
async function openGroup(id){S.groupId=id;S.group=await call('group_get',{groupId:id});await refreshPending();S.page='group';S.tab='expenses';if(!S.loading)render();}
function formData(id){return new FormData(document.getElementById(id));}
function expensePayload(){const f=formData('expense-form'),mode=f.get('splitMode'),ids=f.getAll('participant');if(!ids.length)throw Error('Выберите хотя бы одного участника');const paidFor=ids.map(id=>{let shares=1;if(mode!=='EVENLY'){const raw=String(f.get(`weight_${id}`)||'0').replace(',','.');if(!/^\d+(\.\d{1,2})?$/.test(raw))throw Error('Некорректная доля');shares=mode==='BY_SHARES'?Number(raw):Math.round(Number(raw)*100);}return {participantId:id,shares};});const payload={groupId:S.groupId,expenseId:S.edit?.id||S.newExpenseId,title:String(f.get('title')),amount:amountInt(f.get('amount')),paidById:String(f.get('paidById')),splitMode:mode,paidFor,categoryId:Number(f.get('categoryId')||0),notes:String(f.get('notes')||'')};
 const currency=f.get('originalCurrency');if(currency){payload.originalCurrency=String(currency);payload.originalAmount=amountInt(f.get('originalAmount'));}
 return payload;}
async function applyReceiptQr(qr){
 const receipt=await call('scan_receipt',{groupId:S.groupId,qr});
 const el=document.getElementById('e-amount');
 if(!el)throw Error('Сначала откройте форму добавления расхода');
 // Fiscal QR amounts are always RUB. Never silently interpret RUB as USD/THB/etc.
 const to=S.group.group.currencyCode;
 if(to==='RUB'){
   el.value=(receipt.amount/100).toFixed(2);
   toast('Сумма чека: '+money(receipt.amount,'RUB')+'. Проверьте и сохраните расход.');
 }else{
   const foreign=document.getElementById('foreign-amount'),currency=document.getElementById('foreign-currency');
   if(!foreign||!currency)throw Error('Для чека в рублях необходим режим валютного пересчёта');
   const rate=await call('fx_rates',{groupId:S.groupId,from:'RUB',to});
   if(!Number.isFinite(rate?.rate)||rate.rate<=0)throw Error('Курс RUB → '+to+' недоступен');
   foreign.value=(receipt.amount/100).toFixed(2);currency.value='RUB';
   el.value=(Math.round(receipt.amount*rate.rate)/100).toFixed(2);
   toast('Чек в RUB пересчитан в '+to+' ('+rate.source+'). Проверьте курс перед сохранением.');
 }
 haptic();
}
root.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;const action=b.dataset.action;if(['settle','recoverSettlement','cancelSettlement'].includes(action)&&S.loading)return;busy(async()=>{
 if(action==='home'){await loadHome();return;}
 if(action==='create'){S.page='create';return;}
 if(action==='group'){await openGroup(b.dataset.id);return;}
 if(action==='openCurrent'){if(S.groupId)await openGroup(S.groupId);else await loadHome();return;}
 if(action==='tab'){S.tab=b.dataset.tab;return;}
 if(action==='expense'){S.edit=null;S.newExpenseId='exp_'+Array.from(crypto.getRandomValues(new Uint8Array(18)),x=>x.toString(16).padStart(2,'0')).join('');S.page='expense';return;}
 if(action==='deleteExpenseDirect'){if(!confirm('Удалить запись возврата долга?'))return;await call('expense_delete',{groupId:S.groupId,expenseId:b.dataset.id});await openGroup(S.groupId);return;}
 if(action==='editExpense'){const v=S.group.expenses.find(x=>x.id===b.dataset.id);if(v?.isReimbursement){toast('Подтверждение перевода нельзя редактировать. Его может удалить автор или организатор.');return;}S.edit=v;S.page='expense';return;}
 if(action==='deleteExpense'){if(!confirm('Удалить этот расход?'))return;await call('expense_delete',{groupId:S.groupId,expenseId:S.edit.id});S.edit=null;S.newExpenseId=null;await openGroup(S.groupId);haptic();return;}
 if(action==='exportCsv'){
   if(!extrasEnabled())throw Error('Экспорт доступен в Pro');
   let csv,filename='spliit-export.csv';
   if(S.demo){
     const rows=[['Дата','Описание','Плательщик','Сумма','Валюта','Тип']];
     for(const x of S.group.expenses)rows.push([fmtDate(x.expenseDate),x.title,S.group.participants.find(p=>p.id===x.paidById)?.name||'',(x.amount/100).toFixed(2),S.group.group.currencyCode,x.isReimbursement?'Возврат':'Расход']);
     const safeCell=value=>{
       let s=String(value??'').replace(/[\r\n]+/g,' ');
       if(/^[=+@\-\t\r]/.test(s))s="'"+s;
       return '"'+s.replaceAll('"','""')+'"';
     };
     csv='\uFEFF'+rows.map(row=>row.map(safeCell).join(';')).join('\r\n');
   }else{
     // Fetch the complete, validated report; no partial client-side export.
     const result=await call('export_csv',{groupId:S.groupId});
     csv=result.csv;filename=result.filename||filename;
   }
   const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
   const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);return;
 }
 if(action==='recoverSettlement'||action==='cancelSettlement'){
   const pending=await pendingSettlement(S);if(!pending){await openGroup(S.groupId);return;}
   if(action==='cancelSettlement'){
     if(!confirm('Отменить только незавершённую запись? Уже сохранённый возврат останется в истории.'))return;
     const result=await cancelPendingSettlement({S,call});
     toast(result?.cancelled?'Незавершённая запись отменена.':'Возврат уже сохранён. Проверьте историю.');
   }else{await recordSettlement({S,call,toParticipantId:pending.toParticipantId,amount:pending.amount});toast('Возврат записан.');}
   try{await openGroup(S.groupId);}catch{S.group=null;S.page='home';toast('Результат подтверждён. Откройте группу повторно.');}return;
 }
 if(action==='settle'){if(!confirm(`Деньги уже переведены? Сохранить возврат на ${money(Number(b.dataset.amount),S.group.group.currencyCode)} в истории группы?`))return;await recordSettlement({S,call,toParticipantId:b.dataset.to,amount:Number(b.dataset.amount)});try{await openGroup(S.groupId);}catch{S.group=null;S.page='home';toast('Возврат записан. Не удалось обновить расчёты; откройте группу повторно.');}haptic();return;}
 if(action==='remind'){if(!confirm('Напомнить участнику о долге в личном сообщении Telegram? Не чаще одного раза в 24 часа.'))return;await call('remind_debt',{groupId:S.groupId,debtorId:b.dataset.debtor});toast('Напоминание отправлено');return;}
 if(action==='join'){S.page='join';return;}
 if(action==='invite'){S.page='invite';return;}
 if(action==='share'){const link=configLink(S.group.group.inviteToken);if(!link)throw Error('Ссылка не настроена');if(tg?.openTelegramLink)tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}`);else await navigator.clipboard.writeText(link);return;}
 if(action==='settings'){S.page='settings';return;}
 if(action==='buyPro'){if(!S.boot?.features?.billingEnabled)throw Error('Оплата пока отключена');S.page='pro';return;}
 if(action==='pay'){if(!S.boot?.features?.billingEnabled)throw Error('Оплата пока отключена');if(S.demo)throw Error('В демонстрации реальные платежи недоступны');const {url}=await call('create_invoice',{groupId:S.groupId});if(typeof tg?.openInvoice!=='function')throw Error('Счёт можно оплатить только внутри Telegram');tg.openInvoice(url,()=>{busy(()=>openGroup(S.groupId));});return;}
 if(action==='fxPreview'){
   const from=document.getElementById('foreign-currency')?.value;
   const sum=document.getElementById('foreign-amount')?.value;
   if(!from || !sum)throw Error('Укажите валюту и сумму покупки');
   const sourceAmount=amountInt(sum);
   const {rate,date,source}=await call('fx_rates',{groupId:S.groupId,from,to:S.group.group.currencyCode});
   const converted=Math.round(sourceAmount*rate);
   document.getElementById('e-amount').value=(converted/100).toFixed(2);
   toast(`${source||'Курс валют'}${date?' на '+date:''}: 1 ${from} = ${rate.toFixed(4)} ${S.group.group.currencyCode}`);return;
 }
 if(action==='scanQr'){if(typeof tg?.showScanQrPopup==='function'){tg.showScanQrPopup({text:'Наведите камеру на QR-код кассового чека'},qr=>{busy(async()=>{await applyReceiptQr(qr);tg?.closeScanQrPopup?.();},true);return true;});}else{document.getElementById('qr-photo')?.click();}return;}
 if(action==='addMember'){if(!S.group?.isCreator)return;const name=prompt('Имя участника для учёта расходов (без Telegram). Для настоящего приглашения используйте кнопку «Пригласить».');if(!name?.trim())return;const m=await call('participant_add',{groupId:S.groupId,name});await openGroup(S.groupId);S.tab='members';toast(`Участник «${m.name}» добавлен без Telegram. Приглашение не отправлялось.`);return;}
 if(action==='removeMember'){const id=b.dataset.id;const member=S.group.participants.find(p=>p.id===id);if(!member)return;if(!confirm(`Удалить участника «${member.name}» из группы? Если он участвует в расходах, удаление будет запрещено.`))return;await call('participant_delete',{groupId:S.groupId,participantId:id});await openGroup(S.groupId);S.tab='members';toast(`Участник «${member.name}» удалён`);return;}
 if(action==='leaveGroup'){if(!confirm('Отвязать Telegram и очистить личные реквизиты? История расходов сохранится у группы.'))return;await call('participant_leave',{groupId:S.groupId});S.groupId=null;S.group=null;await loadHome();return;}
 if(action==='deleteGroup'){if(!confirm(`Удалить группу «${S.group.group.name}» и все расходы?`))return;await call('group_delete',{groupId:S.groupId,confirmation:S.group.group.name});S.group=null;S.groupId=null;await loadHome();return;}
 if(action==='demo'){S.demo=true;await loadHome();return;}
 },['fxPreview','scanQr','exportCsv','share'].includes(action));});
root.addEventListener('input',event=>{
 if(event.target.closest('#expense-form')&&event.target.type!=='checkbox'&&event.target.tagName!=='SELECT')updateExpensePreview();
});
root.addEventListener('change',event=>{
 const input=event.target;
 if(input.id==='qr-photo'){
  const file=input.files?.[0];input.value='';
  if(file)busy(async()=>applyReceiptQr(await decodeQrFile(file)),true);
  return;
 }
 if(input.id==='join-seat'){
  const claim=root.querySelector('#join-claim');
  claim.hidden=!input.value;
  claim.querySelector('input').required=!!input.value;
  return;
 }
 if(!input.closest('#expense-form'))return;
 if(input.id==='e-mode'||input.name==='participant')updateSplitControls(input.id==='e-mode');
 else updateExpensePreview();
});
root.addEventListener('submit',e=>{e.preventDefault();if(S.loading)return;const id=e.target.id;if(id==='create-form'&&!document.getElementById('g-name')?.value.trim()){toast('Введите название группы',true);document.getElementById('g-name')?.focus();return;}busy(async()=>{
 if(id==='create-form'){const f=formData(id);const group=await call('group_create',{name:f.get('name'),currencyCode:f.get('currencyCode'),information:f.get('information'),participants:[]});await loadHome();await openGroup(group.groupId);haptic();toast('Группа создана. Для приглашения людей нажмите «Пригласить».');return;}
 if(id==='expense-form'){
  const payload=expensePayload();
  await call('expense_upsert',payload);
  S.edit=null;S.newExpenseId=null;
  try{await openGroup(payload.groupId);toast('Расход сохранён.');}
  catch{S.group=null;S.page='home';toast('Расход сохранён. Откройте группу, чтобы обновить список.');}
  haptic();return;
 }
 if(id==='sbp-form'){const f=formData(id);await call('participant_sync',{groupId:S.groupId,sbpPhone:f.get('sbpPhone'),sbpBank:f.get('sbpBank'),sbpConsent:f.get('sbpConsent')==='yes'});await openGroup(S.groupId);S.tab='members';return;}
 if(id==='join-form'){const f=formData(id);const inviteToken=(tg?.initDataUnsafe?.start_param||new URLSearchParams(location.search).get('startapp')||'');const name=f.get('name'),claim=f.get('claimToken');const payload={groupId:S.invitation.groupId,inviteToken,name};if(f.get('participantId')){payload.participantId=String(f.get('participantId'));payload.claimToken=String(claim||'');if(!payload.claimToken)throw Error('Для занятия места нужен персональный код от организатора');}await call('participant_sync',payload);await loadHome();await openGroup(payload.groupId);return;}
 });});
// Isolated local demo store. Never synced with the cloud or used for payments.
const D={group:{id:'demo',name:'Выходные у моря',currencyCode:'RUB',inviteToken:'demo_inv',proUntil:0},participants:[{id:'a',name:'Вы',tgUserId:1,sbpPhone:null,sbpBank:null},{id:'b',name:'Анна',tgUserId:2,sbpPhone:'+79990000000',sbpBank:'Т-Банк'},{id:'c',name:'Иван',tgUserId:3,sbpPhone:null,sbpBank:null}], expenses:[{id:'exp_000000000000000000000000000000000001',groupId:'demo',title:'Ужин у моря',amount:540000,paidById:'b',splitMode:'EVENLY',paidFor:[{participantId:'a',shares:1},{participantId:'b',shares:1},{participantId:'c',shares:1}],createdByTgId:2,expenseDate:Date.now()-86400000,createdAt:Date.now()-86400000,isReimbursement:0}]};
function demoView(){const totals=Object.fromEntries(D.participants.map(x=>[x.id,{paid:0,paidFor:0,total:0}]));for(const e of D.expenses){totals[e.paidById].paid+=e.amount;const shares=e.paidFor.filter(p=>p.shares>0),sum=shares.reduce((a,b)=>a+b.shares,0);let left=e.amount;shares.forEach((p,i)=>{const q=i===shares.length-1?left:Math.floor(e.amount*p.shares/sum);totals[p.participantId].paidFor+=q;left-=q;});}for(const x of Object.values(totals))x.total=x.paid-x.paidFor;const debts=Object.entries(totals).map(([id,v])=>({id,total:v.total})).filter(x=>x.total<0),credits=Object.entries(totals).map(([id,v])=>({id,total:v.total})).filter(x=>x.total>0),transfers=[];for(const debt of debts)for(const credit of credits){const amount=Math.min(-debt.total,credit.total);if(amount>0){transfers.push({from:debt.id,to:credit.id,amount});debt.total+=amount;credit.total-=amount;}}return {group:{...D.group},me:'a',isCreator:true,participants:D.participants,expenses:[...D.expenses].reverse(),balances:totals,settlements:transfers,activities:[]};}
async function demoCall(name,p){if(name==='bootstrap')return {user:{id:1,name:'Вы'},groups:[{id:D.group.id,name:D.group.name,currencyCode:D.group.currencyCode}],invitation:null,features:{betaFree:true,billingEnabled:false}};if(name==='group_get')return demoView();if(name==='group_create'){D.group={id:'demo',name:p.name,currencyCode:p.currencyCode,information:p.information,inviteToken:'demo_inv',proUntil:0};D.participants=[{id:'a',name:'Вы',tgUserId:1},...p.participants.map((name,i)=>({id:'p'+i,name,tgUserId:null,claimToken:'demo'}))];D.expenses=[];return {groupId:'demo'};}if(name==='expense_upsert'){const id=p.expenseId||'exp_'+(''+Math.random()).replace('0.','').padEnd(36,'0');const e={...p,id,createdByTgId:1,expenseDate:Date.now(),isReimbursement:0};D.expenses=D.expenses.filter(x=>x.id!==id).concat(e);return {expenseId:id};}if(name==='expense_delete'){D.expenses=D.expenses.filter(x=>x.id!==p.expenseId);return {deleted:true};}if(name==='settlement_create'){const old=D.expenses.find(e=>e.id===p.expenseId);D.cancelledSettlements??=new Set();if(p.action==='cancel'){if(old)return {expenseId:p.expenseId,amount:old.amount,replayed:true};D.cancelledSettlements.add(p.expenseId);return {expenseId:p.expenseId,amount:p.amount,cancelled:true};}if(D.cancelledSettlements.has(p.expenseId))throw Error('Запись возврата отменена');if(old)return {expenseId:old.id,amount:old.amount,replayed:true};D.expenses.push({id:p.expenseId,groupId:'demo',title:'Возврат долга',amount:p.amount,paidById:'a',splitMode:'EVENLY',paidFor:[{participantId:p.toParticipantId,shares:1}],createdByTgId:1,expenseDate:Date.now(),isReimbursement:1});return {expenseId:p.expenseId,amount:p.amount};}if(name==='participant_sync'){const x=D.participants.find(x=>x.id==='a');x.sbpPhone=p.sbpPhone;x.sbpBank=p.sbpBank;return {participantId:'a'};}if(name==='participant_add'){D.participants.push({id:'p'+Date.now(),name:p.name,tgUserId:null,claimToken:'demo'});return {id:'x',name:p.name};}if(name==='participant_delete'){const person=D.participants.find(x=>x.id===p.participantId);if(!person||person.id==='a')throw Error('Нельзя удалить участника');if(D.expenses.some(e=>e.paidById===person.id||e.paidFor?.some(x=>x.participantId===person.id)))throw Error('Участник есть в расходах');D.participants=D.participants.filter(x=>x.id!==person.id);return {deleted:true};}if(name==='remind_debt'){return {sent:true};}if(name==='participant_leave'){return {left:true};}if(name==='group_delete'){D.expenses=[];D.participants=[];D.group={id:'demo',name:'Удалена',currencyCode:'RUB'};return {deleted:true};}throw Error('Недоступно в демо');}
function applyTelegramTheme(){
  if(!tg)return;
  const p=tg.themeParams||{};
  document.documentElement.classList.toggle('tg-dark',tg.colorScheme==='dark');
  if(p.bg_color)document.documentElement.style.setProperty('--bg',p.bg_color);
  if(p.text_color)document.documentElement.style.setProperty('--ink',p.text_color);
  if(p.secondary_bg_color)document.documentElement.style.setProperty('--white',p.secondary_bg_color);
  if(p.hint_color)document.documentElement.style.setProperty('--muted',p.hint_color);
  if(p.button_color)document.documentElement.style.setProperty('--brand',p.button_color);
 if(p.button_text_color)document.documentElement.style.setProperty('--on-brand',p.button_text_color);
}
window.__spliitEnhancements = installEnhancements({S,call,render,openGroup});
function applySafeArea(){
 const style=document.documentElement.style;
 for(const side of ['top','right','bottom','left']){
  const inset=Math.max(0,tg?.contentSafeAreaInset?.[side]||0,tg?.safeAreaInset?.[side]||0);
  style.setProperty(`--tg-inset-${side}`,`${inset}px`);
 }
}
try{
 tg?.ready();tg?.expand();tg?.onEvent?.('themeChanged',applyTelegramTheme);
 tg?.onEvent?.('safeAreaChanged',applySafeArea);tg?.onEvent?.('contentSafeAreaChanged',applySafeArea);
 applyTelegramTheme();applySafeArea();
}catch{}
(async()=>{try{await loadHome()}catch(e){S.boot={user:{name:'Гость'},groups:[]};S.homeLoadFailed=!!tg?.Serverless;render()}})();
