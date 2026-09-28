import stylesheet from "./style.css?raw";

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function addMetadataRow(list, label, value) {
  const row = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");
  term.textContent = label;
  description.textContent = value;
  row.append(term, description);
  list.append(row);
}

function savedAtLabel(date) {
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

function fileStamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return (
    date.getFullYear() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    "-" +
    pad(date.getHours()) +
    pad(date.getMinutes())
  );
}

export async function createSubmissionFile({ attendanceNumber, studentName }) {
  const savedAt = new Date();
  const report = document.documentElement.cloneNode(true);
  const head = report.querySelector("head");

  report
    .querySelectorAll(
      'script, link[rel="stylesheet"], link[rel="modulepreload"], link[rel="preconnect"]',
    )
    .forEach((element) => element.remove());
  const style = document.createElement("style");
  style.textContent = stylesheet;
  head.append(style);
  head.querySelector("title").textContent += " — 保存記録";

  const originalCanvases = document.querySelectorAll(".sample-canvas");
  const reportCanvases = report.querySelectorAll(".sample-canvas");
  originalCanvases.forEach((canvas, index) => {
    const image = document.createElement("img");
    image.className = "sample-canvas";
    image.alt = canvas.getAttribute("aria-label") || "Cコードの見本";
    image.src = canvas.toDataURL("image/png");
    image.setAttribute("style", canvas.getAttribute("style") || "");
    reportCanvases[index].replaceWith(image);
  });

  const originalLogo = document.querySelector(".c-logo img");
  const reportLogo = report.querySelector(".c-logo img");
  try {
    const response = await fetch(originalLogo.currentSrc || originalLogo.src);
    if (!response.ok) throw new Error("ロゴを読み込めませんでした。");
    reportLogo.src = await readAsDataUrl(await response.blob());
  } catch {
    reportLogo.src = originalLogo.currentSrc || originalLogo.src;
  }

  const originalExercises = document.querySelectorAll(".exercise");
  const reportExercises = report.querySelectorAll(".exercise");
  originalExercises.forEach((exercise, index) => {
    const copy = reportExercises[index];
    const editor = exercise.querySelector(".editor");
    const code = document.createElement("pre");
    code.className = "report-code";
    code.textContent = editor.value || "（未入力）";
    copy.querySelector(".editor").replaceWith(code);
    copy.querySelector(".work label")?.removeAttribute("for");
    copy.querySelector(".work-footer")?.remove();
    copy.querySelector(".save-note")?.remove();
    copy.querySelector(".status")?.remove();
    if (exercise.querySelector(".output").hidden) {
      copy.querySelector(".output").remove();
    }
  });

  report.querySelector("#save").remove();
  const metadata = document.createElement("section");
  metadata.id = "save";
  metadata.className = "report-meta";
  const heading = document.createElement("h2");
  heading.textContent = "保存情報";
  const list = document.createElement("dl");
  const platform =
    navigator.userAgentData?.platform || navigator.platform || "取得できません";
  addMetadataRow(list, "出席番号", attendanceNumber);
  addMetadataRow(list, "氏名", studentName);
  addMetadataRow(list, "取得日時（端末の時計）", savedAtLabel(savedAt));
  addMetadataRow(list, "取得日時（UTC）", savedAt.toISOString());
  addMetadataRow(list, "ブラウザ情報", navigator.userAgent);
  addMetadataRow(list, "端末の種類", platform);
  addMetadataRow(list, "ブラウザの言語", navigator.language);
  addMetadataRow(
    list,
    "画面サイズ",
    `${screen.width} × ${screen.height} ピクセル`,
  );
  addMetadataRow(list, "教材URL", location.origin + location.pathname);
  metadata.append(heading, list);
  report.querySelector(".page-footer").after(metadata);

  const safeNumber =
    attendanceNumber
      .normalize("NFKC")
      .replace(/[^0-9A-Za-z_-]/g, "")
      .slice(0, 16) || "student";
  const filename = `keisanki2026_01_${safeNumber}_${fileStamp(savedAt)}.html`;
  const blob = new Blob(["<!doctype html>\n", report.outerHTML], {
    type: "text/html;charset=utf-8",
  });
  return { blob, filename };
}
