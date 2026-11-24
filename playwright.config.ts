import { defineConfig } from "@playwright/test";
const puerto = Number(process.env.PUERTO_PRUEBAS || 4178);
const baseURL = `http://127.0.0.1:${puerto}`;
export default defineConfig({
  testDir: "./pruebas/interfaz",
  workers: 1,
  use: {
    baseURL,
    channel: process.env.CANAL_NAVEGADOR || undefined,
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${puerto} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: "https://pruebas.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "clave-publica-de-prueba",
    },
  },
});
