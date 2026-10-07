import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import ArchiveLayout from "./ArchiveLayout";
import { deleteFromR2, getR2Key, uploadToR2 } from "./r2Storage";
import "./styles/App.css";

const go = (path) => {
  if (!path) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new Event("archive:navigate"));
};
const text = (value, fallback) => String(value || "").replace(/\s+/g, " ").trim() || fallback;
const stamp = (item) => `${item.date || "0000-00-00"}T${item.posted_at || item.created_at || "00:00:00"}`;
const shortDate = (value) => String(value || "").slice(2, 10).replaceAll("-", ".");
const parseFriends = (value) => {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.filter((item) => item?.name?.trim() && item?.message?.trim()) : [];
  } catch { return []; }
};

function Home({ isAdmin = false }) {
  const [loading, setLoading] = useState(true);
  const [updates, setUpdates] = useState([]);
  const [counts, setCounts] = useState({ diary: 0, photo: 0, video: 0, guestbook: 0, post: 0 });
  const [friends, setFriends] = useState([]);
  const [friendsDraft, setFriendsDraft] = useState([]);
  const [editingFriends, setEditingFriends] = useState(false);
  const [savingFriends, setSavingFriends] = useState(false);
  const [miniroomUrl, setMiniroomUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function loadHome() {
      const [posts, photos, miniroom, friendSetting, diaryCount, photoCount, videoCount, guestbookCount, postCount] = await Promise.all([
        supabase.from("weverse_posts").select("id,date,posted_at,created_at,content,diary_title,is_diary").order("date", { ascending: false, nullsFirst: false }).order("posted_at", { ascending: false, nullsFirst: false }).limit(6),
        supabase.from("photos").select("id,date,created_at").or("archive_visible.eq.true,archive_visible.is.null").order("date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false, nullsFirst: false }).limit(1),
        supabase.from("site_settings").select("value").eq("key", "miniroom_url").maybeSingle(),
        supabase.from("site_settings").select("value").eq("key", "friends_say").maybeSingle(),
        supabase.from("weverse_posts").select("id", { count: "exact", head: true }).eq("is_diary", true),
        supabase.from("photos").select("id", { count: "exact", head: true }).or("archive_visible.eq.true,archive_visible.is.null"),
        supabase.from("videos").select("id", { count: "exact", head: true }),
        supabase.from("guestbook_public").select("id", { count: "exact", head: true }),
        supabase.from("weverse_posts").select("id", { count: "exact", head: true }).or("is_diary.eq.false,is_diary.is.null"),
      ]);
      if (cancelled) return;
      [posts, photos, miniroom, friendSetting].forEach((result) => result.error && console.error("홈 조회 오류:", result.error));
      const postUpdates = (posts.data || []).filter((post) => isAdmin || post.is_diary).map((post) => ({
        ...post,
        category: post.is_diary ? "다이어리" : "게시글",
        title: post.is_diary ? text(post.diary_title, "새 다이어리가 등록됐어요") : text(post.content, "새 게시글이 등록됐어요"),
        path: post.is_diary ? (isAdmin ? "/admin/diary" : "/diary") : (isAdmin ? "/admin/posts" : null),
      }));
      const photoUpdates = (photos.data || []).map((photo) => ({
        ...photo,
        category: "사진첩",
        title: `새 사진이 업데이트됐어요${photo.date ? ` (${shortDate(photo.date)})` : ""}`,
        path: isAdmin ? "/admin" : "/photos",
      }));
      const savedFriends = parseFriends(friendSetting.data?.value);
      setUpdates([...postUpdates, ...photoUpdates].sort((a, b) => stamp(b).localeCompare(stamp(a))).slice(0, 4));
      setCounts({ diary: diaryCount.count || 0, photo: photoCount.count || 0, video: videoCount.count || 0, guestbook: guestbookCount.count || 0, post: postCount.count || 0 });
      setFriends(savedFriends);
      setFriendsDraft(savedFriends);
      setMiniroomUrl(String(miniroom.data?.value || ""));
      setLoading(false);
    }
    loadHome();
    return () => { cancelled = true; };
  }, [isAdmin]);

  async function changeMiniroom(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return alert("이미지 또는 GIF 파일을 선택해주세요.");
    setUploading(true);
    const oldKey = getR2Key(miniroomUrl);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "gif";
      const { publicUrl } = await uploadToR2("site", `miniroom/miniroom-${Date.now()}.${extension}`, file);
      const { error } = await supabase.from("site_settings").upsert({ key: "miniroom_url", value: publicUrl, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) throw error;
      setMiniroomUrl(publicUrl);
      if (oldKey) await deleteFromR2([oldKey]).catch(console.error);
    } catch (error) { alert(`미니룸을 저장하지 못했습니다.\n${error.message}`); }
    finally { setUploading(false); }
  }

  const updateFriend = (index, key, value) => setFriendsDraft((current) => current.map((item, i) => i === index ? { ...item, [key]: value } : item));
  async function saveFriends() {
    const cleaned = friendsDraft.map((item) => ({ name: item.name.trim(), message: item.message.trim() })).filter((item) => item.name && item.message);
    setSavingFriends(true);
    const { error } = await supabase.from("site_settings").upsert({ key: "friends_say", value: JSON.stringify(cleaned), updated_at: new Date().toISOString() }, { onConflict: "key" });
    setSavingFriends(false);
    if (error) return alert(`친구들 한마디를 저장하지 못했습니다.\n${error.message}`);
    setFriends(cleaned);
    setFriendsDraft(cleaned);
    setEditingFriends(false);
  }

  return (
    <ArchiveLayout isAdmin={isAdmin} activeTab="home">
      <section className="minihome-content">
        <section className="minihome-news">
          <div className="minihome-section-title minihome-news-title"><strong>Updated news</strong></div>
          <div className="minihome-news-body">
            <div className="minihome-news-list">
              {updates.map((item) => (
                <button type="button" key={`${item.category}-${item.id}`} onClick={() => go(item.path)} disabled={!item.path}>
                  <span className={`minihome-news-badge type-${item.category}`}>{item.category}</span><span className="minihome-news-text">{item.title}</span>
                </button>
              ))}
              {!loading && !updates.length && <p className="minihome-empty">최근 업데이트가 없습니다.</p>}
            </div>
            <div className="minihome-counts">
              <span>다이어리 <b>0/{counts.diary}</b></span><span>사진첩 <b>0/{counts.photo}</b></span>
              <span>동영상 <b>0/{counts.video}</b></span><span>방명록 <b>0/{counts.guestbook}</b></span>
              {isAdmin && <span>게시글 <b>0/{counts.post}</b></span>}
            </div>
          </div>
        </section>

        <section className="minihome-miniroom">
          <div className="minihome-section-title"><strong>Miniroom</strong>{isAdmin && <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>{uploading ? "업로드 중..." : "미니룸 변경"}</button>}</div>
          <div className="minihome-miniroom-stage">{miniroomUrl ? <img src={miniroomUrl} alt="링링일기 미니룸" /> : <div className="minihome-miniroom-placeholder"><span>MINIROOM</span>{isAdmin && <small>도트 GIF를 등록해주세요</small>}</div>}</div>
          {isAdmin && <input ref={fileInputRef} className="minihome-file-input" type="file" accept="image/gif,image/*" onChange={changeMiniroom} />}
        </section>

        <section className="minihome-friends">
          <div className="minihome-section-title"><strong>What friends say</strong>{isAdmin && <button type="button" onClick={() => { setFriendsDraft(friends); setEditingFriends((open) => !open); }}>{editingFriends ? "닫기" : "편집"}</button>}</div>
          {editingFriends ? (
            <div className="minihome-friends-editor">
              {friendsDraft.map((entry, index) => <div key={index}><input value={entry.message} onChange={(e) => updateFriend(index, "message", e.target.value)} placeholder="친구의 한마디" /><input value={entry.name} onChange={(e) => updateFriend(index, "name", e.target.value)} placeholder="이름" /><button type="button" onClick={() => setFriendsDraft((current) => current.filter((_, i) => i !== index))}>삭제</button></div>)}
              <div className="minihome-friends-editor-actions"><button type="button" onClick={() => setFriendsDraft((current) => [...current, { name: "", message: "" }])}>+ 한마디 추가</button><button type="button" onClick={saveFriends} disabled={savingFriends}>{savingFriends ? "저장 중..." : "전체 저장"}</button></div>
            </div>
          ) : (
            <div className="minihome-friend-list">{friends.map((entry, index) => <p key={`${entry.name}-${index}`}><span>· {entry.message}</span><strong>({entry.name})</strong></p>)}{!loading && !friends.length && <p className="minihome-empty">아직 등록된 친구들 한마디가 없습니다.</p>}</div>
          )}
        </section>
      </section>
    </ArchiveLayout>
  );
}

export default Home;
