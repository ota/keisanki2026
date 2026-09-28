import { defineConfig } from "vite";
import { basename, join } from "node:path";
import { generateAll } from "./scripts/generate.mjs";

export default defineConfig(async () => {
  const pages = await generateAll();
  return {
    plugins: [
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
              server.ws.send({ type: "full-reload" });
            } catch (error) {
              server.ws.send({
                type: "error",
                err: { message: error.message, stack: error.stack },
              });
            }
          });
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
