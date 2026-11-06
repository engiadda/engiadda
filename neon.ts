import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  functions: {
    jobs: {
      name: "EngiAdda Jobs API",
      source: "./functions/jobs.js",
      env: {
        WEBSITE_WEBHOOK_TOKEN: process.env.WEBSITE_WEBHOOK_TOKEN!,
      },
    },
  },
});
