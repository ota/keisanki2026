function tokenColor(token) {
  if (token.startsWith("#")) return "#b693e8";
  if (token.startsWith('"') || token.startsWith("'")) return "#f0af8e";
  if (/^(int|float|char|return|void)$/.test(token)) return "#86c9b4";
  if (/^\d/.test(token)) return "#e0ca80";
  return "#e4eee8";
}

export function drawSample(canvas, lines) {
  const parent = canvas.parentElement;
  const ratio = window.devicePixelRatio || 1;
  const font = '14px "DM Mono", monospace';
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = font;
  const longest = Math.max(
    ...lines.map((line) => measure.measureText(line).width),
  );
  const width = Math.max(parent.clientWidth, Math.ceil(longest + 106));
  const height = lines.length * 27 + 36;
  canvas.width = Math.ceil(width * ratio);
  canvas.height = Math.ceil(height * ratio);
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  ctx.fillStyle = "#1c2924";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#273a31";
  ctx.fillRect(0, 0, 58, height);
  ctx.font = font;
  ctx.textBaseline = "top";
  lines.forEach((line, index) => {
    const y = 19 + index * 27;
    ctx.fillStyle = "#80998a";
    ctx.textAlign = "right";
    ctx.fillText(String(index + 1), 43, y);
    ctx.textAlign = "left";
    let x = 76;
    const tokenPattern =
      /#[^\s]+(?:\s*<[^>]+>)?|"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|\b(?:int|float|char|return|void)\b|\b\d+(?:\.\d+)?f?\b/g;
    let last = 0;
    for (const match of line.matchAll(tokenPattern)) {
      const plain = line.slice(last, match.index);
      ctx.fillStyle = "#e4eee8";
      ctx.fillText(plain, x, y);
      x += ctx.measureText(plain).width;
      ctx.fillStyle = tokenColor(match[0]);
      ctx.fillText(match[0], x, y);
      x += ctx.measureText(match[0]).width;
      last = match.index + match[0].length;
    }
    ctx.fillStyle = "#e4eee8";
    ctx.fillText(line.slice(last), x, y);
  });
}
