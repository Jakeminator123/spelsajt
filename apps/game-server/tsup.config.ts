import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: false,
  entry: ["src/start.ts"],
  format: ["esm"],
  noExternal: [/^@spelsajt\//],
  outDir: "dist",
  platform: "node",
  sourcemap: true,
  splitting: false,
  target: "node24",
});
