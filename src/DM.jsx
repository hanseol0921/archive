import { useCallback, useEffect, useRef, useState } from 'react';
import { Gift, X, UserRound, RotateCcw, Upload, ChevronsUp, Camera, Search, Images } from 'lucide-react';
import ArchiveLayout from './ArchiveLayout';
import { supabase } from './supabaseClient';
import './styles/DM.css';
import { messageProfile, profileEvidence, effectiveProfileHistory } from './dmProfiles';
import { displayMessages, sameMessageGroup, collectDMPages, messageSpacing, collectDMMedia } from './dmChat';
import DMProfileHistory from './DMProfileHistory';
import { profileCrop, cropStyle } from './profileCrop';
import { sharedProfileAssets } from './artistProfileAssets';
import { sharedDMProfiles,sharedDMOverrides } from './artistProfileIdentity';

// Keep only room/profile metadata in memory, never message bodies.
const dmHeaderCache = new Map();
supabase.auth.onAuthStateChange(event => {
  if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') dmHeaderCache.clear();
});
window.addEventListener('weverse:profile-changed',()=>dmHeaderCache.clear());

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
  const [rooms, setRooms] = useState(() => dmHeaderCache.get(isAdmin)?.rooms || []);
  const [roomId, setRoomId] = useState(() => dmHeaderCache.get(isAdmin)?.rooms?.[0]?.id || '');
  const [profiles, setProfiles] = useState(() => dmHeaderCache.get(isAdmin)?.profiles || []);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [view, setView] = useState('chat');
  const [mediaType, setMediaType] = useState('all');
  const [readyView, setReadyView] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [readyRoom, setReadyRoom] = useState(null);
  const metadata = useRef(null);
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
      if (e) { setError(e.message); setLoading(false); setReadyRoom(''); }
      else { dmHeaderCache.set(isAdmin, { rooms: data || [], profiles: dmHeaderCache.get(isAdmin)?.profiles || [] }); setRooms(data || []); setRoomId(current => data?.some(room => room.id === current) ? current : data?.[0]?.id || ''); if (!data?.length) { setLoading(false); setReadyRoom(''); } }
    });
    return () => { active = false; };
  }, [isAdmin]);

  const load = useCallback(async (older = false, all = false) => {
    if (!roomId || (older && requestPending.current)) return;
    const version = older ? generation.current : ++generation.current;
    requestPending.current = true;
    setLoading(true); setError('');
    // Keep the current results visible while refreshing or searching.
    const previousHeight = timeline.current?.scrollHeight || 0;
    const previousTop = timeline.current?.scrollTop || 0;
    try {
    if (!metadata.current || metadata.current.roomId !== roomId) {
      metadata.current = { roomId, promise: Promise.all([
        supabase.from('dm_profiles').select('*').eq('room_id', roomId).order('observed_at', { ascending: false }),
        supabase.from('dm_profile_overrides').select('*').eq('room_id', roomId).order('created_at', { ascending: false }),
        roomId==='WRBQM41' ? sharedProfileAssets() : Promise.resolve([]),
      ]).then(results => {
        const shared=results.pop();
        results[0]={...results[0],data:sharedDMProfiles(results[0].data||[],shared.filter(p=>p.member_id && !p.from_at),roomId)};
        results[1]={...results[1],data:[...(results[1].data||[]),...sharedDMOverrides(shared,roomId)]};
        for (const response of results) if (response.error) throw response.error;
        if (version === generation.current) {
          const nextProfiles = results[0].data || [];
          setProfiles(nextProfiles);
          setOverrides(results[1].data || []);
          const cached = dmHeaderCache.get(isAdmin);
          dmHeaderCache.set(isAdmin, { rooms: cached?.rooms || [], profiles: [...(cached?.profiles || []).filter(p => p.room_id !== roomId), ...nextProfiles] });
        }
        return results;
      }) };
    }
    const [result, profileResults] = await Promise.all([collectDMPages(async c => {
    let query = supabase.from('dm_messages').select('*').eq('room_id', roomId)
      .order('sent_at', { ascending: false }).order('id', { ascending: false }).limit(100);
    if (view === 'media') {
      if (mediaType === 'all') query = query.or('blocks.cs.[{"type":"photo"}],blocks.cs.[{"type":"video"}],blocks.cs.[{"type":"audio"}]');
      else query = query.contains('blocks', [{ type: mediaType }]);
      query = query.eq('deleted', false);
    }
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
    }, older ? cursor.current : null, all), metadata.current.promise]);
    for (const response of profileResults) if (response.error) throw response.error;
    if (version !== generation.current) return;
    setProfiles(profileResults[0].data || []);
    setOverrides(profileResults[1].data || []);
    setReadyRoom(roomId);
    setReadyView(`${roomId}:${view}:${mediaType}`);
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
      if (timeline.current) timeline.current.scrollTop = all || view === 'media' && !older ? 0 : older
        ? previousTop + timeline.current.scrollHeight - previousHeight : timeline.current.scrollHeight;
    });
    } catch (e) {
      if (version !== generation.current) return;
      requestPending.current = false; setLoading(false); setError(e.message); setReadyRoom(roomId); setReadyView(`${roomId}:${view}:${mediaType}`); metadata.current = null;
    }
  }, [roomId, search, date, isAdmin, view, mediaType]);

  useEffect(() => {
    const timer = setTimeout(() => { cursor.current = null; load(); }, search.trim() ? 250 : 0);
    return () => { clearTimeout(timer); generation.current += 1; };
  }, [load, search]);

  useEffect(()=>{
    const refresh=()=>{metadata.current=null;void load();};
    window.addEventListener('weverse:profile-changed',refresh);
    return()=>window.removeEventListener('weverse:profile-changed',refresh);
  },[load]);

  useEffect(() => {
    let active = true;
    if (profileOpen && roomId) collectDMPages(async c => {
      let query = supabase.from('dm_messages').select('*').eq('room_id',roomId)
        .order('sent_at',{ascending:false}).order('id',{ascending:false}).limit(100);
      if(c) query=query.or(`sent_at.lt.${c.sent_at},and(sent_at.eq.${c.sent_at},id.lt.${c.id})`);
      const {data,error:e}=await query;
      if(e)throw e;
      return data || [];
    },null,true).then(result=>{if(active)setAllMessages(result.rows.sort((a,b)=>Date.parse(a.sent_at)-Date.parse(b.sent_at)||a.id.localeCompare(b.id)));})
      .catch(e=>{if(active)setError(e.message);});
    return () => { active = false; };
  }, [roomId, profileOpen]);

  const contentReady = readyRoom === roomId && (!roomId || readyView === `${roomId}:${view}:${mediaType}`);
  const room = rooms.find(r => r.id === roomId);
  const roomProfiles = profiles.filter(p => p.room_id === roomId);
  const profile = roomProfiles[0];
  const chatRows = displayMessages(messages);
  const mediaItems = collectDMMedia(messages, mediaType);
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
        <button type="button" title="DM 검색" aria-label="DM 검색" aria-expanded={searchOpen} onClick={() => setSearchOpen(value => !value)}><Search size={18} /></button>
        <button type="button" title={view === 'chat' ? '미디어 모아보기' : '채팅 보기'} aria-label="미디어 모아보기" aria-pressed={view === 'media'} onClick={() => setView(value => value === 'chat' ? 'media' : 'chat')}><Images size={18} /></button>
        {date && <button title="날짜 초기화" aria-label="날짜 초기화" onClick={() => setDate('')}><X size={16} /></button>}
        <button title="새로고침" aria-label="새로고침" disabled={loading} onClick={() => load()}><RotateCcw size={16} /></button>
        <button title="저장된 첫 메시지로 이동" aria-label="저장된 첫 메시지로 이동" disabled={loading} onClick={() => load(false, true)}><ChevronsUp size={18} /></button>
        {isAdmin && <a href="/admin/dm/import" title="DM 가져오기" aria-label="DM 가져오기"><Upload size={18} /></a>}
      </header>
      {searchOpen && <div className="dm-search-row"><Search size={16} /><input autoFocus type="search" aria-label="DM 메시지 검색" placeholder="검색어를 입력하세요" value={search} onChange={event => setSearch(event.target.value)} />{search && <button type="button" aria-label="검색 초기화" onClick={() => setSearch('')}><X size={16} /></button>}</div>}
      {view === 'media' && <nav className="dm-media-tabs" aria-label="DM 미디어 종류">{[['all','전체'],['photo','사진'],['video','동영상'],['audio','녹음본']].map(([value,label]) => <button type="button" key={value} aria-pressed={mediaType === value} onClick={() => setMediaType(value)}>{label}</button>)}</nav>}
      {error && <p className="dm-error" role="alert">{error}</p>}
      <div className={`dm-timeline${!contentReady || !messages.length ? " dm-timeline-empty" : ""}`} ref={timeline} aria-busy={loading}>
        {!contentReady ? <p className="dm-empty" role="status">불러오는 중</p> : view === 'media' ? <>
          {!mediaItems.length && <p className="dm-empty">{loading ? '불러오는 중' : '해당 미디어가 없습니다.'}</p>}
          <div className="dm-media-grid">{mediaItems.map(item => <article className={item.block.type === 'audio' ? 'dm-media-card dm-media-audio' : 'dm-media-card'} key={item.id}><time dateTime={item.sent_at}>{dateLabel(item.sent_at)} {new Date(item.sent_at).toLocaleTimeString('ko-KR', {timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'})}</time><MessageBody message={{blocks:[item.block],deleted:false}} /></article>)}</div>
          {more && <button className="dm-older" disabled={loading} onClick={() => load(true)}>더 보기</button>}
        </> : <>
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
        </>}
      </div>
    </section>
    {profileOpen && <DMProfileHistory history={history} selected={selectedProfile} message={selectedMessage} rangeMessages={rangeMessages.length ? rangeMessages : chatRows}
      room={room} isAdmin={isAdmin} onClose={() => setProfileOpen(false)}
      onSaved={p => { metadata.current = null; setOverrides(current => [p,...current]); }} />}
  </ArchiveLayout>;
}
