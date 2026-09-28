import "./style.css";
import { createSubmissionFile } from "./export.js";
import { drawSample } from "./sample.js";

const sampleModules = import.meta.glob("./generated/*-samples.js", {
  eager: true,
});
const lesson = document.body.dataset.lesson;
if (import.meta.hot) {
  import.meta.hot.on("lesson-updated", ({ slug }) => {
    if (slug === lesson) location.reload();
  });
}
const samples = sampleModules[`./generated/${lesson}-samples.js`]?.samples ?? {};

const sampleCanvases = [];
for (const [name, lines] of Object.entries(samples)) {
  const canvas = document.querySelector(
    '[data-exercise="' + name + '"] .sample-canvas',
  );
  sampleCanvases.push([canvas, lines]);
  drawSample(canvas, lines);
}
let resizeFrame;
window.addEventListener("resize", () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    for (const [canvas, lines] of sampleCanvases) drawSample(canvas, lines);
  });
});

let worker;
let requestId = 0;
let running = false;

function stopWorker() {
  worker?.terminate();
  worker = undefined;
}

function runC(code, onStatus) {
  if (!worker)
    worker = new Worker(new URL("./compiler-worker.js", import.meta.url), {
      type: "module",
    });
  const activeWorker = worker;
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    let timeout = setTimeout(() => {
      cleanup();
      stopWorker();
      reject(
        new Error(
          "コンパイラの読み込みが時間切れになりました。通信を確認して、もう一度実行してください。",
        ),
      );
    }, 120000);
    function cleanup() {
      clearTimeout(timeout);
      activeWorker.removeEventListener("message", onMessage);
      activeWorker.removeEventListener("error", onError);
    }
    function onError(event) {
      cleanup();
      stopWorker();
      reject(new Error(event.message || "コンパイラを起動できませんでした。"));
    }
    function onMessage(event) {
      const data = event.data;
      if (data.id !== id) return;
      if (data.type === "progress") {
        onStatus(
          "Cコンパイラを読み込み中… " + Math.round(data.progress * 100) + "%",
        );
      } else if (data.type === "ready") {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          cleanup();
          stopWorker();
          reject(
            new Error(
              "実行が時間切れになりました。無限ループがないか確認してください。",
            ),
          );
        }, 20000);
        onStatus("コンパイルして実行中…");
      } else if (data.type === "result") {
        cleanup();
        resolve(data);
      } else if (data.type === "error") {
        cleanup();
        reject(new Error(data.message));
      }
    }
    activeWorker.addEventListener("message", onMessage);
    activeWorker.addEventListener("error", onError);
    activeWorker.postMessage({ id, code });
  });
}

function setAllRunButtonsDisabled(disabled) {
  for (const button of document.querySelectorAll(".run-btn"))
    button.disabled = disabled;
}

for (const exercise of document.querySelectorAll(".exercise")) {
  const key =
    "keisanki2026:" +
    (lesson === "lesson01" ? "" : `${lesson}:`) +
    exercise.dataset.exercise;
  const editor = exercise.querySelector(".editor");
  const gutter = exercise.querySelector(".gutter");
  const status = exercise.querySelector(".status");
  const output = exercise.querySelector(".output");
  const outputText = output.querySelector("pre");
  const exitCode = output.querySelector(".exit-code");
  const saveNote = document.createElement("div");
  saveNote.className = "save-note";
  saveNote.setAttribute("role", "status");
  saveNote.setAttribute("aria-live", "polite");
  editor.closest(".editor-wrap").insertAdjacentElement("afterend", saveNote);
  const updateGutter = () => {
    const count = Math.max(8, editor.value.split("\n").length);
    gutter.innerHTML = Array.from(
      { length: count },
      (_, index) => index + 1,
    ).join("<br>");
    gutter.scrollTop = editor.scrollTop;
  };
  try {
    const saved = localStorage.getItem(key);
    editor.value = saved || "";
    saveNote.textContent = saved
      ? "前回の入力を復元しました · この端末に保存"
      : "入力内容はこの端末に自動保存されます";
  } catch {
    saveNote.textContent =
      "自動保存を利用できません。ブラウザの保存設定を確認してください。";
    saveNote.classList.add("save-error");
  }
  updateGutter();
  editor.addEventListener("input", () => {
    updateGutter();
    output.hidden = true;
    try {
      localStorage.setItem(key, editor.value);
      saveNote.textContent = editor.value
        ? "この端末に保存済み"
        : "入力内容はこの端末に自動保存されます";
      saveNote.classList.remove("save-error");
    } catch {
      saveNote.textContent =
        "自動保存できません。ブラウザの保存設定を確認してください。";
      saveNote.classList.add("save-error");
    }
  });
  editor.addEventListener("scroll", () => {
    gutter.scrollTop = editor.scrollTop;
  });
  const blockPaste = (event) => {
    event.preventDefault();
    status.textContent =
      "貼り付けは受け付けません。キーボードで入力してください。";
    status.classList.add("error");
  };
  editor.addEventListener("paste", blockPaste);
  editor.addEventListener("drop", blockPaste);
  editor.addEventListener("beforeinput", (event) => {
    if (
      event.inputType === "insertFromPaste" ||
      event.inputType === "insertFromDrop"
    )
      blockPaste(event);
  });
  editor.addEventListener("contextmenu", (event) => event.preventDefault());
  editor.addEventListener("keydown", (event) => {
    if (
      ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") ||
      (event.shiftKey && event.key === "Insert")
    ) {
      blockPaste(event);
    } else if (event.key === "Tab") {
      event.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.setRangeText("    ", start, end, "end");
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  exercise.querySelector(".run-btn").addEventListener("click", async () => {
    if (running) return;
    if (!editor.value.trim()) {
      status.textContent = "まずコードを入力してください。";
      status.classList.add("error");
      editor.focus();
      return;
    }
    running = true;
    setAllRunButtonsDisabled(true);
    output.hidden = true;
    status.classList.remove("error");
    status.textContent = "Cコンパイラを準備中…";
    const codeAtRun = editor.value;
    try {
      const result = await runC(codeAtRun, (message) => {
        status.textContent = message;
      });
      if (editor.value !== codeAtRun) {
        status.textContent =
          "実行中にコードが変わりました。もう一度実行してください。";
        status.classList.add("error");
        return;
      }
      const failed = result.exitCode === null || result.exitCode !== 0;
      const diagnostics = Array.isArray(result.errors)
        ? result.errors.join("\n")
        : "";
      outputText.textContent = failed
        ? diagnostics ||
          result.output ||
          result.stderr ||
          "実行できませんでした。"
        : result.output || "（出力なし）";
      exitCode.textContent = failed
        ? "終了コード: " + (result.exitCode ?? "コンパイルエラー")
        : "終了コード: 0";
      output.hidden = false;
      if (failed) {
        status.textContent = "エラーを確認して直してみましょう。";
        status.classList.add("error");
      } else if (
        lesson === "lesson01" &&
        exercise.dataset.exercise === "task3" &&
        result.stdout.trimEnd() === "  *\n ***\n*****"
      ) {
        status.textContent = "山形模様が表示できました。";
      } else {
        status.textContent = "実行できました。出力を確認してください。";
      }
    } catch (error) {
      status.textContent = error.message;
      status.classList.add("error");
    } finally {
      running = false;
      setAllRunButtonsDisabled(false);
    }
  });
}

const exportForm = document.querySelector("#export-form");
exportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = exportForm.querySelector(".export-btn");
  const status = document.querySelector("#export-status");
  const attendanceNumber = document
    .querySelector("#attendance-number")
    .value.trim();
  const studentName = document.querySelector("#student-name").value.trim();
  if (!attendanceNumber || !studentName) return;

  button.disabled = true;
  status.classList.remove("error");
  status.textContent = "HTMLファイルを作成中…";
  try {
    const { blob, filename } = await createSubmissionFile({
      attendanceNumber,
      studentName,
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    status.textContent = "HTMLファイルのダウンロードを開始しました。";
  } catch (error) {
    status.textContent =
      "保存ファイルを作れませんでした。もう一度試してください。";
    status.classList.add("error");
    console.error(error);
  } finally {
    button.disabled = false;
  }
});
