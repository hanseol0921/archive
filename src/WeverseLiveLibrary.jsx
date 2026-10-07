import { useEffect, useRef, useState } from "react";
import { Play, X } from "lucide-react";
import ArchiveLayout from "./ArchiveLayout";
import { folderDescendants, folderSource, weverseLiveUrl } from "./youtubeContent";
import { youtubeKstDate } from "./youtubeMetadata";
import { loadLiveMetadata } from "./weverseLiveMetadata";
import { supabase } from "./supabaseClient";

export default function WeverseLiveLibrary({ isAdmin, folder, folderItems, sidebar, folderForm, items, persist, loading, error }) {
  const [draft, setDraft] = useState(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [playing, setPlaying] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [metadata, setMetadata] = useState({});
  const [thumbnailError, setThumbnailError] = useState("");
  const [retry, setRetry] = useState(0);
  const requestId = useRef(0);
  const liveUrls = [...new Set(items.filter((item) => !item.thumbnail && weverseLiveUrl(item.url)).map((item) => weverseLiveUrl(item.url)))].sort().join("\n");
  useEffect(() => {
    if (!liveUrls) return;
    const controller = new AbortController();
    async function load() {
      const { data: { session } } = isAdmin ? await supabase.auth.getSession() : { data: {} };
      const urls = liveUrls.split("\n");
      for (let i = 0; i < urls.length; i += 3) {
        if (controller.signal.aborted) return;
        await Promise.all(urls.slice(i, i + 3).map(async (url) => {
          try {
            const info = await loadLiveMetadata(url, session?.access_token, controller.signal);
            if (!controller.signal.aborted) setMetadata((old) => ({ ...old, [url]: info }));
          } catch (err) { if (!controller.signal.aborted) setThumbnailError(err.message); }
        }));
      }
    }
    void load();
    return () => controller.abort();
  }, [liveUrls, isAdmin, retry]);
  async function changeLink(url) {
    const id = ++requestId.current;
    setDraft((old) => ({ ...old, url, thumbnail: "" }));
    const canonical = weverseLiveUrl(url);
    if (!canonical) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const info = await loadLiveMetadata(canonical, session?.access_token);
      if (id !== requestId.current) return;
      setDraft((old) => old ? { ...old, thumbnail: info.thumbnail, title: old.title.trim() ? old.title : info.title } : old);
      setMetadata((old) => ({ ...old, [canonical]: info }));
    } catch (err) { if (id === requestId.current) setNotice(err.message); }
  }
  useEffect(() => {
    if (!playing) return;
    const close = (event) => { if (event.key === "Escape") setPlaying(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [playing]);
  const descendants = folderDescendants(folderItems, folder);
  const visible = items.filter((item) => weverseLiveUrl(item.url) && descendants.has(item.folderId) && item.title.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => (sort === "newest" ? -1 : 1) * String(a.publishedAt || "").localeCompare(String(b.publishedAt || "")));
  async function save(event) {
    event.preventDefault();
    if (saving || loading || error || !isAdmin) return;
    const url = weverseLiveUrl(draft.url);
    if (!url) return setNotice("올바른 위버스 라이브 링크를 입력해주세요.");
    if (items.some((item) => item.id !== draft.id && weverseLiveUrl(item.url) === url)) return setNotice("이미 등록된 라이브입니다.");
    setSaving(true); setNotice("");
    try {
      const thumbnail = draft.thumbnail || metadata[url]?.thumbnail || (await loadLiveMetadata(url, (await supabase.auth.getSession()).data.session?.access_token)).thumbnail;
      const item = { id: draft.id || crypto.randomUUID(), title: draft.title.trim(), url, thumbnail, folderId: draft.folderId || folder, publishedAt: draft.date ? `${draft.date}T00:00:00+09:00` : null };
      await persist(draft.id ? items.map((old) => old.id === draft.id ? item : old) : [item, ...items]);
      setDraft(null);
    } catch (err) { setNotice(`저장하지 못했습니다. ${err.message}`); }
    finally { setSaving(false); }
  }
  async function remove(item) {
    if (!isAdmin || saving || !window.confirm(`‘${item.title}’ 라이브를 삭제할까요?`)) return;
    setSaving(true);
    try { await persist(items.filter((old) => old.id !== item.id)); }
    catch (err) { setNotice(err.message); }
    finally { setSaving(false); }
  }
  return <ArchiveLayout isAdmin={isAdmin} activeTab="videos" sidebarContent={sidebar} search={search} onSearchChange={setSearch} searchPlaceholder="라이브 제목을 검색해보세요">
    <div className="video-folders-mobile">{sidebar}</div>{folderForm}
    <div className="youtube-heading"><h2>{folderItems.find((item) => item.id === folder)?.name}</h2>{isAdmin && <button disabled={loading || saving || Boolean(error)} onClick={() => { setNotice(""); setDraft({ title: "", url: "", date: "", folderId: folder }); }}>+ 라이브 추가</button>}</div>
    <div className="live-sort"><button aria-pressed={sort === "newest"} onClick={() => setSort("newest")}>최신순</button><button aria-pressed={sort === "oldest"} onClick={() => setSort("oldest")}>오래된순</button><span>총 {visible.length}개</span></div>
    {(error || notice) && <p role="alert">{error || notice}</p>}
    {thumbnailError && <p className="youtube-form-note" role="status">{thumbnailError}<button type="button" onClick={() => { setThumbnailError(""); setRetry((old) => old + 1); }}>다시 시도</button></p>}
    {draft && isAdmin && <form className="youtube-form" onSubmit={save}>
      <h3>{draft.id ? "라이브 수정" : "라이브 추가"}</h3>
      <label>위버스 라이브 링크<input type="url" required value={draft.url} onChange={(event) => changeLink(event.target.value)} placeholder="https://weverse.io/boynextdoor/live/…" /></label>
      {draft.thumbnail && <img className="live-draft-thumbnail" src={draft.thumbnail} alt="라이브 썸네일 미리보기" referrerPolicy="no-referrer" />}
      <label>제목<input required maxLength={120} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <label>방송일 (KST)<input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
      <label>폴더<select value={draft.folderId} onChange={(event) => setDraft({ ...draft, folderId: event.target.value })}>{folderItems.filter((item) => folderSource(folderItems, item.id) === "live").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div><button disabled={saving}>{saving ? "저장 중…" : "저장"}</button><button type="button" disabled={saving} onClick={() => setDraft(null)}>취소</button></div>
    </form>}
    {loading ? <p>콘텐츠를 불러오는 중…</p> : <div className="youtube-grid">{!visible.length && <p className="youtube-status">등록된 라이브가 없습니다.</p>}{visible.map((item) => <article className="youtube-card" key={item.id}>
      <button className="youtube-preview live-preview" aria-label={`${item.title} 재생`} onClick={() => setPlaying(item)}>{(item.thumbnail || metadata[weverseLiveUrl(item.url)]?.thumbnail) && <img src={item.thumbnail || metadata[weverseLiveUrl(item.url)].thumbnail} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />}<span><Play size={28} fill="currentColor" /></span><strong>Weverse LIVE</strong></button>
      <h3>{item.title}</h3><div className="youtube-card-meta"><time>{youtubeKstDate(item.publishedAt)}</time><a href={item.url} target="_blank" rel="noreferrer">위버스에서 보기 ↗</a></div>
      {isAdmin && <div className="youtube-card-actions"><button disabled={saving} onClick={() => setDraft({ ...item, date: youtubeKstDate(item.publishedAt) || "" })}>수정</button><button disabled={saving} onClick={() => remove(item)}>삭제</button></div>}
    </article>)}</div>}
    {playing && <div className="live-modal-backdrop" onClick={() => setPlaying(null)}><section className="live-modal" role="dialog" aria-modal="true" aria-label={playing.title} onClick={(event) => event.stopPropagation()}><header><strong>{playing.title}</strong><a href={playing.url} target="_blank" rel="noreferrer">위버스에서 보기 ↗</a><button autoFocus aria-label="라이브 닫기" onClick={() => setPlaying(null)}><X size={20} /></button></header><iframe src={weverseLiveUrl(playing.url)} title={playing.title} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen /></section></div>}
  </ArchiveLayout>;
}
