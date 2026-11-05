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
export function installNativeUX({S,closeTopModal}){
 const root=document.getElementById('app'),T=tg();
 // Header/background follow the Telegram theme (themeParams.bg_color)
 // instead of the previously hardcoded dark '#0f172a', which painted the
 // Telegram frame dark even in the light theme. No themeParams → leave
 // the client defaults alone. Re-applied on themeChanged.
 function syncChrome(){
  try{
   const p=T?.themeParams||{};
   if(p.bg_color){T?.setHeaderColor?.(p.bg_color);T?.setBackgroundColor?.(p.bg_color);}
  }catch{}
 }
 syncChrome();
 try{T?.onEvent?.('themeChanged',syncChrome);}catch{}
 let wasProtected=false,backBound=false;
 // System BackButton follows the router: shown on nested screens, hidden
 // on home. While a modal is open it closes the top modal first (the
 // modal back-stack); only the next press navigates. onClick does exactly
 // what the HTML ‹ button does when no modal is open.
 function syncBackButton(){
  try{
   const B=T?.BackButton;if(!B)return;
   const nested=['group','create','expense','join','invite','settings','pro'].includes(S.page);
   if(nested){
    if(!backBound){B.onClick?.(()=>{if(typeof closeTopModal==='function'&&closeTopModal())return;root.querySelector('.back')?.click();});backBound=true;}
    B.show?.();
   }else B.hide?.();
  }catch{}
 }
 function render(){
  syncChrome();syncBackButton();
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
