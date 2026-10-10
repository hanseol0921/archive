import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export const ARCHIVE_TABS = [
  ["home", "홈"], ["photos", "사진"], ["videos", "동영상"],
  ["diary", "다이어리"], ["guestbook", "방명록"], ["comments", "댓글"],
  ["dm", "DM"], ["posts", "게시글"],
];
const DEFAULTS = { home: true, photos: true, videos: true, diary: true, guestbook: true, comments: false, posts: false, dm: false };
const KEY = "archive_tab_visibility";
let cached = null;
let pending = null;
const listeners = new Set();
function publish(value) { cached = value; listeners.forEach(listener => listener(value)); }
function read() {
  if (!pending) pending = supabase.from("site_settings").select("value").eq("key", KEY).maybeSingle()
    .then(({ data, error }) => {
      if (error) throw error;
      const saved = data ? JSON.parse(data.value) : {};
      const next = { ...DEFAULTS };
      for (const [key] of ARCHIVE_TABS) if (typeof saved[key] === "boolean") next[key] = saved[key];
      publish(next);
    }).finally(() => { pending = null; });
  return pending;
}
export default function useTabVisibility() {
  const [allowed, setAllowed] = useState(cached);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    listeners.add(setAllowed);
    read().catch(() => { if (active) setError("탭 공개 설정을 불러오지 못했습니다."); });
    return () => { active = false; listeners.delete(setAllowed); };
  }, []);
  async function change(key, enabled) {
    if (!allowed || saving || !ARCHIVE_TABS.some(([id]) => id === key)) return;
    setSaving(true); setError("");
    try {
      const next = { ...allowed, [key]: enabled };
      const { error: writeError } = await supabase.from("site_settings").upsert({ key: KEY, value: JSON.stringify(next), updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (writeError) throw writeError;
      publish(next);
    } catch { setError("탭 공개 설정을 저장하지 못했습니다."); }
    finally { setSaving(false); }
  }
  return { allowed, ready: Boolean(allowed), error, saving, change };
}
