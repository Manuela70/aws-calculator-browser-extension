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

// Panel lateral de U6 (sidepanel.js y lib/panel/**; NFR5.1, NFR5.4, NFR5.5;
// decisión 12 del plan). Extiende las listas base y suma selectorSyntax, porque
// el bloque final de U5 lo excluye para no borrarle estas prohibiciones: sin
// red propia, sin chrome.storage.local/sync (el historial va por
// lib/history-store.js), chrome.storage.session solo en tab-store.js, sin
// estilos en línea, sin manejadores on* asignados y setAttribute solo con
// nombre literal.
const panelGlobals = [
  ...restrictedGlobals,
  {
    name: "XMLHttpRequest",
    message: "El panel no hace red propia: usa el service worker (NFR5.5).",
  },
  { name: "WebSocket", message: "El panel no hace red propia (NFR5.5)." },
  { name: "EventSource", message: "El panel no hace red propia (NFR5.5)." },
];
const panelProperties = [
  ...restrictedProperties,
  { object: "self", property: "fetch", message: "El panel no hace red propia (NFR5.5)." },
  {
    object: "window",
    property: "XMLHttpRequest",
    message: "El panel no hace red propia (NFR5.5).",
  },
  { object: "document", property: "write", message: "Prohibido document.write (NFR5.1)." },
];
const panelSyntax = [
  ...securityRules["no-restricted-syntax"].slice(1),
  ...selectorSyntax,
  {
    selector: "MemberExpression[object.property.name='storage'][property.name=/^(local|sync)$/]",
    message:
      "El panel no usa chrome.storage.local/sync: el historial se lee por lib/history-store.js (NFR5.4).",
  },
  {
    selector: "MemberExpression[property.name='style']",
    message: "Sin estilos en línea: los estilos cambian solo con clases fijas (NFR5.1).",
  },
  {
    selector: "AssignmentExpression[left.type='MemberExpression'][left.property.name=/^on[a-z]+$/]",
    message: "Sin manejadores on* asignados: usar addEventListener (NFR5.1).",
  },
  {
    selector: "CallExpression[callee.property.name='setAttribute'][arguments.0.type!='Literal']",
    message: "setAttribute solo con un nombre de atributo literal (NFR5.1).",
  },
];
const panelSessionSyntax = {
  selector: "MemberExpression[object.property.name='storage'][property.name='session']",
  message:
    "Solo lib/panel/tab-store.js usa chrome.storage.session; el panel nunca lee el token (NFR5.4, NFR5.5).",
};
const panelRules = {
  "no-restricted-globals": ["error", ...panelGlobals],
  "no-restricted-properties": ["error", ...panelProperties],
  "no-restricted-syntax": ["error", ...panelSyntax, panelSessionSyntax],
};
// tab-store.js: mismas reglas del panel salvo chrome.storage.session.
const panelTabStoreRules = { "no-restricted-syntax": ["error", ...panelSyntax] };
// Zona A del panel (NFR6.1): sin document ni chrome.
const panelZoneARules = {
  "no-restricted-globals": [
    "error",
    ...panelGlobals,
    { name: "document", message: "La Zona A del panel no toca el DOM (NFR6.1)." },
    { name: "chrome", message: "La Zona A del panel no usa APIs chrome.* (NFR6.1)." },
  ],
};
const PANEL_ZONE_A_FILES = [
  "aws-calculator-extension/lib/panel/{panel-state,url-check,history-model,timers,session-rule,waf-model,heartbeat}.js",
  "aws-calculator-extension/lib/messages-es.js",
];

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
    // U6: panel lateral (NFR5.1, NFR5.4, NFR5.5).
    files: ["aws-calculator-extension/sidepanel.js", "aws-calculator-extension/lib/panel/**/*.js"],
    rules: panelRules,
  },
  {
    // U6: único módulo del panel con chrome.storage.session (claves panel:).
    files: ["aws-calculator-extension/lib/panel/tab-store.js"],
    rules: panelTabStoreRules,
  },
  {
    // U6: Zona A del panel (NFR6.1).
    files: PANEL_ZONE_A_FILES,
    rules: panelZoneARules,
  },
  {
    // U5 (NFR2.1): selectores frágiles y textos de botón solo en selectors.js.
    // Va al final del bundle para que ningún bloque anterior lo reemplace.
    files: ["aws-calculator-extension/**/*.js"],
    // background.js y sw/** quedan fuera: su bloque (U7) ya suma estas reglas a las
    // de almacenamiento, y este bloque las reemplazaría (NFR5.2). Lo mismo
    // sidepanel.js y lib/panel/** (U6, decisión 12), cuyo bloque ya suma selectorSyntax.
    ignores: [
      "aws-calculator-extension/lib/dom/selectors.js",
      "aws-calculator-extension/background.js",
      "aws-calculator-extension/sw/**",
      "aws-calculator-extension/sidepanel.js",
      "aws-calculator-extension/lib/panel/**",
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
