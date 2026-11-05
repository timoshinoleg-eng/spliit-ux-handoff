// Opt-in browser dictation. Runs only inside the Telegram Mini App, never in chat history.
import {validatedDraft} from './ai-ui.js';
function blobBase64(blob){return new Promise((resolve,reject)=>{const rd=new FileReader();rd.onerror=()=>reject(Error('Ошибка чтения записи'));rd.onload=()=>resolve(String(rd.result).split(',')[1]);rd.readAsDataURL(blob)});}
export function installVoice({S,call}){
 const root=document.getElementById('app');
 let recorder=null,stream=null,clip=[],stopTimer=null;
 function deco(){
  if(S.page!=='expense'||!S.boot?.features?.aiEnabled)return;
  const form=root.querySelector('#expense-form');
  if(!form||form.querySelector('[data-voice]'))return;
  const button=document.createElement('button');button.type='button';button.className='btn ghost full';button.dataset.voice='record';
  button.textContent='Микрофон · продиктовать трату (до 25 секунд)';
  const tools=form.querySelector('.expense-tools-content');
  if(tools)tools.append(button);
  else form.querySelector('button[type=submit]')?.before(button);
 }
 async function finish(blob,mime){
  if(blob.size>1300000)throw Error('Аудио слишком длинное. Запишите короткое сообщение.');
  const result=await call('ai_analyze',{groupId:S.groupId,kind:'voice',mimeType:mime,data:await blobBase64(blob),consent:true});
  const d=validatedDraft(result.draft),cur=S.group.group.currencyCode;
  let sum=d.totalAmount,source='без пересчёта';
  if(d.currency!==cur){
   const f=await call('fx_rates',{groupId:S.groupId,from:d.currency,to:cur});
   sum=Math.round(sum*Number(f.rate));source=f.source;
   if(!Number.isSafeInteger(sum)||sum<=0)throw Error('Не удалось пересчитать валюту');
  }
  const transcript=(d.transcript||d.title).slice(0,400);
  if(!confirm('Распознано: '+transcript+'\nСумма: '+(d.totalAmount/100).toFixed(2)+' '+d.currency+(d.currency!==cur?' → '+(sum/100).toFixed(2)+' '+cur+' ('+source+')':'')+'\nЗаполнить форму расхода для проверки?'))return;
  const form=root.querySelector('#expense-form');
  if(!form)throw Error('Форма закрыта, попробуйте снова');
  form.querySelector('#e-title').value=d.title.slice(0,150);
  form.querySelector('#e-amount').value=(sum/100).toFixed(2);
  const notes=form.querySelector('[name=notes]');
  if(notes)notes.value=('Голосовой черновик. Проверьте плательщика и участников: '+transcript).slice(0,990);
  if(d.currency!==cur){
   form.querySelector('#foreign-currency').value=d.currency;
   form.querySelector('#foreign-amount').value=(d.totalAmount/100).toFixed(2);
  }
 }
 root.addEventListener('click',async e=>{
  const b=e.target.closest('[data-voice]');if(!b)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(recorder?.state==='recording'){recorder.stop();return;}
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){alert('Этот браузер не поддерживает запись голосовых сообщений.');return;}
  if(!confirm('Начать запись и отправить распознанное аудио в Google Gemini? Не называйте номера карт и персональные реквизиты.'))return;
  let mime=['audio/webm','audio/ogg'].find(x=>MediaRecorder.isTypeSupported(x));
  if(!mime){alert('Нужна поддержка аудио WebM или OGG. Попробуйте Telegram на Android или десктопе.');return;}
  try{
   stream=await navigator.mediaDevices.getUserMedia({audio:true});
   clip=[];recorder=new MediaRecorder(stream,{mimeType:mime});
   recorder.ondataavailable=x=>{if(x.data?.size)clip.push(x.data)};
   recorder.onstop=async()=>{
    if(stopTimer)clearTimeout(stopTimer);
    stream?.getTracks().forEach(t=>t.stop());stream=null;
    b.textContent='Микрофон · продиктовать трату (до 25 секунд)';
    b.disabled=true;
    try{await finish(new Blob(clip,{type:mime}),mime)}catch(error){alert(error?.message||String(error))}finally{b.disabled=false;clip=[];recorder=null;}
   };
   recorder.start(1000);
   b.textContent='Остановить и распознать голос';
   stopTimer=setTimeout(()=>{if(recorder?.state==='recording')recorder.stop()},25000);
  }catch(error){stream?.getTracks().forEach(t=>t.stop());stream=null;alert(error?.message||'Микрофон недоступен')}
 },true);
 return {render:deco};
}