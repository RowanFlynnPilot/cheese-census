import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves the project at /cheese-census/. Override with
// BASE_PATH=/ when serving from a domain root.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/cheese-census/",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
});
