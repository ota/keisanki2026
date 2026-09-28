// Editable ranges refer to the original, LF-normalized Markdown. Only changed
// ranges are replaced; directive delimiters, IDs and untouched text stay intact.
export class EditorFields {
  constructor(markdown, source) {
    this.markdown = markdown;
    this.source = source;
    this.fields = [];
  }

  add(kind, text, start, extra = {}) {
    if (this.source.slice(start, start + text.length) !== text)
      throw new Error("編集箇所と原稿の対応を確認できませんでした。");
    const field = {
      key: `f${start}`,
      kind,
      start,
      end: start + text.length,
      value: text,
      ...extra,
    };
    if (this.fields.some((other) => other.key === field.key))
      throw new Error("編集箇所が重複しています。");
    this.fields.push(field);
    return field;
  }

  inline(text, start) {
    const field = this.add("inline", text, start);
    return `<span data-author-field="${field.key}" class="author-inline">${this.markdown.renderInline(text)}</span>`;
  }

  rich(text, start) {
    const env = {};
    const tokens = this.markdown.parse(text, env);
    const lineStarts = [0];
    for (let i = 0; i < text.length; i++)
      if (text[i] === "\n") lineStarts.push(i + 1);
    const blocks = tokens
      .map((token, index) => ({ token, index }))
      .filter(({ token }) => token.level === 0 && token.map);
    return blocks
      .map(({ token, index }, blockIndex) => {
        const html = this.markdown.renderer.render(
          tokens.slice(index, blocks[blockIndex + 1]?.index),
          this.markdown.options,
          env,
        );
        if (
          ![
            "paragraph_open",
            "bullet_list_open",
            "ordered_list_open",
            "heading_open",
            "blockquote_open",
          ].includes(token.type)
        )
          return html;
        const begin = lineStarts[token.map[0]];
        const raw = text
          .slice(begin, lineStarts[token.map[1]] ?? text.length)
          .replace(/\n+$/, "");
        const field = this.add("rich", raw, start + begin);
        return `<div data-author-field="${field.key}" class="author-field">${html}</div>\n`;
      })
      .join("");
  }
}

export function applyFieldChanges(source, fields, changes) {
  if (!Array.isArray(changes)) throw new Error("変更内容が不正です。");
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const seen = new Set();
  const patches = changes
    .map(({ key, value }) => {
      const field = byKey.get(key);
      if (!field || seen.has(key) || typeof value !== "string")
        throw new Error("編集箇所が不正です。原稿を読み直してください。");
      seen.add(key);
      if (value.length > 200_000) throw new Error("編集内容が長すぎます。");
      if (field.kind === "inline" && /[\r\n]/.test(value))
        throw new Error("この箇所は1行で入力してください。");
      return { ...field, value: value.replace(/\r\n?/g, "\n") };
    })
    .sort((a, b) => b.start - a.start);
  let end = source.length;
  for (const patch of patches) {
    if (patch.end > end) throw new Error("編集範囲が重複しています。");
    source =
      source.slice(0, patch.start) + patch.value + source.slice(patch.end);
    end = patch.start;
  }
  return source;
}
