import { useEffect, useRef, useState } from "react";
export default function DiaryImage({ photo, priority = false }) {
  const ref = useRef(null);
  const thumbnail = photo.thumbnail_url || photo.image_url;
  const [source, setSource] = useState(thumbnail);
  const [nearby, setNearby] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setNearby(true); observer.disconnect(); } }, { root: ref.current.closest(".diary-post-detail"), rootMargin: "160px" });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!nearby || !previewLoaded || !photo.image_url || source === photo.image_url) return;
    let active = true;
    const image = new Image();
    image.decoding = "async";
    image.onload = async () => { try { await image.decode(); } catch { /* Loaded bytes still render without decode support. */ } if (active) setSource(photo.image_url); };
    image.src = photo.image_url;
    return () => { active = false; image.onload = null; };
  }, [nearby, previewLoaded, photo.image_url, source]);
  return <img ref={ref} src={source} alt="" loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" onLoad={() => setPreviewLoaded(true)} onError={() => { if (source !== photo.image_url) setSource(photo.image_url); }} />;
}
