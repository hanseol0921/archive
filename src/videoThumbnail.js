export function createLocalVideoThumbnail(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    let finishing = false;
    const cleanup = () => { clearTimeout(timer); video.onloadedmetadata = null; video.onloadeddata = null; video.onseeked = null; video.onerror = null; video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); };
    const fail = () => { if (finishing) return; finishing = true; cleanup(); reject(new Error("동영상 썸네일을 만들 수 없습니다.")); };
    const timer = setTimeout(fail, 10000);
    const capture = () => {
      if (finishing || video.seeking || video.readyState < 2 || !video.videoWidth) return;
      finishing = true;
      try {
      const scale = Math.min(1, 600 / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => { cleanup(); if (blob) resolve(blob); else reject(new Error("썸네일 변환에 실패했습니다.")); }, "image/webp", 0.8);
      } catch (error) { cleanup(); reject(error); }
    };
    video.muted = true; video.playsInline = true; video.preload = "auto";
    video.onloadedmetadata = () => { video.currentTime = Number.isFinite(video.duration) ? Math.min(0.1, video.duration / 2) : 0.1; };
    video.onloadeddata = capture; video.onseeked = capture; video.onerror = fail;
    video.src = url;
  });
}
