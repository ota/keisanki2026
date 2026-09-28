import { createCompiler } from "@live-codes/clang-wasm";

let compiler;

self.onmessage = async (event) => {
  const { id, code } = event.data;
  try {
    if (!compiler) {
      compiler = await createCompiler("c", {
        baseUrl: new URL(
          import.meta.env.BASE_URL + "clang/",
          self.location.origin,
        ),
        std: "gnu17",
        onProgress: (progress) =>
          self.postMessage({ id, type: "progress", progress }),
      });
    }
    self.postMessage({ id, type: "ready" });
    const result = await compiler.run(code, "", {
      compileArgs: ["-Wall", "-Wextra"],
    });
    self.postMessage({
      id,
      type: "result",
      stdout: result.stdout,
      stderr: result.stderr,
      output: result.output,
      errors: result.errors,
      exitCode: result.exitCode,
    });
  } catch (error) {
    self.postMessage({
      id,
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
