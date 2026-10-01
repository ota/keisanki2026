// Browser check of lesson 1 with the in-browser C compiler.
// Start a dev server and a Chrome with --remote-debugging-port=9224, then:
//   LESSON_URL=http://127.0.0.1:5173/lesson01.html node tests/browser/c-runtime.mjs
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { send, evaluate, until, errors, screenshot } from "./cdp.mjs";

const url = process.env.LESSON_URL || "http://127.0.0.1:5173/lesson01.html";
const box = (id) => `document.querySelector('[data-exercise=${id}]')`;
// Mark the current document first, so waiting cannot pass on the page that
// is about to be replaced by the navigation or reload.
async function load(method, params = {}) {
  await evaluate("window.__replaced = true");
  await send(method, params);
  await until("!window.__replaced && !!document.querySelector('.save-note')");
}
const setValue = (id, value) =>
  evaluate(`(() => {const e=${box(id)}.querySelector('.editor');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
async function run(id, code) {
  await setValue(id, code);
  await evaluate(`${box(id)}.querySelector('.run-btn').click()`);
  await until(`!${box(id)}.querySelector('.run-btn').disabled`);
  return evaluate(`(() => {const e=${box(id)};return {output:e.querySelector('.output pre').textContent,
    status:e.querySelector('.status').textContent,exit:e.querySelector('.exit-code').textContent};})()`);
}
const source = await readFile(new URL("../../content/lesson01.md", import.meta.url), "utf8");
const samples = Object.fromEntries(
  [...source.matchAll(/^:::exercise ([a-z0-9-]+) [a-z_]+\.c\n```c\n([\s\S]*?)\n```\n:::/gm)].map((m) => [m[1], m[2]]),
);

await load("Page.navigate", { url });
await evaluate("localStorage.clear()");
// Code saved before this update (same keys) must come back unchanged.
const before = {
  "keisanki2026:first": "// 更新前に保存したコード\nint main(void) { return 0; }",
  "keisanki2026:task2": "// 課題2の途中",
};
await evaluate(`(() => {for (const [k,v] of Object.entries(${JSON.stringify(before)})) localStorage.setItem(k,v);})()`);
await load("Page.reload");
assert.equal(await evaluate(`${box("first")}.querySelector('.editor').value`), before["keisanki2026:first"]);
assert.equal(await evaluate(`${box("task2")}.querySelector('.editor').value`), before["keisanki2026:task2"]);
assert.equal(await evaluate(`${box("second")}.querySelector('.editor').value`), "");
assert.equal(await evaluate("localStorage.getItem('keisanki2026:first')"), before["keisanki2026:first"]);
console.log("Code saved before the update is restored: OK");

// Coloring layer, paste blocking, and no progress panel on lesson 1.
assert.ok(await evaluate(`${box("first")}.querySelector('.code-highlight .tok-keyword') !== null && ${box("first")}.querySelector('.code-highlight .tok-comment') !== null`));
assert.equal(await evaluate(`${box("first")}.querySelector('.editor').dispatchEvent(new Event('paste',{cancelable:true}))`), false);
assert.equal(await evaluate("document.body.dataset.progress"), "off");
assert.equal(await evaluate("document.querySelector('#progress').childElementCount"), 0);
console.log("Highlight, paste blocking, progress hidden on lesson 1: OK");

// Compare with the sample.
await setValue("first", samples.first.replace("Hello, World!\\n\");", "Hello, World!\\n\")"));
await evaluate(`${box("first")}.querySelector('.diff-btn').click()`);
assert.match(await evaluate(`${box("first")}.querySelector('.status').textContent`), /4行目：最後に「;」が足りません。/);
assert.equal(await evaluate(`${box("first")}.querySelector('.gutter .diff-num').textContent`), "4");
await setValue("first", samples.first);
await evaluate(`${box("first")}.querySelector('.diff-btn').click()`);
assert.equal(await evaluate(`${box("first")}.querySelector('.status').textContent`), "見本と同じです 🎉");
console.log("Compare with sample: OK");

// Running the exact sample passes; a compile error shows clang diagnostics.
let result = await run("first", samples.first);
assert.equal(result.output, "Hello, World!\n");
assert.match(result.status, /^✅ 合格：見本と同じコードで、正しく実行できました。/);
assert.equal(await evaluate(`${box("first")}.querySelector('.pass-note').hidden`), false);
result = await run("second", samples.second.replace("int number = 10;", "int number = 10"));
assert.match(result.exit, /コンパイルエラー/);
assert.match(result.output, /error/);
result = await run("second", samples.second);
assert.equal(result.output, "10\n");
assert.match(result.status, /^✅ 合格/);
result = await run("printf-two-values", samples["printf-two-values"]);
assert.equal(result.output, "10 A\n");
assert.match(result.status, /^✅ 合格/);
console.log("Run, compile error, pass marks: OK");

// Task 3 must match the expected output.
const main = (body) => `#include <stdio.h>\n\nint main(void) {\n${body}\n    return 0;\n}`;
result = await run("task3", main('    printf("*\\n");'));
assert.match(result.status, /出力例と違います/);
result = await run("task3", main('    printf("  *\\n");\n    printf(" ***\\n");\n    printf("*****\\n");'));
assert.match(result.status, /^✅ 合格：出力例と同じ結果です。/);
result = await run("task1", main('    printf("好きな文字列\\n");'));
assert.match(result.status, /^✅ 合格：エラーなく実行できました。/);
console.log("Task output check: OK");

// Passes stay after reload, and editing clears them.
await load("Page.reload");
assert.equal(await evaluate(`${box("task3")}.querySelector('.pass-note').textContent`), "✅ 合格");
await setValue("task3", "// 書き換え");
assert.equal(await evaluate(`${box("task3")}.querySelector('.pass-note').hidden`), true);
console.log("Pass marks persist and clear on edit: OK");

// Submission file: code, pass marks, no progress on lesson 1.
const directory = await mkdtemp("/tmp/keisanki2026-downloads-");
await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: directory });
await evaluate("document.querySelector('#attendance-number').value='12';document.querySelector('#student-name').value='確認用';document.querySelector('.export-btn').click()");
await until("document.querySelector('#export-status').textContent.includes('ダウンロードを開始')");
let file;
for (let i = 0; i < 50 && !file; i++) {
  file = (await readdir(directory)).find((name) => /^keisanki2026_01_12_.*\.html$/.test(name));
  if (!file) await new Promise((resolve) => setTimeout(resolve, 100));
}
assert.ok(file);
const html = await readFile(`${directory}/${file}`, "utf8");
assert.match(html, /Hello, World!/);
assert.match(html, /確認用/);
assert.match(html, /✅ 合格/);
assert.match(html, /class="tok-directive"/);
assert.doesNotMatch(html, /達成率/);
assert.doesNotMatch(html, /<script/);
console.log("Submission file: OK");

await screenshot(process.env.SCREENSHOT || "/tmp/keisanki2026-c-runtime.png");
assert.deepEqual(errors, []);
console.log(JSON.stringify({ url, browserErrors: errors.length }));
process.exit(0);
