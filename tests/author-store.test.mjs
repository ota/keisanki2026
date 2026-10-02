import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  writeFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createLessonStore,
  lessonEditorPlugin,
} from "../scripts/author-server.mjs";
import { renderLesson } from "../scripts/generate.mjs";

const original = await readFile(
  new URL("../content/lesson01.md", import.meta.url),
  "utf8",
);
const template = await readFile(
  new URL("../templates/page.html", import.meta.url),
  "utf8",
);

async function fixture(t, source = original) {
  const root = await mkdtemp(join(tmpdir(), "keisanki-author-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "content"));
  await mkdir(join(root, "templates"));
  await writeFile(join(root, "content/lesson01.md"), source);
  await writeFile(join(root, "templates/page.html"), template);
  return {
    root,
    file: join(root, "content/lesson01.md"),
    store: createLessonStore(root),
  };
}

test("opening and saving without changes preserves the original bytes", async (t) => {
  const { store, root, file } = await fixture(t);
  const model = await store.load("lesson01");
  assert.ok(model.fields.some(({ kind }) => kind === "rich"));
  assert.deepEqual(
    model.fields
      .filter(({ kind }) => kind === "code")
      .map(({ exercise }) => exercise)
      .sort(),
    Object.keys(model.samples).sort(),
  );
  for (const field of model.fields) {
    assert.equal(model.source.slice(field.start, field.end), field.value);
  }
  const saved = await store.save("lesson01", {
    revision: model.revision,
    changes: [],
  });
  assert.equal(saved.revision, model.revision);
  assert.equal(await readFile(file, "utf8"), original);
  await assert.rejects(readdir(join(root, ".local")), { code: "ENOENT" });
});

test("saves nested bullets, Japanese quotes and C whitespace, retaining all untouched source and IDs", async (t) => {
  const { store, root, file } = await fixture(t);
  const model = await store.load("lesson01");
  const list = model.fields.find(({ value }) => value.startsWith("- 1972年"));
  const code = model.fields.find(({ exercise }) => exercise === "first");
  const listValue =
    list.value.replace("「汎用プログラミング言語」", "「汎用言語」") +
    "\n  - 確認事項\n    - 内側の箇条書き";
  const codeValue =
    '#include <stdio.h>\n\nint main(void) {\n\tprintf("確認\\n");\n    return 0;\n}\n';
  const saved = await store.save("lesson01", {
    revision: model.revision,
    changes: [
      { key: code.key, value: codeValue },
      { key: list.key, value: listValue },
    ],
  });
  const expected = model.source
    .replace(code.value, codeValue)
    .replace(list.value, listValue);
  const disk = await readFile(file, "utf8");
  assert.equal(disk.replace(/\r\n/g, "\n"), expected);
  assert.equal(saved.samples.first.join("\n"), codeValue);
  const before = renderLesson(original, template, "lesson01.md");
  const after = renderLesson(disk, template, "lesson01.md");
  assert.deepEqual(after.sectionIds, before.sectionIds);
  assert.deepEqual(after.exerciseIds, before.exerciseIds);
  const backups = await readdir(join(root, ".local/author-backups"));
  assert.equal(backups.length, 1);
  assert.equal(
    await readFile(join(root, ".local/author-backups", backups[0]), "utf8"),
    original,
  );
});

test("external changes are never overwritten by a stale revision", async (t) => {
  const { store, file } = await fixture(t);
  const model = await store.load("lesson01");
  const external = original.replace("Cコードを動かす", "外部エディタで変更");
  await writeFile(file, external);
  await assert.rejects(
    store.save("lesson01", { revision: model.revision, changes: [] }),
    { status: 409 },
  );
  assert.equal(await readFile(file, "utf8"), external);
});

test("simultaneous saves from two tabs allow only one writer", async (t) => {
  const { store } = await fixture(t);
  const model = await store.load("lesson01");
  const field = model.fields.find(({ kind }) => kind === "inline");
  const results = await Promise.allSettled(
    ["変更A", "変更B"].map((value) =>
      store.save("lesson01", {
        revision: model.revision,
        changes: [{ key: field.key, value }],
      }),
    ),
  );
  assert.equal(
    results.filter(({ status }) => status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.find(({ status }) => status === "rejected").reason.status,
    409,
  );
});

test("rejects invalid edits and structural ID changes without altering source", async (t) => {
  const { store, file } = await fixture(t);
  const model = await store.load("lesson01");
  const field = model.fields.find(({ kind }) => kind === "rich");
  for (const changes of [
    [{ key: "not-a-field", value: "bad" }],
    [
      { key: field.key, value: "text" },
      { key: field.key, value: "text" },
    ],
    [{ key: field.key, value: "## 追加見出し {#unexpected}\n\n本文" }],
    [{ key: field.key, value: ":::unknown\n本文\n:::" }],
  ]) {
    await assert.rejects(
      store.save("lesson01", { revision: model.revision, changes }),
      { status: 422 },
    );
  }
  assert.equal(await readFile(file, "utf8"), original);
  await assert.rejects(store.load("../lesson01"), { status: 404 });
});

test("preserves CRLF files while exposing normalized edit ranges", async (t) => {
  const crlf = original.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  const { store, file } = await fixture(t, crlf);
  const model = await store.load("lesson01");
  const field = model.fields.find(({ kind }) => kind === "inline");
  await store.save("lesson01", {
    revision: model.revision,
    changes: [{ key: field.key, value: "編集確認" }],
  });
  assert.equal(
    await readFile(file, "utf8"),
    crlf.replace(field.value, "編集確認"),
  );
});

test("local editing API checks host, origin and save token", async (t) => {
  const { root } = await fixture(t);
  let middleware;
  lessonEditorPlugin(root).configureServer({
    middlewares: {
      use(fn) {
        middleware = fn;
      },
    },
  });
  async function request({
    method = "GET",
    host = "localhost:5173",
    origin,
    token,
    remoteAddress = "127.0.0.1",
    body = {},
  } = {}) {
    const req = Object.assign(
      (async function* () {
        // Split inside multibyte Japanese characters as a network stream may.
        const bytes = Buffer.from(JSON.stringify(body));
        for (let i = 0; i < bytes.length; i += 2)
          yield bytes.subarray(i, i + 2);
      })(),
      {
        url: "/__editor/api/lesson01",
        method,
        socket: { remoteAddress },
        headers: {
          host,
          origin,
          "content-type": "application/json",
          "x-lesson-editor-token": token,
        },
      },
    );
    let data;
    const response = {
      statusCode: 200,
      setHeader() {},
      end(value) {
        data = JSON.parse(value);
      },
    };
    await middleware(req, response, () =>
      assert.fail("Unexpected fallthrough"),
    );
    return { status: response.statusCode, data };
  }
  const loaded = await request();
  assert.equal(loaded.status, 200);
  assert.ok(loaded.data.token);
  assert.equal((await request({ host: "evil.example" })).status, 403);
  assert.equal((await request({ remoteAddress: "192.168.1.20" })).status, 403);
  assert.equal((await request({ origin: "https://evil.example" })).status, 403);
  assert.equal((await request({ method: "POST" })).status, 403);
  assert.equal(
    (
      await request({
        method: "POST",
        token: loaded.data.token,
        body: { revision: loaded.data.revision, changes: [] },
      })
    ).status,
    200,
  );
  const field = loaded.data.fields.find(({ kind }) => kind === "inline");
  const saved = await request({
    method: "POST",
    token: loaded.data.token,
    body: {
      revision: loaded.data.revision,
      changes: [{ key: field.key, value: "日本語の保存確認" }],
    },
  });
  assert.equal(saved.status, 200);
  assert.ok(saved.data.source.includes("日本語の保存確認"));
});

// Git may check the lesson out with CRLF line endings (core.autocrlf), so
// the tests below build their sources from an LF copy.
const lfOriginal = original.replace(/\r\n?/g, "\n");

test("fix exercises put editable code with errors into the input, not the sample canvas", async (t) => {
  const broken = '#include <stdio.h>\n\nint main(void) {\n    printf("<a>")\n    return 0;\n}';
  const at = lfOriginal.lastIndexOf("\n## ");
  const source =
    lfOriginal.slice(0, at) +
    `\n:::exercise fix-one hello.c fix\n\`\`\`c\n${broken}\n\`\`\`\n:::\n` +
    lfOriginal.slice(at);
  const page = renderLesson(source, template, "lesson01.md");
  assert.equal(page.samples["fix-one"], undefined);
  assert.ok(page.exerciseIds.includes("fix-one"));
  const escaped = broken.replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  assert.ok(page.html.includes(`aria-label="直すコード"`));
  assert.ok(page.html.includes(`>${escaped}</textarea>`));
  assert.ok(page.html.includes('<button type="button" class="reset-btn">最初のコードに戻す</button>'));
  assert.throws(
    () => renderLesson(source.replace("hello.c fix", "hello.c other"), template, "lesson01.md"),
    /指定が不正/,
  );
  const { store, file } = await fixture(t, source);
  const model = await store.load("lesson01");
  const field = model.fields.find(({ exercise }) => exercise === "fix-one");
  assert.equal(field.fix, true);
  assert.equal(field.value, broken);
  const fixed = broken.replace('("<a>")', '("<b>");');
  await store.save("lesson01", {
    revision: model.revision,
    changes: [{ key: field.key, value: fixed }],
  });
  assert.equal(await readFile(file, "utf8"), source.replace(broken, fixed));
});

test("each sentence shows on its own line, and check paragraphs stack", () => {
  const at = lfOriginal.lastIndexOf("\n## ");
  const source =
    lfOriginal.slice(0, at) +
    "\n文の一つ目です。二つ目は「引用。」を含みます。`a。b` の後の文です。\n最後の文です。\n\n:::check\n一つ目の段落です。\n\n二つ目の段落です。\n:::\n" +
    lfOriginal.slice(at);
  const { html } = renderLesson(source, template, "lesson01.md");
  assert.ok(
    html.includes(
      "<p>文の一つ目です。<br>\n二つ目は「引用。」を含みます。<br>\n<code>a。b</code> の後の文です。<br>\n最後の文です。</p>",
    ),
  );
  assert.ok(
    html.includes(
      '<div class="check"><b>確認</b><div class="check-body"><p>一つ目の段落です。</p>\n<p>二つ目の段落です。</p>\n</div></div>',
    ),
  );
  const bold = renderLesson(
    lfOriginal.trimEnd() + "\n\n**やることの文です。\n続きです。**\n注意の文です。\n",
    template,
    "lesson01.md",
  ).html;
  assert.ok(
    bold.includes("<p><strong>やることの文です。<br>\n続きです。</strong><br>\n注意の文です。</p>"),
  );
});

test("a check with a source exercise adds a try input that copies from it", () => {
  const withChecks = (source) =>
    lfOriginal.trimEnd() +
    `\n\n:::check ${source}\n書き換えてみましょう。\n:::\n\n:::check ${source}\nもう一度試しましょう。\n:::\n`;
  const page = renderLesson(withChecks("first"), template, "lesson01.md");
  assert.ok(page.exerciseIds.includes("first-try"));
  assert.ok(page.exerciseIds.includes("first-try2"));
  assert.match(page.html, /data-exercise="first-try" data-kind="try" [^>]*data-copy-from="first"/);
  assert.ok(page.html.includes('<button type="button" class="copy-btn">上のコードをコピー</button>'));
  assert.equal(page.samples["first-try"], undefined);
  assert.throws(
    () => renderLesson(withChecks("missing"), template, "lesson01.md"),
    /コピー元 missing が見つかりません/,
  );
});

test("exercises carry their kind, expected blocks bind answers, and progress can be off", () => {
  const page = renderLesson(lfOriginal, template, "lesson01.md");
  // The saved-code keys depend on these IDs; they must not change.
  assert.deepEqual(page.exerciseIds, [
    "first", "second", "third", "fourth", "printf-two-values", "task1", "task2", "task3",
  ]);
  assert.match(page.html, /data-exercise="first" data-kind="sample" data-label="見本：Hello World"/);
  assert.match(page.html, /data-exercise="task3" data-kind="task" data-label="課題3 山形模様を表示する"/);
  assert.equal(page.outputs.task3, "  *\n ***\n*****");
  assert.equal(page.outputs["printf-two-values"], "10 A");
  assert.match(page.html, /data-progress="off"/);
  assert.match(
    renderLesson(lfOriginal.replace("progress: off\n", ""), template, "lesson01.md").html,
    /data-progress="on"/,
  );
  // The sample's answer is the block right after it, not a later one.
  const extra = renderLesson(
    lfOriginal.trimEnd() +
      "\n\n:::exercise extra extra.c\n```c\nint main(void) {\n    return 0;\n}\n```\n:::\n\n:::expected\n直後の出力例\n:::\n\n本文です。\n\n:::expected\n後の出力例\n:::\n\n## 発展課題（余裕がある人のみ） {#extension}\n\n:::exercise ext1\n:::\n",
    template,
    "lesson01.md",
  );
  assert.equal(extra.outputs.extra, "直後の出力例");
  assert.match(extra.html, /data-exercise="ext1" data-kind="task" [^>]*data-bonus/);
  assert.throws(
    () => renderLesson(lfOriginal.trimEnd() + "\n\n:::expected nothing\nx\n:::\n", template, "lesson01.md"),
    /出力例の対象 nothing が見つかりません/,
  );
});

test("generated pages open and close every div", () => {
  const { html } = renderLesson(lfOriginal, template, "lesson01.md");
  const opened = html.match(/<div\b/g).length;
  const closed = html.match(/<\/div>/g).length;
  assert.equal(opened, closed);
});

test("every lesson renders with balanced divs and keeps its progress setting", async () => {
  const dir = new URL("../content/", import.meta.url);
  const names = (await readdir(dir)).filter((name) => /^lesson\d+\.md$/.test(name));
  assert.ok(names.includes("lesson02.md"));
  for (const name of names) {
    const source = await readFile(new URL(name, dir), "utf8");
    const { html } = renderLesson(source, template, name);
    assert.equal(html.match(/<div\b/g).length, html.match(/<\/div>/g).length, name);
    const off = /^progress: off$/m.test(source.replace(/\r/g, ""));
    assert.match(html, off ? /data-progress="off"/ : /data-progress="on"/, name);
  }
});
