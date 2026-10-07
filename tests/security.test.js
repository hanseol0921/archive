import test from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { Buffer } from "node:buffer";
import process from "node:process";
import download from "../api/photo-download.js";
import storage from "../api/r2-storage.js";
import { ADMIN_USER_ID, isArchiveAdmin } from "../src/adminAccess.js";

function response() {
  const chunks = [];
  const result = new Writable({ write(chunk, encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
  result.code = 200;
  result.headers = {};
  result.status = (code) => { result.code = code; return result; };
  result.setHeader = (key, value) => { result.headers[key] = value; };
  result.json = (body) => { result.payload = body; result.end(JSON.stringify(body)); };
  result.bytes = () => Buffer.concat(chunks);
  return result;
}

test("administrator check does not trust role metadata", () => {
  assert.equal(isArchiveAdmin({ id: ADMIN_USER_ID }), true);
  assert.equal(isArchiveAdmin({ id: "other", user_metadata: { role: "admin" } }), false);
  assert.equal(isArchiveAdmin(null), false);
});

test("download rejects foreign hosts before fetching", async () => {
  const res = response();
  await download({ method: "GET", query: { url: "https://example.com/photos/a.jpg" } }, res);
  assert.equal(res.code, 400);
});

test("download rejects HTML and oversized upstream responses", async () => {
  const previous = globalThis.fetch;
  try {
    for (const [headers, code] of [
      [{ "content-type": "text/html" }, 502],
      [{ "content-type": "image/jpeg", "content-length": String(51 * 1024 * 1024) }, 413],
    ]) {
      globalThis.fetch = async () => new Response("bad", { headers });
      const res = response();
      await download({ method: "GET", query: { url: "https://media.riwooarchive.com/photos/a.jpg" } }, res);
      assert.equal(res.code, code);
    }
  } finally { globalThis.fetch = previous; }
});

test("download streams image bytes with an attachment filename", async () => {
  const previous = globalThis.fetch;
  try {
    const bytes = Uint8Array.from([255, 216, 255, 217]);
    globalThis.fetch = async () => new Response(bytes, { headers: { "content-type": "image/jpeg" } });
    const res = response();
    await download({ method: "GET", query: { url: "https://media.riwooarchive.com/photos/a.jpg", filename: 'a"\r\n.jpg' } }, res);
    assert.deepEqual(res.bytes(), Buffer.from(bytes));
    assert.equal(res.headers["Content-Disposition"], 'attachment; filename="a___.jpg"');
  } finally { globalThis.fetch = previous; }
});

test("R2 rejects a signed-in non-administrator before storage operations", async () => {
  const previous = globalThis.fetch;
  const names = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT", "R2_BUCKET", "R2_PUBLIC_BASE_URL"];
  const old = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    names.forEach((name) => { process.env[name] = "test"; });
    process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
    globalThis.fetch = async () => new Response(JSON.stringify({ id: "other", aud: "authenticated" }), { headers: { "content-type": "application/json" } });
    const res = response();
    await storage({ method: "POST", headers: { authorization: "Bearer test-token" }, body: { action: "delete", keys: ["photos/a.jpg"] } }, res);
    assert.equal(res.code, 403);
  } finally {
    globalThis.fetch = previous;
    names.forEach((name) => { if (old[name] === undefined) delete process.env[name]; else process.env[name] = old[name]; });
  }
});
