import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  build: {
    lib: {
      entry: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      formats: ["es"],
      fileName: () => "haruki-3d-engine.js",
    },
    rollupOptions: {
      external: ["three", "@pixiv/three-vrm"],
      output: {
        globals: {
          three: "THREE",
          "@pixiv/three-vrm": "THREE_VRM",
        },
      },
    },
  },
});
