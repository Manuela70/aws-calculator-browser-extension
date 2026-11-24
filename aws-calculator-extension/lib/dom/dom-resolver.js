// lib/dom/dom-resolver.js — Resolvedor del DOM de calculator.aws (R1/R2; BR1.3, BR2.1-BR2.8,
// BR3.1-BR3.5, BR5.1, BR5.2; NFR2.2, NFR2.3, NFR3.1, NFR3.3, NFR3.5).
// Dueño: U5. Zona B: sin tests automatizados; se verifica con el smoke manual de
// SMOKE.md contra el DOM vivo. Reglas que aplica:
// - tarjeta del servicio, región, plantilla y opciones por coincidencia EXACTA y
//   única (nunca "contiene" ni "primer resultado");
// - un campo o toggle se ubica con la cascada pura selectByCascade (Zona A): aquí
//   solo se juntan los candidatos de cada estrategia;
// - relectura del valor tras cada acción (readBack);
// - guardado confirmado SOLO por un banner verde nuevo con el nombre exacto de la
//   tarjeta, con detección de "is required" en el formulario abierto;
// - Spotlight alrededor de cada acción, quitado siempre en un finally;
// - toda espera vía waitFor con tope y señal; un DomError se devuelve como
//   resultado tipado { ok: false, reason: code } (el orquestador lo traduce).
// Contrato: cada función devuelve { ok: true, value? } o
// { ok: false, reason, detail?, selector? } y comprueba la señal antes de actuar.

import {
  ADD_SERVICE_HASH,
  CLASS_PATTERNS,
  ESTIMATE_HASH,
  SELECTORS,
  UI_TEXT,
} from "./selectors.js";
import {
  cancelled,
  clickElement,
  confirmSave,
  DomError,
  exitWithoutSave,
  findButton,
  formRoot,
  getText,
  isEstimatePage,
  isOverlay,
  isToggleOn,
  isVisible,
  labelledByParts,
  queryAll,
  readBack,
  readEstimateServiceNames,
  setNativeValue,
  valuesMatch,
  waitFor,
} from "./dom-utils.js";
import { resolveSection, scanFormFields } from "./form-scanner.js";
import { cleanAriaLabel } from "./aria-label.js";
import { joinLabelledBy, selectByCascade, splitRequestedLabel } from "./cascade.js";
import { clearSpotlights, showSpotlight } from "./spotlight.js";
import { DELAY, sleep } from "../rpa/wait.js";
import { RetryCounter } from "../rpa/retry.js";
import { matchInstanceRow, matchOption, normalizeText } from "../mapping/option-match.js";
import { fieldNamePart } from "../mapping/deterministic-mapper.js";
import { isCalculatorUrl } from "../validation.js";

const ok = (value) => ({ ok: true, value });
const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });
const CANCELLED = fail("cancelled");

// Convierte un DomError lanzado dentro de fn en un resultado tipado.
function typed(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (!(error instanceof DomError)) throw error;
      if (error.code === "aborted") return CANCELLED;
      return fail(error.code, { detail: error.label, selector: error.step });
    }
  };
}

function optionFailure(match, value, selector) {
  const reason = match.reason === "ambiguous" ? "option_ambiguous" : "option_no_match";
  return fail(reason, { detail: value, selector });
}

// --- My Estimate y búsqueda del servicio -----------------------------------------

async function openEstimate({ signal } = {}) {
  if (cancelled(signal)) return CANCELLED;
  if (!window.location.hash.includes(ESTIMATE_HASH)) window.location.hash = ESTIMATE_HASH;
  await waitFor(isEstimatePage, { signal, step: "preconditions", label: "estimate" });
  return ok();
}

async function listEstimateServices({ signal } = {}) {
  const opened = await openEstimate({ signal });
  if (!opened.ok) return opened;
  if (!(await sleep(DELAY.LONG, signal))) return CANCELLED;
  return ok(readEstimateServiceNames());
}

// Tarjeta cuyo título coincide EXACTO (normalizado) con el término; única.
function findServiceCard(searchTerm) {
  const target = normalizeText(searchTerm);
  const candidates = queryAll("page.buttons")
    .filter((b) => isVisible(b) && normalizeText(getText(b)) === normalizeText(UI_TEXT.CONFIGURE))
    .map((button) => {
      const header = button
        .closest(SELECTORS["addService.card"])
        ?.querySelector(SELECTORS["addService.cardHeader"]);
      return { button, title: getText(header) };
    });
  const exact = candidates.filter((c) => normalizeText(c.title) === target);
  return exact.length === 1 ? exact[0] : { button: null };
}

// Espera de un elemento opcional: una espera agotada devuelve null (el paso
// sigue sin él); la cancelación y cualquier otro fallo se propagan.
async function waitOptional(predicate, options) {
  try {
    return await waitFor(predicate, options);
  } catch (error) {
    if (error instanceof DomError && error.code === "not_found") return null;
    throw error;
  }
}

// Espera que, agotada, es un fallo con motivo propio (no el genérico not_found).
async function waitOrFail(predicate, options, failure) {
  const value = await waitOptional(predicate, options);
  return value ? { ok: true, value } : failure;
}

async function openSearch(signal) {
  if (cancelled(signal)) return CANCELLED;
  if (!window.location.hash.includes(ESTIMATE_HASH)) window.location.hash = ESTIMATE_HASH;
  const opened = await waitOrFail(
    isEstimatePage,
    { signal, step: "search_service" },
    fail("page_timeout", { detail: "abrir My Estimate", selector: "estimate.addServiceButton" }),
  );
  if (!opened.ok) return opened;
  if (!(await clickElement(findButton(UI_TEXT.ADD_SERVICE), signal))) return CANCELLED;
  const searchAll = normalizeText(UI_TEXT.SEARCH_ALL_SERVICES);
  const allServices = await waitOptional(
    () =>
      queryAll("addService.searchAllServices").find((el) =>
        normalizeText(getText(el)).includes(searchAll),
      ),
    { signal, step: "search_service", label: "search all services" },
  );
  if (allServices && !(await clickElement(allServices, signal))) return CANCELLED;
  return waitOrFail(
    () => queryAll("addService.searchBox").find(isVisible),
    { signal, step: "search_service" },
    fail("page_timeout", { detail: "buscar el servicio", selector: "addService.searchBox" }),
  );
}

// R2 paso 1. Devuelve { calculatorServiceName }: el título exacto de la tarjeta,
// que es el nombre con que la calculadora arma el banner (NFR3.1). Sin tarjeta
// exacta y única tras la espera: service_not_found (security-design §3).
async function startService(searchTerm, { signal } = {}) {
  const searchBox = await openSearch(signal);
  if (!searchBox.ok) return searchBox;
  if (!(await setNativeValue(searchBox.value, searchTerm, signal))) return CANCELLED;
  const card = await waitOrFail(
    () => {
      const found = findServiceCard(searchTerm);
      return found.button ? found : null;
    },
    { signal, step: "search_service", label: searchTerm },
    fail("service_not_found", { detail: searchTerm, selector: "addService.cardHeader" }),
  );
  if (!card.ok) return card;
  if (!(await clickElement(card.value.button, signal))) return CANCELLED;
  const form = await waitOrFail(
    () => !window.location.hash.includes(ADD_SERVICE_HASH) && queryAll("page.labels").length > 5,
    { signal, step: "search_service" },
    fail("page_timeout", { detail: "abrir el formulario", selector: "page.labels" }),
  );
  return form.ok ? ok({ calculatorServiceName: card.value.title }) : form;
}

// --- Dropdowns, región y plantilla ----------------------------------------------

function closeDropdown(button) {
  button.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

// Abre el dropdown (hasta 2 intentos, BR4.1) y devuelve sus opciones visibles.
async function openDropdownOptions(button, signal) {
  const counter = new RetryCounter("dropdown_open");
  while (counter.next()) {
    if (!(await clickElement(button, signal))) throw new DomError("aborted", { step: "dropdown" });
    try {
      return await waitFor(
        () => {
          const found = queryAll("dropdown.options").filter((o) => isVisible(o) && !isOverlay(o));
          return found.length > 0 ? found : null;
        },
        { signal, timeoutMs: DELAY.LONG * 4, step: "dropdown", label: "dropdown.options" },
      );
    } catch (error) {
      if (!(error instanceof DomError) || error.code !== "not_found") throw error;
      counter.fail(error.code);
    }
  }
  throw new DomError("not_found", { step: "dropdown", label: "dropdown.options" });
}

// Etiqueta de una opción abierta: el title que CloudScape pone en su span con
// data-value; si no lo hay, el texto visible.
function optionLabel(option) {
  const titled = option.querySelector(SELECTORS["dropdown.optionLabel"]);
  const title = titled?.getAttribute("title")?.trim();
  return title || getText(option);
}

// BR2.8: opciones leídas al abrir, coincidencia exacta y única; nada se elige
// si no la hay. Luego se relee el valor visible del botón (BR2.4).
async function selectDropdownOption(button, value, signal) {
  const options = await openDropdownOptions(button, signal);
  const match = matchOption(value, options.map(optionLabel));
  if (!match.ok) {
    closeDropdown(button);
    return optionFailure(match, value, "dropdown.options");
  }
  const option = options[match.index];
  const clickable = option.closest(SELECTORS["dropdown.selectableItem"]) || option;
  if (!(await clickElement(clickable, signal))) return CANCELLED;
  return valuesMatch(match.option, readBack(button))
    ? ok()
    : fail("readback_mismatch", {
        detail: `${value} ≠ ${readBack(button)}`,
        selector: "form.dropdownButtons",
      });
}

// BR1.3: la región se elige por coincidencia exacta; si no, detalle "Region".
async function setRegion(displayName, { signal } = {}) {
  const label = await waitFor(
    () => queryAll("page.labels").find((l) => isVisible(l) && getText(l) === UI_TEXT.REGION_LABEL),
    { signal, step: "region", label: "Region" },
  );
  const button = document.getElementById(label.getAttribute("for"));
  if (!button)
    return fail("field_not_applied", { detail: "Region", selector: "form.dropdownButtons" });
  if (valuesMatch(displayName, readBack(button))) return ok();
  const selected = await selectDropdownOption(button, displayName, signal);
  if (selected.ok || selected.reason === "cancelled") return selected;
  return fail("field_not_applied", { detail: "Region", selector: selected.selector });
}

function templateLabel(control) {
  if (control.tagName === "INPUT") {
    const labelFor = control.id
      ? document.querySelector(`label[for="${CSS.escape(control.id)}"]`)
      : null;
    return (
      getText(labelFor || control.closest("label")) || control.getAttribute("aria-label") || ""
    );
  }
  return getText(control) || control.getAttribute("aria-label") || "";
}

function isSelectedControl(control) {
  return (
    control.checked === true ||
    control.getAttribute("aria-selected") === "true" ||
    control.getAttribute("aria-checked") === "true"
  );
}

// BR2.1: pestaña o radio cuya etiqueta visible coincide exacta con la plantilla.
async function selectTemplate(template, { signal } = {}) {
  if (cancelled(signal)) return CANCELLED;
  const wanted = normalizeText(template);
  const matches = queryAll("template.controls", formRoot()).filter(
    (c) => !isOverlay(c) && normalizeText(templateLabel(c)) === wanted,
  );
  if (matches.length !== 1) {
    return fail("template_not_found", { detail: template, selector: "template.controls" });
  }
  const control = matches[0];
  if (!isSelectedControl(control)) {
    const target =
      control.tagName === "INPUT" && control.id
        ? document.querySelector(`label[for="${CSS.escape(control.id)}"]`) || control
        : control;
    if (!(await clickElement(target, signal))) return CANCELLED;
  }
  await waitFor(() => isSelectedControl(control), { signal, step: "template", label: template });
  // El formulario cambia al elegir la plantilla: se espera antes de escanear.
  return (await sleep(DELAY.LONG, signal)) ? ok() : CANCELLED;
}

// --- Cascada de resolución (BR3.1) ---------------------------------------------

function labelForText(el) {
  return el.id ? getText(document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) : "";
}

// Junta los candidatos de cada estrategia cuya etiqueta coincide exacta.
function collectCandidates(fieldName, elements) {
  const wanted = normalizeText(fieldName);
  const same = (text) => normalizeText(text) === wanted;
  const byStrategy = { aria_label: [], aria_labelledby: [], label_for: [], section_heading: [] };
  for (const el of elements) {
    if (!isVisible(el) || isOverlay(el)) continue;
    const entry = { el, section: resolveSection(el) };
    if (same(cleanAriaLabel(el.getAttribute("aria-label")))) byStrategy.aria_label.push(entry);
    if (same(joinLabelledBy(labelledByParts(el)))) byStrategy.aria_labelledby.push(entry);
    if (same(labelForText(el))) byStrategy.label_for.push(entry);
    if (same(entry.section)) byStrategy.section_heading.push(entry);
  }
  return byStrategy;
}

function resolveByCascade(label, elements) {
  const { section, field } = splitRequestedLabel(label);
  return selectByCascade(collectCandidates(field, elements), section);
}

function toggleElements() {
  return queryAll("form.checkboxes", formRoot()).filter((el) => !el.closest("[aria-modal]"));
}

// BR2.2 (FIX-4, FIX-9): toggle por cascada; luego se relee su estado.
async function applyToggle({ label, wantOn }, { signal } = {}) {
  if (cancelled(signal)) return CANCELLED;
  const resolved = resolveByCascade(label, toggleElements());
  if (!resolved.ok)
    return fail("field_not_resolved", { detail: label, selector: "form.checkboxes" });
  const input = resolved.candidate.el;
  if (isToggleOn(input) !== wantOn) {
    if (!(await clickElement(input, signal))) return CANCELLED;
    if (!(await sleep(DELAY.LONG, signal))) return CANCELLED;
  }
  return isToggleOn(input) === wantOn
    ? ok()
    : fail("toggle_not_applied", { detail: label, selector: "form.checkboxes" });
}

// Expansión de secciones colapsadas: de mejor esfuerzo.
async function expandSections({ signal } = {}) {
  let total = 0;
  for (let round = 0; round < 5; round++) {
    if (cancelled(signal)) return CANCELLED;
    const collapsed = queryAll("form.collapsedSections").filter((b) => {
      if (!isVisible(b) || isOverlay(b) || b.closest(SELECTORS["dropdown.menus"])) return false;
      const cls = String(b.className || "");
      if (CLASS_PATTERNS.CONTROL_TRIGGER.test(cls)) return false;
      return CLASS_PATTERNS.SECTION_TOGGLE.test(cls) || Boolean(b.closest("section, details"));
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

// --- Acciones (BR2.4, BR2.8, BR3.4) --------------------------------------------

async function applyInstanceRow(handle, value, signal) {
  const search =
    queryAll("instances.search", handle.root).find(isVisible) ||
    queryAll("form.inputs", handle.root).find(
      (i) => isVisible(i) && i.type !== "radio" && i.type !== "checkbox" && i.type !== "number",
    );
  if (search && !(await setNativeValue(search, value, signal))) return CANCELLED;
  let lastMatches = 0;
  let row;
  try {
    row = await waitFor(
      () => {
        const rows = queryAll("instances.rows", handle.table).filter(
          (r) => isVisible(r) && r.querySelector(SELECTORS["instances.radio"]),
        );
        const matches = rows.filter(
          (r) => matchInstanceRow(value, queryAll("instances.cells", r).map(getText)).ok,
        );
        lastMatches = matches.length;
        return matches.length === 1 ? matches[0] : null;
      },
      { signal, step: "apply_action", label: value },
    );
  } catch (error) {
    if (!(error instanceof DomError) || error.code !== "not_found") throw error;
    return optionFailure(
      { reason: lastMatches > 1 ? "ambiguous" : "no_match" },
      value,
      "instances.rows",
    );
  }
  const radio = row.querySelector(SELECTORS["instances.radio"]);
  if (!(await clickElement(radio, signal))) return CANCELLED;
  return radio.checked ? ok() : fail("readback_mismatch", { selector: "instances.radio" });
}

async function applyRadio(handle, value, signal) {
  // La etiqueta puede envolver al radio o estar aparte con label[for] (EC2: modelo de precio).
  const labelFor = (r) =>
    r.id ? getText(document.querySelector(`label[for="${CSS.escape(r.id)}"]`)) : "";
  const labels = handle.radios.map(
    (r) => getText(r.closest("label")) || labelFor(r) || r.getAttribute("aria-label") || r.value,
  );
  const match = matchOption(value, labels);
  if (!match.ok) return optionFailure(match, value, "form.radiogroup");
  const radio = handle.radios[match.index];
  const label = radio.id ? document.querySelector(`label[for="${CSS.escape(radio.id)}"]`) : null;
  if (!(await clickElement(label || radio, signal))) return CANCELLED;
  return radio.checked ? ok() : fail("readback_mismatch", { selector: "form.radiogroup" });
}

async function applySelect(select, value, signal) {
  const options = [...select.options];
  const match = matchOption(
    value,
    options.map((o) => o.text),
  );
  if (!match.ok) return optionFailure(match, value, "form.selects");
  if (cancelled(signal)) return CANCELLED;
  select.value = options[match.index].value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  if (!(await sleep(DELAY.SHORT, signal))) return CANCELLED;
  return valuesMatch(match.option, readBack(select))
    ? ok()
    : fail("readback_mismatch", { selector: "form.selects" });
}

async function applyFill(input, value, signal) {
  if (!(await setNativeValue(input, value, signal))) return CANCELLED;
  const shown = readBack(input);
  return valuesMatch(value, shown)
    ? ok()
    : fail("readback_mismatch", { detail: `${value} ≠ ${shown}`, selector: "form.inputs" });
}

async function applyCheckbox(input, value, signal) {
  const wantOn = ["true", "on", "checked"].includes(normalizeText(value));
  if (isToggleOn(input) !== wantOn && !(await clickElement(input, signal))) return CANCELLED;
  return isToggleOn(input) === wantOn
    ? ok()
    : fail("readback_mismatch", { selector: "form.checkboxes" });
}

// Elemento de la acción: el del último escaneo o, si ya no está conectado, el
// que la cascada resuelve de nuevo (field_not_resolved si no hay uno único).
function resolveHandle(action) {
  const handle = lastRegistry.get(action.fieldLabel);
  if (handle && (!handle.el || handle.el.isConnected)) return { ok: true, handle };
  if (handle && !["input", "select", "dropdown", "checkbox"].includes(handle.kind)) {
    return { ok: false };
  }
  const elements = queryAll("form.labelledControls", formRoot());
  const resolved = resolveByCascade(action.fieldLabel, elements);
  if (!resolved.ok) return { ok: false };
  return { ok: true, handle: { kind: handle?.kind ?? "input", el: resolved.candidate.el } };
}

function runAction(action, handle, signal) {
  if (action.actionType === "instance_radio") return applyInstanceRow(handle, action.value, signal);
  if (action.actionType === "radio") return applyRadio(handle, action.value, signal);
  if (action.actionType === "select") return applySelect(handle.el, action.value, signal);
  if (action.actionType === "dropdown")
    return selectDropdownOption(handle.el, action.value, signal);
  if (action.actionType === "fill") return applyFill(handle.el, action.value, signal);
  if (action.actionType === "checkbox") return applyCheckbox(handle.el, action.value, signal);
  return Promise.resolve(fail("field_not_applied", { selector: "form.registry" }));
}

// Aplica una MappingAction con el Spotlight encendido y relee el resultado.
async function applyAction(action, { signal } = {}) {
  if (cancelled(signal)) return CANCELLED;
  const field = fieldNamePart(action.fieldLabel);
  const detail = `${field}: ${action.value}`;
  const resolved = resolveHandle(action);
  if (!resolved.ok)
    return fail("field_not_resolved", { detail: action.fieldLabel, selector: "form.registry" });
  const { handle } = resolved;
  const target = handle.el ?? handle.table ?? handle.radios?.[0];
  const spotlight = target ? showSpotlight(target, field) : null;
  try {
    const result = await runAction(action, handle, signal);
    if (result.ok || result.reason === "cancelled") return result;
    return { ...result, detail: result.detail ? `${field}: ${result.detail}` : detail };
  } finally {
    spotlight?.remove();
  }
}

// --- Guardado y cierre ----------------------------------------------------------

function findSaveButton() {
  const root = formRoot();
  for (const text of UI_TEXT.SAVE_SERVICE) {
    const button = findButton(text, root) ?? findButton(text);
    if (button) return button;
  }
  return null;
}

// Un intento de guardado (el orquestador hace hasta 3, BR2.6).
async function saveService(calculatorServiceName, { signal } = {}) {
  if (cancelled(signal)) return CANCELLED;
  const button = findSaveButton();
  if (!button) return fail("not_confirmed", { selector: "save.button" });
  return confirmSave(calculatorServiceName, button, { signal });
}

function visibleTitleMatches(name) {
  const target = normalizeText(name);
  return queryAll("page.headings").some(
    (h) => isVisible(h) && normalizeText(getText(h)).includes(target),
  );
}

// Renombra el estimado y verifica el nombre visible.
async function renameEstimate(name, { signal } = {}) {
  await openEstimate({ signal });
  const edit = findButton(UI_TEXT.EDIT);
  if (!edit) return fail("not_found", { selector: "estimate.editButton" });
  if (!(await clickElement(edit, signal))) return CANCELLED;
  const input = await waitFor(() => queryAll("estimate.nameInput").find(isVisible), {
    signal,
    step: "rename",
    label: "estimate.nameInput",
  });
  if (!(await setNativeValue(input, name, signal))) return CANCELLED;
  const save = findButton(UI_TEXT.SAVE);
  if (!save) return fail("not_found", { selector: "estimate.saveNameButton" });
  if (!(await clickElement(save, signal))) return CANCELLED;
  await waitFor(() => visibleTitleMatches(name), {
    signal,
    step: "rename",
    label: "page.headings",
  });
  return ok();
}

// Share: pulsar Share, aceptar el modal público y leer el enlace del modal. El
// enlace se valida en la Zona A (validateShareUrl) antes de devolverlo al SE.
async function shareEstimate({ signal } = {}) {
  const share = await waitFor(() => findButton(UI_TEXT.SHARE), {
    signal,
    step: "share",
    label: "share.button",
  });
  if (!(await clickElement(share, signal))) return CANCELLED;
  const findUrlInput = () =>
    queryAll("share.urlInput").find((i) => isVisible(i) && isCalculatorUrl(i.value));
  const step = await waitFor(() => findButton(UI_TEXT.AGREE_AND_CONTINUE) || findUrlInput(), {
    signal,
    step: "share",
    label: "share.agreeButton",
  });
  if (step.tagName !== "INPUT" && !(await clickElement(step, signal))) return CANCELLED;
  const link = await waitFor(findUrlInput, { signal, step: "share", label: "share.urlInput" });
  return ok(link.value);
}

export function createDomResolver() {
  return {
    openEstimate: typed(openEstimate),
    listEstimateServices: typed(listEstimateServices),
    startService: typed(startService),
    setRegion: typed(setRegion),
    selectTemplate: typed(selectTemplate),
    applyToggle: typed(applyToggle),
    expandSections: typed(expandSections),
    scanForm: typed(scanForm),
    applyAction: typed(applyAction),
    saveService: typed(saveService),
    exitWithoutSave: typed(exitWithoutSave),
    returnToEstimate: typed(openEstimate),
    renameEstimate: typed(renameEstimate),
    shareEstimate: typed(shareEstimate),
    cleanup: clearSpotlights,
  };
}
