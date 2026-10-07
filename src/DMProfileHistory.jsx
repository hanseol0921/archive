import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X, UserRound, Pencil, Save } from 'lucide-react';
import { supabase } from './supabaseClient';
import { uploadToR2 } from './r2Storage';
import { dmStorageKey } from './dmStorageKey';
import { profileCrop, cropStyle, croppedProfileURL } from './profileCrop';

export default function DMProfileHistory({ history, selected, message, rangeMessages = [], room, isAdmin, onClose, onSaved }) {
  const initial = Math.max(0, history.findIndex(p => p.id === selected?.id || p.avatar_url === selected?.avatar_url));
  const [index, setIndex] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(selected?.name || room?.display_name || '');
  const [emoji, setEmoji] = useState(selected?.status_emoji || '');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [crop,setCrop] = useState(()=>profileCrop(history[initial]?.avatar_url || selected?.avatar_url));
  const drag = useRef(null);
  const [startId,setStartId] = useState(message?.id || '');
  const [endId,setEndId] = useState(message?.id || '');
  const close = useRef(null);
  const dialog = useRef(null);
  const p = history[index] || selected || {};
  useEffect(() => {
    const previous = document.activeElement;
    close.current?.focus();
    const keys = e => {
      if (e.key === 'Escape' && !busy) onClose();
      if (e.key === 'Tab') {
        const controls = [...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href]')];
        const first = controls[0], last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', keys);
    return () => { window.removeEventListener('keydown', keys); previous?.focus(); };
  }, [onClose, busy]);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const timer = setTimeout(() => setPreview(url), 0);
    return () => { clearTimeout(timer); URL.revokeObjectURL(url); };
  }, [file]);
  function move(next) {
    setIndex(next); setFile(null); setPreview('');
    setCrop(profileCrop(history[next]?.avatar_url));
    setName(history[next]?.name || room?.display_name || ''); setEmoji(history[next]?.status_emoji || '');
  }
  async function save() {
    if (!message || !name.trim()) return;
    setBusy(true); setError('');
    try {
      const start = rangeMessages.find(m=>m.id===startId);
      const end = rangeMessages.find(m=>m.id===endId);
      if (!start || !end || rangeMessages.indexOf(start)>rangeMessages.indexOf(end)) throw new Error('시작과 끝 말풍선의 순서를 확인해 주세요.');
      // Fail before uploading if the one-time database setup has not been applied.
      const { error: check } = await supabase.from('dm_profile_overrides').select('from_sent_at').limit(0);
      if (check) throw new Error('Supabase에서 scripts/dm-profile-ranges.sql을 먼저 실행해 주세요.');
      let avatar = p.avatar_url;
      if (file) {
        if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type) || file.size > 20 * 1024 * 1024) {
          throw new Error('20MB 이하 JPG, PNG, WEBP, GIF 사진을 선택해 주세요.');
        }
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(x => x.toString(16).padStart(2,'0')).join('');
        const extension = file.type.split('/')[1];
        const key = dmStorageKey(room.id, hash, extension);
        avatar = (await uploadToR2(key.bucket, key.path, file, file.type)).publicUrl;
      }
      if (!avatar) throw new Error('프로필 사진을 선택해 주세요.');
      const { data, error: e } = await supabase.from('dm_profile_overrides').insert({
        room_id: room.id, through_sent_at: end.sent_at,
        through_message_id: end.source_id || end.id,
        through_body_index: end.body_index ?? 0,
        from_sent_at:start.sent_at,from_message_id:start.source_id || start.id,from_body_index:start.body_index ?? 0,
        name: name.trim(), status_emoji: emoji, avatar_url: croppedProfileURL(avatar,crop),
      }).select().single();
      if (e) throw e;
      onSaved(data); onClose();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <div className="dm-modal-backdrop" onClick={() => { if (!busy) onClose(); }}>
    <section ref={dialog} className="dm-profile-viewer" role="dialog" aria-modal="true" aria-label="프로필 기록" onClick={e => e.stopPropagation()}>
      <button ref={close} className="dm-viewer-close" aria-label="닫기" disabled={busy} onClick={onClose}><X size={22}/></button>
      <div className="dm-profile-carousel">
        <button aria-label="이전 프로필" disabled={index === 0 || busy} onClick={() => move(index-1)}><ChevronLeft size={36}/></button>
        <div className={`dm-profile-large ${editing ? 'is-cropping' : ''}`}
          onPointerDown={e=>{if(!editing || busy)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,crop};}}
          onPointerMove={e=>{if(!drag.current)return;const d=drag.current;const box=e.currentTarget.getBoundingClientRect();setCrop({...crop,x:Math.max(0,Math.min(100,d.crop.x-(e.clientX-d.x)*100/box.width)),y:Math.max(0,Math.min(100,d.crop.y-(e.clientY-d.y)*100/box.height))});}}
          onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
          {preview || p.avatar_url ? <img draggable={false} style={editing ? cropStyle(crop) : p.avatar_url?.includes('#dm-crop=') ? cropStyle(profileCrop(p.avatar_url)) : undefined} src={preview || p.avatar_url} alt="프로필 사진"/> : <UserRound size={64}/>}</div>
        <button aria-label="다음 프로필" disabled={index >= history.length-1 || busy} onClick={() => move(index+1)}><ChevronRight size={36}/></button>
      </div>
      <div className="dm-profile-dots">{history.length <= 12 ? history.map((entry,i) => <button key={entry.id || i} aria-label={`${i+1}번째 프로필`} aria-current={i === index ? 'true' : undefined} disabled={busy} onClick={() => move(i)}/>) : <span>{index+1} / {history.length}</span>}</div>
      <h2>{editing ? name : p.name || room?.display_name}</h2>
      <div className="dm-profile-emoji" style={{fontSize:Math.max(12,Math.min(36,72/Math.max(1,Array.from(editing ? emoji : p.status_emoji || '').length)))}}>{editing ? emoji : p.status_emoji || '—'}</div>
      <p className="dm-profile-date">{p.basis === 'manual' || p.through_message_id ? '직접 지정한 프로필' : p.observed_at ? `${new Date(p.observed_at).toLocaleString('ko-KR', {timeZone:'Asia/Seoul'})} 확인` : '변경 시각 미확인'}</p>
      {isAdmin && message && !editing && <button className="dm-profile-edit-command" onClick={() => {setName(p.name || room?.display_name || '');setEmoji(p.status_emoji || '');setEditing(true);}}><Pencil size={16}/>프로필 적용 범위 설정</button>}
      {editing && <form className="dm-profile-form" onSubmit={e => {e.preventDefault();save();}}>
        <label>사진<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={busy} onChange={e => {setFile(e.target.files[0] || null);setCrop({x:50,y:50,scale:1});}}/></label>
        <label>확대<input type="range" min="1" max="3" step="0.01" value={crop.scale} disabled={busy} onChange={e=>setCrop({...crop,scale:Number(e.target.value)})}/></label>
        <label>이름<input value={name} maxLength={80} disabled={busy} required onChange={e=>setName(e.target.value)}/></label>
        <label>상태 이모지<input value={emoji} maxLength={32} disabled={busy} onChange={e=>setEmoji(e.target.value)}/></label>
        <label>시작 말풍선<select value={startId} disabled={busy} onChange={e=>setStartId(e.target.value)}>{rangeMessages.map((m,i)=><option key={m.id} value={m.id}>{i+1}. {new Date(m.sent_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} · {m.blocks.map(b=>b.text || '').join('').slice(0,35) || '미디어'}</option>)}</select></label>
        <label>끝 말풍선<select value={endId} disabled={busy} onChange={e=>setEndId(e.target.value)}>{rangeMessages.map((m,i)=><option key={m.id} value={m.id}>{i+1}. {new Date(m.sent_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} · {m.blocks.map(b=>b.text || '').join('').slice(0,35) || '미디어'}</option>)}</select></label>
        <button disabled={busy} type="submit"><Save size={16}/>{busy ? '저장 중' : '적용'}</button>
      </form>}
      {error && <p role="alert" className="dm-error">{error}</p>}
    </section>
  </div>;
}
