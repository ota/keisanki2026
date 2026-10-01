import { tokenizeLine } from "./highlight.js";

const tokenColors = {
  comment: "#87a294",
  directive: "#b693e8",
  string: "#f0af8e",
  keyword: "#86c9b4",
  number: "#e0ca80",
};

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
    for (const [text, kind] of tokenizeLine(line)) {
      ctx.fillStyle = tokenColors[kind] || "#e4eee8";
      ctx.fillText(text, x, y);
      x += ctx.measureText(text).width;
    }
  });
}
