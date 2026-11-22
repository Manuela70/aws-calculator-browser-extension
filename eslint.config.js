import js from "@eslint/js";
import globals from "globals";

// Reglas de seguridad compartidas (NFR5.4, C6): sin código dinámico, sin
// inserción de HTML y sin red propia en el skeleton (NFR5.1).
const restrictedGlobals = [
  { name: "fetch", message: "El skeleton no hace llamadas de red propias (NFR5.1)." },
];
const restrictedProperties = [
  { object: "window", property: "fetch", message: "Sin red propia (NFR5.1)." },
  { object: "globalThis", property: "fetch", message: "Sin red propia (NFR5.1)." },
];

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
  "no-restricted-globals": ["error", ...restrictedGlobals],
  "no-restricted-properties": ["error", ...restrictedProperties],
  "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
};

// Capa de mapeo de U3 (NFR4.1, NFR5.1): corre en el content script y su única
// salida es el puerto inyectado. Extiende las listas base (sin reemplazarlas).
const mappingRules = {
  "no-restricted-globals": [
    "error",
    ...restrictedGlobals,
    { name: "XMLHttpRequest", message: "La capa de mapeo no hace red propia (NFR4.1)." },
  ],
  "no-restricted-properties": [
    "error",
    ...restrictedProperties,
    { object: "self", property: "fetch", message: "Sin red propia (NFR4.1)." },
    { object: "window", property: "XMLHttpRequest", message: "Sin red propia (NFR4.1)." },
    {
      object: "chrome",
      property: "storage",
      message: "La capa de mapeo no persiste nada (NFR4.1).",
    },
  ],
};

// lib/input/** (U2) es lógica pura: extiende las reglas base y además prohíbe
// red propia y APIs chrome.* (u2 NFR4.1). fetch ya viene de la lista base.
const inputRules = {
  ...securityRules,
  "no-restricted-globals": [
    ...securityRules["no-restricted-globals"],
    { name: "XMLHttpRequest", message: "lib/input no hace red propia (u2 NFR4.1)." },
    { name: "chrome", message: "lib/input no usa APIs chrome.* (u2 NFR4.1)." },
  ],
};

// El cerebro (brain/) y su IaC (infra/) corren en Node, fuera del bundle de la
// extensión: sí hacen red propia (Bedrock, JWKS, Cognito), así que no heredan la
// restricción de fetch, pero mantienen el resto de las reglas de seguridad.
const serverSecurityRules = Object.fromEntries(
  Object.entries(securityRules).filter(
    ([name]) => name !== "no-restricted-globals" && name !== "no-restricted-properties",
  ),
);

export default [
  {
    ignores: [
      "**/node_modules/**",
      "coverage/**",
      "aidlc/**",
      ".claude/**",
      ".kiro/**",
      ".aidlc/**",
      "infra/cdk.out/**",
    ],
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
    files: ["aws-calculator-extension/lib/mapping/**/*.js"],
    rules: mappingRules,
  },
  {
    // content.js es un script clásico (los content scripts del manifest no
    // pueden ser módulos); carga lib/content-main.js con import() dinámico.
    files: ["aws-calculator-extension/content.js"],
    languageOptions: { sourceType: "script" },
  },
  {
    files: ["aws-calculator-extension/lib/input/**/*.js"],
    rules: inputRules,
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
  {
    files: ["brain/**/*.{js,mjs}", "infra/**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: serverSecurityRules,
  },
];
