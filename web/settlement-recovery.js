// A read/write IndexedDB transaction reserves one durable intent per account and
// payer in a group, including across tabs that share the same browser storage.
const flights=new Map();
const storageError=()=>Error('Не удалось открыть хранилище безопасного повтора. Разрешите хранилище приложения и повторите попытку.');
function context(S){
 const uid=S.boot?.user?.id,groupId=S.groupId,payer=S.group?.me;
 if(!Number.isSafeInteger(uid)||uid<=0||!groupId||!payer)throw Error('Обновите группу и проверьте участника');
 return JSON.stringify([S.demo?'demo':'telegram',uid,groupId,payer]);
}
function valid(row,key){
 if(row&&(row.key!==key||!/^exp_[a-f0-9]{36}$/.test(row.expenseId)||!Number.isSafeInteger(row.amount)||row.amount<=0||row.amount>100_000_000_000||typeof row.toParticipantId!=='string'||!row.toParticipantId||!/^[A-Z]{3}$/.test(row.currency)))throw storageError();
 return row||null;
}
async function stored(key,change){
 let database;
 try{database=await new Promise((resolve,reject)=>{
  const request=indexedDB.open('spliit-financial-recovery',1);
  let expired=false;
  const timer=setTimeout(()=>{expired=true;reject(storageError());},5000);
  request.onupgradeneeded=()=>request.result.createObjectStore('pending',{keyPath:'key'});
  request.onerror=()=>{clearTimeout(timer);reject(storageError());};
  request.onblocked=()=>{expired=true;clearTimeout(timer);reject(storageError());};
  request.onsuccess=()=>{clearTimeout(timer);if(expired)request.result.close();else resolve(request.result);};
 });}catch{throw storageError();}
 try{return await new Promise((resolve,reject)=>{
  const tx=database.transaction('pending',change?'readwrite':'readonly'),store=tx.objectStore('pending');let result,error;
  tx.oncomplete=()=>resolve(result);
  tx.onabort=()=>reject(error||storageError());tx.onerror=()=>{};
  const request=store.get(key);
  request.onsuccess=()=>{
   try{
    const previous=valid(request.result,key);result=change?change(previous):previous;
    if(change){if(result)store.put(result);else store.delete(key);}
   }catch(e){error=e;tx.abort();}
  };
 });}finally{database.close();}
}
export async function pendingSettlement(S){return stored(context(S));}
async function clear(key,id){await stored(key,row=>row?.expenseId===id?null:row);}
async function send(call,request){
 let timer;
 try{return await Promise.race([call('settlement_create',request),new Promise((_,reject)=>{
  timer=setTimeout(()=>reject(Error('Ответ о возврате не получен. Проверьте незавершённую запись в группе.')),30000);
 })]);}finally{clearTimeout(timer);}
}
function acknowledged(result,row){
 if(result?.expenseId!==row.expenseId||result.amount!==row.amount)throw Error('Сервер не подтвердил исходную запись возврата. Проверьте незавершённую запись в группе.');
}
export async function recordSettlement({S,call,toParticipantId,amount}){
 const key=context(S),groupId=S.groupId;
 if(typeof toParticipantId!=='string'||!toParticipantId||!Number.isSafeInteger(amount)||amount<=0||amount>100_000_000_000)throw Error('Обновите группу и проверьте сумму возврата');
 const row=await stored(key,previous=>{
  if(previous){
   if(previous.amount!==amount||previous.toParticipantId!==toParticipantId)throw Error('Сначала проверьте незавершённую запись возврата в группе. Её сумма и получатель сохранены.');
   return previous;
  }
  return {key,expenseId:'exp_'+Array.from(crypto.getRandomValues(new Uint8Array(18)),x=>x.toString(16).padStart(2,'0')).join(''),amount,toParticipantId,currency:S.group?.group?.currencyCode||'RUB'};
 });
 if(flights.has(row.expenseId))return flights.get(row.expenseId);
 const flight=(async()=>{
  const result=await send(call,{groupId,expenseId:row.expenseId,amount:row.amount,toParticipantId:row.toParticipantId});
  acknowledged(result,row);await clear(key,row.expenseId);return result;
 })();
 flights.set(row.expenseId,flight);
 try{return await flight;}finally{flights.delete(row.expenseId);}
}
export async function cancelPendingSettlement({S,call}){
 const key=context(S),row=await stored(key);
 if(!row)return null;
 const result=await send(call,{groupId:S.groupId,action:'cancel',expenseId:row.expenseId,amount:row.amount,toParticipantId:row.toParticipantId});
 acknowledged(result,row);
 if(result.cancelled!==true&&result.replayed!==true)throw Error('Сервер не подтвердил отмену. Повторите проверку записи.');
 await clear(key,row.expenseId);return result;
}
