import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./pruebas/interfaz",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4178",
    channel: process.env.CANAL_NAVEGADOR || undefined,
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4178 --strictPort",
    url: "http://127.0.0.1:4178",
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: "https://pruebas.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "clave-publica-de-prueba",
    },
  },
});
