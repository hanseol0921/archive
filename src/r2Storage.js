import { supabase } from "./supabaseClient";
import { isSharedDMKey } from './dmStorageKey';
import { isSharedProfileKey } from './artistProfileIdentity';

let diagnosticRequest;
async function uploadFailureReason() {
  if (!diagnosticRequest) {
    diagnosticRequest = callStorageApi({ action: 'diagnose-upload' })
      .then(result => result.error || 'R2 진단 결과를 받지 못했습니다.')
      .catch(error => `R2 연결 진단 실패: ${error.message}`);
    setTimeout(() => { diagnosticRequest = null; }, 30000);
  }
  return diagnosticRequest;
}

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
  // PUT replaces the same object, so retrying never creates a second file.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      uploadResponse = await fetch(transferUrl, {
        method: "PUT",
        headers: { "Content-Type": type },
        body: file,
      });
      if (![408, 429, 500, 502, 503, 504].includes(uploadResponse.status) || attempt === 2) break;
      await uploadResponse.body?.cancel();
    } catch {
      if (attempt === 2) {
        throw new Error(`R2 파일 전송 실패: ${await uploadFailureReason()}`);
      }
    }
    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  if (!uploadResponse.ok) {
    throw new Error(`R2 업로드 실패 (HTTP ${uploadResponse.status})`);
  }
  return { key, publicUrl };
}

export async function deleteFromR2(keys) {
  // Shared chat/profile originals must survive deletion of an individual gallery row.
  const safeKeys = [...new Set((keys || []).filter(key => key && !isSharedDMKey(key) && !isSharedProfileKey(key)))];
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
