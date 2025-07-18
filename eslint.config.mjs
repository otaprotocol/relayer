import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      "**/*.test.ts",
      "**/*.test.js", 
      "**/*.test.tsx",
      "**/*.test.jsx",
      "**/__tests__/**",
      "**/tests/**",
      "**/test/**",
      "**/coverage/**",
      "**/node_modules/**",
      ".next/**",
      "out/**",
      "dist/**",
      "build/**"
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

export default eslintConfig;
