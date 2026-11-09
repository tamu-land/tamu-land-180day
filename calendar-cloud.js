import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const cfg=window.TAMU_SUPABASE_CONFIG;
const client=createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
const msg=s=>{$('feed-status').textContent=s};
async function invoke(action,other={}) {
 const {data:{session}}=await client.auth.getSession();
 if(!session)throw Error('先にSupabaseにログインしてください。');
 const {data,error}=await client.functions.invoke('calendar-manager',{body:{action,...other}});
 if(error){let desc=error.message;try{const e=await error.context?.json();if(e?.error)desc=e.error}catch{}throw Error(desc)}
 if(data?.error)throw Error(data.error);
 return data;
}
async function list(){
 const {feeds}=await invoke('list');
 const area=$('feed-list');area.replaceChildren();
 if(!feeds?.length){area.textContent='カレンダーURLはまだ登録されていません。';return}
 for(const f of feeds){
   const card=document.createElement('div');card.style.cssText='padding:12px 0;border-bottom:1px solid #e6edf2';
   const heading=document.createElement('p');heading.style.margin='0 0 4px';
   heading.textContent=(f.property_id===1?'南葛西':f.property_id===2?'浦安':'物件'+f.property_id)+'｜'+f.source;
   const state=document.createElement('p');state.className='muted';state.textContent=f.last_error?'同期エラー（最後の同期情報は下に表示）':f.last_synced_at?'最終同期：'+new Date(f.last_synced_at).toLocaleString('ja-JP'):'未同期';
   const sync=document.createElement('button');sync.type='button';sync.textContent='今すぐ同期';
   sync.addEventListener('click',async()=>{sync.disabled=true;msg('同期しています…');try{const d=await invoke('sync',{feed_id:f.id});msg('読み込み完了：'+d.count+'件。内容不明：'+d.needs_review+'件。確認まで法令上の日数には使わないでください。');await list()}catch(e){msg('同期できませんでした：'+e.message)}finally{sync.disabled=false}});
   const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='登録解除';
   remove.addEventListener('click',async()=>{if(!confirm('このカレンダーURLと取り込んだデータを削除しますか？'))return;remove.disabled=true;try{await invoke('remove',{feed_id:f.id});msg('登録解除しました。');await list()}catch(e){msg('登録解除できませんでした：'+e.message)}finally{remove.disabled=false}});
   card.append(heading,state,sync,remove);area.append(card);
 }
}
$('feed-register').addEventListener('click',async()=>{const btn=$('feed-register');const url=$('feed-url').value.trim();if(!url){msg('カレンダーURLを入力してください。');return}btn.disabled=true;msg('安全に登録しています…');try{await invoke('register',{property_id:Number($('feed-property').value),source:$('feed-source').value,url});$('feed-url').value='';msg('登録できました。次に「今すぐ同期」で取り込めます。');await list()}catch(e){msg('登録できませんでした：'+e.message)}finally{btn.disabled=false}});
$('feed-refresh').addEventListener('click',async()=>{try{await list();msg('登録状況を更新しました。')}catch(e){msg(e.message)}});
client.auth.onAuthStateChange((_event,session)=>{if(session)setTimeout(()=>list().catch(()=>{}),0)});
(async()=>{const {data:{session}}=await client.auth.getSession();if(session)await list().catch(()=>{});})();

async function reviewEvents(){
 const area=$('review-list'), state=$('review-status');
 state.textContent='予定を読み込んでいます…';area.replaceChildren();
 const {data:{session}}=await client.auth.getSession();
 if(!session){state.textContent='先にログインしてください。';return}
 const {data,error}=await client.from('calendar_events').select('id,property_id,check_in,check_out,classification,reviewed').order('check_in',{ascending:true}).limit(300);
 if(error){state.textContent='読み込みエラー：'+error.message;return}
 const events=data||[]; const pending=events.filter(e=>!e.reviewed);
 state.textContent='確認待ち：'+pending.length+'件（取得済み：'+events.length+'件）。予約サイトの管理画面と日付を照合してね。';
 if(!pending.length){area.textContent='確認待ちの予定はありません。';return}
 for(const e of pending){
  const div=document.createElement('div');div.style.cssText='padding:12px 0;border-bottom:1px solid #e6edf2';
  const text=document.createElement('p');text.textContent=(e.property_id===1?'南葛西':'浦安')+'｜'+e.check_in+' ～ '+e.check_out;div.append(text);
  const select=document.createElement('select');
  for(const [v,t] of [['unknown','未判定（変更しない）'],['booked','宿泊予約'],['blocked','ブロック・休止']]){const op=document.createElement('option');op.value=v;op.textContent=t;select.append(op)}
  const btn=document.createElement('button');btn.type='button';btn.textContent='この予定を確定';
  btn.addEventListener('click',async()=>{
   if(select.value==='unknown'){state.textContent='宿泊予約かブロック日か選んでね。';return}
   if(!confirm('この予定を「'+(select.value==='booked'?'宿泊予約':'ブロック・休止')+'」として登録しますか？'))return;
   btn.disabled=true;
   const {error:err}=await client.from('calendar_events').update({classification:select.value,reviewed:true}).eq('id',e.id);
   if(err){state.textContent='更新できませんでした：'+err.message;btn.disabled=false;return}
   await reviewEvents();
  });
  div.append(select,btn);area.append(div);
 }
}
$('review-refresh').addEventListener('click',reviewEvents);
