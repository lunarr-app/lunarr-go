import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit({ preprocess: vitePreprocess(), adapter: adapter() })],
  server: { watch: { ignored: ["**/.playwright-cli/**"] } },
});
