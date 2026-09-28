import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import MarkdownIt from "markdown-it";

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
  return { meta, body: source.slice(match[0].length) };
}

function splitSections(body, path) {
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
    return {
      title: match[1],
      id: match[2],
      body: body
        .slice(match.index + match[0].length, matches[index + 1]?.index)
        .trim(),
    };
  });
}

function exerciseHtml(argument, body, samples, usedIds, path) {
  const [id, filename] = argument.split(/\s+/);
  if (!/^[a-z][a-z0-9-]*$/.test(id || ""))
    throw new Error(`${path}: 演習IDが不正です: ${id}`);
  if (usedIds.has(id))
    throw new Error(`${path}: 演習ID ${id} が重複しています`);
  usedIds.add(id);
  let sample = "";
  if (body.trim()) {
    const code = body.trim().match(/^```c\n([\s\S]*?)\n```$/);
    if (!code || !filename)
      throw new Error(
        `${path}: ${id} の見本はCコードフェンスとファイル名が必要です`,
      );
    sample = code[1];
    samples[id] = sample.split("\n");
  } else if (filename) {
    throw new Error(`${path}: ${id} の見本コードがありません`);
  }
  const safeId = escapeHtml(id);
  const label = sample ? "上記のサンプルコードを書き写してください：" : "";
  const sampleHtml = sample
    ? `<div class="sample-head"><span class="file-icon">C</span> ${escapeHtml(filename)}<span class="sample-tag">見ながら入力</span></div>
       <div class="sample-scroll"><canvas class="sample-canvas" aria-label="書き写すためのCコードサンプル。文字は選択できません。"></canvas></div>`
    : "";
  return `<div class="exercise" data-exercise="${safeId}">
    ${sampleHtml}
    <div class="work">
      ${label ? `<label for="editor-${safeId}">${label}</label>` : ""}
      <div class="editor-wrap"><div class="gutter" aria-hidden="true"></div>
        <textarea id="editor-${safeId}" aria-label="${label ? "サンプルコード" : escapeHtml(id.replace(/^task(\d+)$/, "課題$1")) + "のコード"}" class="editor" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" placeholder="${sample ? "// サンプルコードを見ながら、ここに入力" : "// 自分で考えて入力"}"></textarea>
      </div>
      <div class="work-footer"><div class="buttons"><button type="button" class="run-btn">▶ 実行する</button></div></div>
      <div class="status" role="status" aria-live="polite"></div>
      <div class="output" hidden><div class="output-head">実行結果 <span class="exit-code"></span></div><pre></pre></div>
    </div>
  </div>`;
}

function directiveHtml(name, argument, body, samples, usedIds, path) {
  const lines = body.trim().split("\n");
  if (name === "goals") {
    return `<div class="goal-grid">${lines
      .map((line, index) => {
        const match = line.match(/^- (.+?) \| (.+)$/);
        if (!match)
          throw new Error(`${path}: goal は「- 名前 | 説明」で書いてください`);
        return `<div class="goal"><b>${String(index + 1).padStart(2, "0")}</b><strong>${markdown.renderInline(match[1])}</strong><span>${markdown.renderInline(match[2])}</span></div>`;
      })
      .join("")}</div>`;
  }
  if (name === "howto") {
    return `<section class="howto" aria-labelledby="howto-title"><div class="howto-icon">⌨</div><div><h3 id="howto-title">${escapeHtml(argument)}</h3>${markdown.render(body)}</div></section>`;
  }
  if (name === "about-c") {
    const [src, caption] = argument.split("|").map((part) => part.trim());
    if (!src || !caption)
      throw new Error(`${path}: about-c には画像と説明が必要です`);
    const list = markdown.render(body).replace("<ul>", '<ul class="c-points">');
    return `<div class="about-c-layout">${list}<figure class="c-logo"><img src="${escapeHtml(src)}" alt="${escapeHtml(caption)}" width="250" height="262" /><figcaption>${escapeHtml(caption)}</figcaption></figure></div>`;
  }
  if (name === "concepts") {
    return lines
      .map((line, index) => {
        if (!line.startsWith("- "))
          throw new Error(`${path}: concepts は箇条書きで書いてください`);
        return `<div class="concept"><b>${String.fromCharCode(65 + index)}</b><p>${markdown.renderInline(line.slice(2))}</p></div>`;
      })
      .join("\n");
  }
  if (name === "exercise")
    return exerciseHtml(argument, body, samples, usedIds, path);
  if (name === "check")
    return `<div class="check"><b>確認</b>${markdown.render(body)}</div>`;
  if (name === "expected") {
    const value = body.trim().startsWith("```")
      ? markdown
          .render(body)
          .replace(/<pre><code>/, "<pre>")
          .replace(/<\/code><\/pre>/, "</pre>")
      : `<code>${markdown.renderInline(body.trim())}</code>`;
    return `<div class="expected"><span>出力の形</span>${value}</div>`;
  }
  if (name === "hint")
    return `<details class="hint"><summary>ヒント</summary>${markdown.render(body)}</details>`;
  throw new Error(`${path}: 未対応の記法 :::${name}`);
}

function renderBody(body, samples, usedIds, path) {
  const blocks = [];
  const withPlaceholders = body.replace(
    /^:::(\w[\w-]*)([^\n]*)\n([\s\S]*?)^:::\s*$/gm,
    (_, name, argument, content) => {
      const token = `LESSONBLOCK${blocks.length}END`;
      blocks.push([
        token,
        directiveHtml(name, argument.trim(), content, samples, usedIds, path),
      ]);
      return `\n\n${token}\n\n`;
    },
  );
  if (/^:::/m.test(withPlaceholders))
    throw new Error(`${path}: 閉じていない ::: ブロックがあります`);
  let html = markdown.render(withPlaceholders);
  for (const [token, value] of blocks)
    html = html.replace(`<p>${token}</p>`, value);
  return html;
}

function renderSection(section, samples, usedIds, path) {
  let body = section.body;
  let after = "";
  if (section.id === "goals") {
    const howto = body.match(/\n:::howto[^\n]*\n[\s\S]*?\n:::\s*$/);
    if (howto) {
      after = renderBody(howto[0].trim(), samples, usedIds, path);
      body = body.slice(0, howto.index).trim();
    }
  }
  let html = renderBody(body, samples, usedIds, path);
  if (section.id === "warmup")
    html = html.replace("<ul>", '<ul class="fact-list">');
  if (section.id === "challenge") {
    html = html.replace(
      /<h3>課題(\d+)\s+([^<]+)<\/h3>/g,
      '<h3 class="task-title">課題$1 <span>$2</span></h3>',
    );
  }
  const className =
    section.id === "challenge"
      ? "section challenge-section"
      : section.id === "summary"
        ? "section summary"
        : "section";
  return `<section id="${section.id}" class="${className}"><h2>${escapeHtml(section.title)}</h2>${html}</section>${after}`;
}

export async function generateAll() {
  const template = await readFile(templatePath, "utf8");
  const paths = (await readdir(contentDir))
    .filter((name) => /^lesson\d+\.md$/.test(name))
    .sort();
  if (!paths.includes("lesson01.md"))
    throw new Error("content/lesson01.md がありません");
  await mkdir(generatedDir, { recursive: true });
  const outputs = [];
  for (const path of paths) {
    const slug = path.slice(0, -3);
    const { meta, body } = readFrontMatter(
      await readFile(join(contentDir, path), "utf8"),
      path,
    );
    const sections = splitSections(body, path);
    const samples = {};
    const usedIds = new Set();
    const content = `<h1>${escapeHtml(meta.title)}</h1>\n${sections.map((section) => renderSection(section, samples, usedIds, path)).join("\n")}`;
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
    };
    let html = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) =>
      key === "NAV" || key === "CONTENT"
        ? replacements[key]
        : escapeHtml(replacements[key] ?? ""),
    );
    html = html.replace(/[\t ]+$/gm, "");
    if (html.includes("{{"))
      throw new Error(`${path}: 未処理のテンプレート変数があります`);
    const output = join(
      root,
      slug === "lesson01" ? "index.html" : `${slug}.html`,
    );
    await writeFile(output, html);
    await writeFile(
      join(generatedDir, `${slug}-samples.js`),
      `// Generated from content/${path}\nexport const samples = ${JSON.stringify(samples, null, 2)};\n`,
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
