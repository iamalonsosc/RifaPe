import js from "@eslint/js";
import ts from "typescript-eslint";
import globals from "globals";
export default [
  { ignores: ["dist/**", "test-results/**", "node_modules/**"] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
];
