import { parseReceiptLines, splitItems, generateWrapped } from './advanced.js';
import installGroupExtras from './group-extras.js';
import installNext from './next-features.js';
import installAnalytics from './analytics.js';
import {installAiUI} from './ai-ui.js';
import {installVoice} from './ai-voice.js';

const money=(n,c)=>(n/100).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+c;
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const alertUser=s=>{const tg=window.Telegram?.WebApp;if(typeof tg?.showAlert==='function')tg.showAlert(String(s));else alert(s);};
function deliverBlob(blob,filename){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}
async function shareFile(blob,name){
  const file=new File([blob],name,{type:blob.type});
  if(navigator.canShare?.({files:[file]}) && navigator.share){
    try { await navigator.share({files:[file],title:name});return;} catch(e) { if(e?.name==='AbortError')return; }
  }
  deliverBlob(blob,name);
}
export default function installEnhancements({S,call,render,openGroup,modalBack}){
  const root=document.getElementById('app');
  let items=[],modal=null,receiptName='Чек по позициям';
  function deco(){
    if(S.page==='group'&&S.group){
      const a=root.querySelector('.group-tools-content');
      if(a&&!root.querySelector('[data-adv="wrapped"]')) {
        const wrap=document.createElement('div');
        wrap.className='advanced-actions';
        wrap.innerHTML='<button type="button" class="btn ghost" data-adv="wrapped">Скачать картинку с итогами</button><button type="button" class="btn ghost" data-adv="board">Показать долги в чате</button>';
        a.prepend(wrap);
      }
      const ex=root.querySelector('[data-action="exportCsv"]');
      if(ex)ex.textContent='Скачать расходы для Excel';
    }
    if(S.page==='expense'&&S.group){
      const f=root.querySelector('#expense-form');
      if(f&&!f.querySelector('[data-adv="items"]')){
        const btn=document.createElement('button');btn.className='btn ghost full';btn.type='button';btn.dataset.adv='items';
        btn.textContent='Разделить по блюдам, доставке и чаевым';
        const submit=f.querySelector('button[type="submit"]');
        const tools=f.querySelector('.expense-tools-content');
        if(tools)tools.append(btn);
        else submit?.before(btn);
      }
    }
  }
  function openSplitter(draft=null){
    if(!S.group)throw Error('Сначала откройте группу');
    items=[];receiptName='Чек по позициям';
    const box=document.createElement('div');
    box.className='advanced-modal';
    box.innerHTML='<section class="advanced-panel"><div class="advanced-head"><h2>Разбор чека по позициям</h2><button class="btn small ghost" type="button" data-adv="close">Закрыть</button></div>'+
      '<p class="note">Каждая строка: название блюда; цена. Позиции пока вводятся вручную: QR содержит только общую сумму.</p>'+
      '<label class="field"><span>Позиции</span><textarea id="receipt-lines" rows="6" placeholder="Том Ям; 650,00\nПицца; 900,00"></textarea></label>'+
      '<button class="btn primary full" type="button" data-adv="parse">Распределить позиции</button>'+
      '<div id="adv-rows"></div><div class="field"><label for="adv-fee">Чаевые, доставка, сервисный сбор (в валюте группы)</label><div class="advanced-actions"><button type="button" class="btn small ghost" data-adv="tipPct" data-pct="0">0%</button><button type="button" class="btn small ghost" data-adv="tipPct" data-pct="5">5%</button><button type="button" class="btn small ghost" data-adv="tipPct" data-pct="10">10%</button><button type="button" class="btn small ghost" data-adv="tipPct" data-pct="15">15%</button></div><input id="adv-fee" inputmode="decimal" value="0" placeholder="150,00"/></div>'+
      '<div class="field"><label for="adv-payer">Кто оплатил</label><select id="adv-payer"></select></div>'+
      '<div id="adv-total" class="notice"></div><button class="btn primary full" type="button" data-adv="save">Сохранить чек одной тратой</button></section>';
    root.appendChild(box);modal=box;
    box.querySelector('#adv-payer').innerHTML=S.group.participants.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===S.group.me?'selected':'')+'>'+esc(p.name)+'</option>').join('');
    box.querySelector('#adv-rows').innerHTML='<p class="note">Добавьте позиции чека и нажмите «Распределить».</p>';
    box.querySelector('#adv-total').textContent='Введите блюда, чтобы распределить стоимость.';
    if(draft?.items?.length){
      receiptName=String(draft.title||'Чек по позициям').slice(0,150);
      items=draft.items.map(x=>({name:String(x.name).slice(0,90),amount:x.amount,assigned:S.group.participants.map(p=>p.id)}));
      box.querySelector('#receipt-lines').value=items.map(x=>x.name+'; '+(x.amount/100).toFixed(2)).join('\n');
      if(draft.difference>0)box.querySelector('#adv-fee').value=(draft.difference/100).toFixed(2);
      showRows();
      if(draft.difference<0){
        box.querySelector('#adv-total').textContent+=' ВАЖНО: сумма распознанных позиций превышает итог чека. Исправьте позиции вручную.';
        box.querySelector('[data-adv="save"]').disabled=true;
        box.querySelector('#receipt-lines').addEventListener('input',()=>{box.querySelector('[data-adv="save"]').disabled=false;},{once:true});
      }
    }
  }
  function parseAmount(raw){
    const s=String(raw??'').trim().replace(/\s/g,'').replace(',','.');
    if(!/^\d{1,9}(\.\d{1,2})?$/.test(s))throw Error('Некорректная сумма сборов');
    const [a,b='']=s.split('.');return Number(a)*100+Number(b.padEnd(2,'0'));
  }
  function recalc(){
    if(!modal||!items.length)return;
    const fee=parseAmount(modal.querySelector('#adv-fee')?.value||'0');
    const r=splitItems(items,S.group.participants,fee);
    const cur=S.group.group.currencyCode;
    modal.querySelector('#adv-total').textContent='Итого '+money(r.total,cur)+' (позиции '+money(r.subtotal,cur)+' + сборы '+money(r.fee,cur)+'). '+S.group.participants.map(p=>p.name+': '+money(r.totals[p.id],cur)).join('; ');
    return r;
  }
  function showRows(){
    if(!modal)return;
    modal.querySelector('#adv-rows').innerHTML=items.map((item,i)=>
      '<div class="advanced-item"><strong>'+esc(item.name)+' · '+money(item.amount,S.group.group.currencyCode)+'</strong><div class="advanced-users">'+
      S.group.participants.map(p=>'<label><input type="checkbox" data-row="'+i+'" data-person="'+esc(p.id)+'" '+(item.assigned.includes(p.id)?'checked':'')+'/> '+esc(p.name)+'</label>').join('')+'</div></div>').join('');
    recalc();
  }
  async function exportCsv(){
    const result=await call('export_csv',{groupId:S.groupId});
    const blob=new Blob([result.csv],{type:'text/csv;charset=utf-8'});
    await shareFile(blob,result.filename||'Spliit-report.csv');
  }
  async function wrapped(){
    if(!S.group?.expenses?.some(e=>!e.isReimbursement)){alertUser('Для итогов поездки добавьте хотя бы одну трату.');return;}
    const image=await generateWrapped(S.group);
    await shareFile(image,'Spliit_Wrapped.png');
    // shareToStory needs a public HTTPS image URL. Never expose a bot token
    // via getFile links or publish private group statistics automatically.
  }
  function board(){
    const tg=window.Telegram?.WebApp;
    if(typeof tg?.switchInlineQuery==='function'){
      tg.switchInlineQuery(S.group?.group?.name||'', ['groups','supergroups']);
    }else alertUser('В групповом чате введите @demo_bot и выберите группу. Сначала включите Inline Mode через BotFather /setinline.');
  }
  async function reminder(button){
    const choices=['Дружеский','Официальный','С юмором'];
    const code=prompt('Тон напоминания: 1 — '+choices[0]+', 2 — '+choices[1]+', 3 — '+choices[2],'1');
    if(code===null)return;
    const tone=({'1':'friendly','2':'official','3':'meme'})[code.trim()];
    if(!tone){alertUser('Выберите 1, 2 или 3');return;}
    const x=await call('remind_debt',{groupId:S.groupId,debtorId:button.dataset.debtor,tone});
    if(x.sent){alertUser('Напоминание отправлено в Telegram.');return;}
    if(x.shareUrl){
      if(window.Telegram?.WebApp?.openTelegramLink)window.Telegram.WebApp.openTelegramLink(x.shareUrl);
      else window.open(x.shareUrl,'_blank');
      return;
    }
    alertUser('Не удалось отправить напоминание');
  }
  // Capture phase prevents the legacy "busy" handler from destroying forms
  // and mobile keyboard focus after our enhanced actions.
  root.addEventListener('click',async e=>{
    const b=e.target.closest('[data-adv], [data-action="remind"], [data-action="exportCsv"]');
    if(!b)return;
    e.stopImmediatePropagation();e.preventDefault();
    const action=b.dataset.adv||b.dataset.action;
    try{
      if(action==='items')openSplitter();
      else if(action==='close'){modal?.remove();modal=null;items=[];}
      else if(action==='tipPct'){if(!items.length)throw Error('Сначала разберите позиции чека');const pct=Number(b.dataset.pct);const subtotal=items.reduce((s,x)=>s+x.amount,0);modal.querySelector('#adv-fee').value=(Math.round(subtotal*pct/100)/100).toFixed(2);recalc();}
      else if(action==='parse'){
        items=parseReceiptLines(modal.querySelector('#receipt-lines').value).map(it=>({...it,assigned:S.group.participants.map(p=>p.id)}));
        showRows();
      }
      else if(action==='save'){
        if(!items.length)throw Error('Добавьте позиции');
        const split=recalc();
        const title=receiptName;
        const notes=items.map(it=>it.name+' — '+money(it.amount,S.group.group.currencyCode)).join('\n')+'\nСборы: '+money(split.fee,S.group.group.currencyCode);
        b.disabled=true;
        try{
          const expenseId=S.newExpenseId || 'exp_'+Array.from(crypto.getRandomValues(new Uint8Array(18)),x=>x.toString(16).padStart(2,'0')).join('');
          await call('expense_upsert',{groupId:S.groupId,expenseId,title,amount:split.total,splitMode:'BY_AMOUNT',paidById:modal.querySelector('#adv-payer').value,paidFor:split.paidFor,notes});
          modal.remove();modal=null;items=[];await openGroup(S.groupId);
        }finally{b.disabled=false;}
      }
      else if(action==='wrapped')await wrapped();
      else if(action==='board')board();
      else if(action==='exportCsv')await exportCsv();
      else if(action==='remind')await reminder(b);
    }catch(err){alertUser(err?.message||String(err));}
  },true);
  root.addEventListener('change',e=>{
    if(!modal||!modal.contains(e.target))return;
    if(e.target.hasAttribute('data-row')){
      const idx=Number(e.target.dataset.row),id=e.target.dataset.person;
      const member=items[idx];if(!member)return;
      if(e.target.checked)member.assigned=[...new Set([...member.assigned,id])];
      else {
        if(member.assigned.length<=1){e.target.checked=true;alertUser('Нельзя оставить блюдо без участников.');return;}
        member.assigned=member.assigned.filter(x=>x!==id);
      }
      try{recalc();}catch(err){alertUser(err.message);}
    }else if(e.target.id==='adv-fee'){try{recalc();}catch(err){alertUser(err.message);}}
  },true);
  const extras=installGroupExtras({S,call,render,openGroup});
  const next=installNext({S,call,render,openGroup,modalBack});
  const analytics=installAnalytics({S});
  const ai=installAiUI({S,call,onReceipt:draft=>openSplitter(draft)});
  const voice=installVoice({S,call});
  return {render:()=>{deco();extras.render();next.render();analytics.render();ai.render();voice.render();}};
}
