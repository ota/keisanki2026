import "../src/style.css";
import "./style.css";
import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  schema,
  MarkdownParser,
  defaultMarkdownParser,
  defaultMarkdownSerializer,
} from "prosemirror-markdown";
import { baseKeymap, chainCommands, toggleMark } from "prosemirror-commands";
import {
  wrapInList,
  splitListItem,
  sinkListItem,
  liftListItem,
} from "prosemirror-schema-list";
import { history, undo, redo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { drawSample } from "../src/sample.js";
import { applyFieldChanges } from "../scripts/editor-fields.mjs";

const slug = location.pathname.match(/\/(lesson\d+)\/?$/)?.[1] || "lesson01";
const api = `/__editor/api/${slug}`;
const draftKey = `keisanki-author:${slug}`;
const page = document.querySelector("#author-page");
const saveButton = document.querySelector("#author-save");
const status = document.querySelector("#author-status");
const notice = document.querySelector("#author-notice");
const message = document.querySelector("#author-message");
const codeDialog = document.querySelector("#author-code-dialog");
const codeInput = document.querySelector("#author-code-input");
const toolbar = document.querySelector(".author-toolbar");
const inlineSchema = new Schema({
  nodes: schema.spec.nodes
    .update("doc", { content: "paragraph" })
    .update("paragraph", {
      ...schema.spec.nodes.get("paragraph"),
      toDOM: () => ["span", 0],
    }),
  marks: schema.spec.marks,
});
const inlineParser = new MarkdownParser(
  inlineSchema,
  defaultMarkdownParser.tokenizer,
  defaultMarkdownParser.tokens,
);
let model;
let changes = new Map();
let views = [];
let activeView;
let activeInline = false;
let activeCode;
let saving = false;
let stale = false;
let storageFailed = false;

function announce(text) {
  message.textContent = text;
  notice.hidden = false;
}
function updateStatus(text) {
  status.textContent =
    text ||
    (saving
      ? "保存中…"
      : stale
        ? "原稿に外部変更があります"
        : changes.size
          ? "未保存の変更があります"
          : "保存済み");
  saveButton.disabled = saving || stale || changes.size === 0;
}
function persistDraft() {
  try {
    if (changes.size) {
      const { token, ...snapshot } = model;
      localStorage.setItem(
        draftKey,
        JSON.stringify({ model: snapshot, changes: [...changes], scrollY }),
      );
    } else localStorage.removeItem(draftKey);
  } catch {
    if (!storageFailed)
      announce(
        "ブラウザに下書きを保持できません。「原稿を保存」で保存してください。",
      );
    storageFailed = true;
  }
}
function setChange(field, value) {
  if (value === field.value) changes.delete(field.key);
  else changes.set(field.key, value);
  page
    .querySelector(`[data-author-field="${field.key}"]`)
    ?.classList.toggle("is-dirty", changes.has(field.key));
  persistDraft();
  updateStatus();
}
function command(name) {
  if (!activeView) return undefined;
  const activeSchema = activeView.state.schema;
  return {
    bold: toggleMark(activeSchema.marks.strong),
    code: toggleMark(activeSchema.marks.code),
    list: activeInline
      ? undefined
      : chainCommands(
          liftListItem(activeSchema.nodes.list_item),
          wrapInList(activeSchema.nodes.bullet_list),
        ),
    indent: activeInline
      ? undefined
      : sinkListItem(activeSchema.nodes.list_item),
    outdent: activeInline
      ? undefined
      : liftListItem(activeSchema.nodes.list_item),
    undo,
    redo,
  }[name];
}
function updateToolbar() {
  for (const button of document.querySelectorAll("[data-command]")) {
    const run = command(button.dataset.command);
    button.disabled = saving || !activeView || !run || !run(activeView.state);
  }
}
function mountField(field) {
  const host = page.querySelector(`[data-author-field="${field.key}"]`);
  if (!host) return;
  const isInline = field.kind === "inline";
  const parser = isInline ? inlineParser : defaultMarkdownParser;
  const originalDoc = parser.parse(field.value);
  const initialDoc = parser.parse(changes.get(field.key) ?? field.value);
  const firstClass = host.firstElementChild?.className;
  host.replaceChildren();
  const mount = document.createElement(isInline ? "span" : "div");
  host.append(mount);
  let view;
  const state = EditorState.create({
    doc: initialDoc,
    plugins: [
      history(),
      keymap({
        "Mod-z": undo,
        "Mod-y": redo,
        "Shift-Mod-z": redo,
        "Mod-b": toggleMark(initialDoc.type.schema.marks.strong),
        Enter: isInline
          ? () => true
          : chainCommands(
              splitListItem(schema.nodes.list_item),
              baseKeymap.Enter,
            ),
        "Shift-Enter": isInline
          ? () => true
          : (state, dispatch) => {
              dispatch?.(
                state.tr.replaceSelectionWith(schema.nodes.hard_break.create()),
              );
              return true;
            },
        Tab: isInline ? () => false : sinkListItem(schema.nodes.list_item),
        "Shift-Tab": isInline
          ? () => false
          : liftListItem(schema.nodes.list_item),
      }),
      keymap(baseKeymap),
    ],
  });
  view = new EditorView(
    { mount },
    {
      state,
      attributes: {
        "aria-label": isInline ? "教材の文章" : "教材の文章・箇条書き",
        role: "textbox",
        "aria-multiline": String(!isInline),
      },
      dispatchTransaction(transaction) {
        view.updateState(view.state.apply(transaction));
        if (firstClass && view.dom.firstElementChild)
          view.dom.firstElementChild.className = firstClass;
        if (transaction.docChanged) {
          const value = view.state.doc.eq(originalDoc)
            ? field.value
            : defaultMarkdownSerializer.serialize(view.state.doc);
          setChange(field, value);
        }
        updateToolbar();
      },
      handleDOMEvents: {
        focus() {
          activeView = view;
          activeInline = isInline;
          updateToolbar();
          return false;
        },
      },
      handleClick(_view, _pos, event) {
        if (event.target.closest("a")) {
          event.preventDefault();
          return true;
        }
        return false;
      },
    },
  );
  if (firstClass && view.dom.firstElementChild)
    view.dom.firstElementChild.className = firstClass;
  host.classList.toggle("is-dirty", changes.has(field.key));
  views.push(view);
}

function drawSamples() {
  for (const field of model.fields.filter(({ kind }) => kind === "code")) {
    const canvas = page.querySelector(
      `[data-exercise="${field.exercise}"] .sample-canvas`,
    );
    drawSample(canvas, (changes.get(field.key) ?? field.value).split("\n"));
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "button");
    canvas.setAttribute("aria-label", `${field.filename} の見本コードを編集`);
    canvas.onclick = () => openCode(field);
    canvas.onkeydown = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openCode(field);
      }
    };
  }
}
function openCode(field) {
  if (saving) return;
  activeCode = field;
  codeInput.value = changes.get(field.key) ?? field.value;
  document.querySelector("#author-code-title").textContent = field.filename;
  codeDialog.showModal();
  codeInput.focus();
}
function displayModel(nextModel, nextChanges = new Map()) {
  const y = scrollY;
  codeDialog.close();
  activeCode = undefined;
  for (const view of views) view.destroy();
  views = [];
  activeView = undefined;
  model = nextModel;
  changes = nextChanges;
  const html = new DOMParser().parseFromString(model.html, "text/html");
  page.replaceChildren(html.querySelector(".shell"));
  document.title = `教材編集 — ${model.title}`;
  for (const control of page.querySelectorAll(
    "input, textarea, button.run-btn, button.export-btn",
  ))
    control.disabled = true;
  for (const field of model.fields)
    if (field.kind !== "code") mountField(field);
  for (const button of page.querySelectorAll("[data-author-code]")) {
    button.addEventListener("click", () =>
      openCode(
        model.fields.find(({ key }) => key === button.dataset.authorCode),
      ),
    );
  }
  document.querySelector("#student-preview").href =
    slug === "lesson01" ? "/" : `/${slug}.html`;
  document.querySelector("#student-preview").title =
    "原稿を保存した後の学生用ページを開きます";
  drawSamples();
  updateToolbar();
  updateStatus();
  requestAnimationFrame(() => scrollTo(0, y));
}
async function getLatest() {
  const response = await fetch(api, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}
async function save() {
  if (saving || stale || !changes.size) return;
  saving = true;
  codeDialog.close();
  for (const view of views) view.setProps({ editable: () => false });
  updateStatus();
  updateToolbar();
  try {
    const response = await fetch(api, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Lesson-Editor-Token": model.token,
      },
      body: JSON.stringify({
        revision: model.revision,
        changes: [...changes].map(([key, value]) => ({ key, value })),
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 409) stale = true;
      throw new Error(data.error);
    }
    notice.hidden = true;
    displayModel(data);
    persistDraft();
  } catch (error) {
    announce(
      error.message || "保存できませんでした。編集内容は保持しています。",
    );
  } finally {
    saving = false;
    for (const view of views) view.setProps({ editable: () => true });
    updateStatus();
    updateToolbar();
  }
}
saveButton.addEventListener("click", save);
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    save();
  }
});
for (const button of document.querySelectorAll("[data-command]")) {
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => {
    const run = command(button.dataset.command);
    if (run && activeView) {
      run(activeView.state, activeView.dispatch, activeView);
      activeView.focus();
      updateToolbar();
    }
  });
}
codeInput.addEventListener("input", () => {
  setChange(activeCode, codeInput.value);
  drawSamples();
});
codeInput.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    event.preventDefault();
    codeInput.setRangeText(
      "    ",
      codeInput.selectionStart,
      codeInput.selectionEnd,
      "end",
    );
    codeInput.dispatchEvent(new Event("input"));
  }
});
document
  .querySelector("#author-code-close")
  .addEventListener("click", () => codeDialog.close());
document.querySelector("#author-download").addEventListener("click", () => {
  if (!model) return;
  const source = applyFieldChanges(
    model.source,
    model.fields,
    [...changes].map(([key, value]) => ({ key, value })),
  );
  const url = URL.createObjectURL(
    new Blob([source], { type: "text/markdown;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slug}-edited.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
});
document.querySelector("#author-reload").addEventListener("click", async () => {
  if (
    changes.size &&
    !confirm(
      "手元の未保存の編集を破棄し、最新の原稿を読み込みますか？ 必要なら先に編集中の原稿を書き出してください。",
    )
  )
    return;
  try {
    const latest = await getLatest();
    stale = false;
    notice.hidden = true;
    displayModel(latest);
    persistDraft();
  } catch (error) {
    announce(error.message);
  }
});
window.addEventListener("beforeunload", (event) => {
  if (!changes.size) return;
  persistDraft();
  event.preventDefault();
  event.returnValue = "";
});
new ResizeObserver(() => {
  document.documentElement.style.setProperty(
    "--author-toolbar-height",
    `${toolbar.offsetHeight}px`,
  );
}).observe(toolbar);
window.addEventListener("resize", () => {
  if (model) drawSamples();
});
if (import.meta.hot) {
  import.meta.hot.on("lesson-updated", async ({ slug: changedSlug }) => {
    if (slug !== changedSlug || saving) return;
    try {
      const latest = await getLatest();
      if (latest.revision === model.revision) return;
      if (changes.size) {
        stale = true;
        updateStatus();
        announce(
          "Zedなどで原稿が変更されています。編集内容を書き出してから、最新の原稿を読み込んでください。",
        );
      } else {
        stale = false;
        displayModel(latest);
      }
    } catch (error) {
      announce(error.message);
    }
  });
}

try {
  const latest = await getLatest();
  let draft;
  try {
    draft = JSON.parse(localStorage.getItem(draftKey));
  } catch {
    /* No draft. */
  }
  if (
    draft?.model?.slug === slug &&
    Array.isArray(draft.changes) &&
    draft.changes.length
  ) {
    stale = draft.model.revision !== latest.revision;
    displayModel(
      { ...draft.model, token: latest.token },
      new Map(draft.changes),
    );
    announce(
      stale
        ? "未保存の編集を復元しました。原稿にも変更があるため、上書きせず保持しています。"
        : "前回の未保存の編集を復元しました。",
    );
    requestAnimationFrame(() => scrollTo(0, draft.scrollY || 0));
  } else displayModel(latest);
} catch (error) {
  updateStatus("読み込めませんでした");
  announce(error.message);
}
