import { ArrowLeft } from "lucide-react";
import useDragSelection from "./useDragSelection";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import TagPicker from "./TagPicker";
import { LazyVideoThumbnail } from "./ArchiveVideoPlayer";
import { MEDIA_TYPES, VIDEO_TYPES, UNCLASSIFIED_TYPE, UNCLASSIFIED_FILTER } from "./mediaClassification";
import { videoSourceTags, withVideoSourceTags } from "./videoClassification";
import { isPendingMedia, managedMediaValues, normalizeManagedMedia, splitMediaTags } from "./mediaManager";
import "./styles/App.css";
import "./styles/PhotoLightbox.css";
import "./styles/PhotoManager.css";
import "./styles/AdminTools.css";

const HAIR_COLORS = ["흑발", "갈발", "금발", "적발", "은발", "핑머", "주머", "와인", "베이지"];
async function readPages(table, configure = (query) => query) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await configure(supabase.from(table).select("*")).order("id").range(offset, offset + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
async function loadManagedMedia(month, unclassified) {
  const start = `${month}-01`;
  const [year, number] = month.split("-").map(Number);
  const end = `${number === 12 ? year + 1 : year}-${String(number === 12 ? 1 : number + 1).padStart(2, "0")}-01`;
  const [photos, videos] = await Promise.all([
    readPages("photos", (query) => unclassified ? query.or(UNCLASSIFIED_FILTER) : query.gte("date", start).lt("date", end)),
    readPages("videos"),
  ]);
  const ids = [...new Set([...photos, ...videos].map((row) => row.post_id).filter(Boolean))];
  const posts = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await supabase.from("weverse_posts").select("id,date,content,weverse_url").in("id", ids.slice(offset, offset + 100));
    if (error) throw error;
    posts.push(...data);
  }
  const postMap = new Map(posts.map((post) => [String(post.id), post]));
  const rows = [...photos.map((row) => normalizeManagedMedia(row, "photos", postMap.get(String(row.post_id)))),
    ...videos.map((row) => normalizeManagedMedia(row, "videos", postMap.get(String(row.post_id))))]
    .filter((row) => unclassified ? isPendingMedia(row) : row.date >= start && row.date < end)
    .sort((a, b) => b.date.localeCompare(a.date) || Number(a.upload_order || 0) - Number(b.upload_order || 0));
  return { rows, posts };
}

export default function PhotoManager({ unclassified = false }) {
  const [selectedMonth, setSelectedMonth] = useState(() => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date()).slice(0, 7));
  const [rows, setRows] = useState([]);
  const [posts, setPosts] = useState([]);
  const [selected, setSelected] = useState([]);
  const [kind, setKind] = useState("all");
  const [source, setSource] = useState("all");
  const [bulkVideoType, setBulkVideoType] = useState("");
  const [bulkType, setBulkType] = useState("");
  const [bulkHair, setBulkHair] = useState("");
  const [bulkTags, setBulkTags] = useState("");
  const [loading, setLoading] = useState(unclassified);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const busy = loading || saving;
  const { overlay: selectionOverlay, ...selectionHandlers } = useDragSelection({ selected, onChange: setSelected, disabled: busy });
  const title = unclassified ? "미분류 자료 관리" : "사진·동영상 관리";
  useEffect(() => {
    if (!unclassified) return;
    let cancelled = false;
    loadManagedMedia("", true).then((result) => { if (!cancelled) { setRows(result.rows); setPosts(result.posts); } })
      .catch((err) => { if (!cancelled) setError(`자료를 불러오지 못했습니다. ${err.message}`); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [unclassified]);
  async function load() {
    if (busy || (!unclassified && !selectedMonth)) return;
    setLoading(true); setError(""); setNotice("");
    try { const result = await loadManagedMedia(selectedMonth, unclassified); setRows(result.rows); setPosts(result.posts); setSelected([]); }
    catch (err) { setError(`자료를 불러오지 못했습니다. ${err.message}`); }
    finally { setLoading(false); }
  }
  const visible = useMemo(() => rows.filter((row) => (kind === "all" || row.table === kind)
    && (source === "all" || (source === "포스트" ? !videoSourceTags(row).length : videoSourceTags(row).includes(source)))), [rows, kind, source]);
  const groups = useMemo(() => {
    const postMap = new Map(posts.map((post) => [String(post.id), post]));
    const grouped = new Map();
    for (const row of visible) {
      const key = row.post_id ? `post:${row.post_id}` : `media:${row.id}`;
      if (!grouped.has(key)) grouped.set(key, { id: key, post: postMap.get(String(row.post_id)), rows: [] });
      grouped.get(key).rows.push(row);
    }
    return [...grouped.values()];
  }, [visible, posts]);
  const selectedRows = visible.filter((row) => selected.includes(row.id));
  const selectedPhotos = selectedRows.filter((row) => row.table === "photos");
  const selectedVideos = selectedRows.filter((row) => row.table === "videos");
  const edit = (id, field, value) => setRows((current) => current.map((row) => row.id === id
    ? { ...row, [field]: value, ...(field === "type" && ["스크린샷", "같은사진", "짤"].includes(value) ? { archive_visible: false } : {}) } : row));
  function toggle(ids) {
    const all = ids.every((id) => selected.includes(id));
    setSelected((current) => all ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
  }
  async function saveTargets(targets, getValues, message) {
    if (busy || !targets.length) return;
    setSaving(true); setError(""); setNotice("");
    let completed = 0;
    try {
      for (let offset = 0; offset < targets.length; offset += 8) {
        const results = await Promise.allSettled(targets.slice(offset, offset + 8).map(async (row) => {
          const values = getValues(row);
          const { data, error: writeError } = await supabase.from(row.table).update(values).eq("id", row.originalId).select("*").single();
          if (writeError) throw writeError;
          const saved = { ...data, table: row.table };
          setRows((current) => current.flatMap((item) => item.id !== row.id ? [item]
            : unclassified && !isPendingMedia(saved) ? [] : [{ ...item, ...values,
              ...(values.tags ? { tagsText: values.tags.join(", ") } : {}) }]));
          setSelected((current) => current.filter((id) => id !== row.id));
          completed += 1;
          setProgress(`${completed} / ${targets.length}`);
        }));
        const failure = results.find((result) => result.status === "rejected");
        if (failure) throw failure.reason;
      }
      setNotice(`${completed}개 ${message}`);
    } catch (err) { setError(`${completed}개 저장 완료. ${err.message}`); }
    finally { setSaving(false); setProgress(""); }
  }
  const bulkTargets = selectedRows.length ? selectedRows : visible;
  const targetLabel = selectedRows.length ? `선택 자료 (${selectedRows.length}개)` : `현재 목록 전체 (${visible.length}개)`;
  const countLabel = `사진 ${visible.filter((row) => row.table === "photos").length}장 · 동영상 ${visible.filter((row) => row.table === "videos").length}개`;
  return <main className="archive-import-page photo-manager-page">
    <aside className="photo-manager-sidebar" aria-label="자료 조회 및 일괄 편집">
      <section className="archive-import-top">
        <div className="archive-import-header"><button type="button" className="archive-import-back-button admin-tools-back" aria-label="설정으로 돌아가기" title="설정으로 돌아가기" onClick={() => { window.location.href = "/admin/settings"; }}><ArrowLeft size={18} aria-hidden="true" /></button><h1>{title}</h1></div>
        <p>{unclassified ? "사진·동영상 유형이 선택 안됨인 자료를 모았습니다." : "사진과 동영상을 월별로 불러와 함께 편집합니다."}</p>
        <div className="photo-manager-month-toolbar">
          {!unclassified && <label>조회할 월<input type="month" disabled={busy} value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} /></label>}
          <div className="media-manager-filters">
            <label>자료<select disabled={busy} value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">사진·동영상</option><option value="photos">사진</option><option value="videos">동영상</option></select></label>
            <label>출처<select disabled={busy} value={source} onChange={(event) => setSource(event.target.value)}><option value="all">전체</option>{["포스트", "DM", "모먼트"].map((value) => <option key={value}>{value}</option>)}</select></label>
          </div>
          <button type="button" disabled={busy || (!unclassified && !selectedMonth)} onClick={load}>{loading ? "불러오는 중…" : unclassified ? "새로고침" : "이달 자료 불러오기"}</button>
        </div>
      </section>
      <div className="photo-manager-bulk-bar">
        <div className="photo-manager-bulk-heading"><strong>일괄 편집</strong><span>{selectedRows.length}개 선택</span><button disabled={busy || !visible.length} onClick={() => setSelected([...new Set([...selected, ...visible.map((row) => row.id)])])}>전체 선택</button><button disabled={busy || !selected.length} onClick={() => setSelected([])}>선택 해제</button></div>
        <span>{countLabel}</span>
        <div className="photo-manager-bulk-type"><select aria-label="일괄 사진 유형" disabled={busy} value={bulkType} onChange={(event) => setBulkType(event.target.value)}><option value="">사진 유형 선택</option><option value="unset">선택 안됨</option>{MEDIA_TYPES.map((type) => <option key={type}>{type}</option>)}</select>
          <button disabled={busy || !bulkType || !selectedPhotos.length} onClick={() => saveTargets(selectedPhotos, (row) => ({ type: bulkType === "unset" ? UNCLASSIFIED_TYPE : bulkType, tags: withVideoSourceTags(row).tags, ...(["스크린샷", "같은사진", "짤"].includes(bulkType) ? { archive_visible: false } : {}) }), "사진 유형을 저장했습니다.")}>유형 적용 ({selectedPhotos.length}장)</button></div>
        <div className="photo-manager-bulk-field">
        <select aria-label="일괄 머리색" disabled={busy} value={bulkHair} onChange={(event) => setBulkHair(event.target.value)}><option value="">머리색 선택</option>{HAIR_COLORS.map((color) => <option key={color}>{color}</option>)}</select>
        <button title={`${targetLabel} 머리색 적용`} disabled={busy || !bulkHair || !bulkTargets.length} onClick={() => saveTargets(bulkTargets, () => ({ hair_color: bulkHair }), "머리색을 저장했습니다.")}>{selectedRows.length ? "선택 머리색 적용" : "전체 머리색 적용"}</button>
        </div>
        <div className="photo-manager-bulk-tags"><TagPicker disabled={busy} value={bulkTags} onChange={setBulkTags} placeholder="일괄 추가할 태그" /></div>
        <button title={`${targetLabel} 태그 적용`} disabled={busy || !splitMediaTags(bulkTags).length || !bulkTargets.length} onClick={() => saveTargets(bulkTargets, (row) => ({ tags: withVideoSourceTags({ ...row, tags: [...new Set([...splitMediaTags(row.tagsText), ...splitMediaTags(bulkTags)])] }).tags }), "태그를 적용했습니다.")}>{selectedRows.length ? `선택 태그 적용 (${selectedRows.length}개)` : "전체 태그 적용"}</button>
        <div className="photo-manager-bulk-type"><select aria-label="일괄 동영상 유형" disabled={busy} value={bulkVideoType} onChange={(event) => setBulkVideoType(event.target.value)}><option value="">동영상 유형 선택</option><option value="unset">선택 안됨</option>{VIDEO_TYPES.map((type) => <option key={type}>{type}</option>)}</select><button disabled={busy || !bulkVideoType || !selectedVideos.length} onClick={() => saveTargets(selectedVideos, (row) => ({ type: bulkVideoType === "unset" ? UNCLASSIFIED_TYPE : bulkVideoType, tags: withVideoSourceTags(row).tags }), "동영상 유형을 저장했습니다.")}>유형 적용 ({selectedVideos.length}개)</button></div>
        <button disabled={busy || !visible.length} onClick={() => saveTargets(visible, managedMediaValues, "설정을 저장했습니다.")}>{saving ? `저장 중 ${progress}` : "전체 설정 저장"}</button>
      </div>
      {notice && <p className="photo-manager-notice" role="status">{notice}</p>}{error && <p className="photo-manager-error" role="alert">{error}</p>}
    </aside>
    <section {...selectionHandlers} className="photo-manager-workspace" aria-label="편집할 자료 목록">
      <header className="photo-manager-workspace-heading"><h2>자료 편집</h2><span>{countLabel} · {selectedRows.length}개 선택</span></header>
      {!visible.length && <p className="photo-manager-empty">{loading ? "자료를 불러오는 중…" : unclassified ? "미분류 자료가 없습니다." : "왼쪽에서 조회할 월을 선택하고 자료를 불러와주세요."}</p>}
      <div className="archive-draft-list photo-manager-post-list">
        {groups.map((group) => <section className={`archive-draft-card photo-manager-post-group ${group.rows.length > 1 ? "has-multiple-photos" : ""}`} key={group.id}>
          <div className="archive-draft-header"><div><strong>{group.post?.date || group.rows[0].date || "날짜 없음"}</strong>{group.post?.content && <div className="archive-draft-path photo-manager-content">{group.post.content}</div>}</div>
            {group.rows.length > 1 && <label className="photo-manager-post-select"><input type="checkbox" disabled={busy} checked={group.rows.every((row) => selected.includes(row.id))} ref={(element) => { if (element) element.indeterminate = group.rows.some((row) => selected.includes(row.id)) && !group.rows.every((row) => selected.includes(row.id)); }} onChange={() => toggle(group.rows.map((row) => row.id))} />전체선택</label>}</div>
          <div className="archive-import-media-list">{group.rows.map((row, index) => {
            const photo = row.table === "photos";
            const label = photo ? "사진" : "동영상";
            const crop = (row.crop_position || "50% 50%").split(" ");
            return <article className={`archive-import-media ${selected.includes(row.id) ? "is-selected" : ""}`} key={row.id} data-drag-select-id={row.id}>
              <div className="photo-manager-card-heading"><label className="photo-manager-card-select" title="일괄 편집 대상으로 선택"><input type="checkbox" aria-label={`${row.date} ${index + 1}번 ${label} 편집 선택`} disabled={busy} checked={selected.includes(row.id)} onChange={() => toggle([row.id])} /></label></div>
              <button type="button" className="archive-import-media-preview photo-preview-button" aria-label={`${index + 1}번 ${label} 크게 보기`} onClick={() => setPreview(row)}>
                {row.thumbnail_url || row.image_url ? <img src={row.thumbnail_url || row.image_url} alt="" loading="lazy" decoding="async" style={{ objectPosition: row.crop_position || "50% 50%" }} /> : !photo && row.video_url ? <LazyVideoThumbnail src={row.video_url} time={row.thumbnail_time} onLoadedMetadata={(video, time) => { video.currentTime = Math.min(Math.max(0.1, Number(time) || 0), Number.isFinite(video.duration) ? video.duration / 2 : 0.1); video.pause(); }} /> : <span className="media-manager-video-placeholder">▶ 동영상 재생</span>}
                <span>{photo ? "크게 보기" : "▶ 동영상 재생"}</span>
              </button>
              <small className="media-manager-source">{label} · {videoSourceTags(row).join(" · ") || "포스트"}</small>
              <fieldset className="archive-import-media-info" disabled={busy}>
                <select aria-label={`${label} 유형`} value={(photo ? MEDIA_TYPES : VIDEO_TYPES).includes(row.type) ? row.type : ""} onChange={(event) => edit(row.id, "type", event.target.value)}><option value="">선택 안됨</option>{(photo ? MEDIA_TYPES : VIDEO_TYPES).map((type) => <option key={type}>{type}</option>)}</select>
                <select aria-label="머리색" value={row.hair_color || ""} onChange={(event) => edit(row.id, "hair_color", event.target.value)}><option value="">머리색 선택</option>{HAIR_COLORS.map((color) => <option key={color}>{color}</option>)}</select>
                {photo && <label className="archive-visible-toggle import-visible-toggle"><input type="checkbox" disabled={["스크린샷", "같은사진", "짤"].includes(row.type)} checked={!["스크린샷", "같은사진", "짤"].includes(row.type) && row.archive_visible !== false} onChange={(event) => edit(row.id, "archive_visible", event.target.checked)} />아카이브 표시</label>}
                {!photo && !videoSourceTags(row).includes("DM") && <label>영상 위 텍스트<textarea rows={3} maxLength={5000} value={row.overlay_text || ""} onChange={(event) => edit(row.id, "overlay_text", event.target.value)} placeholder="모먼트 영상 위 텍스트" /></label>}
                <TagPicker disabled={busy} value={row.tagsText} onChange={(value) => edit(row.id, "tagsText", value)} />
                {unclassified ? <input aria-label="검색용 태그" placeholder="검색용 태그 (쉼표로 구분)" value={row.searchTagsText} onChange={(event) => edit(row.id, "searchTagsText", event.target.value)} /> : <small>검색용 태그는 태그 관리에서 일괄 수정됩니다.</small>}
                {photo && <details className="media-manager-crop"><summary>미리보기 위치</summary>{["가로", "세로"].map((axis, axisIndex) => <label key={axis}>{axis}<input type="range" min="0" max="100" value={parseFloat(crop[axisIndex]) || 0} onChange={(event) => { const next = [...crop]; next[axisIndex] = `${event.target.value}%`; edit(row.id, "crop_position", next.join(" ")); }} /></label>)}</details>}
                <button type="button" onClick={() => saveTargets([row], managedMediaValues, "설정을 저장했습니다.")}>이 {label} 설정 저장</button>
              </fieldset>
            </article>;
          })}</div>
        </section>)}
      </div>
    </section>
    {selectionOverlay}
    {preview && <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label="자료 미리보기" onMouseDown={() => setPreview(null)}><button type="button" className="photo-lightbox-close" aria-label="미리보기 닫기" onClick={() => setPreview(null)}>×</button>
      {preview.table === "photos" ? <img src={preview.image_url} alt="사진 미리보기" onMouseDown={(event) => event.stopPropagation()} /> : <video key={preview.id} src={preview.video_url} poster={preview.thumbnail_url || undefined} controls playsInline preload="metadata" onMouseDown={(event) => event.stopPropagation()} />}</div>}
  </main>;
}
