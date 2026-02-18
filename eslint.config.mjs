import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // ✅ Ignore build & dependency folders
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "dist/**",
      "build/**",
      "out/**",
    ],
  },

  // ✅ Extend Next.js defaults
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // ✅ Relax rules that cause massive failures
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
      "react/no-unescaped-entities": "off",
    },
  },
];

export default eslintConfig;
