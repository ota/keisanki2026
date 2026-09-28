import { defineConfig } from "vite";
import { basename, join, relative } from "node:path";
import { generateAll } from "./scripts/generate.mjs";
import { lessonEditorPlugin } from "./scripts/author-server.mjs";

export default defineConfig(async () => {
  const pages = await generateAll();
  return {
    // Generated HTML is refreshed through lesson-updated. Vite's default
    // index.html reload also reloads the author page and interrupts editing.
    server: {
      watch: {
        ignored: [
          (path) =>
            /^(?:index|lesson\d+)\.html$/.test(
              relative(import.meta.dirname, path),
            ),
        ],
      },
    },
    plugins: [
      lessonEditorPlugin(import.meta.dirname),
      {
        name: "lesson-markdown",
        configureServer(server) {
          const contentDir = join(import.meta.dirname, "content");
          server.watcher.add(contentDir);
          server.watcher.on("change", async (path) => {
            if (
              !/^lesson\d+\.md$/.test(basename(path)) ||
              !path.startsWith(contentDir)
            )
              return;
            try {
              await generateAll();
              const slug = basename(path, ".md");
              const samplePath = join(
                import.meta.dirname,
                "src/generated",
                `${slug}-samples.js`,
              );
              for (const module of server.moduleGraph.getModulesByFile(
                samplePath,
              ) || [])
                server.moduleGraph.invalidateModule(module);
              server.ws.send({
                type: "custom",
                event: "lesson-updated",
                data: { slug },
              });
            } catch (error) {
              server.ws.send({
                type: "error",
                err: { message: error.message, stack: error.stack },
              });
            }
          });
        },
        handleHotUpdate({ file, modules, server, timestamp }) {
          if (file.startsWith(join(import.meta.dirname, "src/generated/"))) {
            for (const module of modules)
              server.moduleGraph.invalidateModule(
                module,
                new Set(),
                timestamp,
                true,
              );
            return [];
          }
        },
      },
    ],
    build: {
      rollupOptions: {
        input: Object.fromEntries(
          pages.map((path) => [basename(path, ".html"), path]),
        ),
      },
    },
  };
});
