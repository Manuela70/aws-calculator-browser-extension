import js from "@eslint/js";
import globals from "globals";

// Reglas de seguridad compartidas (NFR5.4, C6): sin código dinámico, sin
// inserción de HTML y sin red propia en el skeleton (NFR5.1).
const securityRules = {
  "no-empty": ["error", { allowEmptyCatch: false }],
  "no-eval": "error",
  "no-implied-eval": "error",
  "no-new-func": "error",
  "no-restricted-syntax": [
    "error",
    {
      selector: "MemberExpression[property.name=/^(innerHTML|outerHTML|insertAdjacentHTML)$/]",
      message: "Prohibido insertar HTML: usar textContent o createElement (NFR5.4).",
    },
    {
      selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
      message: "Prohibido insertAdjacentHTML (NFR5.4).",
    },
  ],
  "no-restricted-globals": [
    "error",
    { name: "fetch", message: "El skeleton no hace llamadas de red propias (NFR5.1)." },
  ],
  "no-restricted-properties": [
    "error",
    { object: "window", property: "fetch", message: "Sin red propia (NFR5.1)." },
    { object: "globalThis", property: "fetch", message: "Sin red propia (NFR5.1)." },
  ],
  "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
};

export default [
  {
    ignores: ["node_modules/**", "coverage/**", "aidlc/**", ".claude/**", ".kiro/**"],
  },
  js.configs.recommended,
  {
    files: ["aws-calculator-extension/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, chrome: "readonly" },
    },
    rules: securityRules,
  },
  {
    // content.js es un script clásico (los content scripts del manifest no
    // pueden ser módulos); carga lib/content-main.js con import() dinámico.
    files: ["aws-calculator-extension/content.js"],
    languageOptions: { sourceType: "script" },
  },
  {
    files: ["tests/**/*.js", "scripts/**/*.js", "*.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: securityRules,
  },
];
