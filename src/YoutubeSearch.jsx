import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { supabase } from './supabaseClient';
import { youtubeKstDate } from './youtubeMetadata';

function text(value) {
  return String(value).replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, entity => {
    const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    const code = entity.slice(2, -1);
    const point = code[0]?.toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
  });
}

export default function YoutubeSearch({ onSelect, registeredIds = [], selectedId, disabled }) {
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');
  const [items, setItems] = useState([]);
  const [nextPage, setNextPage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function search(more = false) {
    const term = more ? searched : query.trim();
    if (!term || disabled || busy) return;
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setBusy(true); setError('');
    if (!more) { setItems([]); setNextPage(''); setSearched(term); }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('관리자 로그인이 필요합니다.');
      const params = new URLSearchParams({ q: term, ...(more ? { page: nextPage } : {}) });
      const response = await fetch(`/api/youtube-search?${params}`, { signal: active.signal,
        headers: { Authorization: `Bearer ${session.access_token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '유튜브 검색에 실패했습니다.');
      if (active.signal.aborted) return;
      const results = data.items.map(item => ({ ...item, title: text(item.title), channel: text(item.channel) }));
      setItems(old => [...new Map([...(more ? old : []), ...results].map(item => [item.id, item])).values()]);
      setNextPage(data.nextPage || '');
    } catch (err) { if (!active.signal.aborted) setError(err.message); }
    finally { if (!active.signal.aborted) setBusy(false); }
  }
  return <section className="youtube-search" aria-label="유튜브에서 영상 찾기">
    <label htmlFor="youtube-add-search">유튜브에서 찾기</label>
    <div className="youtube-search-input">
      <input id="youtube-add-search" value={query} maxLength={150} disabled={disabled} placeholder="영상 제목, 채널명 등으로 검색"
        onChange={event => setQuery(event.target.value)} onKeyDown={event => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); search(); }
        }} />
      <button type="button" disabled={disabled || busy || !query.trim()} onClick={() => search()}><Search size={16} />검색</button>
    </div>
    {error && <p role="alert" className="youtube-form-note">{error}</p>}
    {busy && <p role="status" className="youtube-form-note">검색 중…</p>}
    {!busy && !error && searched && !items.length && <p role="status" className="youtube-form-note">검색 결과가 없습니다.</p>}
    {items.length > 0 && <ul className="youtube-search-results" aria-label={`${searched} 검색 결과`}>{items.map(item => {
      const registered = registeredIds.includes(item.id);
      return <li key={item.id}><button type="button" disabled={disabled || registered} aria-pressed={selectedId === item.id}
        onClick={() => onSelect(item)}><img src={item.thumbnail} alt="" loading="lazy" decoding="async" />
        <span><strong>{item.title}</strong><small>{item.channel} · {youtubeKstDate(item.publishedAt)}</small>
          <small className="youtube-search-select">{registered ? '이미 등록됨' : selectedId === item.id ? '선택됨' : '이 영상 선택'}</small></span>
      </button></li>;
    })}</ul>}
    {nextPage && <button type="button" className="youtube-search-more" disabled={disabled || busy} onClick={() => search(true)}>검색 결과 더 보기</button>}
  </section>;
}
