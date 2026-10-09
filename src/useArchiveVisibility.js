import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { getPhotoExtraGroups, isDmMedia, shouldMigrateToRiwooView } from "./photoVisibility.js";

const KEY = "archive_extra_visibility";
const DEFAULT = { members: true, food: true, scenery: true, dogs: true, other: true, dm: false };
export default function useArchiveVisibility(isAdmin) {
  const [allowed, setAllowed] = useState({ members: false, food: false, scenery: false, dogs: false, other: false, dm: false });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error: readError } = await supabase.from("site_settings").select("value").eq("key", KEY).maybeSingle();
      if (readError) throw readError;
      if (isAdmin) {
        const otherMigrationKey = "other_photo_type_to_riwoo_view_v1";
        const { data: otherMigration, error: otherReadError } = await supabase.from("site_settings").select("value").eq("key", otherMigrationKey).maybeSingle();
        if (otherReadError) throw otherReadError;
        if (!otherMigration) {
          const { count, error: otherUpdateError } = await supabase.from("photos").update({ type: "리우뷰" }).in("type", ["그외", "그 외"]).select("id", { count: "exact" });
          if (otherUpdateError) throw otherUpdateError;
          const { error: otherMarkerError } = await supabase.from("site_settings").upsert({ key: otherMigrationKey, value: String(count || 0), updated_at: new Date().toISOString() }, { onConflict: "key" });
          if (otherMarkerError) throw otherMarkerError;
          window.dispatchEvent(new Event("archive:classification-updated"));
          if (!cancelled) setNotice(`그외 유형 사진 ${count || 0}장을 리우뷰로 변경했습니다.`);
        }
        const migrationKey = "riwoo_view_types_migrated_v1";
        const { data: migration, error: migrationError } = await supabase.from("site_settings").select("value").eq("key", migrationKey).maybeSingle();
        if (migrationError) throw migrationError;
        if (!migration) {
          const targets = [];
          for (let offset = 0; ; offset += 500) {
            const { data: batch, error: batchError } = await supabase.from("photos").select("*").order("id").range(offset, offset + 499);
            if (batchError) throw batchError;
            targets.push(...batch.filter(shouldMigrateToRiwooView).map((row) => row.id));
            if (batch.length < 500) break;
          }
          for (let offset = 0; offset < targets.length; offset += 100) {
            const { error: updateError } = await supabase.from("photos").update({ type: "리우뷰" }).in("id", targets.slice(offset, offset + 100));
            if (updateError) throw updateError;
          }
          const { error: markerError } = await supabase.from("site_settings").upsert({ key: migrationKey, value: String(targets.length), updated_at: new Date().toISOString() }, { onConflict: "key" });
          if (markerError) throw markerError;
          window.dispatchEvent(new Event("archive:classification-updated"));
          if (!cancelled) setNotice((previous) => [previous, `풍경·음식 사진 ${targets.length}장의 유형을 리우뷰로 변경했습니다. 짱대박·DM 자료는 제외했습니다.`].filter(Boolean).join(" "));
        }
      }
      if (!data && isAdmin) {
        // One-time transition from the old base-display flag to absolute exclusion.
        for (const table of ["photos", "videos"]) {
          const hidden = [];
          for (let offset = 0; ; offset += 500) {
            const { data: batch, error: batchError } = await supabase.from(table).select("*").order("id").range(offset, offset + 499);
            if (batchError) throw batchError;
            hidden.push(...batch.filter((row) => !["스크린샷", "같은사진", "짤"].includes(row.type) && row.archive_visible === false && (isDmMedia(row) || Object.values(getPhotoExtraGroups(row)).some(Boolean))).map((row) => row.id));
            if (batch.length < 500) break;
          }
          for (let offset = 0; offset < hidden.length; offset += 100) {
            const { error: updateError } = await supabase.from(table).update({ archive_visible: true }).in("id", hidden.slice(offset, offset + 100));
            if (updateError) throw updateError;
          }
        }
        const { error: writeError } = await supabase.from("site_settings").upsert({ key: KEY, value: JSON.stringify(DEFAULT), updated_at: new Date().toISOString() }, { onConflict: "key" });
        if (writeError) throw writeError;
      }
      if (!cancelled) { setAllowed(data ? { ...DEFAULT, ...JSON.parse(data.value) } : DEFAULT); setReady(true); }
    }
    load().catch((err) => { if (!cancelled) setError(`공개 설정을 불러오지 못했습니다. ${err.message}`); });
    return () => { cancelled = true; };
  }, [isAdmin]);
  async function change(update) {
    if (!isAdmin || !ready || saving) return;
    const next = typeof update === "function" ? update(allowed) : update;
    setSaving(true); setError("");
    const { error: writeError } = await supabase.from("site_settings").upsert({ key: KEY, value: JSON.stringify(next), updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (writeError) setError(`공개 설정을 저장하지 못했습니다. ${writeError.message}`);
    else setAllowed(next);
    setSaving(false);
  }
  return { allowed, change, ready, saving, error, notice };
}
