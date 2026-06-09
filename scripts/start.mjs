import { loadDotenv } from "./env.mjs";

loadDotenv();

await import("../build/index.js");
