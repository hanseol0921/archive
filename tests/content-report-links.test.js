import test from "node:test";
import assert from "node:assert/strict";
import { photoDetailPath, reportTargetPath } from "../src/contentReportLinks.js";

test("existing photo reports open admin detail instead of the Weverse source", () => {
  assert.equal(reportTargetPath({ target_type: "photo", target_id: 42, page_url: "https://weverse.io/example" }), "/admin?photo=42");
  assert.equal(reportTargetPath({ target_type: "photo", target_id: "uuid", page_url: null }), "/admin?photo=uuid");
});

test("new photo reports retain an individual public detail link", () => {
  assert.equal(photoDetailPath(42), "/photos?photo=42");
  assert.equal(new URL(photoDetailPath("a&b"), "https://riwooarchive.com").searchParams.get("photo"), "a&b");
  assert.equal(photoDetailPath(null), null);
});

test("other report destinations are unchanged", () => {
  assert.equal(reportTargetPath({ target_type: "archive", page_url: "/photos" }), "/photos");
  assert.equal(reportTargetPath({ target_type: "photo", target_id: "" }), null);
});
