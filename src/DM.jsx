import { useCallback, useEffect, useRef, useState } from 'react';
import { Gift, X, UserRound, RotateCcw, Upload, ChevronsUp, Camera } from 'lucide-react';
import ArchiveLayout from './ArchiveLayout';
import { supabase } from './supabaseClient';
import './styles/DM.css';
import { messageProfile, profileEvidence, effectiveProfileHistory } from './dmProfiles';
import { displayMessages, sameMessageGroup, collectDMPages, messageSpacing } from './dmChat';
import DMProfileHistory from './DMProfileHistory';
import { profileCrop, cropStyle } from './profileCrop';

function dateLabel(value) {
  return new Date(value).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' });
}

function MessageBody({ message }) {
  const [open, setOpen] = useState(false);
  const hasGift = message.blocks.some(b => b.gift);
  if (message.deleted) return <span className="dm-deleted">삭제된 메시지</span>;
  return <>
    {hasGift && <button className="dm-gift" onClick={() => setOpen(!open)} aria-expanded={open}>
      <Gift size={20} /> {open ? '선물 접기' : '선물 열기'}
    </button>}
    {message.blocks.map((b, i) => {
      if (b.gift && !open) return null;
      if (b.type === 'text') return <span key={i}>{b.text}</span>;
      if (b.type === 'nickname_candidate') return <mark key={i} title="설정된 사용자 이름과 일치하는 표현. 이름 호출 여부는 확정되지 않았습니다.">{b.text}</mark>;
      if (b.type === 'photo') return <a className="dm-image-link" key={i} href={b.url} target="_blank" rel="noreferrer"><img src={b.url} alt="DM 사진" loading="lazy" /></a>;
      if (b.type === 'video') return <video key={i} controls playsInline preload="none" poster={b.thumbnail_url || undefined} src={b.url} />;
      if (b.type === 'audio') return <audio key={i} controls preload="none" src={b.url} aria-label="DM 음성" />;
      return null;
    })}
  </>;
}

export default function DM({ isAdmin = false }) {
  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState('');
  const [profiles, setProfiles] = useState([]);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [overrides, setOverrides] = useState([]);
  const [allMessages,setAllMessages] = useState([]);
  const timeline = useRef(null);
  const generation = useRef(0);
  const cursor = useRef(null);
  const requestPending = useRef(false);

  useEffect(() => {
    let active = true;
    supabase.from('dm_rooms').select('*').order('artist_name').then(({ data, error: e }) => {
      if (!active) return;
      if (e) setError(e.message);
      else { setRooms(data || []); setRoomId(data?.[0]?.id || ''); }
    });
    return () => { active = false; };
  }, []);

  const load = useCallback(async (older = false, all = false) => {
    if (!roomId || (older && requestPending.current)) return;
    const version = older ? generation.current : ++generation.current;
    requestPending.current = true;
    setLoading(true); setError('');
    if (!older) setMessages([]);
    const previousHeight = timeline.current?.scrollHeight || 0;
    const previousTop = timeline.current?.scrollTop || 0;
    try {
    const result = await collectDMPages(async c => {
    let query = supabase.from('dm_messages').select('*').eq('room_id', roomId)
      .order('sent_at', { ascending: false }).order('id', { ascending: false }).limit(100);
    if (search.trim()) query = query.ilike('text', `%${search.trim().replace(/[\\%_]/g, '\\$&')}%`);
    if (date) {
      const start = new Date(`${date}T00:00:00+09:00`);
      query = query.gte('sent_at', start.toISOString()).lt('sent_at', new Date(start.getTime() + 86400000).toISOString());
    }
    if (c) {
      query = query.or(`sent_at.lt.${c.sent_at},and(sent_at.eq.${c.sent_at},id.lt.${c.id})`);
    }
    const { data, error: e } = await query;
    if (e) throw e;
    if (version !== generation.current) throw new Error('Cancelled');
    return data || [];
    }, older ? cursor.current : null, all);
    if (version !== generation.current) return;
    requestPending.current = false; setLoading(false);
    const rows = result.rows;
    cursor.current = result.cursor;
    setMore(result.more);
    setMessages(current => {
      const combined = new Map((older ? current : []).map(m => [m.id, m]));
      rows.forEach(m => combined.set(m.id, m));
      return [...combined.values()].sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at) || a.id.localeCompare(b.id));
    });
    requestAnimationFrame(() => {
      if (timeline.current) timeline.current.scrollTop = all ? 0 : older
        ? previousTop + timeline.current.scrollHeight - previousHeight : timeline.current.scrollHeight;
    });
    } catch (e) {
      if (version !== generation.current) return;
      requestPending.current = false; setLoading(false); setError(e.message);
    }
  }, [roomId, search, date]);

  useEffect(() => {
    const timer = setTimeout(() => { cursor.current = null; load(); }, 250);
    return () => { clearTimeout(timer); generation.current += 1; };
  }, [load]);

  useEffect(() => {
    let active = true;
    if (roomId) collectDMPages(async c => {
      let query = supabase.from('dm_messages').select('*').eq('room_id',roomId)
        .order('sent_at',{ascending:false}).order('id',{ascending:false}).limit(100);
      if(c) query=query.or(`sent_at.lt.${c.sent_at},and(sent_at.eq.${c.sent_at},id.lt.${c.id})`);
      const {data,error:e}=await query;
      if(e)throw e;
      return data || [];
    },null,true).then(result=>{if(active)setAllMessages(result.rows.sort((a,b)=>Date.parse(a.sent_at)-Date.parse(b.sent_at)||a.id.localeCompare(b.id)));})
      .catch(e=>{if(active)setError(e.message);});
    if (roomId) supabase.from('dm_profile_overrides').select('*').eq('room_id', roomId)
      .order('created_at', { ascending: false }).then(({ data }) => { if (active) setOverrides(data || []); });
    if (roomId) supabase.from('dm_profiles').select('*').eq('room_id', roomId)
      .order('observed_at', { ascending: false }).then(({ data, error: e }) => {
        if (!active) return;
        if (e) setError(e.message); else setProfiles(data || []);
      });
    return () => { active = false; };
  }, [roomId]);

  const room = rooms.find(r => r.id === roomId);
  const roomProfiles = profiles.filter(p => p.room_id === roomId);
  const profile = roomProfiles[0];
  const chatRows = displayMessages(messages);
  function openHistory(p, message = null) {
    setSelectedProfile(p); setSelectedMessage(message); setProfileOpen(true);
  }
  const rangeMessages = displayMessages(allMessages.filter(m=>m.room_id===roomId));
  const history = effectiveProfileHistory(rangeMessages.length ? rangeMessages : chatRows,roomProfiles,overrides);
  return <ArchiveLayout isAdmin={isAdmin} activeTab="dm" search={search} onSearchChange={setSearch} searchPlaceholder="DM 검색">
    <section className="dm-chat">
      <header className="dm-header">
        <button className="dm-profile-button" onClick={() => openHistory(profile)} aria-label="프로필 기록" disabled={!profile}>
          {profile?.avatar_url ? <img src={profile.avatar_url} alt="프로필" /> : <UserRound size={28} />}
        </button>
        <div><strong>{profile?.name || room?.display_name || 'DM'}</strong><span>{profile?.status_emoji || ''}</span></div>
        {rooms.length > 1 && <select aria-label="아티스트" value={roomId} onChange={e => setRoomId(e.target.value)}>{rooms.map(r => <option key={r.id} value={r.id}>{r.artist_name}</option>)}</select>}
        <input aria-label="메시지 날짜" type="date" value={date} onChange={e => setDate(e.target.value)} />
        {date && <button title="날짜 초기화" aria-label="날짜 초기화" onClick={() => setDate('')}><X size={16} /></button>}
        <button title="새로고침" aria-label="새로고침" disabled={loading} onClick={() => load()}><RotateCcw size={16} /></button>
        <button title="저장된 첫 메시지로 이동" aria-label="저장된 첫 메시지로 이동" disabled={loading} onClick={() => load(false, true)}><ChevronsUp size={18} /></button>
        {isAdmin && <a href="/admin/dm/import" title="DM 가져오기" aria-label="DM 가져오기"><Upload size={18} /></a>}
      </header>
      {error && <p className="dm-error" role="alert">{error}</p>}
      <div className="dm-timeline" ref={timeline} aria-busy={loading}>
        {more && <button className="dm-older" disabled={loading} onClick={() => load(true)}>이전 메시지</button>}
        {!messages.length && <p className="dm-empty">{loading ? '불러오는 중' : '저장된 메시지가 없습니다.'}</p>}
        {chatRows.map((m, i) => {
          const p = messageProfile(m, roomProfiles, overrides);
          const previous = chatRows[i - 1];
          const grouped = sameMessageGroup(m, previous, p, previous && messageProfile(previous, roomProfiles, overrides));
          const sameDay = previous && dateLabel(previous.sent_at) === dateLabel(m.sent_at);
          const spacing = sameDay ? messageSpacing(m, previous) : 'normal';
          return <div key={m.id}>
          {(i === 0 || dateLabel(previous.sent_at) !== dateLabel(m.sent_at)) && <div className="dm-day">{dateLabel(m.sent_at)}</div>}
          <article className={`dm-message dm-spacing-${spacing}`}>
            {grouped ? <div className="dm-avatar-space" aria-hidden="true" /> :
            <button className="dm-message-avatar" onClick={() => openHistory(p, m)} aria-label="메시지 프로필 기록" title={profileEvidence(p)}>
              {p.avatar_url ? <img src={p.avatar_url} style={cropStyle(profileCrop(p.avatar_url))} alt="프로필" loading="lazy" /> : <UserRound size={22} />}
              {isAdmin && <span className="dm-avatar-camera" aria-hidden="true"><Camera size={17}/></span>}
            </button>}
            <div className="dm-message-content">
              <div className="dm-message-meta">
              {!grouped && <div className="dm-sender">{p.name || room?.artist_name}{p.status_emoji && <span>{p.status_emoji}</span>}</div>}
              </div>
              <div className="dm-bubble"><MessageBody message={m} /></div>
            </div>
            <time dateTime={m.sent_at}>{new Date(m.sent_at).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })}</time>
          </article>
        </div>; })}
      </div>
    </section>
    {profileOpen && <DMProfileHistory history={history} selected={selectedProfile} message={selectedMessage} rangeMessages={rangeMessages.length ? rangeMessages : chatRows}
      room={room} isAdmin={isAdmin} onClose={() => setProfileOpen(false)}
      onSaved={p => setOverrides(current => [p,...current])} />}
  </ArchiveLayout>;
}
