import { createHash, randomBytes } from "node:crypto";
import {
  readFile,
  writeFile,
  mkdir,
  rename,
  unlink,
  stat,
} from "node:fs/promises";
import { join } from "node:path";
import { renderLesson } from "./generate.mjs";
import { applyFieldChanges } from "./editor-fields.mjs";

const revision = (source) => createHash("sha256").update(source).digest("hex");
const fail = (status, message) => Object.assign(new Error(message), { status });

export function createLessonStore(root) {
  const queues = new Map();
  async function load(slug) {
    if (!/^lesson\d+$/.test(slug)) throw fail(404, "教材が見つかりません。");
    const path = join(root, "content", `${slug}.md`);
    let raw;
    try {
      raw = await readFile(path, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") throw fail(404, "教材が見つかりません。");
      throw error;
    }
    const template = await readFile(join(root, "templates/page.html"), "utf8");
    const model = renderLesson(raw, template, `${slug}.md`, { editable: true });
    return { ...model, slug, revision: revision(raw), raw, path, template };
  }
  function publicModel(model) {
    const { html, fields, samples, source, slug, revision, meta } = model;
    return { html, fields, samples, source, slug, revision, title: meta.title };
  }
  async function saveNow(slug, request) {
    const current = await load(slug);
    if (request.revision !== current.revision)
      throw fail(
        409,
        "Zedなどで原稿が変更されています。上書きせず、編集内容を保持しています。",
      );
    let candidate;
    try {
      candidate = applyFieldChanges(
        current.source,
        current.fields,
        request.changes,
      );
      const result = renderLesson(candidate, current.template, `${slug}.md`, {
        editable: true,
      });
      if (
        JSON.stringify(result.sectionIds) !==
          JSON.stringify(current.sectionIds) ||
        JSON.stringify(result.exerciseIds) !==
          JSON.stringify(current.exerciseIds)
      )
        throw new Error(
          "見出しIDや演習IDを変更する編集は、この画面では保存できません。",
        );
    } catch (error) {
      throw fail(422, error.message);
    }
    if (candidate === current.source) return publicModel(current);
    const raw = current.raw.includes("\r\n")
      ? candidate.replace(/\n/g, "\r\n")
      : candidate;
    const backupDir = join(root, ".local", "author-backups");
    await mkdir(backupDir, { recursive: true });
    await writeFile(
      join(
        backupDir,
        `${slug}-${Date.now()}-${current.revision.slice(0, 10)}.md`,
      ),
      current.raw,
    );
    const temporary = `${current.path}.${randomBytes(6).toString("hex")}.tmp`;
    try {
      await writeFile(temporary, raw, {
        flag: "wx",
        mode: (await stat(current.path)).mode,
      });
      if (revision(await readFile(current.path, "utf8")) !== current.revision)
        throw fail(
          409,
          "保存中に原稿が変更されました。編集内容を保持しています。",
        );
      await rename(temporary, current.path);
    } finally {
      await unlink(temporary).catch(() => {});
    }
    return publicModel(await load(slug));
  }
  return {
    load: async (slug) => publicModel(await load(slug)),
    save(slug, request) {
      const task = (queues.get(slug) || Promise.resolve())
        .catch(() => {})
        .then(() => saveNow(slug, request));
      queues.set(slug, task);
      task
        .finally(() => {
          if (queues.get(slug) === task) queues.delete(slug);
        })
        .catch(() => {});
      return task;
    },
  };
}

function isLocalRequest(request) {
  const addresses = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
  if (!addresses.includes(request.socket.remoteAddress)) return false;
  const origin = `http://${request.headers.host}`;
  let host;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) return false;
  if (request.headers.origin && request.headers.origin !== origin) return false;
  return request.headers["sec-fetch-site"] !== "cross-site";
}

export function lessonEditorPlugin(root) {
  const store = createLessonStore(root);
  const token = randomBytes(32).toString("hex");
  return {
    name: "local-lesson-editor",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url, "http://localhost").pathname;
        if (!pathname.startsWith("/__editor")) return next();
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("X-Frame-Options", "DENY");
        const json = (status, body) => {
          response.statusCode = status;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify(body));
        };
        try {
          if (!isLocalRequest(request))
            throw fail(403, "編集画面はこのPCから開いてください。");
          const api = pathname.match(/^\/__editor\/api\/(lesson\d+)$/);
          const page = pathname.match(/^\/__editor(?:\/(lesson\d+))?\/?$/);
          if (api && request.method === "GET") {
            return json(200, { ...(await store.load(api[1])), token });
          }
          if (api && request.method === "POST") {
            if (
              request.headers["x-lesson-editor-token"] !== token ||
              !request.headers["content-type"]?.startsWith("application/json")
            )
              throw fail(403, "編集画面を開き直してください。");
            const chunks = [];
            let size = 0;
            for await (const chunk of request) {
              const buffer = Buffer.isBuffer(chunk)
                ? chunk
                : Buffer.from(chunk);
              size += buffer.length;
              if (size > 2_000_000) throw fail(413, "編集内容が長すぎます。");
              chunks.push(buffer);
            }
            let parsed;
            try {
              parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            } catch {
              throw fail(400, "保存データが不正です。");
            }
            if (!parsed || typeof parsed !== "object")
              throw fail(400, "保存データが不正です。");
            return json(200, { ...(await store.save(api[1], parsed)), token });
          }
          if (page && request.method === "GET") {
            const source = await readFile(
              join(root, "author/index.html"),
              "utf8",
            );
            const html = await server.transformIndexHtml(pathname, source);
            response.setHeader("Content-Type", "text/html; charset=utf-8");
            response.end(html);
            return;
          }
          throw fail(404, "編集画面が見つかりません。");
        } catch (error) {
          json(error.status || 500, { error: error.message });
        }
      });
    },
  };
}
