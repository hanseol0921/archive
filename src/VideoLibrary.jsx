import { useEffect, useRef, useState } from "react";
import { Folder, Play, Plus, Pencil, Trash2 } from "lucide-react";
import ArchiveLayout from "./ArchiveLayout";
import WeverseLiveLibrary from "./WeverseLiveLibrary";
import { ArchiveSortControl } from "./ArchiveFilters";
import { loadYoutubeMetadata, sortYoutubeItems, youtubeKstDate } from "./youtubeMetadata";
import { supabase } from "./supabaseClient";
import { YOUTUBE_CONTENT_KEY, VIDEO_FOLDERS_KEY, ROOT_VIDEO_FOLDERS, parseVideoFolders, folderDescendants, folderSource, parseYoutubeContents, youtubeVideoId, moveVideoFolder } from "./youtubeContent";
import "./styles/VideoLibrary.css";

const emptyDraft = { title: "", url: "" };

export default function VideoLibrary({ isAdmin, WeverseVideos }) {
  const [folder, setFolder] = useState("weverse");
  const [items, setItems] = useState([]);
  const [folderItems, setFolderItems] = useState(ROOT_VIDEO_FOLDERS);
  const [folderDraft, setFolderDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [playingId, setPlayingId] = useState(null);
  const [sort, setSort] = useState("최신순");
  const [metadata, setMetadata] = useState({});
  const [metadataError, setMetadataError] = useState("");
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataRevision, setMetadataRevision] = useState(0);
  const savedUpdatedAt = useRef({});
  const exists = useRef({});
  const titleRequest = useRef(0);
  const titleEdited = useRef(false);
  const [titleStatus, setTitleStatus] = useState("");
  useEffect(() => () => { titleRequest.current += 1; }, [formOpen]);

  async function changeYoutubeLink(url) {
    setDraft((old) => ({ ...old, url }));
    const requestId = ++titleRequest.current;
    const videoId = youtubeVideoId(url);
    if (!videoId) { setTitleStatus(""); return; }
    setTitleStatus("유튜브 제목을 가져오는 중…");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const info = (await loadYoutubeMetadata([videoId], session?.access_token))[videoId];
      if (requestId !== titleRequest.current) return;
      if (!info?.title || info.unavailable) throw new Error("영상 제목을 확인할 수 없습니다. 링크와 공개 상태를 확인해주세요.");
      setDraft((old) => titleEdited.current ? old : { ...old, title: info.title.slice(0, 120) });
      setTitleStatus(titleEdited.current ? "유튜브 제목을 확인했어요. 직접 입력한 제목은 유지합니다." : "유튜브 제목을 가져왔어요. 자유롭게 수정할 수 있습니다.");
    } catch (err) { if (requestId === titleRequest.current) setTitleStatus(err.message); }
  }
  const isYoutubeFolder = folderSource(folderItems, folder) === "youtube";
  const videoIds = [...new Set(items.map((item) => youtubeVideoId(item.url)).filter(Boolean))].sort().join(",");

  useEffect(() => {
    if (!isYoutubeFolder || !videoIds) return;
    const controller = new AbortController();
    Promise.resolve().then(() => {
      if (controller.signal.aborted) return {};
      setMetadataLoading(true);
      setMetadataError("");
      return loadYoutubeMetadata(videoIds.split(","), null, controller.signal);
    })
      .then((next) => { if (!controller.signal.aborted) setMetadata((old) => ({ ...old, ...next })); })
      .catch((err) => { if (!controller.signal.aborted) setMetadataError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setMetadataLoading(false); });
    return () => controller.abort();
  }, [isYoutubeFolder, videoIds, metadataRevision]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await supabase.from("site_settings").select("key,value,updated_at").in("key", [YOUTUBE_CONTENT_KEY, VIDEO_FOLDERS_KEY]);
      if (cancelled) return;
      try {
        if (result.error) throw result.error;
        const rows = Object.fromEntries((result.data || []).map((row) => [row.key, row.value]));
        setItems(parseYoutubeContents(rows[YOUTUBE_CONTENT_KEY]));
        setFolderItems(parseVideoFolders(rows[VIDEO_FOLDERS_KEY]));
        savedUpdatedAt.current = Object.fromEntries((result.data || []).map((row) => [row.key, row.updated_at]));
        exists.current = Object.fromEntries((result.data || []).map((row) => [row.key, true]));
        setError("");
      } catch {
        setError("유튜브 목록을 불러오지 못했습니다. 다시 시도해주세요.");
      } finally { setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [revision]);

  async function persist(nextItems, key = YOUTUBE_CONTENT_KEY) {
    // Optimistic concurrency prevents one administrator tab overwriting another.
    const value = JSON.stringify(nextItems);
    const row = { value, updated_at: new Date().toISOString() };
    let query;
    if (exists.current[key]) {
      query = supabase.from("site_settings").update(row).eq("key", key);
      query = savedUpdatedAt.current[key] == null ? query.is("updated_at", null) : query.eq("updated_at", savedUpdatedAt.current[key]);
    } else query = supabase.from("site_settings").insert({ key, ...row });
    const result = await query.select("key,updated_at");
    if (result.error) throw result.error;
    if (!result.data?.length) throw new Error("다른 창에서 목록이 변경되었거나 저장 권한이 없습니다. 목록을 새로고침해주세요.");
    savedUpdatedAt.current[key] = result.data[0].updated_at;
    exists.current[key] = true;
    if (key === VIDEO_FOLDERS_KEY) setFolderItems(nextItems);
    else setItems(nextItems);
  }

  async function save(event) {
    event.preventDefault();
    if (saving || !isAdmin || loading || error) return;
    const videoId = youtubeVideoId(draft.url);
    if (!videoId) return alert("올바른 유튜브 영상 링크를 입력해주세요. watch, 공유 링크, Shorts 링크를 사용할 수 있습니다.");
    if (items.some((item) => item.id !== editingId && youtubeVideoId(item.url) === videoId)) return alert("이미 등록된 유튜브 영상입니다.");
    if (!draft.title.trim()) return alert("영상 제목을 입력해주세요.");
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const info = (await loadYoutubeMetadata([videoId], session?.access_token))[videoId];
      if (!info?.publishedAt || info.unavailable) throw new Error("공개된 유튜브 영상의 업로드일을 확인할 수 없습니다. 링크와 공개 상태를 확인해주세요.");
      const item = { id: editingId || crypto.randomUUID(), title: draft.title.trim(), url: `https://www.youtube.com/watch?v=${videoId}`, publishedAt: info.publishedAt, viewCount: info.viewCount, metadataUpdatedAt: info.fetchedAt, folderId: draft.folderId || folder };
      await persist(editingId ? items.map((old) => old.id === editingId ? item : old) : [item, ...items]);
      setMetadata((old) => ({ ...old, [videoId]: info }));
      setFormOpen(false); setDraft(emptyDraft); setEditingId(null);
    } catch (err) { alert(`저장하지 못했습니다. ${err.message}`); }
    finally { setSaving(false); }
  }

  async function remove(item) {
    if (saving || !isAdmin || !window.confirm(`‘${item.title}’ 콘텐츠를 삭제할까요?`)) return;
    setSaving(true);
    try { await persist(items.filter((old) => old.id !== item.id)); }
    catch (err) { alert(`삭제하지 못했습니다. ${err.message}`); }
    finally { setSaving(false); }
  }

  async function saveFolder(event) {
    event.preventDefault();
    if (saving || !isAdmin || loading || error) return;
    const name = folderDraft.name.trim();
    if (!name) return;
    setSaving(true);
    try {
      let next;
      if (folderDraft.id) {
        next = ["youtube", "weverse"].includes(folderDraft.id) ? folderItems : moveVideoFolder(folderItems, folderDraft.id, folderDraft.parentId || null, folderDraft.beforeId);
        next = next.map((item) => item.id === folderDraft.id ? { ...item, name } : item);
      } else next = [...folderItems, { id: crypto.randomUUID(), name, parentId: folderDraft.parentId || null }];
      parseVideoFolders(next); await persist(next, VIDEO_FOLDERS_KEY); setFolderDraft(null);
    }
    catch (err) { alert(`폴더를 저장하지 못했습니다. ${err.message}`); }
    finally { setSaving(false); }
  }

  async function removeFolder(targetId = folder) {
    if (saving || !isAdmin || ["youtube", "weverse"].includes(targetId) || folderItems.find((item) => item.id === targetId)?.autoTag) return;
    if (folderItems.some((item) => item.parentId === targetId) || (folderItems.find((item) => item.id === targetId)?.videoIds || []).length || items.some((item) => (item.folderId || "youtube") === targetId)) {
      return alert("하위 폴더나 콘텐츠가 있는 폴더는 삭제할 수 없습니다. 콘텐츠를 다른 폴더로 옮긴 뒤 삭제해주세요.");
    }
    if (!window.confirm("이 빈 폴더를 삭제할까요?")) return;
    setSaving(true);
    try { await persist(folderItems.filter((item) => item.id !== targetId), VIDEO_FOLDERS_KEY); if (folder === targetId) setFolder("youtube"); }
    catch (err) { alert(`폴더를 삭제하지 못했습니다. ${err.message}`); }
    finally { setSaving(false); }
  }

  function folderTree(parentId = null, depth = 0) {
    return folderItems.filter((item) => (item.parentId || null) === parentId && (isAdmin || item.autoTag !== "DM")).map((item) => <div className="video-folder-node" key={item.id}>
      <div className={`video-folder-row ${depth > 0 ? "is-child" : "is-root"}`}>
      <button type="button" title={item.name} aria-pressed={folder === item.id} onClick={() => { setFolder(item.id); setPlayingId(null); setSearch(""); setFormOpen(false); setFolderDraft(null); }}><Folder size={16} /><span className="video-folder-name">{item.name}</span></button>
      {isAdmin && <button type="button" className="video-folder-icon" aria-label={`${item.name} 폴더 수정`} title="이름·위치 수정" disabled={loading || Boolean(error) || saving} onClick={() => { const siblings = folderItems.filter((other) => (other.parentId || null) === (item.parentId || null)); setFolderDraft({ name: item.name, parentId: item.parentId, id: item.id, beforeId: siblings[siblings.findIndex((other) => other.id === item.id) + 1]?.id || "" }); }}><Pencil size={14} /></button>}
      {isAdmin && !["youtube", "weverse"].includes(item.id) && !item.autoTag && <button type="button" className="video-folder-icon" aria-label={`${item.name} 폴더 삭제`} disabled={loading || Boolean(error) || saving} onClick={() => removeFolder(item.id)}><Trash2 size={14} /></button>}
      </div>
      {folderItems.some((child) => child.parentId === item.id) && <div className="video-folder-children">{folderTree(item.id, depth + 1)}</div>}
    </div>);
  }
  const currentFolder = folderItems.find((item) => item.id === folder) || ROOT_VIDEO_FOLDERS[1];
  function folderLabel(item) {
    const names = [item.name];
    let parent = folderItems.find((old) => old.id === item.parentId);
    while (parent) { names.unshift(parent.name); parent = folderItems.find((old) => old.id === parent.parentId); }
    return names.join(" / ");
  }
  const folders = <nav className="video-folders" aria-label="동영상 폴더">
    <div className="video-folder-heading"><h2>폴더</h2>{isAdmin && <button className="video-folder-icon" type="button" aria-label="폴더 추가" disabled={loading || Boolean(error) || saving} onClick={() => setFolderDraft({ name: "", parentId: folder, id: null })}><Plus size={18} /></button>}</div>{folderTree()}
  </nav>;
  const folderForm = folderDraft && <form className="youtube-form" onSubmit={saveFolder}>
    <h3>{folderDraft.id ? "폴더 수정" : "폴더 만들기"}</h3>
    <label>폴더 이름<input required maxLength={40} value={folderDraft.name} onChange={(event) => setFolderDraft({ ...folderDraft, name: event.target.value })} /></label>
    {!["youtube", "weverse"].includes(folderDraft.id) && <label>상위 폴더<select value={folderDraft.parentId || ""} onChange={(event) => setFolderDraft({ ...folderDraft, parentId: event.target.value, beforeId: "" })}>{(!folderDraft.id || folderSource(folderItems, folderDraft.id) === "youtube") && <option value="">최상위</option>}{folderItems.filter((item) => (!folderDraft.id || (!folderDescendants(folderItems, folderDraft.id).has(item.id) && folderSource(folderItems, item.id) === (folderItems.find((old) => old.id === folderDraft.id)?.autoTag === "라이브" ? "weverse" : folderSource(folderItems, folderDraft.id))))).map((item) => <option key={item.id} value={item.id}>{folderLabel(item)}</option>)}</select></label>}
    {folderDraft.id && !["youtube", "weverse"].includes(folderDraft.id) && <label>목록에서 위치<select value={folderDraft.beforeId || ""} onChange={(event) => setFolderDraft({ ...folderDraft, beforeId: event.target.value })}>{folderItems.filter((item) => item.id !== folderDraft.id && (item.parentId || null) === (folderDraft.parentId || null)).map((item) => <option key={item.id} value={item.id}>{item.name} 앞</option>)}<option value="">맨 아래</option></select></label>}
    <div><button type="submit" disabled={saving}>저장</button><button type="button" disabled={saving} onClick={() => setFolderDraft(null)}>취소</button></div>
  </form>;
  async function assignWeverseFolder(videoId, targetId) {
    if (!isAdmin || saving || loading || error) return;
    setSaving(true);
    try {
      const next = folderItems.map((item) => ({ ...item, videoIds: [...(item.videoIds || []).filter((id) => String(id) !== String(videoId)), ...(item.id === targetId ? [String(videoId)] : [])] }));
      await persist(next, VIDEO_FOLDERS_KEY);
    } catch (err) { alert(`폴더를 변경하지 못했습니다. ${err.message}`); }
    finally { setSaving(false); }
  }
  if (folderSource(folderItems, folder) === "weverse") return <WeverseVideos isAdmin={isAdmin} folderId={folder} folderItems={folderItems.filter((item) => folderSource(folderItems, item.id) === "weverse")} onAssignFolder={assignWeverseFolder} folderSaving={saving || loading || Boolean(error)} folderSidebar={folders} folderControls={<>{folderForm}{error && <div role="alert">{error}<button type="button" onClick={() => { setLoading(true); setRevision((value) => value + 1); }}>다시 불러오기</button></div>}</>} />;

  if (folderSource(folderItems, folder) === "live") return <WeverseLiveLibrary key={folder} isAdmin={isAdmin} folder={folder} folderItems={folderItems} sidebar={folders} folderForm={folderForm} items={items} persist={persist} loading={loading} error={error} />;

  const descendants = folderDescendants(folderItems, folder);
  const filtered = sortYoutubeItems(items.filter((item) => descendants.has(item.folderId || "youtube") && item.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map((item) => ({ ...item, videoId: youtubeVideoId(item.url) })), metadata, sort);
  return <ArchiveLayout isAdmin={isAdmin} activeTab="videos" sidebarContent={folders} search={search} onSearchChange={setSearch} searchPlaceholder="유튜브 콘텐츠 제목을 검색해보세요">
    <div className="video-folders-mobile">{folders}</div>
    {folderForm}
    <div className="youtube-heading"><div><h2>{currentFolder.name}</h2></div>
      {isAdmin && <button type="button" disabled={loading || Boolean(error) || saving} onClick={() => { titleRequest.current += 1; titleEdited.current = false; setTitleStatus(""); setDraft({ ...emptyDraft, folderId: folder }); setEditingId(null); setFormOpen(true); }}>+ 콘텐츠 추가</button>}
    </div>
    <ArchiveSortControl value={sort} onChange={setSort} count={filtered.length} unit="개" />
    {metadataLoading && <p className="youtube-status">업로드일·조회수를 불러오는 중…</p>}
    {metadataError && <div className="youtube-status" role="status">{isAdmin ? metadataError : "업로드일·조회수를 불러오지 못했습니다. 확인된 정보로 표시합니다."}<button type="button" onClick={() => setMetadataRevision((value) => value + 1)}>다시 시도</button></div>}
    {error && <div className="youtube-status" role="alert">{error}<button type="button" onClick={() => { setLoading(true); setRevision((value) => value + 1); }}>다시 불러오기</button></div>}
    {loading && <p className="youtube-status">콘텐츠를 불러오는 중...</p>}
    {formOpen && isAdmin && <form className="youtube-form" onSubmit={save}>
      <h3>{editingId ? "콘텐츠 수정" : "콘텐츠 추가"}</h3>
      <label>유튜브 링크<input required type="url" maxLength={1000} value={draft.url} onChange={(event) => changeYoutubeLink(event.target.value)} placeholder="https://www.youtube.com/watch?v=…" /></label>
      <label>제목<input required maxLength={120} value={draft.title} onChange={(event) => { titleEdited.current = Boolean(event.target.value.trim()); setDraft({ ...draft, title: event.target.value }); }} placeholder="링크를 넣으면 제목을 자동으로 가져옵니다" /></label>
      {titleStatus && <p className="youtube-form-note" role="status">{titleStatus}</p>}
      <p className="youtube-form-note">업로드일은 유튜브에서 자동으로 가져와 한국 시간(KST)으로 표시합니다.</p>
      <label>폴더<select value={draft.folderId || folder} onChange={(event) => setDraft({ ...draft, folderId: event.target.value })}>{folderItems.filter((item) => folderSource(folderItems, item.id) === "youtube").map((item) => <option key={item.id} value={item.id}>{folderLabel(item)}</option>)}</select></label>
      <div><button type="submit" disabled={saving}>{saving ? "저장 중…" : "저장"}</button><button type="button" disabled={saving} onClick={() => setFormOpen(false)}>취소</button></div>
    </form>}
    {!loading && !error && <div className="youtube-grid">
      {filtered.length === 0 && <p className="youtube-status">{search.trim() ? "검색 결과가 없습니다." : "이 폴더에 등록된 유튜브 콘텐츠가 없습니다."}</p>}
      {filtered.map((item) => { const id = item.videoId; const info = metadata[id]; const publishedAt = info?.publishedAt || item.publishedAt; const date = youtubeKstDate(publishedAt); const views = info?.viewCount ?? item.viewCount; return <article className="youtube-card" key={item.id}>
        {playingId === item.id ? <div className="youtube-player"><iframe src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`} title={item.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div>
          : <button type="button" className="youtube-preview" aria-label={`${item.title} 재생`} onClick={() => setPlayingId(item.id)}><img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" decoding="async" /><span><Play size={28} fill="currentColor" /></span></button>}
        <h3>{item.title}</h3>
        <div className="youtube-card-meta">{date && <time dateTime={publishedAt} title="한국 시간(KST) 기준 업로드일">{date.replaceAll("-", ".")}</time>}{views != null && <span>조회수 {Number(views).toLocaleString("ko-KR")}회</span>}<a href={item.url} target="_blank" rel="noreferrer">YouTube에서 보기 ↗</a></div>
        {info?.unavailable && <p className="youtube-form-note">공개 정보를 확인할 수 없는 영상입니다.</p>}
        {isAdmin && <div className="youtube-card-actions"><button type="button" disabled={saving} onClick={() => { titleRequest.current += 1; titleEdited.current = true; setTitleStatus(""); setEditingId(item.id); setDraft({ title: item.title, url: item.url, folderId: item.folderId || "youtube" }); setFormOpen(true); }}>수정</button><button type="button" disabled={saving} onClick={() => remove(item)}>삭제</button></div>}
      </article>; })}
    </div>}
  </ArchiveLayout>;
}
