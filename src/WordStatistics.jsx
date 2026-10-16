import {useEffect, useMemo, useState} from 'react';
import {Download, RefreshCw, ChevronLeft, ChevronRight, BarChart3} from 'lucide-react';
import ArchiveLayout from './ArchiveLayout';
import {supabase} from './supabaseClient';
import useTabVisibility from './useTabVisibility';
import {WORD_SOURCES, loadWordRows, rankWords, rankingCSV} from './wordFrequency';
import './styles/WordStatistics.css';

export default function WordStatistics({isAdmin = false}) {
  const visibility = useTabVisibility();
  const enabled = isAdmin ? {dm: true, posts: true, diary: true, comments: true} : visibility.allowed || {};
  const permissions = JSON.stringify({dm: !!enabled.dm, posts: !!enabled.posts, diary: !!enabled.diary, comments: !!enabled.comments});
  const [loaded, setLoaded] = useState({documents: [], loading: true, error: '', count: 0});
  const [revision, setRevision] = useState(0);
  const [source, setSource] = useState('all');
  const [includeSingle, setIncludeSingle] = useState(true);
  const [includeInitials, setIncludeInitials] = useState(false);
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (!isAdmin && !visibility.ready) return;
    const controller = new AbortController();
    Promise.resolve().then(() => {
      if (controller.signal.aborted) return [];
      setLoaded({documents: [], loading: true, error: '', count: 0, permissions});
      return loadWordRows(supabase, JSON.parse(permissions), controller.signal, count => {
      if (!controller.signal.aborted) setLoaded(old => ({...old, count}));
      });
    }).then(documents => {
      if (!controller.signal.aborted) setLoaded({documents, loading: false, error: '', count: documents.length, permissions});
    }).catch(error => {
      if (!controller.signal.aborted) setLoaded({documents: [], loading: false, error: error.message, count: 0, permissions});
    });
    return () => controller.abort();
  }, [isAdmin, visibility.ready, permissions, revision]);
  const result = useMemo(() => rankWords(loaded.permissions === permissions ? loaded.documents : [], {source, excludeSingle: !includeSingle, includeInitials}), [loaded.documents, loaded.permissions, permissions, source, includeSingle, includeInitials]);
  const pageCount = Math.max(1, Math.ceil(result.rows.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
  const rows = result.rows.slice(currentPage * 50, (currentPage + 1) * 50);
  const sourceAllowed = id => id === 'all' || (id === 'posts' ? enabled.posts || enabled.diary : enabled[id]);
  function download() {
    const url = URL.createObjectURL(new Blob([rankingCSV(result.rows)], {type: 'text/csv;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url; link.download = `리우_단어순위_${source}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function change(setter, value) { setter(value); setPage(0); }
  return <ArchiveLayout isAdmin={isAdmin} activeTab="statistics">
    <main className="word-statistics">
      <header className="word-heading"><h1><BarChart3 size={20} aria-hidden="true" />단어 순위</h1><div className="word-actions">
        <div className="word-toggles"><label>한 글자<input type="checkbox" role="switch" checked={includeSingle} onChange={e => change(setIncludeSingle, e.target.checked)} /></label><label>웃음·초성<input type="checkbox" role="switch" aria-label="웃음·초성 포함" checked={includeInitials} onChange={e => change(setIncludeInitials, e.target.checked)} /></label></div>
        <button type="button" title="새로 집계" aria-label="새로 집계" disabled={loaded.loading} onClick={() => setRevision(v => v + 1)}><RefreshCw size={18} /></button>
        <button type="button" title="CSV 내려받기" aria-label="CSV 내려받기" disabled={loaded.loading || !!loaded.error || !result.rows.length} onClick={download}><Download size={18} /></button>
      </div></header>
      <div className="word-tabs" role="tablist" aria-label="집계 자료">{Object.entries(WORD_SOURCES).filter(([id]) => sourceAllowed(id)).map(([id, name]) => <button type="button" key={id} role="tab" aria-selected={source === id} onClick={() => change(setSource, id)}>{name}</button>)}</div>
      {loaded.loading ? <p role="status">집계 자료를 불러오는 중 · {loaded.count.toLocaleString()}개</p> : loaded.error ? <div role="alert"><p>집계를 완료하지 못했어요. {loaded.error}</p><button type="button" onClick={() => setRevision(v => v + 1)}>다시 시도</button></div> : <>
        <div className="word-results" role="tabpanel" aria-label={`${WORD_SOURCES[source]} 단어 순위`}>
          <table><thead><tr><th scope="col">순위</th><th scope="col">단어</th><th scope="col">횟수</th><th scope="col">사용한 글</th></tr></thead><tbody>{rows.map(row => <tr key={row.word}><td>{row.rank}</td><th scope="row"><span>{row.word}</span><span className="word-bar" aria-hidden="true" style={{width: `${row.count / (result.rows[0]?.count || 1) * 100}%`}} /></th><td>{row.count.toLocaleString()}</td><td>{row.documents.toLocaleString()}</td></tr>)}</tbody></table>
          {!rows.length && <p className="word-empty">해당하는 단어가 없어요.</p>}
        </div>
        <nav className="word-pagination" aria-label="단어 순위 페이지"><button type="button" title="이전 페이지" aria-label="이전 페이지" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button><span>{currentPage + 1} / {pageCount}</span><button type="button" title="다음 페이지" aria-label="다음 페이지" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button></nav>
        <footer className="word-notes"><p>단어 {result.total.toLocaleString()}회 · {result.unique.toLocaleString()}종 · DM {result.sources.dm.toLocaleString()}개 · 게시글·다이어리 {result.sources.posts.toLocaleString()}개 · 댓글 {result.sources.comments.toLocaleString()}개</p><p>띄어쓰기 기준 · 조사·어미 유지 · 웃음·초성 {includeInitials ? '포함' : '제외'} · 링크·이모지·개인화 호칭 후보 제외</p></footer>
      </>}
    </main>
  </ArchiveLayout>;
}
