export const CATEGORIES=[['0','Прочее'],['1','Еда и кафе'],['2','Жильё'],['3','Транспорт'],['4','Развлечения'],['5','Покупки'],['6','Билеты']];
const money=(n,c)=>(n/100).toLocaleString('ru-RU',{maximumFractionDigits:2})+' '+c;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function groupAnalytics(data){
 const bills=data.expenses.filter(x=>!x.isReimbursement&&!x.deletedAt);
 const total=bills.reduce((s,e)=>s+e.amount,0),categories=Object.fromEntries(CATEGORIES.map(([k])=>[k,0]));
 for(const e of bills)categories[e.categoryId||0]=(categories[e.categoryId||0]||0)+e.amount;
 const dates=bills.map(x=>x.expenseDate).filter(Number.isFinite);
 const days=dates.length?Math.max(1,Math.ceil((Math.max(...dates)-Math.min(...dates)+86400000)/86400000)):0;
 const top=bills.reduce((x,e)=>!x||e.amount>x.amount?e:x,null);
 return {total,days,perDay:days?Math.round(total/days):0,bills:bills.length,categories,top,code:data.group.currencyCode};
}
export default function installAnalytics({S}){
 const root=document.querySelector('#app');let dialog=null;
 function deco(){
  if(S.page==='expense'){
   const form=root.querySelector('#expense-form'),notes=form?.querySelector('textarea[name=notes]');
   if(form&&!form.querySelector('#expense-category')){
    const box=document.createElement('div');box.className='field';
    box.innerHTML='<label for="expense-category">Категория траты</label><select id="expense-category" name="categoryId">'+
     CATEGORIES.map(([id,label])=>'<option value="'+id+'" '+((S.edit?.categoryId||0)===Number(id)?'selected':'')+'>'+label+'</option>').join('')+'</select>';
    notes?.closest('.field')?.before(box);
   }
  }
  if(S.page==='group'&&S.group&&!root.querySelector('[data-an="analytics"]')){
   const btn=document.createElement('button');btn.className='btn ghost';btn.type='button';btn.dataset.an='analytics';
   btn.textContent='Аналитика бюджета';
   root.querySelector('.group-tools-content')?.append(btn);
  }
 }
 function open(){
  const a=groupAnalytics(S.group);
  const content=document.createElement('div');content.className='advanced-modal';
  const bars=CATEGORIES.map(([id,name])=>{
   const n=a.categories[id]||0,pct=a.total?Math.round(100*n/a.total):0;
   return '<div class="analytic-row"><span>'+esc(name)+' · '+money(n,a.code)+'</span><div class="analytic-bar"><i style="width:'+pct+'%"></i></div></div>';
  }).join('');
  content.innerHTML='<section class="advanced-panel"><div class="advanced-head"><h2>Аналитика бюджета</h2><button class="btn small ghost" data-an="close">Закрыть</button></div>'+
   '<div class="analytic-hero"><strong>'+money(a.total,a.code)+'</strong><span>Общие расходы · '+a.bills+' операций</span></div>'+
   '<div class="notice">В среднем '+money(a.perDay,a.code)+' в день за '+a.days+' дней. Самый дорогой чек: '+esc(a.top?.title||'нет')+'.</div>'+
   bars+'<button class="btn primary full" data-an="forecast">Прогноз: хватит ли бюджета до конца поездки?</button>'+
   '<p class="note">Расчёты локальные, без передачи информации в ИИ-сервисы.</p></section>';
  root.append(content);dialog=content;
 }
 root.addEventListener('click',e=>{
  const btn=e.target.closest('[data-an]');if(!btn)return;
  e.stopImmediatePropagation();e.preventDefault();
  if(btn.dataset.an==='close'){dialog?.remove();dialog=null;return;}
  if(btn.dataset.an==='analytics'){open();return;}
  if(btn.dataset.an==='forecast'){
    try{
      const a=groupAnalytics(S.group);if(!a.days||!a.total)throw Error('Нужен хотя бы один расход.');
      const remaining=prompt('Сколько денег осталось в бюджете группы, '+a.code+'?');if(remaining==null)return;
      const until=prompt('Сколько дней осталось до конца поездки?','3');if(until==null)return;
      const n=Number(remaining.replace(',','.'))*100,days=Number(until);
      if(!Number.isFinite(n)||n<0||!Number.isInteger(days)||days<1||days>365)throw Error('Укажите корректные суммы и дни');
      const needed=a.perDay*days,diff=Math.round(n)-needed;
      alert((diff>=0?'По текущему среднему темпу денег хватит.':'По текущему среднему темпу денег может не хватить.')+
        '\nДоступно: '+money(Math.round(n),a.code)+'\nПрогноз расходов: '+money(needed,a.code)+
        '\nРазница: '+money(diff,a.code)+'\nЭто оценка по истории трат, не гарантия.');
    }catch(err){alert(err.message);}
  }
 },true);
 return {render:deco};
}
