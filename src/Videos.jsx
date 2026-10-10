import { VIDEO_TYPES, UNCLASSIFIED_TYPE, isUnclassifiedType } from "./mediaClassification";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import ArchiveLayout from "./ArchiveLayout";
import ArchiveFilters, { ArchiveSortControl } from "./ArchiveFilters";
import { getPopularityScore, trackMediaEngagement } from "./mediaPopularity";
import "./styles/App.css";
import TagPicker from "./TagPicker";
import ContentReport from "./ContentReport";
import { deleteFromR2, getR2Key, uploadToR2 } from "./r2Storage";
import "./styles/Videos.css";
import VideoLibrary from "./VideoLibrary";
import ArchiveVideoPlayer, { LazyVideoThumbnail } from "./ArchiveVideoPlayer";
import { weverseFolderMatches } from "./youtubeContent";
import { videoSourceTags, withVideoSourceTags } from "./videoClassification";
import { isPhotoVisible, isDmMedia } from "./photoVisibility";
import useArchiveVisibility from "./useArchiveVisibility";

function WeverseVideos({ isAdmin = false, folderSidebar, folderControls, folderItems = [], folderId = "weverse", onAssignFolder, folderSaving }) {
  const visibility = useArchiveVisibility(isAdmin);
  const [videos, setVideos] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);
  const [thumbnailTime, setThumbnailTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [savingThumbnail, setSavingThumbnail] = useState(false);
  const [editingVideo, setEditingVideo] = useState(false);
  const [savingVideo, setSavingVideo] = useState(false);
  const [editOverlayText, setEditOverlayText] = useState("");
  const [editVideoType, setEditVideoType] = useState("");
  const [editVideoHairColor, setEditVideoHairColor] = useState("");
  const [editVideoTags, setEditVideoTags] = useState("");
  const [editVideoSearchTags, setEditVideoSearchTags] = useState("");
  const modalVideoRef = useRef(null);


  const [sortOrder, setSortOrder] = useState("최신순");


  const [videoType, setVideoType] = useState("전체");
  const [videoHairColor, setVideoHairColor] = useState("전체");

  const [search, setSearch] = useState("");
  const [extraSelection, setExtraSelection] = useState({});

  const [startDate, setStartDate] = useState("");

  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    loadVideos();
  }, []);

  useEffect(() => {
    if (!selectedVideo) return;

    setThumbnailTime(Number(selectedVideo.thumbnail_time) || 0);
    setVideoDuration(0);
    setEditingVideo(isAdmin);
    setEditOverlayText(selectedVideo.overlay_text || "");
    setEditVideoType(VIDEO_TYPES.includes(selectedVideo.type) ? selectedVideo.type : "");
    setEditVideoHairColor(selectedVideo.hair_color || "");
    setEditVideoTags(
      Array.isArray(selectedVideo.tags) ? selectedVideo.tags.join(", ") : "",
    );
    setEditVideoSearchTags(
      Array.isArray(selectedVideo.search_tags)
        ? selectedVideo.search_tags.join(", ")
        : "",
    );
  }, [selectedVideo, isAdmin]);

  function splitTags(value) {
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  async function saveVideoDetails() {
    if (!selectedVideo) return;

    const nextValues = {
      ...(("overlay_text" in selectedVideo || editOverlayText.trim()) ? { overlay_text: editOverlayText.trim() } : {}),
      type: editVideoType || UNCLASSIFIED_TYPE,
      hair_color: editVideoHairColor || null,
      tags: splitTags(editVideoTags),
      search_tags: splitTags(editVideoSearchTags),
    };
    nextValues.tags = withVideoSourceTags({ ...selectedVideo, ...nextValues }, getPost(selectedVideo)).tags;

    setSavingVideo(true);
    try {
      const { error } = await supabase
        .from("videos")
        .update(nextValues)
        .eq("id", selectedVideo.id);

      if (error) throw error;

      const updatedVideo = { ...selectedVideo, ...nextValues };
      setVideos((current) =>
        current.map((video) =>
          video.id === selectedVideo.id ? updatedVideo : video,
        ),
      );
      setSelectedVideo(updatedVideo);
      setEditingVideo(false);
    } catch (error) {
      console.error("동영상 정보 수정 오류:", error);
      alert("동영상 정보를 수정하지 못했습니다.");
    } finally {
      setSavingVideo(false);
    }
  }

  async function deleteSelectedVideo() {
    if (!selectedVideo) return;
    if (!window.confirm("이 동영상을 삭제할까요? 삭제 후 복구할 수 없습니다.")) {
      return;
    }

    try {
      const targetId = selectedVideo.id;
      const { error } = await supabase.from("videos").delete().eq("id", targetId);
      if (error) throw error;

      const videoKey = getR2Key(selectedVideo.video_url);
      const thumbnailKey = getR2Key(selectedVideo.thumbnail_url);
      await deleteFromR2([videoKey, thumbnailKey]);

      setVideos((current) => current.filter((video) => video.id !== targetId));
      setSelectedVideo(null);
    } catch (error) {
      console.error("동영상 삭제 오류:", error);
      alert("동영상을 삭제하지 못했습니다.");
    }
  }

  function searchVideoTag(tag) {
    setSearch(tag);
    setSelectedVideo(null);
  }

  function showThumbnailFrame(element, time) {
    const nextTime = Math.max(0, Number(time) || 0);

    if (Number.isFinite(element.duration)) {
      element.currentTime = Math.min(nextTime, element.duration);
    }

    element.pause();
  }

  function handleThumbnailChange(value) {
    const nextTime = Number(value);
    setThumbnailTime(nextTime);

    if (modalVideoRef.current) {
      showThumbnailFrame(modalVideoRef.current, nextTime);
    }


  }

  async function captureVideoThumbnail(videoElement, time) {
    if (!videoElement) throw new Error("동영상 화면을 찾지 못했습니다.");

    const targetTime = Math.max(
      0,
      Math.min(Number(time) || 0, videoElement.duration || Number(time) || 0),
    );

    if (Math.abs(videoElement.currentTime - targetTime) > 0.03) {
      await new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("선택 장면을 불러오는 데 시간이 초과되었습니다.")), 10000);
        const handleSeeked = () => {
          window.clearTimeout(timeout);
          videoElement.removeEventListener("error", handleError);
          resolve();
        };
        const handleError = () => {
          window.clearTimeout(timeout);
          videoElement.removeEventListener("seeked", handleSeeked);
          reject(new Error("선택 장면을 불러오지 못했습니다."));
        };
        videoElement.addEventListener("seeked", handleSeeked, { once: true });
        videoElement.addEventListener("error", handleError, { once: true });
        videoElement.currentTime = targetTime;
      });
    }

    const sourceWidth = videoElement.videoWidth;
    const sourceHeight = videoElement.videoHeight;
    if (!sourceWidth || !sourceHeight) throw new Error("동영상 크기를 확인하지 못했습니다.");

    const maxSize = 640;
    const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d");
    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("썸네일 이미지 생성에 실패했습니다.")),
        "image/webp",
        0.82,
      );
    });
  }

  async function saveThumbnailTime() {
    if (!selectedVideo) return;

    setSavingThumbnail(true);

    try {
      const thumbnailBlob = await captureVideoThumbnail(
        modalVideoRef.current,
        thumbnailTime,
      );
      const thumbnailPath = `thumbnails/${selectedVideo.id}/${Date.now()}.webp`;
      const { publicUrl: thumbnailUrl, key: thumbnailKey } = await uploadToR2(
        "videos",
        thumbnailPath,
        thumbnailBlob,
        "image/webp",
      );

      const { error } = await supabase
        .from("videos")
        .update({
          thumbnail_time: thumbnailTime,
          thumbnail_url: thumbnailUrl,
        })
        .eq("id", selectedVideo.id);

      if (error) {
        await deleteFromR2([thumbnailKey]);
        throw error;
      }

      const oldThumbnailKey = getR2Key(selectedVideo.thumbnail_url);
      if (oldThumbnailKey?.startsWith("videos/thumbnails/") && oldThumbnailKey !== thumbnailKey) {
        await deleteFromR2([oldThumbnailKey]);
      }

      setVideos((current) =>
        current.map((video) =>
          video.id === selectedVideo.id
            ? { ...video, thumbnail_time: thumbnailTime, thumbnail_url: thumbnailUrl }
            : video
        )
      );

      setSelectedVideo((current) => ({
        ...current,
        thumbnail_time: thumbnailTime,
        thumbnail_url: thumbnailUrl,
      }));
      alert("선택한 장면을 썸네일 이미지로 저장했습니다.");
    } catch (error) {
      console.error("썸네일 장면 저장 오류:", error);
      alert("썸네일 장면을 저장하지 못했습니다.");
    } finally {
      setSavingThumbnail(false);
    }
  }

  async function loadVideos() {
    setLoading(true);

    try {
      const [videoResult, postResult] = await Promise.all([
        supabase.from("videos").select("*"),
        supabase.from("weverse_posts").select("*"),
      ]);
      if (videoResult.error) throw videoResult.error;
      if (postResult.error) throw postResult.error;
      const videoData = videoResult.data;
      const postData = postResult.data;
      const postsById = new Map((postData || []).map(post => [String(post.id), post]));

      setVideos((videoData || []).map((video) => withVideoSourceTags(video, postsById.get(String(video.post_id)))));
      setPosts(postData || []);
    } catch (error) {
      console.error("동영상 불러오기 오류:", error);
    } finally {
      setLoading(false);
    }
  }

  function getPost(video) {
    if (video?.dm_sent_at) {
      const date = new Date(video.dm_sent_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
      return { date, posted_at: video.dm_sent_at, content: 'DM' };
    }
    if (!video?.post_id) {
      return null;
    }

    return posts.find(
      (post) => String(post.id) === String(video.post_id)
    );
  }

  function formatDate(date) {
    if (!date) return "";
    return date.replaceAll("-", ".");
  }

  function formatTime(postedAt) {
    if (!postedAt) return "";

    const date = new Date(postedAt);

    return date.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getVideoSortTime(video) {
    const post = getPost(video);

    if (post?.posted_at) {
      const time = new Date(post.posted_at).getTime();
      if (Number.isFinite(time)) return time;
    }

    if (post?.date) {
      const time = new Date(`${post.date}T00:00:00`).getTime();
      if (Number.isFinite(time)) return time;
    }

    if (video.created_at) {
      const time = new Date(video.created_at).getTime();
      if (Number.isFinite(time)) return time;
    }

    return 0;
  }

  const filteredVideos = useMemo(() => {
    return [...videos]
      .filter((video) => {
        if (!isAdmin && isDmMedia(video)) return false;
        if (!isAdmin && (!visibility.ready || !isPhotoVisible(video, extraSelection, visibility.allowed))) return false;

        const post = getPost(video);
        if (!weverseFolderMatches(folderItems, folderId, video, post)) return false;

        const videoDate = post?.date || "";

        // 유형

        const tags = Array.isArray(video.tags) ? video.tags : [];
        const searchTags = Array.isArray(video.search_tags)
          ? video.search_tags
          : [];

        const matchesHairColor =
          videoHairColor === "전체" || video.hair_color === videoHairColor;

        // 시작 날짜
        const matchesStartDate =
          !startDate || (videoDate && videoDate >= startDate);

        // 종료 날짜
        const matchesEndDate = !endDate || (videoDate && videoDate <= endDate);

        const normalizedSearch = search.trim().toLowerCase();
        const searchableValues = [
          video.type,
          videoDate,
          post?.content,
          video.overlay_text,
          ...tags,
          ...searchTags,
        ];

        const matchesSearch =
          !normalizedSearch ||
          searchableValues.some((value) =>
            String(value || "").toLowerCase().includes(normalizedSearch),
          );

        return (
          (videoType === "전체" || (videoType === UNCLASSIFIED_TYPE ? isUnclassifiedType(video.type) : video.type === videoType)) && matchesHairColor &&
          matchesStartDate &&
          matchesEndDate &&
          matchesSearch
        );
      })
      .filter(
        (video) => sortOrder !== "인기순" || Number(video.view_count || 0) > 0,
      )
      .sort((a, b) => {
        if (sortOrder === "인기순") {
          const popularityDiff = getPopularityScore(b) - getPopularityScore(a);
          if (popularityDiff !== 0) return popularityDiff;
        }

        const aTime = getVideoSortTime(a);

        const bTime = getVideoSortTime(b);

        return sortOrder === "오래된순" ? aTime - bTime : bTime - aTime;
      });
  }, [
    videos,
    posts,
    sortOrder,
    videoType,
    videoHairColor,
    search,
    extraSelection,
    isAdmin,
    visibility.ready,
    visibility.allowed,
    startDate,
    endDate,
    folderItems,
    folderId,
  ]);


  const visibleVideoCount = filteredVideos.length;

  async function downloadVideo(video) {
    try {
      const response = await fetch(video.video_url);

      if (!response.ok) {
        throw new Error("동영상 파일을 불러오지 못했습니다.");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const post = getPost(video);
      const extension =
        blob.type?.split("/")[1]?.split("+")[0] || "mp4";

      const link = document.createElement("a");
      link.href = objectUrl;
      link.download =
        `riwoo_${post?.date || "video"}_${video.id}.${extension}`;

      document.body.appendChild(link);
      link.click();
      link.remove();
      void trackMediaEngagement("video", video.id, "download");

      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error("동영상 다운로드 오류:", error);
      alert("동영상을 다운로드하지 못했습니다.");
    }
  }



          return (
            <>
              <ArchiveLayout
                isAdmin={isAdmin}
                activeTab="videos"
                sidebarContent={folderSidebar}
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="검색어를 입력하세요"
              >
                <div className="video-folders-mobile">{folderSidebar}</div>
                {folderControls}


                {visibility.error && <p role="alert">{visibility.error}</p>}
                {visibility.notice && <p role="status">{visibility.notice}</p>}
                <ArchiveFilters
                  search={search}
                  setSearch={setSearch}
                  searchPlaceholder="검색어를 입력하세요"
                  type={videoType}
                  setType={setVideoType}
                  typeOptions={["전체", ...(isAdmin ? ["선택 안됨", ...VIDEO_TYPES] : ["춤", "노래", "셀카"])]}
                  extraSelection={isAdmin ? visibility.allowed : extraSelection}
                  setExtraSelection={isAdmin ? visibility.change : setExtraSelection}
                  extraDisabled={isAdmin && (!visibility.ready || visibility.saving)}
                  extraHelp={isAdmin ? "체크한 항목의 자료를 공개 아카이브에서 허용합니다. DM은 관리자 전용입니다." : ""}
                  includeDm={isAdmin}
                  extraIsPublicationSetting={isAdmin}
                  sortOrder={sortOrder}
                  setSortOrder={setSortOrder}
                  startDate={startDate}
                  setStartDate={setStartDate}
                  endDate={endDate}
                  setEndDate={setEndDate}
                  typeLabel="동영상 유형"
                  secondaryValue={videoHairColor}
                  setSecondaryValue={setVideoHairColor}
                  secondaryLabel="머리색"
                  secondaryOptions={["흑발", "갈발", "금발", "적발", "은발", "핑머", "주머", "와인", "베이지"]}
                  allActive={
                    videoType === "전체" && videoHairColor === "전체" &&
                    search.trim() === ""
                  }
                  onAllClick={() => {
                    setVideoType("전체");
                    setVideoHairColor("전체");
                    setSearch("");
                  }}
                />

                <ArchiveSortControl
          value={sortOrder}
          onChange={setSortOrder}
          count={visibleVideoCount}
          unit="개"
          adminTotal={isAdmin ? videos.length : undefined}
        />

                <div className="video-grid">
                  {loading && (
                    <div className="video-empty">동영상을 불러오는 중...</div>
                  )}

                  {!loading && filteredVideos.length === 0 && (
                    <div className="video-empty">
                      조건에 맞는 동영상이 없습니다.
                    </div>
                  )}

                  {!loading &&
                    filteredVideos.map((video) => {
                      const post = getPost(video);

                      return (
                        <article
                          className="video-card"
                          key={video.id}
                          onClick={() => {
                            setSelectedVideo(video);
                            void trackMediaEngagement("video", video.id, "view");
                          }}
                        >
                          <div className="video-preview">
                            {video.thumbnail_url ? (
                              <img
                                src={video.thumbnail_url}
                                alt=""
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <LazyVideoThumbnail key={video.id} src={video.video_url} time={video.thumbnail_time} onLoadedMetadata={showThumbnailFrame} />
                            )}
                            <div className="video-thumbnail-play">▶</div>
                          </div>

                          <div className="video-info">
                            {post && (
                              <div className="video-date">
                                <span>{formatDate(post.date)}</span>

                                {post.posted_at && (
                                  <span className="video-time">
                                    {formatTime(post.posted_at)}
                                  </span>
                                )}
                              </div>
                            )}

                            {video.type && (
                              <div className="video-type">{video.type}</div>
                            )}

                            {post?.content && (
                              <div className="video-post-text">
                                {post.content}
                              </div>
                            )}

                            <div className="video-card-footer">
                              {post?.weverse_url && (
                                <a
                                  href={post.weverse_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void trackMediaEngagement("video", video.id, "weverse");
                                  }}
                                >
                                  WEVERSE ↗
                                </a>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                </div>
              </ArchiveLayout>

              {selectedVideo && (
                <div
                  className="video-modal"
                  onClick={() => setSelectedVideo(null)}
                >
                  <div
                    className={`video-modal-content video-detail-panel ${editingVideo ? "is-editing" : ""}`}
                    role="dialog"
                    aria-modal="true"
                    aria-label="동영상 상세"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <header className="photo-detail-header video-detail-header">
                    {editingVideo ? <strong>동영상 정보 수정</strong> : <details className="content-detail-menu photo-detail-menu">
                      <summary aria-label="동영상 메뉴">⋯</summary>
                      <div>
                        {!isAdmin && <button type="button" onClick={() => setReportTarget({ type: "video", id: selectedVideo.id, label: `${getPost(selectedVideo)?.date || ""} 동영상`.trim(), previewUrl: selectedVideo.thumbnail_url || null, pageUrl: window.location.href })}>태그 제안 · 수정 요청</button>}
                        {isAdmin && <><button type="button" onClick={() => setEditingVideo(true)}>동영상 정보 수정</button><button type="button" onClick={deleteSelectedVideo}>동영상 삭제</button></>}
                      </div>
                    </details>}
                    <button
                      type="button"
                      className="photo-detail-close"
                      aria-label="동영상 상세 닫기"
                      onClick={() => setSelectedVideo(null)}
                    >
                      ×
                    </button>
                    </header>

                    <div className="video-modal-player">
                      <ArchiveVideoPlayer key={selectedVideo.id} ref={modalVideoRef} src={selectedVideo.video_url} poster={selectedVideo.thumbnail_url} capture={isAdmin} onDuration={setVideoDuration} />
                    </div>

                    <div className="video-modal-info">
                      {isAdmin && onAssignFolder && <label className="weverse-folder-select">폴더
                        <select disabled={folderSaving} value={folderItems.find((item) => (item.videoIds || []).some((id) => String(id) === String(selectedVideo.id)))?.id || "weverse"} onChange={(event) => onAssignFolder(selectedVideo.id, event.target.value)}>
                          {folderItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                      </label>}
                      {isAdmin && (
                        <details className="video-thumbnail-editor">
                          <summary>썸네일 장면 선택</summary>
                          <div className="video-thumbnail-editor-title">
                            썸네일 장면 선택
                          </div>
                          <input
                            type="range"
                            min="0"
                            max={videoDuration || Math.max(thumbnailTime, 1)}
                            step="0.1"
                            value={thumbnailTime}
                            onChange={(event) =>
                              handleThumbnailChange(event.target.value)
                            }
                          />
                          <div className="video-thumbnail-editor-bottom">
                            <span>{thumbnailTime.toFixed(1)}초</span>
                            <button
                              type="button"
                              onClick={saveThumbnailTime}
                              disabled={savingThumbnail || videoDuration <= 0}
                            >
                              {savingThumbnail ? "저장 중..." : videoDuration > 0 ? "이 장면 저장" : "영상 불러오는 중..."}
                            </button>
                          </div>
                        </details>
                      )}
                      {getPost(selectedVideo) && (
                        <div className="video-date">
                          <span>{formatDate(getPost(selectedVideo).date)}</span>
                          {getPost(selectedVideo).posted_at && (
                            <span className="video-time">
                              {formatTime(getPost(selectedVideo).posted_at)}
                            </span>
                          )}
                        </div>
                      )}

                      {selectedVideo.hair_color && (
                        <div className="modal-meta">
                          {selectedVideo.hair_color}
                        </div>
                      )}

                      {!editingVideo && selectedVideo.overlay_text && <div className="video-overlay-caption"><strong>영상 위 텍스트</strong><p>{selectedVideo.overlay_text}</p></div>}
                      {!editingVideo && Array.isArray(selectedVideo.tags) && (
                        <div className="modal-tags">
                          {selectedVideo.tags.map((tag) => (
                            <button
                              type="button"
                              className="tag"
                              key={tag}
                              onClick={() => searchVideoTag(tag)}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      )}

                      {isAdmin && editingVideo && (
                        <div className="video-detail-editor">
                          {!videoSourceTags(selectedVideo, getPost(selectedVideo)).includes("DM") && <label>영상 위 텍스트<textarea rows={3} maxLength={5000} value={editOverlayText} onChange={(event) => setEditOverlayText(event.target.value)} placeholder="모먼트 영상 위에 적힌 텍스트를 입력하세요" /></label>}
                          <label>
                            머리색
                            <select
                              value={editVideoHairColor}
                              onChange={(e) => setEditVideoHairColor(e.target.value)}
                            >
                              <option value="">머리색 선택</option>
                              <option value="흑발">흑발</option>
                              <option value="갈발">갈발</option>
                              <option value="금발">금발</option>
                              <option value="적발">적발</option>
                              <option value="은발">은발</option>
                              <option value="핑머">핑머</option>
                              <option value="주머">주머</option>
                              <option value="와인">와인</option>
                              <option value="베이지">베이지</option>
                            </select>
                          </label>
                          <label>동영상 유형<select value={editVideoType} onChange={(event) => setEditVideoType(event.target.value)}><option value="">선택 안됨</option>{VIDEO_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
                          <div><span>태그</span>
                            <TagPicker value={editVideoTags} onChange={setEditVideoTags} />
                          </div>
                          <div className="input-help">검색용 태그는 관리자 태그 사전에서 관리합니다.</div>
                          <div className="video-detail-editor-actions">
                            <button
                              type="button"
                              onClick={() => setEditingVideo(false)}
                              disabled={savingVideo}
                            >
                              취소
                            </button>
                            <button
                              type="button"
                              onClick={saveVideoDetails}
                              disabled={savingVideo}
                            >
                              {savingVideo ? "저장 중..." : "저장"}
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="photo-detail-actions video-detail-actions">
                      <button
                        type="button"
                        className="media-download-button video-modal-download"
                        onClick={() => downloadVideo(selectedVideo)}
                      >
                        동영상 다운로드 ↓
                      </button>

                      {getPost(selectedVideo)?.weverse_url && (
                        <a
                          className="weverse-link"
                          href={getPost(selectedVideo).weverse_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() =>
                            void trackMediaEngagement("video", selectedVideo.id, "weverse")
                          }
                        >
                          위버스에서 보기 ↗
                        </a>
                      )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <ContentReport target={reportTarget} onClose={() => setReportTarget(null)} />
            </>
          );
}

export default function Videos({ isAdmin = false }) {
  return <VideoLibrary isAdmin={isAdmin} WeverseVideos={WeverseVideos} />;
}
