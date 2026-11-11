
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const cfg=window.TAMU_SUPABASE_CONFIG;
const supabase=createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const el=id=>document.getElementById(id);
const msDay=86400000;
const time=d=>Date.parse(d+'T00:00:00Z');
const iso=t=>new Date(t).toISOString().slice(0,10);
const now=new Date();
const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
function daysFor(events,year){
 const from=time(year+'-04-01'),end=time((year+1)+'-04-01');
 const total=new Set(),past=new Set();
 for(const e of events){
  if(!e.reviewed || e.classification!=='booked')continue;
  const a=Math.max(time(e.check_in),from),b=Math.min(time(e.check_out),end);
  if(!Number.isFinite(a)||!Number.isFinite(b)||b<a)continue;
  for(let t=a;t<b;t+=msDay){
   const day=iso(t);total.add(day);
   if(day<today)past.add(day);
  }
 }
 return {plan:total.size, past:past.size};
}
function alertFor(n){
 if(n>=180)return ['🚨','180日以上','新しい予約の受付を止め、自治体の指導と営業実績を至急確認してください。','danger'];
 if(n>=170)return ['🔴','170日以上','上限まで残り10日以下。今後の予約と営業実績を確認してください。','danger'];
 if(n>=150)return ['⚠️','150日以上','早めに予約調整と営業実績の照合をしてください。','warning'];
 return ['✓','150日未満','現時点で登録された予約予定は注意ライン未満です。',''];
}
async function getRows(){
 const rows=[];
 for(let from=0;from<10000;from+=1000){
  const {data,error}=await supabase.from('calendar_events')
   .select('property_id,check_in,check_out,classification,reviewed')
   .order('id',{ascending:true}).range(from,from+999);
  if(error)throw error;
  rows.push(...(data||[]));
  if(!data || data.length<1000)break;
  if(rows.length>=10000)throw Error('予定が多すぎるため表示を中断しました。');
 }
 return rows;
}
function card(property,events,year,fullSources){
 const label=property===1?'南葛西':'浦安';
 const matches=events.filter(e=>e.property_id===property);
 const pending=matches.filter(e=>!e.reviewed).length;
 const counts=daysFor(matches,year);
 const [symbol,level,description,cls]=alertFor(counts.plan);
 const div=document.createElement('section');div.className='card';
 const title=document.createElement('h2');title.textContent=label;
 const stat=document.createElement('div');stat.className='number '+cls;stat.textContent=counts.plan+' / 180日';
 const subtitle=document.createElement('p');subtitle.textContent='確認済み予約の予定泊数（重複除外）';
 const progress=document.createElement('div');progress.className='bar';
 const fill=document.createElement('div');fill.className='fill';fill.style.width=Math.min(100,100*counts.plan/180)+'%';fill.style.background=counts.plan>=170?'#b12626':counts.plan>=150?'#db920b':'#1686b4';progress.append(fill);
 const status=document.createElement('p');status.className=cls;status.style.fontWeight='700';status.textContent=symbol+' '+level+'：'+description;
 const more=document.createElement('p');more.className='muted';more.textContent='確認済みの過去泊：'+counts.past+'泊相当 ／ 予定残枠：'+Math.max(0,180-counts.plan)+'泊相当 ／ 未確認の予定：'+pending+'件';
 const sources=document.createElement('p');sources.className='muted';sources.textContent='登録済みのカレンダー：'+(fullSources[property]||'確認中');
 const caution=document.createElement('p');caution.className='warning';caution.textContent='※予約予定から計算した参考値です。未取得の過去予約・手動運用・休止期間・法令上の営業日数は自動確定しません。';
 div.append(title,stat,subtitle,progress,status,more,sources,caution);return div;
}
let rendering=false;
async function update(){
 if(rendering)return;
 rendering=true;
 const box=el('cloud-dashboard-results');const banner=el('cloud-dashboard-status');
 if(!box||!banner){rendering=false;return}
 try{
  const {data:{session},error:sErr}=await supabase.auth.getSession();
  if(sErr)throw sErr;
  if(!session){banner.textContent='ログイン後、確認済み予約の予定泊数が表示されます。';box.replaceChildren();return}
  banner.textContent='クラウドの予約を集計しています…';
  const rows=await getRows();
  const year=Number(el('year')?.value||new Date().getFullYear());
  let sources={},warnings=[];
  try{
   const {data,error}=await supabase.functions.invoke('calendar-manager',{body:{action:'list'}});
   if(error)throw error;
   const group={1:[],2:[]};
   for(const f of data?.feeds||[]){
    const age=f.last_synced_at?(Date.now()-new Date(f.last_synced_at).getTime())/3600000:null;
    const suffix=f.last_error?'（同期失敗）':age===null?'（未同期）':age>24?'（24時間超）':'';
    (group[f.property_id]??=[]).push(f.source+suffix);
    if(f.last_error || age===null || age>24)warnings.push((f.property_id===1?'南葛西':'浦安')+'／'+f.source);
   }
   sources={1:group[1].join('・')||'未登録',2:group[2].join('・')||'未登録'};
  }catch{sources={1:'取得できません',2:'取得できません'};warnings.push('同期状態を確認できません')}
  box.replaceChildren(card(1,rows,year,sources),card(2,rows,year,sources));
  banner.textContent='クラウドの確認済み予約を表示中（'+year+'年度）'+(warnings.length?'。⚠️ 同期の更新が必要：'+warnings.join('、'):'');
 }catch(e){banner.textContent='集計できませんでした：'+(e.message||'接続エラー');box.replaceChildren()}
 finally{rendering=false}
}
el('cloud-dashboard-refresh')?.addEventListener('click',update);
el('year')?.addEventListener('change',update);
document.addEventListener('tamu-cloud-changed',update);
supabase.auth.onAuthStateChange((_event,session)=>{if(session)setTimeout(update,0);else{const box=el('cloud-dashboard-results');if(box)box.replaceChildren()}});
update();
