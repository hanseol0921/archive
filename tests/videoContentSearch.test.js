import test from "node:test";
import assert from "node:assert/strict";
import { matchesVideoContent } from "../src/videoSearchText.js";
import { managedMediaValues } from "../src/mediaManager.js";
import { parseYoutubeContents } from "../src/youtubeContent.js";
test("live search combines title, summary and participants", () => { assert.equal(matchesVideoContent("리우 요리", "저녁 라이브", "요리하고 이야기", "리우, 성호 · 2명"),true); assert.equal(matchesVideoContent("운학 요리", "저녁 라이브", "요리", "리우, 성호"),false); });
test("search handles older content, whitespace and case", () => { assert.equal(matchesVideoContent("", undefined),true); assert.equal(matchesVideoContent("  VLOG  ","Riwoo vlog"),true); assert.equal(matchesVideoContent("노래", "VLOG",undefined),false); });
test("live annotations survive stored list parsing", () => { const item={id:"live",title:"방송",url:"https://weverse.io/boynextdoor/live/1-180676393",summary:"노래와 이야기",participants:"리우 · 1명"}; assert.deepEqual(parseYoutubeContents(JSON.stringify([item])),[item]); });
test("video overlay text can be saved and cleared without altering tags", () => { const row={table:"videos",type:"셀카",tagsText:"모먼트",overlay_text:"  오늘도 화이팅\n좋은 하루  "}; assert.equal(managedMediaValues(row).overlay_text,"오늘도 화이팅\n좋은 하루"); assert.deepEqual(managedMediaValues(row).tags,["모먼트"]); assert.equal(managedMediaValues({...row,overlay_text:""}).overlay_text,""); assert.equal("overlay_text" in managedMediaValues({table:"photos"}),false); });
