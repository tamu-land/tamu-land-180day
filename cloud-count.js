import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const cfg=window.TAMU_SUPABASE_CONFIG;
const db=createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id), DAY=86400000;
const utc=s=>Date.parse(s+'T00:00:00Z');
const iso=t=>new Date(t).toISOString().slice(0,10);
const names={1:'南葛西',2:'浦安'};
let cloudEvents=[],actualStays=[],feedStates=[],loaded=false,loadError='',lastUpdated=null;
const notice=document.createElement('p');
notice.id='cloud-counter-status';notice.className='muted';
$('cards').before(notice);
function daySet(events,property,from,to){
 const days=new Set();
 for(const e of events){
  if(Number(e.property_id)!==property||e.classification!=='booked'||e.reviewed!==true||e.active===false)continue;
  const a=Math.max(from,utc(e.check_in)),z=Math.min(to,utc(e.check_out));
  if(!Number.isFinite(a)||!Number.isFinite(z)||z<=a)continue;
  for(let t=a;t<z;t+=DAY)days.add(iso(t));
 }
 return days;
}
function countDates(events,property,from,to){return daySet(events,property,from,to).size}
function sameDay(t){return new Date(t).toISOString().slice(0,10)}
function update(){
 if(!loaded){
  notice.textContent=loadError?'同期済み予約の集計に失敗：'+loadError+'（0日表示は実績ではありません）':'ログイン後、確定済み予約の日数を読み込みます。0日は実績ではありません。';
  $('cards').replaceChildren();
  for(const name of Object.values(names)){const card=document.createElement('div');card.className='card';const h=document.createElement('h2');h.textContent=name;const p=document.createElement('p');p.className='warning';p.textContent='未集計（— / 180日）';card.append(h,p);$('cards').append(card)}
  return;
 }
 const y=Number($('year').value),from=utc(y+'-04-01'),to=utc((y+1)+'-04-01');
 notice.textContent='確認済みの宿泊予約と、手入力した宿泊実績を重複なく集計。未確認・販売停止・未登録の過去実績は含まれません。法令上の営業日数としては未確定です。'+(lastUpdated?' 最終取得：'+lastUpdated.toLocaleString('ja-JP'):'');
 $('cards').replaceChildren();
 for(const [idString,name] of Object.entries(names)){
  const id=Number(idString),bookingDays=daySet(cloudEvents,id,from,to),verifiedDays=new Set();
  for(const a of actualStays.filter(x=>Number(x.property_id)===id)){const start=Math.max(from,utc(a.check_in)),end=Math.min(to,utc(a.check_out));for(let t=start;t<end;t+=DAY)verifiedDays.add(iso(t))}
  const allDays=new Set([...bookingDays,...verifiedDays]),n=allDays.size;const observedStart=cloudEvents.filter(e=>Number(e.property_id)===id&&e.active!==false).map(e=>e.check_in).sort()[0];const missingHistory=id===1&&y===2026&&(!observedStart||observedStart>'2026-04-01');
  const pending=cloudEvents.filter(e=>Number(e.property_id)===id&&e.reviewed!==true&&utc(e.check_in)<to&&utc(e.check_out)>from).length;
  const fresh=feedStates.filter(f=>Number(f.property_id)===id);
  const missing=(id===1&&fresh.length<2),stale=fresh.some(f=>!f.last_synced_at||f.last_error||(Date.now()-new Date(f.last_synced_at).getTime())>86400000);
  const warning=n>=180?'🚨 180日以上：新規受付前に要確認':n>=170?'🔴 170日以上：残り10日以内':n>=150?'⚠️ 150日以上：残り30日以内':'';
  const card=document.createElement('div');card.className='card';
  const h=document.createElement('h2');h.textContent=name;
  const figure=document.createElement('div');figure.className='number'+(n>=180?' danger':n>=150?' warning':'');figure.textContent=n+' / 180日';
  const bar=document.createElement('div');bar.className='bar';const fill=document.createElement('div');fill.className='fill';fill.style.width=Math.min(100,n/180*100)+'%';if(n>=180)fill.style.background='#b12626';else if(n>=150)fill.style.background='#db920b';bar.append(fill);
  const p=document.createElement('p');p.textContent=missingHistory?'年度開始からの記録が不足しているため、正確な残日数は未確定です。':'登録済みデータによる参考残日数：'+Math.max(0,180-n)+'日';
  const caution=document.createElement('p');caution.className='warning';caution.textContent=(missingHistory?'⚠️ 4月1日〜'+(observedStart||'現在')+'の宿泊実績が未取得です。予約サイトの過去の宿泊履歴を照合してください。 ':'')+(missing?'未登録の予約サイトがあります。 ':'')+(stale?'最終同期が古い、または同期エラーがあります。手動同期してください。 ':'')+(pending?'未確認の予定：'+pending+'件。確認が終わるまで日数は不完全です。':'')+(warning?' '+warning:'');
  const breakdown=document.createElement('p');breakdown.className='muted';breakdown.textContent='確定予約：'+bookingDays.size+'日／実績登録：'+verifiedDays.size+'日（重複日を除く）';
  const monthly=document.createElement('p');monthly.className='muted';
  const monthLabels=[];
  for(let i=0;i<12;i++){const year=y+(i>=9?1:0),month=(i+3)%12+1,prefix=year+'-'+String(month).padStart(2,'0');
    const amount=[...allDays].filter(day=>day.startsWith(prefix)).length;
    monthLabels.push(month+'月：'+(missingHistory&&prefix<'2026-11'?'未取得（現在'+amount+'日）':amount+'日'))}
  monthly.textContent='年度内の月別集計：'+monthLabels.join(' ／ ');
  const caveat=document.createElement('p');caveat.className='muted';caveat.textContent='確定予約の予定泊数＋手入力の実績を重複除外した参考値。未来の予約を含み、法定営業日数ではありません。';
  card.append(h,figure,bar,p,breakdown,monthly,caution,caveat);$('cards').append(card);
 }
}
async function refresh(){
 const {data:{session},error:sessionError}=await db.auth.getSession();
 if(sessionError)throw sessionError;
 if(!session){loaded=false;cloudEvents=[];loadError='';update();return}
 const rows=[];let offset=0;
 while(true){
  const {data,error}=await db.from('calendar_events').select('id,property_id,check_in,check_out,classification,reviewed,active').order('id',{ascending:true}).range(offset,offset+999);
  if(error)throw error;
  rows.push(...(data||[]));
  if(!data||data.length<1000)break;
  offset+=1000;
  if(offset>=20000)throw Error('予定が多すぎます。集計を停止しました。');
 }
 const {data:actual,error:actualError}=await db.from('actual_stays').select('id,property_id,check_in,check_out').eq('property_id',1).order('check_in',{ascending:false}).limit(1000);
 if(actualError)throw actualError;
 // Feed URLs are private; retrieve safe status metadata through the authenticated server endpoint.
 const {data:feedResponse,error:feedError}=await db.functions.invoke('calendar-manager',{body:{action:'list'}});
 if(feedError)throw feedError;
 if(feedResponse?.error)throw Error(feedResponse.error);
 const feeds=feedResponse?.feeds||[];
 cloudEvents=rows;actualStays=actual||[];feedStates=feeds||[];renderStays();loaded=true;loadError='';lastUpdated=new Date();update();
}
async function safeRefresh(){try{await refresh()}catch(e){loaded=false;loadError=e.message||String(e);update()}}
$('year').addEventListener('change',update);
document.addEventListener('tamu-cloud-changed',safeRefresh);
db.auth.onAuthStateChange(()=>setTimeout(safeRefresh,0));
safeRefresh();

const panel=document.createElement('div');panel.className='card';panel.innerHTML='<h2>南葛西｜過去の宿泊実績を登録</h2><p class="muted">Airbnb・Booking.comの同期に含まれない、実際に宿泊があった日だけ入力してください。確認済み予約と同じ日は二重計上しません。名前や個人情報は入力しないでね。</p><label for="actual-start">チェックイン日</label><input id="actual-start" type="date"><label for="actual-end">チェックアウト日</label><input id="actual-end" type="date"><button id="actual-save" type="button">宿泊実績をクラウドに保存</button><p class="muted" id="actual-status" role="status">ログインすると登録できます。</p><h2 style="margin-top:22px">登録済み実績</h2><div id="actual-entries"></div>';
$('cards').after(panel);
function renderStays(){
 const area=$('actual-entries');area.replaceChildren();
 if(!actualStays.length){area.textContent='手入力した宿泊実績はまだありません。';return}
 for(const a of actualStays){const line=document.createElement('div');line.style.cssText='padding:8px 0;border-bottom:1px solid #ddd;display:flex;align-items:center;gap:8px';
  const info=document.createElement('span');info.textContent=a.check_in+' ～ '+a.check_out;info.style.flex='1';
  const remove=document.createElement('button');remove.className='remove';remove.textContent='削除';remove.type='button';
  remove.addEventListener('click',async()=>{if(!confirm(info.textContent+' の宿泊実績を削除しますか？'))return;remove.disabled=true;
    const {error}=await db.from('actual_stays').delete().eq('id',a.id);
    if(error){$('actual-status').textContent='削除失敗：'+error.message;remove.disabled=false;return}
    $('actual-status').textContent='削除しました。';await safeRefresh();
  });line.append(info,remove);area.append(line)}
}
$('actual-save').addEventListener('click',async()=>{
 const b=$('actual-start').value,e=$('actual-end').value,today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 if(!b||!e||!Number.isFinite(utc(b))||!Number.isFinite(utc(e))||utc(e)<=utc(b)||utc(e)-utc(b)>366*DAY){$('actual-status').textContent='正しい宿泊日を入力してください（最大366日）。';return}
 if(e>today){$('actual-status').textContent='未来の日付は宿泊実績として登録できません。';return}
 if(!confirm(b+' ～ '+e+' は実際に宿泊があった日ですか？'))return;
 const btn=$('actual-save');btn.disabled=true;
 try{const {data:{user},error:authError}=await db.auth.getUser();if(authError||!user)throw Error('ログインが必要です。');
 const {error}=await db.from('actual_stays').insert({owner_id:user.id,property_id:1,check_in:b,check_out:e});
 if(error)throw error;$('actual-status').textContent='宿泊実績を保存しました。';$('actual-start').value='';$('actual-end').value='';await safeRefresh();
 }catch(err){$('actual-status').textContent='保存できませんでした：'+err.message}finally{btn.disabled=false}
});
