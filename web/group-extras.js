// Collections, recurring templates, creator-only backups and opt-in TON address display.
import {saveSbp} from './native-ux.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const msg=s=>{const tg=window.Telegram?.WebApp;if(typeof tg?.showAlert==='function')tg.showAlert(String(s));else alert(s)};
const amount=v=>{const s=String(v||'').trim().replace(/\s/g,'').replace(',','.');if(!/^\d{1,8}(\.\d{1,2})?$/.test(s))throw Error('Введите сумму в рублях с точностью до копейки');let [a,b='']=s.split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));if(n<=0)throw Error('Введите положительную сумму');return n};
const fmt=(n,c)=>(n/100).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+c;
export default function installGroupExtras({S,call,render,openGroup}){
  const root=document.getElementById('app');
  let popup=null;
  function show(title,html){
    popup?.remove();
    const el=document.createElement('div');el.className='advanced-modal group-extras';
    el.innerHTML='<section class="advanced-panel"><div class="advanced-head"><h2>'+esc(title)+'</h2><button class="btn small ghost" data-extra="close">Закрыть</button></div>'+html+'</section>';
    root.appendChild(el);popup=el;return el;
  }
  function decorate(){
    if(S.page==='group'&&S.group){
      const area=root.querySelector('.group-tools-content');
      if(area&&!root.querySelector('[data-extra="collections"]')){
        const box=document.createElement('div');box.className='advanced-actions more-tools';
        box.innerHTML='<button class="btn ghost" data-extra="collections">Сборы / подарки</button>'+
          (S.group.isCreator?'<button class="btn ghost" data-extra="recurring">Регулярные траты</button><button class="btn ghost" data-extra="backup">Резервная копия</button>':'');
        area.append(box);
      }
      if(S.tab==='members')root.querySelectorAll('.person').forEach((el,i)=>{
        const p=S.group.participants[i];if(!p?.tonWallet||el.querySelector('[data-extra="copyTon"]'))return;
        const text=document.createElement('div');text.className='ton-wallet-note';
        text.innerHTML='<button class="btn ghost small" data-extra="copyTon" data-wallet="'+esc(p.tonWallet)+'">Копировать TON адрес '+esc(p.name)+'</button>';
        el.querySelector('div:nth-child(2)')?.appendChild(text);
      });
    }
    if(S.page==='settings'&&S.group){
      const f=root.querySelector('#sbp-form');
      if(f&&!f.querySelector('#ton-wallet')){
        const row=document.createElement('div');row.className='field';
        const p=S.group.participants.find(x=>x.id===S.group.me);
        row.innerHTML='<label for="ton-wallet">TON / USDT (адрес кошелька, необязательно)</label>'+
          '<input id="ton-wallet" name="tonWallet" value="'+esc(p?.tonWallet||'')+'" placeholder="EQ... или UQ..." autocapitalize="off" autocomplete="off"/>'+
          '<label><input type="checkbox" name="tonConsent" '+(p?.tonWallet?'checked':'')+'/> Разрешаю участникам группы видеть мой публичный TON-адрес</label>'+
          '<p class="note">Бот не отправляет криптовалюту. Перевод выполняется вручную в кошельке отправителя.</p>';
        f.querySelector('button[type="submit"]')?.before(row);
      }
    }
  }
  async function collectionView(){
    const d=await call('collection_manage',{groupId:S.groupId,action:'list'});
    let html=(d.isCreator?'<button class="btn primary full" data-extra="createCollection">Создать сбор</button>':'')+
      '<p class="note">«Я перевёл» — заявка участника. Только организатор подтверждает поступление денег.</p>';
    for(const c of d.collections){
      html+='<div class="advanced-item"><strong>'+esc(c.title)+' · '+fmt(c.perPerson,S.group.group.currencyCode)+' с человека</strong>';
      for(const p of c.entries){
        const text=p.status==='confirmed'?'Подтверждено':p.status==='pending'?'Ожидает подтверждения':'Не перевёл';
        html+='<div class="group-contribution"><span>'+esc(p.name)+' — '+text+'</span>'+
          (p.id===d.me&&p.status==='none'?'<button class="btn small primary" data-extra="mark" data-collection="'+esc(c.id)+'">Я перевёл</button>':'')+
          (d.isCreator&&p.status==='pending'?'<button class="btn small primary" data-extra="confirm" data-collection="'+esc(c.id)+'" data-person="'+esc(p.id)+'">Подтвердить</button>':'')+
          (d.isCreator&&p.status==='confirmed'?'<button class="btn small ghost" data-extra="reset" data-collection="'+esc(c.id)+'" data-person="'+esc(p.id)+'">Исправить</button>':'')+'</div>';
      }
      html+='</div>';
    }
    if(!d.collections.length)html+='<p class="note">Сборов пока нет.</p>';
    show('Сборы и подарки',html);
  }
  async function recurringView(){
    const d=await call('recurring_manage',{groupId:S.groupId,action:'list'});
    let html='<button class="btn primary full" data-extra="createRecurring">Новый шаблон</button>'+
      '<p class="note">Это шаблоны. Бот не создаёт расходы в фоне: после даты платежа организатор нажимает «Создать за месяц».</p>';
    for(const t of d.templates)html+='<div class="advanced-item"><strong>'+esc(t.title)+' · '+fmt(t.amount,S.group.group.currencyCode)+'</strong>'+
      '<p class="note">Каждое '+t.dayOfMonth+'-е число · последний учтённый месяц: '+esc(t.lastMonth||'нет')+'</p>'+
      '<button class="btn small primary" data-extra="generateRecurring" data-id="'+esc(t.id)+'">Создать за месяц</button> '+
      '<button class="btn small danger" data-extra="deleteRecurring" data-id="'+esc(t.id)+'">Удалить шаблон</button></div>';
    show('Регулярные расходы',html);
  }
  async function backup(){
    if(!S.group?.isCreator)throw Error('Только создатель группы может скачать резервную копию');
    const data=await call('group_backup',{groupId:S.groupId});
    const text=JSON.stringify(data,null,2);
    const blob=new Blob([text],{type:'application/json'});
    const filename='Spliit_backup_'+S.groupId.slice(0,16)+'.json';
    const a=document.createElement('a'),url=URL.createObjectURL(blob);
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
  }
  root.addEventListener('click',async e=>{
    const b=e.target.closest('[data-extra]');if(!b)return;
    e.stopImmediatePropagation();e.preventDefault();
    const action=b.dataset.extra;
    try {
      if(action==='close'){popup?.remove();popup=null;}
      else if(action==='collections')await collectionView();
      else if(action==='recurring')await recurringView();
      else if(action==='backup')await backup();
      else if(action==='createCollection'){
        const title=prompt('Название сбора (например, Подарок учителю)');if(!title)return;
        const value=prompt('Сумма с каждого участника, ₽');if(!value)return;
        await call('collection_manage',{groupId:S.groupId,action:'create',title,perPerson:amount(value)});await collectionView();
      }else if(['mark','confirm','reset'].includes(action)){
        if(action==='confirm'&&!confirm('Подтверждаете, что деньги реально поступили?'))return;
        await call('collection_manage',{groupId:S.groupId,action,collectionId:b.dataset.collection,participantId:b.dataset.person});await collectionView();
      }else if(action==='createRecurring'){
        const title=prompt('Регулярный расход (например, Интернет)');if(!title)return;
        const value=prompt('Общая сумма, ₽');if(!value)return;
        const day=prompt('День месяца (1–28)','1');if(!day)return;
        await call('recurring_manage',{groupId:S.groupId,action:'create',title,amount:amount(value),dayOfMonth:Number(day)});await recurringView();
      }else if(action==='generateRecurring'){
        const result=await call('recurring_manage',{groupId:S.groupId,action:'generate',templateId:b.dataset.id});
        msg(result.generated?'Расход создан за текущий месяц.': 'За этот месяц расход уже создан.');
        await openGroup(S.groupId);await recurringView();
      }else if(action==='deleteRecurring'){
        if(!confirm('Удалить шаблон? Ранее созданные расходы сохранятся.'))return;
        await call('recurring_manage',{groupId:S.groupId,action:'delete',templateId:b.dataset.id});await recurringView();
      }else if(action==='copyTon'){
        await navigator.clipboard.writeText(b.dataset.wallet);msg('Адрес TON скопирован. Перед переводом проверьте сеть и токен.');
      }
    }catch(err){msg(err?.message||String(err));}
  },true);
  root.addEventListener('submit',async e=>{
    if(e.target.id!=='sbp-form'||!e.target.querySelector('#ton-wallet'))return;
    e.stopImmediatePropagation();e.preventDefault();
    const f=new FormData(e.target);
    try {
      await call('participant_sync',{groupId:S.groupId,sbpPhone:f.get('sbpPhone'),sbpBank:f.get('sbpBank'),sbpConsent:f.get('sbpConsent')==='yes',
        tonWallet:f.get('tonWallet'),tonConsent:f.get('tonConsent')==='on'});
      if(f.get('rememberSbp')==='yes')await saveSbp(f.get('sbpPhone'),f.get('sbpBank'),true);
      await openGroup(S.groupId);S.tab='members';render();
    }catch(err){msg(err?.message||String(err))}
  },true);
  return {render:decorate};
}
