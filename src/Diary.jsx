import DiaryImage from "./DiaryImage";
import ArchiveVideoPlayer from "./ArchiveVideoPlayer";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import ArchiveLayout from "./ArchiveLayout";
import "./styles/Diary.css";
import ContentReport from "./ContentReport";
import TagPicker from "./TagPicker";
import WeverseProfile from './WeverseProfile';
import {PostComments} from './WeverseComments';
import {sourcePostId,postTimestamp} from './weverseData';

function Diary({ isAdmin = false }) {
  const [posts, setPosts] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [videos, setVideos] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editCoverId, setEditCoverId] = useState("");
  const [editCoverPosition, setEditCoverPosition] = useState("50% 50%");
  const [videoCoverMap, setVideoCoverMap] = useState({});
  const [savingDiary, setSavingDiary] = useState(false);
  const [editTags, setEditTags] = useState("");
  const cropRef = useRef(null);
  const cropDragRef = useRef(null);
  const [reportTarget, setReportTarget] = useState(null);

  useEffect(() => {
    loadDiary();
    supabase
      .from("site_settings")
      .select("value")
      .eq("key", "diary_video_covers")
      .maybeSingle()
      .then(({ data }) => {
        try {
          const parsed = typeof data?.value === "string" ? JSON.parse(data.value) : data?.value;
          setVideoCoverMap(parsed && typeof parsed === "object" ? parsed : {});
        } catch {
          setVideoCoverMap({});
        }
      });
  }, []);



  async function loadDiary() {
    setLoading(true);

    try {
      const { data: postData, error: postError } = await supabase
        .from("weverse_posts")
        .select("*")
        .eq("is_diary", true)
        .order("date", { ascending: false, nullsFirst: false })
        .order("posted_at", { ascending: false, nullsFirst: false })
        // 날짜와 게시 시간이 같은 글도 불러올 때마다 순서가 바뀌지 않게 한다.
        .order("created_at", { ascending: false, nullsFirst: false });

      if (postError) throw postError;

      const diaryPosts = postData || [];
      const postIds = diaryPosts.map((post) => post.id);

      // 미디어 조회가 실패해도 등록된 다이어리 게시글 자체는 먼저 표시한다.

      if (!postIds.length) {
        setPosts([]);
        setPhotos([]);
        setVideos([]);
        return;
      }

      const [photoResult, videoResult] = await Promise.all([
        supabase
          .from("photos")
          .select("*")
          .in("post_id", postIds)
          .order("media_order", { ascending: true, nullsFirst: false }),
        supabase
          .from("videos")
          .select("*")
          .in("post_id", postIds)
          .order("media_order", { ascending: true, nullsFirst: false }),
      ]);

      setPosts(diaryPosts);
      const source=new URLSearchParams(window.location.search).get('weverse');
      if(source) {const requested=diaryPosts.find(post=>sourcePostId(post.weverse_url)===source);if(requested)setSelectedPost(requested);}
      if (photoResult.error) {
        console.error("다이어리 사진을 불러오지 못했습니다:", photoResult.error);
        setPhotos([]);
      } else {
        setPhotos(photoResult.data || []);
      }

      if (videoResult.error) {
        console.error("다이어리 영상을 불러오지 못했습니다:", videoResult.error);
        setVideos([]);
      } else {
        setVideos(videoResult.data || []);
      }
    } catch (error) {
      console.error("다이어리를 불러오지 못했습니다:", error);
    } finally {
      setLoading(false);
    }
  }

  function getPostPhotos(postId) {
    return photos.filter(
      (photo) => String(photo.post_id) === String(postId),
    );
  }

  function getPostVideos(postId) {
    return videos.filter(
      (video) => String(video.post_id) === String(postId),
    );
  }

  function getCover(post) {
    const postPhotos = getPostPhotos(post.id);
    const selectedCover = postPhotos.find(
      (photo) =>
        String(photo.id) === String(post.diary_cover_photo_id || ""),
    );

    if (selectedCover) {
      return selectedCover.thumbnail_url || selectedCover.image_url;
    }

    const selectedVideo = getPostVideos(post.id).find(
      (video) => String(video.id) === String(videoCoverMap[String(post.id)] || ""),
    );
    if (selectedVideo?.thumbnail_url) return selectedVideo.thumbnail_url;

    if (postPhotos[0]) {
      return postPhotos[0].thumbnail_url || postPhotos[0].image_url;
    }

    return getPostVideos(post.id)[0]?.thumbnail_url || "";
  }

  function getCoverPosition(post) {
    return post.diary_cover_position || "50% 50%";
  }

  function getTextPreview(post) {
    if (post.content?.trim()) return post.content.trim();
    if (!Array.isArray(post.content_blocks)) return "내용을 확인해보세요.";
    return post.content_blocks
      .filter((block) => block?.type === "text" && block.content)
      .map((block) => block.content.trim())
      .filter(Boolean)
      .join("\n\n") || "내용을 확인해보세요.";
  }

  function formatDiaryDate(post) {
    const date = String(post.date || "").replaceAll("-", ".");
    if (!post.posted_at) return { date, time: "" };
    const time = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(post.posted_at));
    return { date, time };
  }

  function getPostMedia(postId) {
    const photoMedia = getPostPhotos(postId).map((photo) => ({
      ...photo,
      mediaKind: "photo",
      order: Number(photo.media_order ?? photo.upload_order ?? 0),
    }));
    const videoMedia = getPostVideos(postId).map((video) => ({
      ...video,
      mediaKind: "video",
      order: Number(video.media_order ?? video.upload_order ?? 0),
    }));

    return [...photoMedia, ...videoMedia].sort((a, b) => a.order - b.order);
  }

  const filteredPosts = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return posts;

    return posts.filter((post) =>
      [post.diary_title, post.content, post.date, post.author, ...(Array.isArray(post.tags) ? post.tags : [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword)),
    );
  }, [posts, search]);

  const selectedMedia = selectedPost ? getPostMedia(selectedPost.id) : [];

  function openDiaryEdit() {
    setEditTitle(selectedPost.diary_title || "");
    const firstPhoto = getPostPhotos(selectedPost.id)[0];
    const firstVideo = getPostVideos(selectedPost.id)[0];
    const savedVideoId = videoCoverMap[String(selectedPost.id)];
    setEditCoverId(
      selectedPost.diary_cover_photo_id
        ? `photo:${selectedPost.diary_cover_photo_id}`
        : savedVideoId
          ? `video:${savedVideoId}`
          : firstPhoto
            ? `photo:${firstPhoto.id}`
            : firstVideo
              ? `video:${firstVideo.id}`
              : "",
    );
    setEditCoverPosition(selectedPost.diary_cover_position || "50% 50%");
    setEditTags(Array.isArray(selectedPost.tags) ? selectedPost.tags.join(", ") : "");
    setEditMode(true);
  }

  function parsePosition(position) {
    const [rawX = "50%", rawY = "50%"] = String(position || "50% 50%").split(/\s+/);
    return {
      x: Number.parseFloat(rawX) || 50,
      y: Number.parseFloat(rawY) || 50,
    };
  }

  function startCoverDrag(event) {
    const { x, y } = parsePosition(editCoverPosition);
    cropDragRef.current = { clientX: event.clientX, clientY: event.clientY, x, y };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveCoverDrag(event) {
    if (!cropDragRef.current || !cropRef.current) return;
    const rect = cropRef.current.getBoundingClientRect();
    const nextX = Math.max(0, Math.min(100,
      cropDragRef.current.x - ((event.clientX - cropDragRef.current.clientX) / rect.width) * 100,
    ));
    const nextY = Math.max(0, Math.min(100,
      cropDragRef.current.y - ((event.clientY - cropDragRef.current.clientY) / rect.height) * 100,
    ));
    setEditCoverPosition(`${nextX}% ${nextY}%`);
  }

  function stopCoverDrag(event) {
    cropDragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  async function saveDiarySettings() {
    if (!editTitle.trim()) {
      alert("다이어리 제목을 입력해주세요.");
      return;
    }

    const [coverKind, coverId = ""] = editCoverId.split(":");
    const nextVideoCoverMap = { ...videoCoverMap };
    if (coverKind === "video" && coverId) nextVideoCoverMap[String(selectedPost.id)] = coverId;
    else delete nextVideoCoverMap[String(selectedPost.id)];

    setSavingDiary(true);
    const { data, error } = await supabase
      .from("weverse_posts")
      .update({
        diary_title: editTitle.trim(),
        diary_cover_photo_id: coverKind === "photo" ? coverId : null,
        diary_cover_position: editCoverPosition,
        tags: editTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      })
      .eq("id", selectedPost.id)
      .select()
      .single();
    if (error) {
      setSavingDiary(false);
      alert(`다이어리 설정을 저장하지 못했습니다.\n${error.message}`);
      return;
    }
    const { error: coverSettingError } = await supabase.from("site_settings").upsert(
      { key: "diary_video_covers", value: JSON.stringify(nextVideoCoverMap), updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
    setSavingDiary(false);
    if (coverSettingError) {
      alert(`영상 대표 썸네일 설정을 저장하지 못했습니다.\n${coverSettingError.message}`);
      return;
    }
    setVideoCoverMap(nextVideoCoverMap);
    setPosts((current) => current.map((post) => String(post.id) === String(data.id) ? data : post));
    setSelectedPost(data);
    setEditMode(false);
  }

  function renderDiaryContent(post, media) {
    const blocks = Array.isArray(post.content_blocks) ? post.content_blocks : [];
    if (!blocks.length) return null;
    const orderedPhotos = media.filter((item) => item.mediaKind === "photo");
    const orderedVideos = media.filter((item) => item.mediaKind === "video");
    return blocks.map((block, blockIndex) => {
      if (block?.type === "text" && block.content) {
        return <div className="diary-modal-body" key={`text-${blockIndex}`}>{block.content}</div>;
      }
      const item = block?.type === "photo"
        ? orderedPhotos[Number(block.index)]
        : block?.type === "video"
          ? orderedVideos[Number(block.index)]
          : null;
      if (!item) return null;
      return (
        <div
          className={`diary-modal-media ${editMode ? "diary-cover-selectable" : ""} ${editCoverId === `${block.type}:${item.id}` ? "selected-cover" : ""}`}
          key={`${block.type}-${blockIndex}`}
          onClick={() => {
            if (editMode) setEditCoverId(`${block.type}:${item.id}`);
          }}
        >
          {block.type === "photo" ? (
            <DiaryImage key={item.id} photo={item} priority={orderedPhotos[0]?.id === item.id} />
          ) : (
            <div className="diary-video-player"><ArchiveVideoPlayer src={item.video_url} poster={item.thumbnail_url} preload="none" /></div>
          )}
        </div>
      );
    });
  }

  return (
    <>
      <ArchiveLayout
        isAdmin={isAdmin}
        activeTab="diary"
        onActiveTabClick={() => { setSelectedPost(null); setEditMode(false); }}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="다이어리 제목이나 내용을 검색해보세요"
      >
        {!selectedPost && <div className="diary-grid">
          {loading && <div className="diary-empty">다이어리를 불러오는 중...</div>}

          {!loading && filteredPosts.length === 0 && (
            <div className="diary-empty">아직 등록된 다이어리가 없습니다.</div>
          )}

          {filteredPosts.map((post, postIndex) => {
            const cover = getCover(post);
            return (
              <article
                className="diary-card"
                key={post.id}
                onClick={() => setSelectedPost(post)}
              >
                <div className="diary-card-cover">
                  {cover ? (
                    <img
                      src={cover}
                      alt=""
                      loading={postIndex < 3 ? "eager" : "lazy"}
                      decoding="async"
                      fetchPriority={postIndex === 0 ? "high" : "auto"}
                      style={{ objectPosition: getCoverPosition(post) }}
                    />
                  ) : (
                    <div className="diary-card-text-cover">
                      <small>TEXT DIARY</small>
                      <p>{getTextPreview(post)}</p>
                      <span>READ MORE</span>
                    </div>
                  )}
                </div>
                <div className="diary-card-title">
                  {post.diary_title || post.date || "제목 없는 다이어리"}
                </div>
                <div className="diary-card-date">{post.date}</div>
              </article>
            );
          })}
        </div>}

      {selectedPost && (
        <section className="diary-post-detail" aria-label="다이어리 상세">
            <button type="button" className="diary-post-back" onClick={() => { setSelectedPost(null); setEditMode(false); }}>← 목록으로</button>
          <article className="diary-post-content">

            <header className="diary-modal-header">
              <h2>{selectedPost.diary_title || "제목 없는 다이어리"}</h2>
              <div className="diary-modal-profile-row">
                <WeverseProfile at={postTimestamp(selectedPost)} sourceId={sourcePostId(selectedPost.weverse_url)} name={selectedPost.author} isAdmin={isAdmin}/>
                <div className="diary-modal-profile-info">
                  <strong>{selectedPost.author || "리우"}</strong>
                  <div className="diary-modal-date-time">
                    <span>{formatDiaryDate(selectedPost).date}</span>
                    {formatDiaryDate(selectedPost).time && (
                      <span>{formatDiaryDate(selectedPost).time}</span>
                    )}
                  </div>
                </div>
                <details className="entry-more-menu">
                  <summary aria-label="다이어리 설정">⋮</summary>
                  <div>
                    {selectedPost.weverse_url && (
                      <a href={selectedPost.weverse_url} target="_blank" rel="noreferrer">위버스 바로가기</a>
                    )}
                    {isAdmin && (
                      <button type="button" onClick={openDiaryEdit}>
                        수정
                      </button>
                    )}
                    <button type="button" onClick={() => setReportTarget({
                      type: "diary",
                      id: selectedPost.id,
                      label: `${selectedPost.date || ""} ${selectedPost.diary_title || "다이어리"}`.trim(),
                      previewUrl: getCover(selectedPost),
                      pageUrl: selectedPost.weverse_url || window.location.href,
                    })}>
                      오류 제보 · 수정 요청
                    </button>
                  </div>
                </details>
              </div>
            </header>

            {editMode && (
              <section className="diary-settings-editor">
                <label>
                  다이어리 제목
                  <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} />
                </label>

                <label className="diary-tags-editor">
                  다이어리 태그
                  <TagPicker value={editTags} onChange={setEditTags} />
                </label>

                {(() => {
                  const [coverKind, coverId] = editCoverId.split(":");
                  const cover = coverKind === "photo" ? getPostPhotos(selectedPost.id).find(
                    (photo) => String(photo.id) === String(coverId),
                  ) : null;
                  const coverVideo = coverKind === "video" ? getPostVideos(selectedPost.id).find(
                    (video) => String(video.id) === String(coverId),
                  ) : null;
                  return cover ? (
                    <>
                      <div
                        ref={cropRef}
                        className="diary-drag-crop"
                        onPointerDown={startCoverDrag}
                        onPointerMove={moveCoverDrag}
                        onPointerUp={stopCoverDrag}
                        onPointerCancel={stopCoverDrag}
                      >
                        <img
                          src={cover.thumbnail_url || cover.image_url}
                          alt="대표 이미지 크롭"
                          draggable={false}
                          style={{ objectPosition: editCoverPosition }}
                        />
                        <span>사진을 잡고 움직여 위치를 맞춰주세요</span>
                      </div>
                      <p>아래 본문 사진을 누르면 대표 이미지가 바뀝니다.</p>
                    </>
                  ) : coverVideo ? (
                    <>
                      <div className="diary-drag-crop diary-video-cover-preview">
                        {coverVideo.thumbnail_url ? (
                          <img src={coverVideo.thumbnail_url} alt="영상 대표 썸네일" />
                        ) : (
                          <video src={coverVideo.video_url} muted playsInline preload="metadata" />
                        )}
                        <span>선택한 영상의 썸네일을 사용합니다</span>
                      </div>
                      <p>아래 본문 영상이나 사진을 누르면 대표 미디어가 바뀝니다.</p>
                    </>
                  ) : getPostPhotos(selectedPost.id).length || getPostVideos(selectedPost.id).length ? (
                    <p>아래 본문 사진이나 영상을 누르면 대표 미디어를 선택할 수 있습니다.</p>
                  ) : (
                    <p>사진이 없는 다이어리는 대표 이미지 없이 제목과 태그만 저장됩니다.</p>
                  );
                })()}

                <div className="diary-settings-actions">
                  <button type="button" onClick={() => setEditMode(false)} disabled={savingDiary}>취소</button>
                  <button type="button" onClick={saveDiarySettings} disabled={savingDiary}>
                    {savingDiary ? "저장 중…" : "저장"}
                  </button>
                </div>
              </section>
            )}

            {Array.isArray(selectedPost.content_blocks) && selectedPost.content_blocks.length ? (
              <div className="diary-modal-blocks">{renderDiaryContent(selectedPost, selectedMedia)}</div>
            ) : <>
            {selectedPost.content && <div className="diary-modal-body">{selectedPost.content}</div>}
            {selectedMedia.length > 0 && (
              <div className="diary-modal-media">
                {selectedMedia.map((item) =>
                  item.mediaKind === "photo" ? (
                    <button
                      type="button"
                      key={`photo-${item.id}`}
                      className={`diary-fallback-photo ${editMode ? "diary-cover-selectable" : ""} ${editCoverId === `photo:${item.id}` ? "selected-cover" : ""}`}
                      onClick={() => { if (editMode) setEditCoverId(`photo:${item.id}`); }}
                    >
                      <DiaryImage key={item.id} photo={item} priority={selectedMedia.find((media) => media.mediaKind === "photo")?.id === item.id} />
                    </button>
                  ) : (
                    <div
                      key={`video-${item.id}`}
                      className={`${editMode ? "diary-cover-selectable" : ""} ${editCoverId === `video:${item.id}` ? "selected-cover" : ""}`}
                      onClick={() => { if (editMode) setEditCoverId(`video:${item.id}`); }}
                    >
                      <div className="diary-video-player"><ArchiveVideoPlayer src={item.video_url} poster={item.thumbnail_url} preload="none" /></div>
                    </div>
                  ),
                )}
              </div>
            )}
            </>}

            {Array.isArray(selectedPost.tags) && selectedPost.tags.length > 0 && (
              <div className="entry-hashtags diary-bottom-tags">
                {selectedPost.tags.map((tag) => <span key={tag}>#{tag}</span>)}
              </div>
            )}

            <PostComments key={selectedPost.id} post={selectedPost} isAdmin={isAdmin}/>
          </article>
        </section>
      )}
      </ArchiveLayout>
      <ContentReport target={reportTarget} onClose={() => setReportTarget(null)} />
    </>
  );
}

export default Diary;
