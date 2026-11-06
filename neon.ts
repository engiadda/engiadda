import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  functions: {
    jobs: {
      name: "EngiAdda Jobs API",
      source: "./functions/jobs.js",
    },
  },
});
