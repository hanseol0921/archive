import { supabase } from "./supabaseClient";
import { isSharedDMKey } from './dmStorageKey';

async function callStorageApi(body) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("관리자 로그인이 필요합니다.");

  let response;
  try { response = await fetch("/api/r2-storage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  }); } catch {
    throw new Error('업로드 승인 서버에 연결하지 못했습니다. 서버 연결을 확인해 주세요.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "R2 요청에 실패했습니다.");
  return result;
}

export async function uploadToR2(bucket, path, file, contentType = file.type) {
  const key = `${bucket}/${path.replace(/^\/+/, "")}`;
  const type = contentType || "application/octet-stream";
  const { uploadUrl, publicUrl } = await callStorageApi({
    action: "sign-upload",
    key,
    contentType: type,
  });

  let uploadResponse;
  const transferUrl = import.meta.env.DEV ? `/api/r2-upload?url=${encodeURIComponent(uploadUrl)}` : uploadUrl;
  try { uploadResponse = await fetch(transferUrl, {
    method: "PUT",
    headers: { "Content-Type": type },
    body: file,
  }); } catch {
    throw new Error(`R2 파일 전송 실패: 현재 주소 ${window.location.origin}의 CORS 허용 설정 또는 네트워크를 확인해 주세요.`);
  }
  if (!uploadResponse.ok) {
    throw new Error(`R2 업로드 실패 (HTTP ${uploadResponse.status})`);
  }
  return { key, publicUrl };
}

export async function deleteFromR2(keys) {
  // DM originals are shared by chat and galleries; deleting a gallery row must not remove them.
  const safeKeys = [...new Set((keys || []).filter(key => key && !isSharedDMKey(key)))];
  if (!safeKeys.length) return;
  await callStorageApi({ action: "delete", keys: safeKeys });
}

export function getR2Key(publicUrl) {
  if (!publicUrl) return null;
  try {
    const url = new URL(publicUrl);
    if (url.hostname !== "media.riwooarchive.com") return null;
    return decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  } catch {
    return null;
  }
}
