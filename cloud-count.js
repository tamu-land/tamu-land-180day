import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const cfg=window.TAMU_SUPABASE_CONFIG;
const db=createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id), DAY=86400000;
const utc=s=>Date.parse(s+'T00:00:00Z');
const iso=t=>new Date(t).toISOString().slice(0,10);
const names={1:'南葛西',2:'浦安'};
let cloudEvents=[],loaded=false,loadError='',lastUpdated=null;
const notice=document.createElement('p');
notice.id='cloud-counter-status';notice.className='muted';
$('cards').before(notice);
function allDays(events,property,from,to){
 const days=new Set();
 for(const e of events){
  if(Number(e.property_id)!==property||e.classification!=='booked'||e.reviewed!==true)continue;
  const a=Math.max(from,utc(e.check_in)),z=Math.min(to,utc(e.check_out));
  if(!Number.isFinite(a)||!Number.isFinite(z)||z<=a)continue;
  for(let t=a;t<z;t+=DAY)days.add(iso(t));
 }
 return days.size;
}
function update(){
 if(!loaded){
  notice.textContent=loadError?'同期済み予約の集計に失敗：'+loadError+'（0日表示は実績ではありません）':'ログイン後、確定済み予約の日数を読み込みます。0日は実績ではありません。';
  $('cards').replaceChildren();
  for(const name of Object.values(names)){const card=document.createElement('div');card.className='card';const h=document.createElement('h2');h.textContent=name;const p=document.createElement('p');p.className='warning';p.textContent='未集計（— / 180日）';card.append(h,p);$('cards').append(card)}
  return;
 }
 const y=Number($('year').value),from=utc(y+'-04-01'),to=utc((y+1)+'-04-01');
 notice.textContent='クラウドで「宿泊予約」と確定した予定のみ集計。未確認・販売停止・過去の未取得予約は含まれません。法令上の営業日数としては確定していません。'+(lastUpdated?' 最終取得：'+lastUpdated.toLocaleString('ja-JP'):'');
 $('cards').replaceChildren();
 for(const [idString,name] of Object.entries(names)){
  const id=Number(idString),n=allDays(cloudEvents,id,from,to);
  const pending=cloudEvents.filter(e=>Number(e.property_id)===id&&e.reviewed!==true&&utc(e.check_in)<to&&utc(e.check_out)>from).length;
  const warning=n>=180?'上限到達：新規受付前に要確認':n>=150?'上限まで30日以下：要注意':n>=120?'残り60日以下：注意':'';
  const card=document.createElement('div');card.className='card';
  const h=document.createElement('h2');h.textContent=name;
  const figure=document.createElement('div');figure.className='number'+(n>=180?' danger':n>=150?' warning':'');figure.textContent=n+' / 180日';
  const bar=document.createElement('div');bar.className='bar';const fill=document.createElement('div');fill.className='fill';fill.style.width=Math.min(100,n/180*100)+'%';if(n>=180)fill.style.background='#b12626';else if(n>=150)fill.style.background='#db920b';bar.append(fill);
  const p=document.createElement('p');p.textContent='確認済み予約の参考残日数：'+Math.max(0,180-n)+'日';
  const caution=document.createElement('p');caution.className='warning';caution.textContent=(pending?'未確認の予定：'+pending+'件。確認が終わるまで日数は不完全です。':'')+(warning?' '+warning:'');
  const caveat=document.createElement('p');caveat.className='muted';caveat.textContent='同期した予約の参考値（法定営業日数ではありません）';
  card.append(h,figure,bar,p,caution,caveat);$('cards').append(card);
 }
}
async function refresh(){
 const {data:{session},error:sessionError}=await db.auth.getSession();
 if(sessionError)throw sessionError;
 if(!session){loaded=false;cloudEvents=[];loadError='';update();return}
 const rows=[];let offset=0;
 while(true){
  const {data,error}=await db.from('calendar_events').select('id,property_id,check_in,check_out,classification,reviewed').order('id',{ascending:true}).range(offset,offset+999);
  if(error)throw error;
  rows.push(...(data||[]));
  if(!data||data.length<1000)break;
  offset+=1000;
  if(offset>=20000)throw Error('予定が多すぎます。集計を停止しました。');
 }
 cloudEvents=rows;loaded=true;loadError='';lastUpdated=new Date();update();
}
async function safeRefresh(){try{await refresh()}catch(e){loaded=false;loadError=e.message||String(e);update()}}
$('year').addEventListener('change',update);
document.addEventListener('tamu-cloud-changed',safeRefresh);
db.auth.onAuthStateChange(()=>setTimeout(safeRefresh,0));
safeRefresh();
