import { forwardRef, useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, RotateCcw } from "lucide-react";
import "./styles/ArchiveVideoPlayer.css";

const clock = (seconds) => {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
};

export const LazyVideoThumbnail = ({ src, time, onLoadedMetadata }) => {
  const ref = useRef(null);
  const canvasRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [captured, setCaptured] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "100px" });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  function captureFrame(video) {
    if (video.readyState < 2 || video.seeking || !video.videoWidth || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const scale = Math.min(1, 320 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    video.pause();
    video.removeAttribute("src");
    video.load();
    setCaptured(true);
  }
  return <div ref={ref} className="lazy-video-thumbnail">
    <canvas ref={canvasRef} hidden={!captured} />
    {visible && !captured && <video src={src} preload="metadata" muted playsInline
      onLoadedMetadata={(event) => onLoadedMetadata(event.currentTarget, time)}
      onLoadedData={(event) => captureFrame(event.currentTarget)}
      onSeeked={(event) => captureFrame(event.currentTarget)} />}
  </div>;
};

const ArchiveVideoPlayer = forwardRef(function ArchiveVideoPlayer({ src, poster, onDuration, capture = false, preload = "auto" }, forwardedRef) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState("");
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [cors, setCors] = useState(capture);
  const [attempt, setAttempt] = useState(0);

  function bindRef(element) {
    videoRef.current = element;
    if (typeof forwardedRef === "function") forwardedRef(element);
    else if (forwardedRef) forwardedRef.current = element;
  }
  async function toggle() {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) { video.pause(); return; }
    setError(""); setWaiting(video.readyState < 3);
    try { await video.play(); }
    catch (err) {
      if (err.name !== "AbortError") { setError("재생하지 못했습니다. 다시 시도해주세요."); setWaiting(false); }
    }
  }
  function progress() {
    const video = videoRef.current;
    if (video?.buffered.length) setBuffered(video.buffered.end(video.buffered.length - 1));
  }
  async function fullscreen() {
    const video = videoRef.current;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (containerRef.current?.requestFullscreen) await containerRef.current.requestFullscreen();
      else video?.webkitEnterFullscreen?.();
    } catch { setError("이 브라우저에서는 전체화면을 열 수 없습니다."); }
  }
  return <div ref={containerRef} className="archive-video-player" tabIndex={0} aria-label="동영상 플레이어" onKeyDown={(event) => {
    if (event.target !== event.currentTarget) return;
    if (event.code === "Space" || event.key === "k") { event.preventDefault(); void toggle(); }
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); if (videoRef.current) videoRef.current.currentTime = Math.max(0, Math.min(duration, time + (event.key === "ArrowRight" ? 5 : -5))); }
  }}>
    {poster && <div className="archive-video-backdrop" style={{ backgroundImage: `url(${JSON.stringify(poster)})` }} />}
    <video key={`${src}-${cors}-${attempt}`} ref={bindRef} className="video-modal-main" src={src} poster={poster || undefined} crossOrigin={cors ? "anonymous" : undefined} preload={preload} playsInline muted={muted}
      onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
      onClick={() => void toggle()}
      onLoadedMetadata={(event) => { const value = event.currentTarget.duration; setDuration(Number.isFinite(value) ? value : 0); onDuration?.(Number.isFinite(value) ? value : 0); }}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onPlaying={() => { setWaiting(false); setError(""); }}
      onWaiting={() => setWaiting(true)} onCanPlay={() => setWaiting(false)} onEnded={() => { setPlaying(false); setWaiting(false); }}
      onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} onProgress={progress}
      onError={(event) => {
        if (cors) { setCors(false); return; }
        setPlaying(false); setWaiting(false);
        setError(event.currentTarget.error?.code === 4 ? "영상 주소나 형식을 확인해주세요. 재생할 수 없는 영상입니다." : "영상을 불러오지 못했습니다. 다시 시도해주세요.");
      }} />
    {!playing && !error && <button className="archive-video-center" type="button" aria-label="동영상 재생" onClick={() => void toggle()}><Play size={32} fill="currentColor" /></button>}
    {waiting && <span className="archive-video-loading" role="status">영상 불러오는 중…</span>}
    {error && <div className="archive-video-error" role="alert"><p>{error}</p><button type="button" onClick={() => { setError(""); setWaiting(false); setAttempt((value) => value + 1); }}><RotateCcw size={16} />다시 불러오기</button></div>}
    <div className="archive-video-controls">
      <div className="archive-video-timeline" style={{ "--played": `${duration ? time / duration * 100 : 0}%`, "--buffered": `${duration ? buffered / duration * 100 : 0}%` }}>
        <input aria-label="재생 위치" type="range" min="0" max={duration || 0} step="0.1" value={time} disabled={!duration} onChange={(event) => { const value = Number(event.target.value); if (videoRef.current) videoRef.current.currentTime = value; setTime(value); }} />
      </div>
      <div className="archive-video-toolbar">
        <button type="button" aria-label={playing ? "일시정지" : "재생"} onClick={() => void toggle()}>{playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}</button>
        <button type="button" aria-label={muted ? "소리 켜기" : "음소거"} onClick={() => { if (videoRef.current) videoRef.current.muted = !muted; setMuted(!muted); }}>{muted ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>
        <span>{clock(time)} / {clock(duration)}</span>
        <button type="button" className="archive-video-fullscreen" aria-label="전체화면" onClick={() => void fullscreen()}><Maximize size={20} /></button>
      </div>
    </div>
  </div>;
});
export default ArchiveVideoPlayer;
