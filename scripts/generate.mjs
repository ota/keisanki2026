import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import MarkdownIt from "markdown-it";
import { EditorFields } from "./editor-fields.mjs";

const root = resolve(import.meta.dirname, "..");
const contentDir = join(root, "content");
const templatePath = join(root, "templates/page.html");
const generatedDir = join(root, "src/generated");
const markdown = new MarkdownIt({ html: false, linkify: true });
const defaultLinkOpen =
  markdown.renderer.rules.link_open ||
  ((tokens, index, options, environment, self) =>
    self.renderToken(tokens, index, options));
markdown.renderer.rules.link_open = (
  tokens,
  index,
  options,
  environment,
  self,
) => {
  const href = tokens[index].attrGet("href") || "";
  if (/^https?:\/\//.test(href)) {
    tokens[index].attrSet("target", "_blank");
    tokens[index].attrSet("rel", "noopener noreferrer");
  }
  return defaultLinkOpen(tokens, index, options, environment, self);
};

// Show each sentence on its own line: break after "。" unless it ends the
// text or a closing bracket follows. A source line break after "。" also
// becomes a visible break. Code spans are separate tokens and stay intact.
markdown.core.ruler.push("sentence_breaks", (state) => {
  const lineBreak = () => new state.Token("hardbreak", "br", 0);
  for (const block of state.tokens) {
    if (block.type !== "inline" || !block.children) continue;
    const children = [];
    // A sentence ended; the break is placed after any closing tags (such as
    // the end of bold text) and only if more content follows.
    let pending = false;
    for (const token of block.children) {
      if (pending) {
        if (token.type.endsWith("_close") || (token.type === "text" && !token.content.trim())) {
          children.push(token);
          continue;
        }
        children.push(lineBreak());
        pending = false;
        if (token.type === "softbreak") continue;
      }
      if (token.type !== "text" || !token.content.includes("。")) {
        children.push(token);
        continue;
      }
      const parts = token.content
        .split(/(?<=。)(?![」』）)])/)
        .map((part, index) => (index ? part.replace(/^\s+/, "") : part))
        .filter(Boolean);
      parts.forEach((part, index) => {
        if (index) children.push(lineBreak());
        const text = new state.Token("text", "", 0);
        text.content = part;
        children.push(text);
      });
      pending = parts.at(-1).endsWith("。");
    }
    block.children = children;
  }
});

// Wide tables scroll inside their own box instead of widening the page on phones.
markdown.renderer.rules.table_open = () => '<div class="table-scroll"><table>\n';
markdown.renderer.rules.table_close = () => "</table></div>\n";

// The literal text of an expected-output block, without a code fence.
const expectedText = (body) =>
  body.trim().match(/^```[^\n]*\n([\s\S]*?)\n```$/)?.[1] ?? body.trim();

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

function readFrontMatter(source, path) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error(`${path}: 先頭にメタデータが必要です`);
  const meta = Object.fromEntries(
    match[1]
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf(":");
        if (index < 0) throw new Error(`${path}: 不正なメタデータ: ${line}`);
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );
  for (const key of [
    "title",
    "pageTitle",
    "number",
    "term",
    "subhead",
    "footer",
  ]) {
    if (!meta[key]) throw new Error(`${path}: ${key} がありません`);
  }
  return {
    meta,
    body: source.slice(match[0].length),
    bodyStart: match[0].length,
  };
}

function splitSections(body, path, offset = 0) {
  const heading = /^## (.+?) \{#([a-z][a-z0-9-]*)\}\s*$/gm;
  const matches = [...body.matchAll(heading)];
  if (!matches.length) throw new Error(`${path}: ## 見出し {#id} がありません`);
  if (body.slice(0, matches[0].index).trim())
    throw new Error(`${path}: 最初の本文の前に ## 見出し {#id} が必要です`);
  if ([...body.matchAll(/^## /gm)].length !== matches.length)
    throw new Error(`${path}: すべての ## 見出しに {#id} を付けてください`);
  const ids = new Set();
  return matches.map((match, index) => {
    if (ids.has(match[2]))
      throw new Error(`${path}: 見出しID ${match[2]} が重複しています`);
    ids.add(match[2]);
    const rawStart = match.index + match[0].length;
    const raw = body.slice(rawStart, matches[index + 1]?.index);
    return {
      title: match[1],
      id: match[2],
      body: raw.trim(),
      bodyStart: offset + rawStart + raw.length - raw.trimStart().length,
    };
  });
}

function exerciseHtml(argument, body, samples, usedIds, path, context, { copyFrom } = {}) {
  // "fix" puts code with deliberate errors into the input for students to repair.
  const [id, filename, mode] = argument.split(/\s+/);
  if (mode && mode !== "fix")
    throw new Error(`${path}: ${id} の指定が不正です: ${mode}`);
  const fix = mode === "fix";
  if (!/^[a-z][a-z0-9-]*$/.test(id || ""))
    throw new Error(`${path}: 演習IDが不正です: ${id}`);
  if (usedIds.has(id))
    throw new Error(`${path}: 演習ID ${id} が重複しています`);
  usedIds.add(id);
  let sample = "";
  let initial = "";
  let codeField;
  if (body.trim()) {
    const code = body.trim().match(/^```c\n([\s\S]*?)\n```$/);
    if (!code || !filename)
      throw new Error(
        `${path}: ${id} の見本はCコードフェンスとファイル名が必要です`,
      );
    if (fix) initial = code[1];
    else {
      sample = code[1];
      samples[id] = sample.split("\n");
    }
    codeField = context.editor?.add(
      "code",
      code[1],
      context.start + body.length - body.trimStart().length + 5,
      { exercise: id, filename, ...(fix && { fix: true }) },
    );
  } else if (fix) {
    throw new Error(`${path}: ${id} の直すコードがありません`);
  } else if (filename) {
    throw new Error(`${path}: ${id} の見本コードがありません`);
  }
  const safeId = escapeHtml(id);
  // Kind, a readable name and whether it is optional drive the progress panel.
  const kind = sample ? "sample" : fix ? "fix" : copyFrom ? "try" : "task";
  const lesson = context.lesson;
  const section = context.section ?? { id: "", title: "" };
  const count = `${section.id}:${kind}`;
  lesson.counts[count] = (lesson.counts[count] ?? 0) + 1;
  const nth = lesson.counts[count];
  const nthText = nth > 1 ? `（${nth}つ目）` : "";
  const title = context.heading
    ? context.heading.replace(/\s+/, " ")
    : kind === "fix"
      ? `エラーを直す（${nth}つ目）`
      : `${{ sample: "見本", try: "確認", task: "課題" }[kind]}：${section.title}${nthText}`;
  const bonus = section.id === "extension";
  const label = sample
    ? "上記のサンプルコードを書き写してください："
    : fix
      ? "まず実行してエラーを確かめ、直してから再実行しましょう："
      : copyFrom
        ? "上のコードをコピーしてから書き換え、実行しましょう："
        : "";
  const sampleHtml = sample
    ? `<div class="sample-head"><span class="file-icon">C</span> ${escapeHtml(filename)}${codeField ? `<button type="button" class="author-code-button" data-author-code="${codeField.key}">見本コードを編集</button>` : '<span class="sample-tag">見ながら入力</span>'}</div>
       <div class="sample-scroll"><canvas class="sample-canvas" aria-label="書き写すためのCコードサンプル。文字は選択できません。"></canvas></div>`
    : fix
      ? `<div class="sample-head fix-head"><span class="file-icon">C</span> ${escapeHtml(filename)}${codeField ? `<button type="button" class="author-code-button" data-author-code="${codeField.key}">直すコードを編集</button>` : '<span class="sample-tag">エラーを直す</span>'}</div>`
      : "";
  return `<div class="exercise${fix ? " fix-exercise" : ""}${copyFrom ? " try-exercise" : ""}" data-exercise="${safeId}" data-kind="${kind}" data-label="${escapeHtml(title)}"${bonus ? " data-bonus" : ""}${copyFrom ? ` data-copy-from="${escapeHtml(copyFrom)}"` : ""}>
    ${sampleHtml}
    <div class="work">
      ${label ? `<label for="editor-${safeId}">${label}</label>` : ""}
      <div class="editor-wrap"><div class="gutter" aria-hidden="true"></div>
        <textarea id="editor-${safeId}" aria-label="${sample ? "サンプルコード" : fix ? "直すコード" : copyFrom ? "確認用のコード" : escapeHtml(id.replace(/^task(\d+)$/, "課題$1").replace(/^ext(\d+)$/, "発展$1")) + "のコード"}" class="editor" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" placeholder="${sample ? "// サンプルコードを見ながら、ここに入力" : copyFrom ? "// 「上のコードをコピー」を押してから書き換えます" : "// 自分で考えて入力"}">${escapeHtml(initial)}</textarea>
      </div>
      <div class="pass-note" hidden></div>
      <div class="work-footer"><div class="buttons">${sample ? '<button type="button" class="diff-btn">見本と比べる</button>' : ""}${fix ? '<button type="button" class="reset-btn">最初のコードに戻す</button>' : ""}${copyFrom ? '<button type="button" class="copy-btn">上のコードをコピー</button>' : ""}<button type="button" class="run-btn">▶ 実行する</button></div></div>
      <div class="status" role="status" aria-live="polite"></div>
      <div class="output" hidden><div class="output-head">実行結果 <span class="exit-code"></span></div><pre></pre></div>
    </div>
  </div>`;
}

function directiveHtml(name, argument, body, samples, usedIds, path, context) {
  const trimmed = body.trim();
  const lines = trimmed.split("\n");
  let lineStart = context.start + body.length - body.trimStart().length;
  const inline = (text, start) =>
    context.editor
      ? context.editor.inline(text, start)
      : markdown.renderInline(text);
  const rich = () =>
    context.editor
      ? context.editor.rich(body, context.start)
      : markdown.render(body);
  if (name === "goals") {
    return `<div class="goal-grid">${lines
      .map((line, index) => {
        const match = line.match(/^- (.+?) \| (.+)$/);
        if (!match)
          throw new Error(`${path}: goal は「- 名前 | 説明」で書いてください`);
        const title = inline(match[1], lineStart + 2);
        const description = inline(
          match[2],
          lineStart + 2 + match[1].length + 3,
        );
        lineStart += line.length + 1;
        return `<div class="goal"><b>${String(index + 1).padStart(2, "0")}</b><strong>${title}</strong><span>${description}</span></div>`;
      })
      .join("")}</div>`;
  }
  if (name === "howto") {
    return `<section class="howto" aria-labelledby="howto-title"><div class="howto-icon">⌨</div><div><h3 id="howto-title">${escapeHtml(argument)}</h3>${rich()}</div></section>`;
  }
  if (name === "about-c") {
    const [src, caption] = argument.split("|").map((part) => part.trim());
    if (!src || !caption)
      throw new Error(`${path}: about-c には画像と説明が必要です`);
    const list = rich().replace("<ul>", '<ul class="c-points">');
    return `<div class="about-c-layout">${list}<figure class="c-logo"><img src="${escapeHtml(src)}" alt="${escapeHtml(caption)}" width="250" height="262" /><figcaption>${escapeHtml(caption)}</figcaption></figure></div>`;
  }
  if (name === "concepts") {
    const items = [];
    for (const line of lines) {
      if (line.startsWith("- ")) {
        items.push({
          content: inline(line.slice(2), lineStart + 2),
          details: [],
        });
      } else if (line.startsWith("  - ") && items.length) {
        items.at(-1).details.push(inline(line.slice(4), lineStart + 4));
      } else {
        throw new Error(`${path}: concepts は箇条書きで書いてください`);
      }
      lineStart += line.length + 1;
    }
    return `<ul class="concepts">${items.map(({ content, details }) => `<li class="concept"><p>${content}</p>${details.length ? `<ul class="concept-details">${details.map((detail) => `<li>${detail}</li>`).join("")}</ul>` : ""}</li>`).join("\n")}</ul>`;
  }
  if (name === "exercise")
    return exerciseHtml(argument, body, samples, usedIds, path, context);
  if (name === "check") {
    const box = `<div class="check"><b>確認</b><div class="check-body">${rich()}</div></div>`;
    if (!argument) return box;
    // ":::check SOURCE" adds an input below the check, where students try the
    // change on a copy of their own code from exercise SOURCE.
    if (!usedIds.has(argument))
      throw new Error(`${path}: 確認のコピー元 ${argument} が見つかりません`);
    let id = `${argument}-try`;
    for (let n = 2; usedIds.has(id); n++) id = `${argument}-try${n}`;
    return (
      box +
      exerciseHtml(id, "", samples, usedIds, path, context, {
        copyFrom: argument,
      })
    );
  }
  if (name === "notice") return `<div class="lesson-notice">${rich()}</div>`;
  if (name === "expected") {
    if (argument && !/^[a-z][a-z0-9-]*$/.test(argument))
      throw new Error(`${path}: 出力例の対象IDが不正です: ${argument}`);
    const value = body.trim().startsWith("```")
      ? markdown
          .render(body)
          .replace(/<pre><code>/, "<pre>")
          .replace(/<\/code><\/pre>/, "</pre>")
      : `<code>${markdown.renderInline(body.trim())}</code>`;
    return `<div class="expected">${value}</div>`;
  }
  if (name === "hint")
    return `<details class="hint"><summary>ヒント</summary>${rich()}</details>`;
  throw new Error(`${path}: 未対応の記法 :::${name}`);
}

function renderBody(body, samples, usedIds, path, context) {
  const blocks = [];
  // The student rendering keeps its existing output; the editor renders each
  // source fragment separately so that editable ranges have exact offsets.
  let authorHtml = "";
  let cursor = 0;
  let lastSample = null;
  const withPlaceholders = body.replace(
    /^:::(\w[\w-]*)([^\n]*)\n([\s\S]*?)^:::\s*$/gm,
    (full, name, argument, content, offset) => {
      const token = `LESSONBLOCK${blocks.length}END`;
      // An expected block right after a sample is that sample's answer;
      // ":::expected ID" makes it the answer of exercise ID.
      if (name === "expected") {
        const target =
          argument.trim() ||
          (lastSample && !body.slice(lastSample.end, offset).trim()
            ? lastSample.id
            : "");
        if (target) context.lesson.outputs[target] = expectedText(content);
      }
      const heading = [...body.slice(0, offset).matchAll(/^### (.+)$/gm)].at(-1)?.[1];
      const html = directiveHtml(
        name,
        argument.trim(),
        content,
        samples,
        usedIds,
        path,
        {
          editor: context.editor,
          start: context.start + offset + 3 + name.length + argument.length + 1,
          lesson: context.lesson,
          section: context.section,
          heading,
        },
      );
      const id = argument.trim().split(/\s+/)[0];
      lastSample =
        name === "exercise" && samples[id]
          ? { id, end: offset + full.length }
          : null;
      blocks.push([token, html]);
      if (context.editor) {
        authorHtml +=
          context.editor.rich(
            body.slice(cursor, offset),
            context.start + cursor,
          ) + html;
        cursor = offset + full.length;
      }
      return `\n\n${token}\n\n`;
    },
  );
  if (/^:::/m.test(withPlaceholders))
    throw new Error(`${path}: 閉じていない ::: ブロックがあります`);
  if (context.editor)
    return (
      authorHtml +
      context.editor.rich(body.slice(cursor), context.start + cursor)
    );
  let html = markdown.render(withPlaceholders);
  for (const [token, value] of blocks)
    html = html.replace(`<p>${token}</p>`, value);
  return html;
}

function renderSection(section, samples, usedIds, path, editor, lesson) {
  const where = { lesson, section: { id: section.id, title: section.title } };
  let body = section.body;
  let after = "";
  if (section.id === "goals") {
    const howto = body.match(/\n:::howto[^\n]*\n[\s\S]*?\n:::\s*$/);
    if (howto) {
      after = renderBody(howto[0].trim(), samples, usedIds, path, {
        ...where,
        editor,
        start:
          section.bodyStart +
          howto.index +
          howto[0].length -
          howto[0].trimStart().length,
      });
      body = body.slice(0, howto.index).trim();
    }
  }
  let html = renderBody(body, samples, usedIds, path, {
    ...where,
    editor,
    start: section.bodyStart,
  });
  if (section.id === "warmup")
    html = html.replace("<ul>", '<ul class="fact-list">');
  const tasks = section.id === "challenge" || section.id === "extension";
  if (tasks) {
    html = html.replace(
      /<h3>(課題|発展)(\d+)\s+([^<]+)<\/h3>/g,
      '<h3 class="task-title">$1$2 <span>$3</span></h3>',
    );
  }
  const className = tasks
      ? "section challenge-section"
      : section.id === "summary"
        ? "section summary"
        : "section";
  return `<section id="${section.id}" class="${className}"><h2>${escapeHtml(section.title)}</h2>${html}</section>${after}`;
}

export function renderLesson(
  source,
  template,
  path,
  { editable = false } = {},
) {
  source = source.replace(/\r\n?/g, "\n");
  const slug = path.replace(/\.md$/, "");
  const { meta, body, bodyStart } = readFrontMatter(source, path);
  const sections = splitSections(body, path, bodyStart);
  const samples = {};
  const usedIds = new Set();
  const lesson = { outputs: {}, counts: {} };
  const editor = editable ? new EditorFields(markdown, source) : undefined;
  const content = `<h1>${escapeHtml(meta.title)}</h1>\n${sections.map((section) => renderSection(section, samples, usedIds, path, editor, lesson)).join("\n")}`;
  for (const id of Object.keys(lesson.outputs))
    if (!usedIds.has(id))
      throw new Error(`${path}: 出力例の対象 ${id} が見つかりません`);
  const nav =
    sections
      .map(({ id, title }) => `<a href="#${id}">${escapeHtml(title)}</a>`)
      .join("") + '<a href="#save">保存</a>';
  const replacements = {
    PAGE_TITLE: meta.pageTitle,
    TERM: meta.term,
    NUMBER: meta.number,
    TITLE: meta.title,
    SUBHEAD: meta.subhead,
    FOOTER: meta.footer,
    SLUG: slug,
    NAV: nav,
    CONTENT: content,
    // "progress: off" in the front matter hides the progress panel.
    PROGRESS: meta.progress === "off" ? "off" : "on",
  };
  let html = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) =>
    key === "NAV" || key === "CONTENT"
      ? replacements[key]
      : escapeHtml(replacements[key] ?? ""),
  );
  html = html.replace(/[\t ]+$/gm, "");
  if (html.includes("{{"))
    throw new Error(`${path}: 未処理のテンプレート変数があります`);
  return {
    html,
    samples,
    fields: editor?.fields ?? [],
    source,
    meta,
    sectionIds: sections.map(({ id }) => id),
    exerciseIds: [...usedIds],
    outputs: lesson.outputs,
  };
}

export async function generateAll() {
  const template = await readFile(templatePath, "utf8");
  const paths = (await readdir(contentDir))
    .filter((name) => /^lesson\d+\.md$/.test(name))
    .sort();
  if (!paths.includes("lesson01.md"))
    throw new Error("content/lesson01.md がありません");
  await mkdir(generatedDir, { recursive: true });
  // Validate every lesson before writing any generated files.
  const rendered = await Promise.all(
    paths.map(async (path) => ({
      path,
      ...renderLesson(
        await readFile(join(contentDir, path), "utf8"),
        template,
        path,
      ),
    })),
  );
  const outputs = [];
  for (const { path, html, samples, outputs: answers } of rendered) {
    const slug = path.slice(0, -3);
    const output = join(root, `${slug}.html`);
    await writeFile(output, html);
    if (slug === "lesson01") {
      const entry = join(root, "index.html");
      await writeFile(entry, html);
      outputs.push(entry);
    }
    await writeFile(
      join(generatedDir, `${slug}-samples.js`),
      `// Generated from content/${path}\nexport const samples = ${JSON.stringify(samples, null, 2)};\nexport const outputs = ${JSON.stringify(answers, null, 2)};\n`,
    );
    outputs.push(output);
  }
  return outputs;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  for (const path of await generateAll()) console.log(path);
}
