// Client-side helpers: no personal information is sent to third-party services.
export function parseReceiptLines(source){
  const lines=String(source||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if(!lines.length||lines.length>80)throw Error('Введите от 1 до 80 строк: Название; Сумма');
  return lines.map((line,i)=>{
    const sep=line.lastIndexOf(';');
    if(sep<=0)throw Error('Строка '+(i+1)+': используйте «Название; 150,50»');
    const title=line.slice(0,sep).trim(),raw=line.slice(sep+1).replace(/\s/g,'').replace(',','.');
    if(!title||title.length>90||!/^\d{1,8}(\.\d{1,2})?$/.test(raw))throw Error('Строка '+(i+1)+': некорректная сумма или название');
    const [a,b='']=raw.split('.');
    const amount=Number(a)*100+Number(b.padEnd(2,'0'));
    if(amount<=0)throw Error('Строка '+(i+1)+': сумма должна быть положительной');
    return {name:title,amount,assigned:[]};
  });
}
export function splitItems(items,participants,fee=0){
  if(!Array.isArray(items)||!items.length||!Array.isArray(participants)||!participants.length)throw Error('Нет позиций или участников');
  if(!Number.isSafeInteger(fee)||fee<0)throw Error('Некорректная сумма чаевых/доставки');
  const totals=Object.fromEntries(participants.map(p=>[p.id,0]));
  for(const item of items){
    const ids=[...new Set(item.assigned||[])].sort();
    if(!ids.length||ids.some(id=>!(id in totals)))throw Error('У каждой позиции должен быть хотя бы один участник');
    if(!Number.isSafeInteger(item.amount)||item.amount<=0)throw Error('Некорректная стоимость позиции');
    const q=Math.floor(item.amount/ids.length),rem=item.amount%ids.length;
    ids.forEach((id,i)=>totals[id]+=q+(i<rem?1:0));
  }
  const subtotal=Object.values(totals).reduce((a,b)=>a+b,0);
  if(fee>0) {
    const entries=Object.entries(totals).map(([id,n])=>({id,n,raw:BigInt(fee)*BigInt(n)}));
    let left=fee;
    for(const e of entries){e.extra=Number(e.raw/BigInt(subtotal));left-=e.extra;}
    entries.sort((a,b)=>a.raw%BigInt(subtotal)>b.raw%BigInt(subtotal)?-1:a.raw%BigInt(subtotal)<b.raw%BigInt(subtotal)?1:a.id.localeCompare(b.id));
    for(let i=0;i<left;i++)entries[i].extra++;
    for(const e of entries)totals[e.id]+=e.extra;
  }
  return {subtotal,fee,total:subtotal+fee,paidFor:Object.entries(totals).filter(([,n])=>n>0).map(([participantId,shares])=>({participantId,shares})),totals};
}
export function tripStats(groupData){
  const people=groupData.participants||[],expenses=(groupData.expenses||[]).filter(e=>!e.isReimbursement);
  const paid=Object.fromEntries(people.map(p=>[p.id,0]));
  for(const e of expenses)if(e.paidById in paid)paid[e.paidById]+=e.amount;
  const sponsor=people.reduce((best,p)=>paid[p.id]>(paid[best?.id]??-1)?p:best,null);
  const biggest=expenses.reduce((max,e)=>!max||e.amount>max.amount?e:max,null);
  const total=expenses.reduce((s,e)=>s+e.amount,0);
  const dates=expenses.map(x=>x.expenseDate||x.createdAt).filter(Number.isFinite);
  const days=dates.length?Math.max(1,Math.floor((Math.max(...dates)-Math.min(...dates))/86400000)+1):0;
  return {groupName:groupData.group.name,currency:groupData.group.currencyCode,total,count:expenses.length,people:people.length,days,sponsor:sponsor?.name||'—',sponsorPaid:paid[sponsor?.id]||0,biggest:biggest?.title||'—',biggestAmount:biggest?.amount||0};
}
export async function generateWrapped(groupData){
  const s=tripStats(groupData),canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;
  const c=canvas.getContext('2d');if(!c)throw Error('Canvas недоступен');
  const grad=c.createLinearGradient(0,0,1080,1920);grad.addColorStop(0,'#101034');grad.addColorStop(.55,'#422084');grad.addColorStop(1,'#0c132b');c.fillStyle=grad;c.fillRect(0,0,1080,1920);
  const circ=(x,y,r,color)=>{c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill()};
  circ(910,310,280,'#9d4edd30');circ(100,1360,330,'#3185fc25');
  const txt=(text,x,y,size,color='#fff',weight=700)=>{c.fillStyle=color;c.font=weight+' '+size+'px system-ui';c.fillText(String(text).slice(0,36),x,y,950)};
  const money=n=>(n/100).toLocaleString('ru-RU',{maximumFractionDigits:2})+' '+s.currency;
  txt('SPLIIT · ИТОГИ',70,135,40,'#dfcaff');
  txt(s.groupName,70,290,73);
  txt('ВМЕСТЕ ПОТРАТИЛИ',70,455,36,'#cabdff');
  txt(money(s.total),70,565,92);
  txt(s.count+' чеков  ·  '+s.people+' участников',70,665,43,'#f0dafe');
  txt(s.days+' дней вместе',70,740,38,'#e1c8ff');
  const card=(top,title,value,sub='')=>{c.fillStyle='#ffffff18';c.beginPath();c.roundRect(65,top,950,300,38);c.fill();txt(title,108,top+88,35,'#fbc6ec');txt(value,108,top+173,57);if(sub)txt(sub,108,top+239,34,'#d3c7ff')};
  card(850,'ГЛАВНЫЙ СПОНСОР',s.sponsor,money(s.sponsorPaid)+' оплатил(а)');
  card(1190,'САМЫЙ БОЛЬШОЙ ЧЕК',s.biggest,money(s.biggestAmount));
  txt('Делить расходы — проще вместе',70,1730,44);
  txt('@demo_bot',70,1825,44,'#ffb8e8');
  return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Не удалось создать PNG')),'image/png'));
}
