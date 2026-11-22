import js from "@eslint/js";
import globals from "globals";
import { BUTTON_TEXTS } from "./aws-calculator-extension/lib/dom/selectors.js";

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

// Código del content script de U5 (content.js, lib/dom/**, lib/rpa/**,
// lib/mapping/**): NFR4.1 (sin red propia) y NFR5.1 (sin chrome.storage), más
// document.write (NFR5.2). En flat config un bloque posterior REEMPLAZA las
// opciones de una regla: por eso se extienden las listas base, nunca se
// redefinen desde cero (cicd-pipeline.md de U5).
const contentScriptGlobals = [
  ...restrictedGlobals,
  { name: "XMLHttpRequest", message: "El content script no hace red propia (NFR4.1)." },
  { name: "WebSocket", message: "El content script no hace red propia (NFR4.1)." },
  { name: "EventSource", message: "El content script no hace red propia (NFR4.1)." },
];
const contentScriptProperties = [
  ...restrictedProperties,
  { object: "self", property: "fetch", message: "Sin red propia (NFR4.1)." },
  { object: "window", property: "XMLHttpRequest", message: "Sin red propia (NFR4.1)." },
  {
    object: "chrome",
    property: "storage",
    message: "El content script no usa chrome.storage (NFR5.1).",
  },
  { object: "document", property: "write", message: "Prohibido document.write (NFR5.2)." },
];
const contentScriptRules = {
  "no-restricted-globals": ["error", ...contentScriptGlobals],
  "no-restricted-properties": ["error", ...contentScriptProperties],
};

// Zona A de U5 (NFR7.1): lógica pura que no toca document ni chrome y no
// importa nada de la Zona B.
const ZONE_B_MODULES =
  "(^|/)(dom-utils|dom-resolver|form-scanner|selectors|spotlight|content-main)\\.js$";
const zoneARules = {
  "no-restricted-globals": [
    "error",
    ...contentScriptGlobals,
    { name: "document", message: "La Zona A no toca el DOM (NFR7.1)." },
    { name: "chrome", message: "La Zona A no usa APIs chrome.* (NFR7.1)." },
  ],
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        { regex: ZONE_B_MODULES, message: "La Zona A no importa módulos de la Zona B (NFR7.1)." },
      ],
    },
  ],
};

// NFR2.1 / BR3.5: clases de CloudScape y textos de botón de calculator.aws solo
// en lib/dom/selectors.js. Los textos salen del propio BUTTON_TEXTS.
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const buttonTexts = [...new Set(Object.values(BUTTON_TEXTS).flat())];
const BUTTON_TEXT_SELECTOR = `Literal[value=/^(${buttonTexts.map(escapeRegex).join("|")})$/]`;
const selectorSyntax = [
  {
    selector: "Literal[raw=/awsui_/]",
    message: "Las clases de CloudScape viven solo en lib/dom/selectors.js (NFR2.1).",
  },
  {
    selector: "TemplateElement[value.raw=/awsui_/]",
    message: "Las clases de CloudScape viven solo en lib/dom/selectors.js (NFR2.1).",
  },
  {
    selector: BUTTON_TEXT_SELECTOR,
    message: "Los textos de botón de calculator.aws viven solo en lib/dom/selectors.js (NFR2.1).",
  },
];

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

// Service worker (U7, NFR5.2, NFR5.3): extiende las listas base. Sin
// chrome.storage.local ni chrome.storage.sync directos (el token vive en
// storage.session); fetch solo en sw/brain-client.js y sw/auth-flow.js.
const storageSelectors = [
  {
    selector:
      "MemberExpression[object.object.name='chrome'][object.property.name='storage'][property.name=/^(local|sync)$/]",
    message:
      "El service worker no usa chrome.storage.local/sync: el token vive en storage.session (NFR5.2).",
  },
];
const serviceWorkerRules = {
  "no-restricted-syntax": [
    ...securityRules["no-restricted-syntax"],
    ...storageSelectors,
    ...selectorSyntax,
  ],
};
// En flat config una regla con solo severidad conserva las opciones previas: si la
// lista base sin fetch queda vacía, la regla se apaga para esos dos archivos.
const networkGlobals = restrictedGlobals.filter((entry) => entry.name !== "fetch");
const serviceWorkerNetworkRules = {
  "no-restricted-globals": networkGlobals.length > 0 ? ["error", ...networkGlobals] : "off",
};

// Adaptador de página del cerebro (U7): sin red propia ni chrome.storage; solo mensajes.
const brainPortRules = {
  "no-restricted-globals": [
    ...securityRules["no-restricted-globals"],
    { name: "XMLHttpRequest", message: "brain-port no hace red propia: usa BRAIN_CALL (NFR5.3)." },
  ],
  "no-restricted-properties": [
    ...securityRules["no-restricted-properties"],
    {
      object: "chrome",
      property: "storage",
      message: "brain-port no usa chrome.storage (NFR5.2).",
    },
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
    files: ["aws-calculator-extension/background.js", "aws-calculator-extension/sw/**/*.js"],
    rules: serviceWorkerRules,
  },
  {
    files: [
      "aws-calculator-extension/sw/brain-client.js",
      "aws-calculator-extension/sw/auth-flow.js",
    ],
    rules: serviceWorkerNetworkRules,
  },
  {
    files: ["aws-calculator-extension/lib/connection/brain-port.js"],
    rules: brainPortRules,
  },
  {
    // U5: todo el código que corre en el content script (NFR4.1, NFR5.1, NFR5.2).
    files: [
      "aws-calculator-extension/content.js",
      "aws-calculator-extension/lib/dom/**/*.js",
      "aws-calculator-extension/lib/rpa/**/*.js",
      "aws-calculator-extension/lib/mapping/**/*.js",
    ],
    rules: contentScriptRules,
  },
  {
    // U5: módulos de Zona A (NFR7.1).
    files: [
      "aws-calculator-extension/lib/rpa/{orchestrator,result-aggregator,retry,service-timer}.js",
      "aws-calculator-extension/lib/dom/{aria-label,cascade}.js",
    ],
    rules: zoneARules,
  },
  {
    // U5 (NFR2.1): selectores frágiles y textos de botón solo en selectors.js.
    // Va al final del bundle para que ningún bloque anterior lo reemplace.
    files: ["aws-calculator-extension/**/*.js"],
    // background.js y sw/** quedan fuera: su bloque (U7) ya suma estas reglas a las
    // de almacenamiento, y este bloque las reemplazaría (NFR5.2).
    ignores: [
      "aws-calculator-extension/lib/dom/selectors.js",
      "aws-calculator-extension/background.js",
      "aws-calculator-extension/sw/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...securityRules["no-restricted-syntax"].slice(1),
        ...selectorSyntax,
      ],
    },
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
