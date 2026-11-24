// lib/dom/selectors.js — Única tabla de selectores CSS, clases de CloudScape y textos de la UI
// de calculator.aws (BR3.5; NFR2.1, NFR2.2).
// Dueño: U5. Zona B: si calculator.aws cambia su UI (CloudScape, riesgo P2), este
// es el punto único de ajuste. Ningún otro módulo puede contener literales con
// el prefijo de clase de CloudScape ni los textos de botón de BUTTON_TEXTS (lo
// impone la regla no-restricted-syntax de eslint.config.js). Los fallos
// devuelven el NOMBRE de la entrada (p. ej. "share.button"), que va al registro
// técnico; nunca al SE.

export const SELECTORS = Object.freeze({
  "page.buttons": 'button, [role="button"], a',
  "page.labels": "label",
  "page.uiChrome": 'header, nav, [role="banner"], footer',
  "page.headings":
    'h1, h2, h3, h4, h5, h6, legend, [class*="awsui_heading"], [class*="awsui_header"]',
  "addService.searchAllServices": 'label, input[type="radio"], button, [role="radio"]',
  "addService.searchBox":
    'input[placeholder*="Search"], input[placeholder*="search"], input[type="search"]',
  "addService.card": '[class*="awsui_card"]',
  "addService.cardHeader": '[class*="awsui_header"]',
  "form.root": 'main, [role="main"]',
  "form.inputs": 'input:not([type="hidden"])',
  "form.selects": "select",
  "form.dropdownButtons": "button[aria-haspopup], button[aria-expanded]",
  "form.sliders": 'input[type="range"], [role="slider"]',
  "form.collapsedSections": 'button[aria-expanded="false"]',
  "form.radiogroup": '[role="radiogroup"]',
  "form.radiogroupHeading": "legend, h2, h3, h4, [class*='awsui_heading']",
  "form.checkboxes": 'input[type="checkbox"]',
  "form.field": '[class*="awsui_form-field"], [role="group"]',
  "form.requiredMessages": '[class*="awsui_error"], [role="alert"]',
  "form.labelledControls": "input, button, select, [role='switch'], [role='checkbox']",
  "template.controls": '[role="tab"], [role="radio"], input[type="radio"]',
  "dropdown.options": '[class*="awsui_option-content"]',
  // Etiqueta de la opción: CloudScape la repite en el atributo title del span con
  // data-value. La región muestra además su código ("US East (N. Virginia)" +
  // "us-east-1"), así que el texto visible no sirve para comparar.
  "dropdown.optionLabel": "[data-value][title], [title]",
  "dropdown.selectableItem": '[class*="awsui_selectable-item"]',
  "dropdown.listbox": '[role="listbox"]',
  "dropdown.menus": '[role="listbox"], [role="menu"]',
  // Buscador de la tabla de tipos de instancia ("Search instance type"). El bloque
  // también contiene "Number of instances" (input number), que va antes.
  "instances.search": 'input[type="search"]',
  "instances.rows": 'tr, [role="row"]',
  "instances.cells": 'td, [role="cell"], [role="gridcell"]',
  "instances.radio": 'input[type="radio"]',
  "instances.tableContainer": 'table, [role="grid"], [role="table"]',
  "save.messages":
    '[class*="awsui_flash"], [role="status"], [role="alert"], [class*="awsui_error"]',
  "estimate.serviceRows": "tbody tr",
  "estimate.headerCells": "thead th",
  "estimate.nameInput":
    'input[placeholder*="Name"], input[placeholder*="name"], input[value*="Estimate"]',
  "share.urlInput": 'input[readonly], input[type="text"]',
  "overlay.root": "[data-aidlc-overlay]",
});

// Patrones de clase de CloudScape para decidir si un botón colapsado es una
// sección (expandible) o un control (trigger de dropdown, filtro).
export const CLASS_PATTERNS = Object.freeze({
  SECTION_TOGGLE: /awsui_header|awsui_expand|awsui_section/,
  CONTROL_TRIGGER: /awsui_trigger|awsui_button|awsui_select|filter/,
  // Nombres de grupo generados por CloudScape (numéricos o con prefijo de clase), FIX-6.
  GENERATED_NAME: /^\d|^awsui/,
});

// Textos de botones de calculator.aws, en inglés tal como los muestra la página.
export const BUTTON_TEXTS = Object.freeze({
  ADD_SERVICE: "Add service",
  CONFIGURE: "Configure",
  SEARCH_ALL_SERVICES: "Search all services",
  SAVE_SERVICE: Object.freeze(["Save and add service", "Add to my estimate"]),
  SHARE: "Share",
  AGREE_AND_CONTINUE: "Agree and continue",
  EDIT: "Edit",
  SAVE: "Save",
  CANCEL: "Cancel",
});

// Otros textos y señales de la UI.
export const UI_TEXT = Object.freeze({
  ...BUTTON_TEXTS,
  // Compatibilidad con el walking skeleton: "Save" también vale como guardado.
  SAVE_SERVICE: Object.freeze([...BUTTON_TEXTS.SAVE_SERVICE, BUTTON_TEXTS.SAVE]),
  REGION_LABEL: "Choose a Region",
  REQUIRED_MARKER: "is required",
  INSTANCE_TYPE_FALLBACK_LABEL: "Instance type",
  ESTIMATE_SERVICE_COLUMN: "Service Name",
});

// Banner verde de guardado (BR2.6, NFR3.1): el grupo 1 es el nombre del servicio.
export const SUCCESS_BANNER_PATTERN = /^Successfully added (.+) estimate\.$/;

// Marca del overlay del Spotlight (BR5.2): scanForm excluye su subárbol.
export const OVERLAY_ATTRIBUTE = "data-aidlc-overlay";

export const ESTIMATE_HASH = "/estimate";
export const ADD_SERVICE_HASH = "/addService";
