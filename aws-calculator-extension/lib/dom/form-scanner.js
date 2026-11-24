// lib/dom/form-scanner.js — scanForm portado del v6 (FIX-1..FIX-6, FIX-8) con los cambios del diseño.
// Dueño: U5. Zona B (smoke manual de SMOKE.md).
// Cambios frente al v6:
// - aria-labelledby se reconstruye con joinLabelledBy y los botones Unit se
//   leen con parseUnitButtonLabel (Zona A, FIX-2/FIX-8).
// - El subárbol del overlay del Spotlight ([data-aidlc-overlay]) se excluye (BR5.2).
// - Los literales de clase de CloudScape viven en selectors.js (BR3.5).
// - La tabla de instancias de EC2 es UN solo DomField instance_radio, con label
//   desde el heading de la tabla (FIX-6); su caja de búsqueda y demás controles
//   internos NO se emiten como DomField aparte (BR3.1).
// - Las cajas de búsqueda sueltas son type "search" (no instance_search).
// - Devuelve además un registro label → elementos para aplicar las acciones
//   sin volver a adivinar el elemento (los DomField no llevan referencias DOM).

import { CLASS_PATTERNS, SELECTORS, UI_TEXT } from "./selectors.js";
import {
  cleanAriaLabel,
  getText,
  isOverlay,
  isUiChrome,
  isVisible,
  labelledByParts,
  queryAll,
} from "./dom-utils.js";
import { humanizeName, parseUnitButtonLabel } from "./aria-label.js";
import { joinLabelledBy } from "./cascade.js";

const FIELD_SUFFIXES = [
  "Value",
  "Unit",
  "Amount",
  "Duration",
  "Frequency",
  "Size",
  "Count",
  "Rate",
  "Limit",
];
const ACTION_WORDS =
  /^(save|cancel|add|delete|remove|show|hide|open|close|next|back|submit|confirm|ok|dismiss|stop|info|accept|decline|customize|preferences|feedback|agree|share|export|copy|edit|create|bulk|language)/i;
const GENERATED_NAME = CLASS_PATTERNS.GENERATED_NAME;

function firstLine(text) {
  return text.replace(/\n.*/s, "").trim();
}

// FIX-3: sección por contenedor con rol, o por el heading visible precedente.
export function resolveSection(el) {
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const role = node.getAttribute("role");
    if (!["region", "group", "fieldset"].includes(role) && node.tagName !== "FIELDSET") continue;
    const ariaLabel = node.getAttribute("aria-label");
    if (ariaLabel) return cleanAriaLabel(ariaLabel);
    const parts = labelledByParts(node);
    if (parts.length > 0) return cleanAriaLabel(parts.join(" "));
    const heading = node.querySelector(
      ":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > legend",
    );
    if (heading) return cleanAriaLabel(firstLine(getText(heading)));
  }
  let nearest = null;
  for (const h of queryAll("page.headings")) {
    if (!isVisible(h) || h.contains(el)) continue;
    if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) nearest = h;
  }
  const text = nearest ? cleanAriaLabel(firstLine(getText(nearest))).slice(0, 80) : "";
  return text.length > 2 ? text : "General";
}

function splitAriaLabel(rawLabel) {
  for (const suffix of FIELD_SUFFIXES) {
    if (rawLabel.endsWith(` ${suffix}`) && rawLabel.length > suffix.length + 5) {
      return {
        label: suffix,
        section: rawLabel.slice(0, rawLabel.length - suffix.length - 1).trim(),
      };
    }
  }
  return { label: rawLabel, section: null };
}

function fullLabel(section, label) {
  return section && section !== "General" ? `${section} > ${label}` : label;
}

// Contenedor de la tabla de instancias: el ancestro más cercano que también
// contiene su heading. Label = texto del heading sin contadores "(123)".
function describeInstanceTable(table) {
  let node = table;
  for (let depth = 0; depth < 6 && node.parentElement; depth++) {
    node = node.parentElement;
    const heading = queryAll("page.headings", node).find(
      (h) =>
        isVisible(h) &&
        !table.contains(h) &&
        h.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    if (heading) {
      const label = cleanAriaLabel(
        firstLine(getText(heading))
          .replace(/\(\s*\d[\d,.]*\s*\)/g, "")
          .trim(),
      );
      return { root: node, label: label || UI_TEXT.INSTANCE_TYPE_FALLBACK_LABEL };
    }
  }
  return { root: table.parentElement ?? table, label: UI_TEXT.INSTANCE_TYPE_FALLBACK_LABEL };
}

function findInstanceTables() {
  const tables = new Map();
  for (const radio of queryAll("instances.radio")) {
    if (!radio.closest(SELECTORS["instances.rows"])) continue;
    const table = radio.closest(SELECTORS["instances.tableContainer"]);
    if (table && !tables.has(table)) tables.set(table, describeInstanceTable(table));
  }
  return [...tables.entries()].map(([table, info]) => ({ table, ...info }));
}

function checkboxLabel(input) {
  let label = joinLabelledBy(labelledByParts(input));
  if (!label && input.id)
    label = getText(document.querySelector(`label[for="${CSS.escape(input.id)}"]`));
  if (!label) {
    const clone = (input.closest("div") || input.parentElement)?.cloneNode(true);
    clone?.querySelectorAll("input, button, select, svg").forEach((n) => n.remove());
    label = (clone?.textContent || "").replace(/\s+/g, " ").trim();
  }
  return cleanAriaLabel(label);
}

function radioOptionLabel(input) {
  const labelFor = input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null;
  return cleanAriaLabel(
    input.getAttribute("aria-label") ||
      joinLabelledBy(labelledByParts(input)) ||
      getText(labelFor) ||
      input.value ||
      "",
  );
}

// FIX-6: nombre legible del grupo desde el heading del radiogroup.
function radioGroupKey(input) {
  const name = input.name || "";
  if (name && !GENERATED_NAME.test(name)) return name;
  const group = input.closest(SELECTORS["form.radiogroup"]);
  const ariaLabel = group?.getAttribute("aria-label");
  if (ariaLabel) return cleanAriaLabel(ariaLabel);
  const parts = group ? labelledByParts(group) : [];
  if (parts.length > 0) return cleanAriaLabel(parts.join(" "));
  const heading = group?.querySelector(SELECTORS["form.radiogroupHeading"]);
  return heading ? cleanAriaLabel(getText(heading)) : resolveSection(input);
}

function createCollector() {
  const fields = [];
  const registry = new Map();
  return {
    fields,
    registry,
    add(field, handle) {
      if (!field.label || registry.has(field.label)) return;
      fields.push(field);
      registry.set(field.label, handle);
    },
  };
}

function scanInputs(collector, isExcluded, radioGroups) {
  for (const input of queryAll("form.inputs")) {
    if (isUiChrome(input) || isExcluded(input) || input.closest("[aria-modal]")) continue;
    const type = input.type || "text";
    if (type === "checkbox") {
      const label = checkboxLabel(input);
      collector.add(
        { label, section: resolveSection(input), type: "checkbox" },
        { kind: "checkbox", el: input },
      );
      continue;
    }
    if (type === "radio") {
      const key = radioGroupKey(input);
      if (!radioGroups.has(key)) radioGroups.set(key, []);
      radioGroups.get(key).push(input);
      continue;
    }
    if (type === "range") continue;
    const raw = cleanAriaLabel(
      input.getAttribute("aria-label") || joinLabelledBy(labelledByParts(input)),
    );
    if (!raw) continue;
    const { label, section: ariaSection } = splitAriaLabel(raw);
    const section = ariaSection && ariaSection !== "General" ? ariaSection : resolveSection(input);
    const fieldType = type === "search" ? "search" : type === "number" ? "number" : "text";
    collector.add(
      { label: fullLabel(section, label), section, type: fieldType },
      { kind: "input", el: input },
    );
  }
}

function scanSelectsAndDropdowns(collector, isExcluded) {
  for (const select of queryAll("form.selects")) {
    if (isUiChrome(select) || isExcluded(select)) continue;
    const label = cleanAriaLabel(
      select.getAttribute("aria-label") || joinLabelledBy(labelledByParts(select)),
    );
    if (!label) continue;
    const section = resolveSection(select);
    const options = [...select.options].map((o) => o.text);
    collector.add(
      { label: fullLabel(section, label), section, type: "select", options },
      { kind: "select", el: select },
    );
  }
  for (const btn of queryAll("form.dropdownButtons")) {
    if (isUiChrome(btn) || isExcluded(btn)) continue;
    const text = getText(btn);
    if (!text || text.length > 80 || ACTION_WORDS.test(text)) continue;
    const parts = labelledByParts(btn);
    const withoutValue = parts.slice(0, -1);
    // FIX-2/FIX-8: botón Unit leído por significado (ELB y WAF ordenan distinto).
    const unit = parseUnitButtonLabel(parts);
    let label;
    let section;
    if (unit) {
      label = unit.label;
      section = unit.section || resolveSection(btn);
    } else if (withoutValue.length > 0) {
      label = cleanAriaLabel(withoutValue[withoutValue.length - 1]);
      section = withoutValue.length > 1 ? cleanAriaLabel(withoutValue[0]) : resolveSection(btn);
    } else {
      label = cleanAriaLabel(btn.getAttribute("aria-label") || parts[0] || "");
      section = resolveSection(btn);
    }
    if (!label) continue;
    collector.add(
      { label: fullLabel(section, label), section, type: "dropdown" },
      { kind: "dropdown", el: btn },
    );
  }
  for (const slider of queryAll("form.sliders")) {
    if (isUiChrome(slider) || isExcluded(slider)) continue;
    const label = cleanAriaLabel(slider.getAttribute("aria-label") || "");
    const section = resolveSection(slider);
    collector.add(
      { label: fullLabel(section, label), section, type: "slider" },
      { kind: "slider", el: slider },
    );
  }
}

// Escanea el formulario visible → { fields: DomField[], registry }.
export function scanFormFields() {
  const collector = createCollector();
  const instanceTables = findInstanceTables();
  // El overlay del Spotlight nunca entra en el escaneo (BR5.2, NFR5.3).
  const isExcluded = (el) => isOverlay(el) || instanceTables.some((t) => t.root.contains(el));
  for (const { table, root, label } of instanceTables) {
    collector.add(
      { label, section: null, type: "instance_radio" },
      { kind: "instance_radio", table, root },
    );
  }
  const radioGroups = new Map();
  scanInputs(collector, isExcluded, radioGroups);
  scanSelectsAndDropdowns(collector, isExcluded);
  for (const [key, radios] of radioGroups) {
    const section = resolveSection(radios[0]);
    const label = GENERATED_NAME.test(key) ? section : cleanAriaLabel(humanizeName(key));
    const options = radios.map(radioOptionLabel).filter(Boolean);
    collector.add(
      {
        label: fullLabel(section === label ? null : section, label),
        section,
        type: "radiogroup",
        options,
      },
      { kind: "radiogroup", radios },
    );
  }
  return { fields: collector.fields, registry: collector.registry };
}
