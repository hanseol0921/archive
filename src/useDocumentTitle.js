import { useEffect } from "react";
import { supabase } from "./supabaseClient";

function applyTitle(title) {
  document.title = String(title || "").trim();
  for (const selector of ['meta[name="application-name"]', 'meta[property="og:site_name"]']) {
    document.querySelector(selector)?.setAttribute("content", document.title);
  }
}

export default function useDocumentTitle(path) {
  useEffect(() => {
    let active = true;
    let version = 0;
    async function refresh() {
      const request = ++version;
      const { data, error } = await supabase.from("site_settings").select("value").eq("key", "archive_title").maybeSingle();
      if (active && request === version && !error) applyTitle(data?.value);
    }
    function onSaved(event) {
      version += 1;
      applyTitle(event.detail);
    }
    void refresh();
    window.addEventListener("archive:title-changed", onSaved);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("archive:title-changed", onSaved);
      window.removeEventListener("focus", refresh);
    };
  }, [path]);
}
