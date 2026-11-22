// lib/dom/dom-resolver.js — Resolvedor del DOM de calculator.aws (W3/W4; BR4.1-BR4.10, BR5.2, BR5.3, BR5.6).
// PROVISIONAL (U1, walking skeleton). Dueño final: U5. Zona B: sin tests
// automatizados; se verifica con el smoke manual de SMOKE.md contra el DOM vivo.
// Portado del v6 con las correcciones del diseño:
// - sin "primer resultado" al elegir el servicio (BR4.2);
// - confirmación del guardado SOLO por el banner verde, con detección de
//   "is required" (BR4.4, BR4.5);
// - relectura del campo tras cada acción (BR4.3);
// - enlace solo del modal Share, validado; sin fallback a la URL de la página (BR5.3);
// - toda espera vía waitFor con tope de 20 s y signal de cancelación (BR4.10, NFR8.6).
// Contrato: cada función devuelve { ok: true, value? } o
// { ok: false, reason, detail?, selector? } y comprueba signal antes de actuar.

import { ADD_SERVICE_HASH, ESTIMATE_HASH, SELECTORS, UI_TEXT } from "./selectors.js";
import {
  cancelled,
  clickElement,
  findButton,
  getText,
  isToggleOn,
  isVisible,
  labelledByParts,
  queryAll,
  setNativeValue,
} from "./dom-utils.js";
import { scanFormFields } from "./form-scanner.js";
import { DELAY, sleep, waitFor } from "../rpa/wait.js";
import { matchInstanceRow, matchOption, normalizeText } from "../mapping/option-match.js";
import { fieldNamePart } from "../mapping/deterministic-mapper.js";
import { isCalculatorUrl } from "../validation.js";

export const PAGE_TIMEOUT_MS = 20000;
export const BANNER_TIMEOUT_MS = 10000;

const ok = (value) => ({ ok: true, value });
const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });
const CANCELLED = fail("cancelled");

function onEstimatePage() {
  return window.location.hash.includes(ESTIMATE_HASH) && Boolean(findButton(UI_TEXT.ADD_SERVICE));
}

async function openEstimate({ signal } = {}) {
  if (cancelled(signal)) return CANCELLED;
  if (!window.location.hash.includes(ESTIMATE_HASH)) window.location.hash = ESTIMATE_HASH;
  const loaded = await waitFor(onEstimatePage, {
    timeoutMs: PAGE_TIMEOUT_MS,
    signal,
    label: "estimate",
  });
  return loaded.ok ? ok() : fail("timeout", { selector: "estimate.addServiceButton" });
}

// Lista los servicios de My Estimate (texto de cada fila con al menos 2 celdas).
async function listEstimateServices({ signal } = {}) {
  const opened = await openEstimate({ signal });
  if (!opened.ok) return opened;
  if (!(await sleep(DELAY.LONG, signal))) return CANCELLED;
  const rows = queryAll("estimate.serviceRows").filter(
    (row) => isVisible(row) && queryAll("instances.cells", row).length >= 2,
  );
  return ok(rows.map((row) => getText(row)));
}

function findServiceCard(searchTerm) {
  const target = normalizeText(searchTerm);
  const candidates = queryAll("page.buttons")
    .filter((b) => isVisible(b) && normalizeText(getText(b)) === normalizeText(UI_TEXT.CONFIGURE))
    .map((button) => {
      const header = button
        .closest(SELECTORS["addService.card"])
        ?.querySelector(SELECTORS["addService.cardHeader"]);
      return { button, title: normalizeText(getText(header)) };
    });
  const exact = candidates.filter((c) => c.title === target);
  if (exact.length === 1) return { button: exact[0].button, total: candidates.length };
  const containing = candidates.filter((c) => c.title.includes(target));
  if (exact.length === 0 && containing.length === 1)
    return { button: containing[0].button, total: candidates.length };
  return { button: null, total: candidates.length };
}

async function startService(searchTerm, { signal } = {}) {
  const opened = await openEstimate({ signal });
  if (!opened.ok)
    return fail("page_timeout", {
      detail: "abrir My Estimate",
      selector: "estimate.addServiceButton",
    });
  if (!(await clickElement(findButton(UI_TEXT.ADD_SERVICE), signal))) return CANCELLED;
  const allServices = await waitFor(
    () =>
      queryAll("addService.searchAllServices").find((el) =>
        normalizeText(getText(el)).includes(normalizeText(UI_TEXT.SEARCH_ALL_SERVICES)),
      ),
    { timeoutMs: PAGE_TIMEOUT_MS, signal },
  );
  if (allServices.ok && !(await clickElement(allServices.value, signal))) return CANCELLED;
  const searchBox = await waitFor(() => queryAll("addService.searchBox").find(isVisible), {
    timeoutMs: PAGE_TIMEOUT_MS,
    signal,
  });
  if (!searchBox.ok)
    return fail("page_timeout", { detail: "buscar el servicio", selector: "addService.searchBox" });
  if (!(await setNativeValue(searchBox.value, searchTerm, signal))) return CANCELLED;
  let lastTotal = 0;
  const card = await waitFor(
    () => {
      const found = findServiceCard(searchTerm);
      lastTotal = found.total;
      return found.button;
    },
    { timeoutMs: PAGE_TIMEOUT_MS, signal },
  );
  if (cancelled(signal)) return CANCELLED;
  if (!card.ok) {
    return lastTotal > 0
      ? fail("service_not_found", { detail: searchTerm, selector: "addService.cardHeader" })
      : fail("page_timeout", { detail: "buscar el servicio", selector: "addService.card" });
  }
  if (!(await clickElement(card.value, signal))) return CANCELLED;
  const form = await waitFor(
    () => !window.location.hash.includes(ADD_SERVICE_HASH) && queryAll("page.labels").length > 5,
    { timeoutMs: PAGE_TIMEOUT_MS, signal },
  );
  return form.ok
    ? ok()
    : fail("page_timeout", { detail: "abrir el formulario", selector: "page.labels" });
}

// Abre un dropdown CloudScape y elige la opción por coincidencia exacta (BR3.4).
async function selectDropdownOption(button, value, signal) {
  if (!(await clickElement(button, signal))) return CANCELLED;
  const options = await waitFor(
    () => {
      const found = queryAll("dropdown.options").filter(isVisible);
      return found.length > 0 ? found : null;
    },
    { timeoutMs: PAGE_TIMEOUT_MS, signal },
  );
  if (!options.ok) return fail("field_not_applied", { selector: "dropdown.options" });
  const match = matchOption(value, options.value.map(getText));
  if (!match.ok) {
    document.body.click();
    return fail("field_not_applied", { selector: "dropdown.options" });
  }
  const option = options.value[match.index];
  const clickable = option.closest(SELECTORS["dropdown.selectableItem"]) || option;
  if (!(await clickElement(clickable, signal))) return CANCELLED;
  return normalizeText(getText(button)).includes(normalizeText(match.option))
    ? ok()
    : fail("field_not_applied", { selector: "form.dropdownButtons" });
}

async function setRegion(displayName, { signal } = {}) {
  const label = await waitFor(
    () => queryAll("page.labels").find((l) => isVisible(l) && getText(l) === UI_TEXT.REGION_LABEL),
    { timeoutMs: PAGE_TIMEOUT_MS, signal },
  );
  if (!label.ok) return fail("field_not_applied", { detail: "región", selector: "page.labels" });
  const button = document.getElementById(label.value.getAttribute("for"));
  if (!button)
    return fail("field_not_applied", { detail: "región", selector: "form.dropdownButtons" });
  if (normalizeText(getText(button)).includes(normalizeText(displayName))) return ok();
  const selected = await selectDropdownOption(button, displayName, signal);
  return selected.ok
    ? ok()
    : fail("field_not_applied", { detail: "región", selector: selected.selector });
}

function findToggleInput(label) {
  const target = normalizeText(label);
  for (const l of queryAll("page.labels")) {
    if (!isVisible(l) || normalizeText(getText(l)) !== target || !l.htmlFor) continue;
    const input = document.getElementById(l.htmlFor);
    if (input?.type === "checkbox") return input;
  }
  return (
    queryAll("form.checkboxes").find(
      (i) => !i.closest("[aria-modal]") && normalizeText(labelledByParts(i).join(" ")) === target,
    ) ?? null
  );
}

async function applyToggle({ label, wantOn }, { signal } = {}) {
  if (cancelled(signal)) return CANCELLED;
  const input = findToggleInput(label);
  if (!input) return fail("toggle_not_applied", { detail: label, selector: "form.checkboxes" });
  if (isToggleOn(input) !== wantOn) {
    if (!(await clickElement(input, signal))) return CANCELLED;
    if (!(await sleep(DELAY.LONG, signal))) return CANCELLED;
  }
  return isToggleOn(input) === wantOn
    ? ok()
    : fail("toggle_not_applied", { detail: label, selector: "form.checkboxes" });
}

// Expansión de secciones colapsadas: de mejor esfuerzo (BR4.9).
async function expandSections({ signal } = {}) {
  let total = 0;
  for (let round = 0; round < 5; round++) {
    if (cancelled(signal)) return CANCELLED;
    const collapsed = queryAll("form.collapsedSections").filter((b) => {
      if (!isVisible(b) || b.closest('[role="listbox"], [role="menu"]')) return false;
      const cls = String(b.className || "");
      if (/awsui_trigger|awsui_button|awsui_select|filter/.test(cls)) return false;
      return (
        /awsui_header|awsui_expand|awsui_section/.test(cls) ||
        Boolean(b.closest("section, details"))
      );
    });
    if (collapsed.length === 0) return ok(total);
    for (const button of collapsed) {
      if (!(await clickElement(button, signal))) return CANCELLED;
      total += 1;
    }
  }
  return ok(total);
}

let lastRegistry = new Map();

async function scanForm({ signal } = {}) {
  if (cancelled(signal)) return CANCELLED;
  const { fields, registry } = scanFormFields();
  lastRegistry = registry;
  return ok(fields);
}

async function applyInstanceRow(handle, value, signal) {
  const search = queryAll("form.inputs", handle.root).find(
    (i) => isVisible(i) && i.type !== "radio" && i.type !== "checkbox",
  );
  if (search && !(await setNativeValue(search, value, signal))) return CANCELLED;
  const row = await waitFor(
    () => {
      const rows = queryAll("instances.rows", handle.table).filter(
        (r) => isVisible(r) && r.querySelector(SELECTORS["instances.radio"]),
      );
      const matches = rows.filter(
        (r) => matchInstanceRow(value, queryAll("instances.cells", r).map(getText)).ok,
      );
      return matches.length === 1 ? matches[0] : null;
    },
    { timeoutMs: PAGE_TIMEOUT_MS, signal },
  );
  if (!row.ok) return fail("field_not_applied", { selector: "instances.rows" });
  const radio = row.value.querySelector(SELECTORS["instances.radio"]);
  if (!(await clickElement(radio, signal))) return CANCELLED;
  return radio.checked ? ok() : fail("field_not_applied", { selector: "instances.radio" });
}

async function applyRadio(handle, value, signal) {
  const match = matchOption(
    value,
    handle.radios.map(
      (r) => getText(r.closest("label")) || r.getAttribute("aria-label") || r.value,
    ),
  );
  if (!match.ok) return fail("field_not_applied", { selector: "form.radiogroup" });
  const radio = handle.radios[match.index];
  const label = radio.id ? document.querySelector(`label[for="${CSS.escape(radio.id)}"]`) : null;
  if (!(await clickElement(label || radio, signal))) return CANCELLED;
  return radio.checked ? ok() : fail("field_not_applied", { selector: "form.radiogroup" });
}

async function applySelect(select, value, signal) {
  const options = [...select.options];
  const match = matchOption(
    value,
    options.map((o) => o.text),
  );
  if (!match.ok) return fail("field_not_applied", { selector: "form.selects" });
  if (cancelled(signal)) return CANCELLED;
  select.value = options[match.index].value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  if (!(await sleep(DELAY.SHORT, signal))) return CANCELLED;
  return select.options[select.selectedIndex]?.text === match.option
    ? ok()
    : fail("field_not_applied", { selector: "form.selects" });
}

async function applyFill(input, value, signal) {
  if (!(await setNativeValue(input, value, signal))) return CANCELLED;
  return input.value === String(value)
    ? ok()
    : fail("field_not_applied", { selector: "form.inputs" });
}

async function applyCheckbox(input, value, signal) {
  const wantOn = ["true", "on", "checked"].includes(normalizeText(value));
  if (isToggleOn(input) !== wantOn && !(await clickElement(input, signal))) return CANCELLED;
  return isToggleOn(input) === wantOn
    ? ok()
    : fail("field_not_applied", { selector: "form.checkboxes" });
}

// Aplica una MappingAction sobre el elemento registrado en el último scanForm
// y relee el resultado (BR4.3). instance_radio: buscar y elegir la fila (BR4.7).
async function applyAction(action, { signal } = {}) {
  if (cancelled(signal)) return CANCELLED;
  const detail = `${fieldNamePart(action.fieldLabel)}: ${action.value}`;
  const handle = lastRegistry.get(action.fieldLabel);
  if (!handle || (handle.el && !handle.el.isConnected)) {
    return fail("field_not_applied", { detail, selector: "form.registry" });
  }
  let result;
  if (action.actionType === "instance_radio")
    result = await applyInstanceRow(handle, action.value, signal);
  else if (action.actionType === "radio") result = await applyRadio(handle, action.value, signal);
  else if (action.actionType === "select")
    result = await applySelect(handle.el, action.value, signal);
  else if (action.actionType === "dropdown")
    result = await selectDropdownOption(handle.el, action.value, signal);
  else if (action.actionType === "fill") result = await applyFill(handle.el, action.value, signal);
  else if (action.actionType === "checkbox")
    result = await applyCheckbox(handle.el, action.value, signal);
  else result = fail("field_not_applied", { selector: "form.registry" });
  return result.ok || result.reason === "cancelled" ? result : { ...result, detail };
}

function findSaveButton() {
  for (const text of UI_TEXT.SAVE_SERVICE) {
    const button = findButton(text);
    if (button) return button;
  }
  return null;
}

function visibleMessages() {
  return queryAll("save.messages").filter(isVisible);
}

function isSuccessBanner(el, serviceName) {
  const text = normalizeText(getText(el));
  return (
    text.includes(normalizeText(UI_TEXT.SUCCESS_BANNER_PREFIX)) &&
    text.includes(normalizeText(UI_TEXT.SUCCESS_BANNER_SUFFIX)) &&
    text.includes(normalizeText(serviceName))
  );
}

function requiredFieldLabel(message) {
  const field = message.closest('[class*="awsui_form-field"], [role="group"]');
  const label = field ? getText(field.querySelector("label")) : "";
  return label || getText(message);
}

// Un intento de guardado: SOLO el banner verde confirma; "is required" falla sin
// reintento. La URL o el botón "Add service" no cuentan (BR4.4).
async function saveService(serviceName, { signal } = {}) {
  if (cancelled(signal)) return CANCELLED;
  const button = findSaveButton();
  if (!button) return fail("not_confirmed", { selector: "save.button" });
  const before = new Set(visibleMessages());
  if (!(await clickElement(button, signal))) return CANCELLED;
  const outcome = await waitFor(
    () => {
      const messages = visibleMessages();
      const required = messages.find((m) =>
        normalizeText(getText(m)).includes(UI_TEXT.REQUIRED_MARKER),
      );
      if (required) return { required };
      const banner = messages.find((m) => !before.has(m) && isSuccessBanner(m, serviceName));
      return banner ? { confirmed: true } : null;
    },
    { timeoutMs: BANNER_TIMEOUT_MS, signal, label: "banner" },
  );
  if (!outcome.ok)
    return outcome.reason === "cancelled"
      ? CANCELLED
      : fail("not_confirmed", { selector: "save.messages" });
  if (outcome.value.required) {
    return fail("validation_required", {
      detail: requiredFieldLabel(outcome.value.required),
      selector: "save.messages",
    });
  }
  return ok();
}

function visibleTitleMatches(name) {
  const target = normalizeText(name);
  return queryAll("page.headings").some(
    (h) => isVisible(h) && normalizeText(getText(h)).includes(target),
  );
}

// Renombra el estimado y verifica el nombre visible (BR5.2).
async function renameEstimate(name, { signal } = {}) {
  const opened = await openEstimate({ signal });
  if (!opened.ok) return fail("timeout", { selector: "estimate.addServiceButton" });
  const edit = findButton(UI_TEXT.EDIT);
  if (!edit) return fail("not_found", { selector: "estimate.editButton" });
  if (!(await clickElement(edit, signal))) return CANCELLED;
  const input = await waitFor(() => queryAll("estimate.nameInput").find(isVisible), {
    timeoutMs: PAGE_TIMEOUT_MS,
    signal,
  });
  if (!input.ok) return fail("timeout", { selector: "estimate.nameInput" });
  if (!(await setNativeValue(input.value, name, signal))) return CANCELLED;
  const save = findButton(UI_TEXT.SAVE);
  if (!save) return fail("not_found", { selector: "estimate.saveNameButton" });
  if (!(await clickElement(save, signal))) return CANCELLED;
  const verified = await waitFor(() => visibleTitleMatches(name), {
    timeoutMs: PAGE_TIMEOUT_MS,
    signal,
  });
  return verified.ok ? ok() : fail("not_verified", { selector: "page.headings" });
}

// Share: pulsar Share, aceptar el modal público y leer el enlace del modal (BR5.3).
async function shareEstimate({ signal } = {}) {
  const share = await waitFor(() => findButton(UI_TEXT.SHARE), {
    timeoutMs: PAGE_TIMEOUT_MS,
    signal,
  });
  if (!share.ok) return fail("timeout", { selector: "share.button" });
  if (!(await clickElement(share.value, signal))) return CANCELLED;
  const findUrlInput = () =>
    queryAll("share.urlInput").find((i) => isVisible(i) && isCalculatorUrl(i.value));
  const step = await waitFor(() => findButton(UI_TEXT.AGREE_AND_CONTINUE) || findUrlInput(), {
    timeoutMs: PAGE_TIMEOUT_MS,
    signal,
  });
  if (!step.ok) return fail("timeout", { selector: "share.agreeButton" });
  if (step.value.tagName !== "INPUT" && !(await clickElement(step.value, signal))) return CANCELLED;
  const link = await waitFor(findUrlInput, { timeoutMs: PAGE_TIMEOUT_MS, signal });
  return link.ok ? ok(link.value.value) : fail("timeout", { selector: "share.urlInput" });
}

export function createDomResolver() {
  return {
    openEstimate,
    listEstimateServices,
    startService,
    setRegion,
    applyToggle,
    expandSections,
    scanForm,
    applyAction,
    saveService,
    returnToEstimate: openEstimate,
    renameEstimate,
    shareEstimate,
  };
}
