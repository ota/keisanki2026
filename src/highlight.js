// Shared C token rules for the sample canvas and the student editor.
// Strings may be unclosed so that a missing quote colors the rest of the line.
const keywords =
  "int|long|short|float|double|char|void|unsigned|signed|const|static|struct|enum|typedef|sizeof|return|if|else|for|while|do|switch|case|default|break|continue";
const tokenPattern = new RegExp(
  String.raw`//.*|/\*.*?(?:\*/|$)|#[^\s]+(?:\s*<[^>]+>)?|"(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|\b(?:${keywords})\b|\b\d+(?:\.\d+)?f?\b`,
  "g",
);

function kindOf(token) {
  if (token.startsWith("//") || token.startsWith("/*")) return "comment";
  if (token.startsWith("#")) return "directive";
  if (token.startsWith('"') || token.startsWith("'")) return "string";
  if (/^\d/.test(token)) return "number";
  return "keyword";
}

// Returns [text, kind] pairs; kind is "" for plain text.
export function tokenizeLine(line) {
  const parts = [];
  let last = 0;
  for (const match of line.matchAll(tokenPattern)) {
    if (match.index > last) parts.push([line.slice(last, match.index), ""]);
    parts.push([match[0], kindOf(match[0])]);
    last = match.index + match[0].length;
  }
  if (last < line.length) parts.push([line.slice(last), ""]);
  return parts;
}

export const escapeHtml = (text) =>
  text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

export function highlightHtml(code) {
  return code
    .split("\n")
    .map((line) =>
      tokenizeLine(line)
        .map(([text, kind]) =>
          kind ? `<span class="tok-${kind}">${escapeHtml(text)}</span>` : escapeHtml(text),
        )
        .join(""),
    )
    .join("\n");
}
