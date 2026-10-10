import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Camera,ChevronLeft,ChevronRight,Save,UserRound,X} from 'lucide-react';
import {supabase} from './supabaseClient';
import {sharedProfileAssets,uploadArtistProfile} from './artistProfileAssets';
import {uniqueArtistProfiles,profilePhotoKey,enrichSharedProfile} from './artistProfileIdentity';
import {cropStyle,profileCrop,croppedProfileURL} from './profileCrop';
import {WEVERSE_ARTIST,resolveWeverseProfile,kstInput,inputToUTC} from './weverseData';
import './styles/Weverse.css';

let cache;
window.addEventListener('weverse:profile-changed',()=>{cache=null;});
supabase.auth.onAuthStateChange(event=>{
  if(['SIGNED_IN','SIGNED_OUT'].includes(event)) {
    cache=null;setTimeout(()=>window.dispatchEvent(new Event('weverse:profile-changed')),0);
  }
});
function loadProfiles() {
  if(!cache) cache=(async()=>{
    const snapshots=[],overrides=[];
    for(const [table,target] of [['weverse_profile_snapshots',snapshots],['weverse_profile_overrides',overrides]]) {
      for(let offset=0;;offset+=500) {
        const {data,error}=await supabase.from(table).select('*').eq('member_id',WEVERSE_ARTIST).order('id').range(offset,offset+499);
        if(error) throw error;
        target.push(...data);if(data.length<500) break;
      }
    }
    const shared=await sharedProfileAssets();
    snapshots.push(...shared.filter(p=>p.room_id==='WRBQM41' && !p.through_sent_at).map(p=>({...p,id:`dm:${p.id}`,member_id:WEVERSE_ARTIST,time_basis:'observed'})));
    overrides.push(...shared.filter(p=>p.room_id==='WRBQM41' && p.through_sent_at && p.from_sent_at).map(p=>({...p,id:`dm:${p.id}`,from_at:p.from_sent_at,through_at:p.through_sent_at})));
    return {snapshots,overrides};
  })().catch(error=>{cache=null;throw error;});
  return cache;
}

export default function WeverseProfile({at,sourceId=null,name='리우',isAdmin=false}) {
  const [state,setState]=useState({snapshots:[],overrides:[]}),[open,setOpen]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    const refresh=()=>loadProfiles().then(data=>{if(active){setState(data);setError('');}}).catch(()=>{if(active)setError('위버스 프로필 기록을 불러오지 못했습니다.');});
    refresh();window.addEventListener('weverse:profile-changed',refresh);
    return()=>{active=false;window.removeEventListener('weverse:profile-changed',refresh);};
  },[]);
  const selectedProfile=resolveWeverseProfile(state.snapshots,state.overrides,at,sourceId);
  const profile=enrichSharedProfile(selectedProfile,state.snapshots,selectedProfile?.time_basis==='manual'?at:null);
  return <><button className="wv-avatar" title={error||'위버스 프로필'} aria-label={`${name} 위버스 프로필`} onClick={()=>setOpen(true)}>
    {profile?.avatar_url?<img src={profile.avatar_url} style={cropStyle(profileCrop(profile.avatar_url))} alt=""/>:<UserRound size={24}/>}
    {isAdmin && <span className="wv-avatar-camera"><Camera size={20}/></span>}</button>
    {open && createPortal(<ProfileViewer at={at} selected={profile} state={state} name={name} isAdmin={isAdmin} onClose={()=>setOpen(false)}/>,document.body)}</>;
}

function ProfileViewer({at,selected,state,name,isAdmin,onClose}) {
  const raw=[...state.snapshots,...state.overrides.map(p=>({...p,time_basis:'manual',observed_at:p.created_at}))]
    .sort((a,b)=>Date.parse(a.effective_at||a.observed_at)-Date.parse(b.effective_at||b.observed_at));
  const history=uniqueArtistProfiles(raw);
  const [index,setIndex]=useState(()=>Math.max(0,history.findIndex(p=>p.id===selected?.id || (profilePhotoKey(p.avatar_url)===profilePhotoKey(selected?.avatar_url) && p.name===selected?.name))));
  const [editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const p=history[index]||selected||{name};
  const [draft,setDraft]=useState(()=>({name:p.name||name,message:p.message||'',from:kstInput(at),through:kstInput(at)}));
  const [file,setFile]=useState(null),[preview,setPreview]=useState(''),[background,setBackground]=useState(null);
  const [crop,setCrop]=useState(()=>profileCrop(p.avatar_url));
  const drag=useRef(null),dialog=useRef(null),close=useRef(null);
  useEffect(()=>{
    const previous=document.activeElement;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';close.current?.focus();
    function keys(event) {
      if(event.key==='Escape'&&!busy) onClose();
      if(event.key==='Tab') {
        const controls=[...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled)')];
        if(event.shiftKey&&document.activeElement===controls[0]) {event.preventDefault();controls.at(-1)?.focus();}
        else if(!event.shiftKey&&document.activeElement===controls.at(-1)) {event.preventDefault();controls[0]?.focus();}
      }
    }
    window.addEventListener('keydown',keys);
    return()=>{window.removeEventListener('keydown',keys);document.body.style.overflow=overflow;previous?.focus();};
  },[busy,onClose]);
  useEffect(()=>{
    if(!file) return;
    const url=URL.createObjectURL(file),timer=setTimeout(()=>setPreview(url),0);
    return()=>{clearTimeout(timer);URL.revokeObjectURL(url);};
  },[file]);
  function move(next) {
    setIndex(next);setFile(null);setPreview('');setBackground(null);setCrop(profileCrop(history[next]?.avatar_url));
    setDraft({...draft,name:history[next]?.name||name,message:history[next]?.message||''});
  }
  async function upload(asset) {
    if(!asset) return null;
    return uploadArtistProfile(asset);
  }
  async function save() {
    setBusy(true);setError('');
    try {
      const from=inputToUTC(draft.from),through=inputToUTC(draft.through,true);
      if(Date.parse(from)>Date.parse(through)||!draft.name.trim()) throw new Error('이름과 적용 기간을 확인해 주세요.');
      const {error:check}=await supabase.from('weverse_profile_overrides').select('id').limit(0);
      if(check) throw new Error('scripts/weverse-comments-profiles.sql을 먼저 실행해 주세요.');
      const avatar=await upload(file)||p.avatar_url||'',cover=await upload(background)||p.background_url||'';
      const {error:e}=await supabase.from('weverse_profile_overrides').insert({member_id:WEVERSE_ARTIST,
        from_at:from,through_at:through,name:draft.name.trim(),message:draft.message,
        avatar_url:avatar?croppedProfileURL(avatar,crop):'',background_url:cover});
      if(e) throw e;
      cache=null;window.dispatchEvent(new Event('weverse:profile-changed'));onClose();
    } catch(e) {setError(e.message);} finally {setBusy(false);}
  }
  return <div className="wv-profile-backdrop" onClick={()=>{if(!busy)onClose();}}>
    <section ref={dialog} className="wv-profile-viewer" role="dialog" aria-modal="true" aria-label="위버스 프로필 기록" onClick={e=>e.stopPropagation()}>
      <button ref={close} className="wv-profile-close" title="닫기" aria-label="닫기" disabled={busy} onClick={onClose}><X size={22}/></button>
      <div className="wv-profile-cover">{p.background_url && <img className="wv-profile-background" src={p.background_url} alt="프로필 배경"/>}</div>
      <div className="wv-profile-carousel"><button title="이전 프로필" aria-label="이전 프로필" disabled={!index||busy} onClick={()=>move(index-1)}><ChevronLeft/></button>
        <div className={`wv-profile-photo ${editing?'is-cropping':''}`}
          onPointerDown={e=>{if(!editing||busy)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,crop};}}
          onPointerMove={e=>{if(!drag.current)return;const d=drag.current,box=e.currentTarget.getBoundingClientRect();setCrop({...crop,x:Math.max(0,Math.min(100,d.crop.x-(e.clientX-d.x)*100/box.width)),y:Math.max(0,Math.min(100,d.crop.y-(e.clientY-d.y)*100/box.height))});}}
          onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
          {preview||p.avatar_url?<img src={preview||p.avatar_url} alt="프로필 사진" draggable={false} style={cropStyle(editing?crop:profileCrop(p.avatar_url))}/>:<UserRound size={64}/>}</div>
        <button title="다음 프로필" aria-label="다음 프로필" disabled={index>=history.length-1||busy} onClick={()=>move(index+1)}><ChevronRight/></button></div>
      <div className="wv-profile-details">
      <div className="wv-profile-dots" aria-label="프로필 기록 위치">{history.map((item,i)=><button key={item.id} className={i===index?'active':''} aria-label={`${i+1}번째 프로필`} onClick={()=>move(i)} disabled={busy}/>)}</div>
      <h2>{p.name||name}</h2><p className="wv-profile-message">{p.message}</p>
      {p.observed_at && <p className="wv-profile-date">{p.time_basis==='verified'?'변경 시각':p.time_basis==='manual'?'관리자 설정':'수집 시각'} · {new Date(p.effective_at||p.observed_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</p>}
      {isAdmin && <button className="wv-edit-toggle" onClick={()=>setEditing(!editing)} disabled={busy}><Camera size={16}/> 기간별 프로필 설정</button>}
      {editing && <form className="wv-profile-editor" onSubmit={e=>{e.preventDefault();save();}}>
        <label>시작 (KST)<input type="datetime-local" required value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})} disabled={busy}/></label>
        <label>끝 (KST)<input type="datetime-local" required value={draft.through} onChange={e=>setDraft({...draft,through:e.target.value})} disabled={busy}/></label>
        <label>이름<input value={draft.name} required onChange={e=>setDraft({...draft,name:e.target.value})} disabled={busy}/></label>
        <label>프로필 메시지<textarea value={draft.message} onChange={e=>setDraft({...draft,message:e.target.value})} disabled={busy}/></label>
        <label>프로필 사진<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e=>{setFile(e.target.files[0]||null);setCrop({x:50,y:50,scale:1});}} disabled={busy}/></label>
        <label>확대<input type="range" min="1" max="3" step=".01" value={crop.scale} onChange={e=>setCrop({...crop,scale:Number(e.target.value)})} disabled={busy}/></label>
        <label>배경 사진<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e=>setBackground(e.target.files[0]||null)} disabled={busy}/></label>
        <button type="submit" disabled={busy}><Save size={16}/> 저장</button></form>}
      {error && <p role="alert">{error}</p>}
      </div>
    </section></div>;
}
