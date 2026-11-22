// lib/dom/selectors.js — Única tabla de selectores CSS y textos de la UI de calculator.aws
// (reliability-design §2; NFR2.1, NFR2.2).
// PROVISIONAL (U1, walking skeleton). Dueño final: U5.
// Si calculator.aws cambia su UI (CloudScape, riesgo P2), este es el punto
// único de ajuste. Los fallos devuelven el NOMBRE de la entrada (p. ej.
// "share.button"), que va al registro técnico; nunca al SE.

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
  "form.inputs": 'input:not([type="hidden"])',
  "form.selects": "select",
  "form.dropdownButtons": "button[aria-haspopup], button[aria-expanded]",
  "form.sliders": 'input[type="range"], [role="slider"]',
  "form.collapsedSections": 'button[aria-expanded="false"]',
  "form.radiogroup": '[role="radiogroup"]',
  "form.checkboxes": 'input[type="checkbox"]',
  "dropdown.options": '[class*="awsui_option-content"]',
  "dropdown.selectableItem": '[class*="awsui_selectable-item"]',
  "dropdown.listbox": '[role="listbox"]',
  "instances.rows": 'tr, [role="row"]',
  "instances.cells": 'td, [role="cell"], [role="gridcell"]',
  "instances.radio": 'input[type="radio"]',
  "instances.tableContainer": 'table, [role="grid"], [role="table"]',
  "save.messages":
    '[class*="awsui_flash"], [role="status"], [role="alert"], [class*="awsui_error"]',
  "estimate.serviceRows": "tbody tr",
  "estimate.nameInput":
    'input[placeholder*="Name"], input[placeholder*="name"], input[value*="Estimate"]',
  "share.urlInput": 'input[readonly], input[type="text"]',
});

// Textos de botones y señales de la UI (en inglés, tal como los muestra calculator.aws).
export const UI_TEXT = Object.freeze({
  ADD_SERVICE: "Add service",
  CONFIGURE: "Configure",
  SEARCH_ALL_SERVICES: "Search all services",
  SAVE_SERVICE: Object.freeze(["Save and add service", "Add to my estimate", "Save"]),
  SHARE: "Share",
  AGREE_AND_CONTINUE: "Agree and continue",
  EDIT: "Edit",
  SAVE: "Save",
  REGION_LABEL: "Choose a Region",
  SUCCESS_BANNER_PREFIX: "Successfully added",
  SUCCESS_BANNER_SUFFIX: "estimate",
  REQUIRED_MARKER: "is required",
  INSTANCE_TYPE_FALLBACK_LABEL: "Instance type",
});

export const ESTIMATE_HASH = "/estimate";
export const ADD_SERVICE_HASH = "/addService";
