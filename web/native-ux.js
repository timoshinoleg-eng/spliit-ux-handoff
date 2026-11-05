// Optional Telegram native UX. Never cache bank details without opt-in.
export const tg=()=>window.Telegram?.WebApp;
export const saveSbp=(phone,bank,consent)=>new Promise(resolve=>{
 const cloud=tg()?.CloudStorage;
 if(!consent||!cloud?.setItem){resolve(false);return;}
 cloud.setItem('spliit_sbp_phone',String(phone||''),err=>{
  if(err){resolve(false);return;}
  cloud.setItem('spliit_sbp_bank',String(bank||''),e=>resolve(!e));
 });
});
export const loadSbp=()=>new Promise(resolve=>{
 const cloud=tg()?.CloudStorage;
 if(!cloud?.getItems){resolve(null);return;}
 cloud.getItems(['spliit_sbp_phone','spliit_sbp_bank'],(err,data)=>
  resolve(err?null:{phone:data?.spliit_sbp_phone||'',bank:data?.spliit_sbp_bank||''}));
});
export const clearSbp=()=>new Promise(resolve=>{
 const cloud=tg()?.CloudStorage;
 if(!cloud?.removeItems){resolve(false);return;}
 cloud.removeItems(['spliit_sbp_phone','spliit_sbp_bank'],e=>resolve(!e));
});
export function installNativeUX({S}){
 const root=document.getElementById('app'),T=tg();
 try{T?.setHeaderColor?.('#0f172a');T?.setBackgroundColor?.('#0f172a')}catch{}
 let wasProtected=false;
 function render(){
  const editing=['expense','create','join','settings'].includes(S.page)||!!root.querySelector('.advanced-modal');
  try{
   if(editing&&!wasProtected){T?.enableClosingConfirmation?.();T?.disableVerticalSwipes?.();wasProtected=true;}
   if(!editing&&wasProtected){T?.disableClosingConfirmation?.();T?.enableVerticalSwipes?.();wasProtected=false;}
  }catch{}
  if(S.page==='home'&&!root.querySelector('[data-native="home"]')&&T?.addToHomeScreen){
    const btn=document.createElement('button');btn.type='button';btn.className='btn ghost full';btn.dataset.native='home';
    btn.textContent='Добавить Spliit на экран телефона';
    root.querySelector('.page')?.appendChild(btn);
  }
 }
 root.addEventListener('click',e=>{
  const b=e.target.closest('[data-native]');if(!b)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(b.dataset.native==='home'){T?.addToHomeScreen?.();}
 },true);
 return {render};
}
