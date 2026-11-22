// brain/core/inventory-model.js — Modelo del inventario versionado (entities.md:
// InventorySnapshot, InventoryService, InventoryField; BR5.1, BR5.2, NFR3.5).
// Módulo puro: sin red, sin disco, sin SDK. Lo usan el servicio (validar e
// indexar la versión cargada) y InventoryJob (armar la versión desde las
// definiciones públicas de calculator.aws).

export const FIELD_KINDS = ["quantity", "unit", "choice", "checkbox", "toggle", "complex"];
export const SNAPSHOT_STATUSES = ["active", "superseded", "rejected"];
export const MAX_SNAPSHOT_BYTES = 50 * 1024 * 1024;
export const TOGGLE_PREFIX = "__switch__:";
export const UNIT_SUFFIX = " unit";
export const LABEL_SEPARATOR = " > ";

const VERSION_PATTERN = /^\d{4}-\d{2}-\d{2}(-\d+)?$/;

// Tipos de la definición que son solo presentación: no son campos configurables.
const DISPLAY_SUBTYPES = new Set([
  "bodyText",
  "alert",
  "headerText",
  "workflowInstruction",
  "priceSelector",
  "sqlSummary",
  "windowsSummary",
  "dedicatedHostsReviewTable",
  "dedicatedHostsCostTable",
]);

// Cantidades sin unidad propia.
const QUANTITY_SUBTYPES = new Set(["numericInput", "percentInput", "utilization"]);

// Cantidades con unidad: generan el campo del número y el campo "<Campo> unit".
// Si la definición no trae opciones de unidad, se usan estas listas, que son las
// que muestra la calculadora para cada tipo.
const UNIT_SUBTYPES = {
  fileSize: ["KB", "MB", "GB", "TB", "PB"],
  frequency: ["per second", "per minute", "per hour", "per day", "per month"],
  durationInput: ["seconds", "minutes", "hours", "days"],
  throughput: ["KBps", "MBps", "GBps"],
};

const CHOICE_SUBTYPES = new Set(["dropdown", "radioTiles", "workloadDropdown"]);
const CHECKBOX_SUBTYPES = new Set(["checkbox"]);
const TOGGLE_SUBTYPES = new Set(["condition"]);

// Clasifica un subType de la definición. Un subType desconocido se trata como
// "complex": el cerebro nunca lo llena y lo reporta como unsupported_component.
export function classifySubType(subType, hasOptions) {
  if (DISPLAY_SUBTYPES.has(subType)) return "display";
  if (QUANTITY_SUBTYPES.has(subType)) return "quantity";
  if (Object.hasOwn(UNIT_SUBTYPES, subType)) return "quantity_with_unit";
  if (CHOICE_SUBTYPES.has(subType)) return hasOptions ? "choice" : "complex";
  if (CHECKBOX_SUBTYPES.has(subType)) return "checkbox";
  if (TOGGLE_SUBTYPES.has(subType)) return "toggle";
  return "complex";
}

function cleanOptions(options) {
  if (!Array.isArray(options)) return [];
  return options.filter((o) => typeof o === "string" && o.trim().length > 0).map((o) => o.trim());
}

// Convierte las entradas crudas de una definición (forma de build-inventory) en
// campos del inventario. Etiqueta "Sección > Campo" cuando la etiqueta se repite
// dentro de la misma plantilla del servicio; si no, "Campo".
export function buildFields(inputs, templates) {
  const multiTemplate = templates.length > 1;
  const usable = [];
  for (const input of inputs) {
    if (typeof input?.label !== "string" || input.label.trim().length === 0) continue;
    const options = cleanOptions(input.options);
    const category = classifySubType(input.subType, options.length > 0);
    if (category === "display") continue;
    usable.push({ input, options, category, label: input.label.trim() });
  }
  const counts = new Map();
  for (const item of usable) {
    const key = `${item.input.template ?? ""}\u0000${item.label}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const fields = [];
  const seen = new Set();
  for (const item of usable) {
    const template = multiTemplate && item.input.template ? item.input.template : undefined;
    const repeated = counts.get(`${item.input.template ?? ""}\u0000${item.label}`) > 1;
    const label =
      repeated && item.input.card
        ? `${item.input.card}${LABEL_SEPARATOR}${item.label}`
        : item.label;
    const identity = `${template ?? ""}\u0000${label}`;
    if (seen.has(identity)) continue; // misma sección y etiqueta: un solo campo
    seen.add(identity);
    const base = { label, conditional: Boolean(item.input.conditional) };
    if (template) base.template = template;
    if (item.category === "quantity_with_unit") {
      fields.push({ ...base, kind: "quantity" });
      const unitOptions =
        item.options.length > 0 ? item.options : UNIT_SUBTYPES[item.input.subType];
      fields.push({ ...base, label: `${label}${UNIT_SUFFIX}`, kind: "unit", options: unitOptions });
    } else if (item.category === "choice") {
      fields.push({ ...base, kind: "choice", options: item.options });
    } else {
      fields.push({ ...base, kind: item.category });
    }
  }
  return fields;
}

// Arma un InventoryService desde la entrada cruda del catálogo.
export function buildService(raw, { canonical, synonymsEs }) {
  const templates = (raw.templates ?? []).filter((t) => typeof t === "string" && t.length > 0);
  return {
    serviceCode: raw.serviceCode,
    name: String(raw.name).trim(),
    canonical: Boolean(canonical),
    searchKeywords: Array.isArray(raw.searchKeywords) ? [...new Set(raw.searchKeywords)] : [],
    synonymsEs: Array.isArray(synonymsEs) ? synonymsEs : [],
    regions: Array.isArray(raw.regions) ? raw.regions : [],
    templates,
    fields: buildFields(raw.inputs ?? [], templates),
  };
}

// Decide qué entrada es canónica cuando varias comparten nombre visible: la que
// indica la lista de preferencias versionada; si no hay preferencia, la primera.
export function assignCanonical(rawServices, preferences = {}) {
  const byName = new Map();
  for (const raw of rawServices) {
    const name = String(raw.name).trim();
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(raw.serviceCode);
  }
  const canonical = new Set();
  for (const [name, codes] of byName) {
    const preferred = preferences[name];
    canonical.add(preferred && codes.includes(preferred) ? preferred : codes[0]);
  }
  return canonical;
}

// Arma la versión completa del inventario (InventorySnapshot).
export function buildSnapshot({
  version,
  generatedAt,
  rawServices,
  preferences = {},
  synonyms = {},
}) {
  const canonical = assignCanonical(rawServices, preferences);
  const services = rawServices.map((raw) =>
    buildService(raw, {
      canonical: canonical.has(raw.serviceCode),
      synonymsEs: synonyms[String(raw.name).trim()] ?? [],
    }),
  );
  return {
    version,
    generatedAt,
    serviceCount: services.length,
    fieldCount: services.reduce((sum, s) => sum + s.fields.length, 0),
    status: "active",
    services,
  };
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringList(value) {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function validateField(field, where, errors) {
  if (!field || typeof field !== "object") {
    errors.push(`${where}: campo inválido`);
    return;
  }
  if (!isNonEmptyString(field.label)) errors.push(`${where}: label vacío`);
  if (!FIELD_KINDS.includes(field.kind)) errors.push(`${where}: kind desconocido "${field.kind}"`);
  if (typeof field.conditional !== "boolean") errors.push(`${where}: conditional no booleano`);
  if (field.template !== undefined && !isNonEmptyString(field.template)) {
    errors.push(`${where}: template vacío`);
  }
  if (field.kind === "choice" || field.kind === "unit") {
    if (!isStringList(field.options) || field.options.length === 0) {
      errors.push(`${where}: ${field.kind} sin opciones`);
    }
  }
}

function validateService(service, index, errors) {
  const where = `services[${index}]`;
  if (!service || typeof service !== "object") {
    errors.push(`${where}: servicio inválido`);
    return;
  }
  if (!isNonEmptyString(service.serviceCode)) errors.push(`${where}: serviceCode vacío`);
  if (!isNonEmptyString(service.name)) errors.push(`${where}: name vacío`);
  if (typeof service.canonical !== "boolean") errors.push(`${where}: canonical no booleano`);
  for (const key of ["searchKeywords", "synonymsEs", "regions", "templates"]) {
    if (!isStringList(service[key])) errors.push(`${where}: ${key} no es lista de textos`);
  }
  if (!Array.isArray(service.fields)) {
    errors.push(`${where}: fields no es lista`);
    return;
  }
  const identities = new Set();
  service.fields.forEach((field, i) => {
    validateField(field, `${where}.fields[${i}]`, errors);
    const identity = `${field?.template ?? ""}\u0000${field?.label}`;
    if (identities.has(identity))
      errors.push(`${where}.fields[${i}]: etiqueta repetida "${field.label}"`);
    identities.add(identity);
  });
}

// Valida esquema y tamaño de una versión. byteLength es el tamaño del JSON
// serializado (lo mide quien lo leyó o lo generó).
export function validateSnapshot(snapshot, { byteLength = 0 } = {}) {
  const errors = [];
  if (byteLength > MAX_SNAPSHOT_BYTES) {
    errors.push(`tamaño ${byteLength} supera ${MAX_SNAPSHOT_BYTES} bytes`);
  }
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { ok: false, errors: [...errors, "la versión no es un objeto"] };
  }
  if (typeof snapshot.version !== "string" || !VERSION_PATTERN.test(snapshot.version)) {
    errors.push("version inválida");
  }
  if (!isNonEmptyString(snapshot.generatedAt) || Number.isNaN(Date.parse(snapshot.generatedAt))) {
    errors.push("generatedAt inválido");
  }
  if (!SNAPSHOT_STATUSES.includes(snapshot.status)) errors.push("status inválido");
  if (!Array.isArray(snapshot.services) || snapshot.services.length === 0) {
    errors.push("services vacío");
    return { ok: false, errors };
  }
  snapshot.services.forEach((service, i) => validateService(service, i, errors));
  if (snapshot.serviceCount !== snapshot.services.length) errors.push("serviceCount no coincide");
  const fieldCount = snapshot.services.reduce(
    (sum, s) => sum + (Array.isArray(s?.fields) ? s.fields.length : 0),
    0,
  );
  if (snapshot.fieldCount !== fieldCount) errors.push("fieldCount no coincide");
  const canonicalByName = new Map();
  for (const s of snapshot.services) {
    if (s?.canonical) canonicalByName.set(s.name, (canonicalByName.get(s.name) ?? 0) + 1);
  }
  for (const [name, count] of canonicalByName) {
    if (count > 1) errors.push(`más de una entrada canónica para "${name}"`);
  }
  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors };
}

// Índice por nombre de servicio (solo entradas canónicas: las únicas que el
// cerebro puede elegir) y lista compacta de nombres.
export function indexInventory(snapshot) {
  const byName = new Map();
  for (const service of snapshot.services) {
    if (service.canonical) byName.set(service.name, service);
  }
  return {
    version: snapshot.version,
    generatedAt: snapshot.generatedAt,
    byName,
    canonicalNames: [...byName.keys()].sort(),
  };
}

// Campos de un servicio por plantilla: Map(template|"" → Map(clave → campo)).
// La clave de un toggle es "__switch__:<label>"; la de los demás, su label.
export function fieldKeysByTemplate(service) {
  const result = new Map();
  for (const field of service.fields) {
    const template = field.template ?? "";
    if (!result.has(template)) result.set(template, new Map());
    const key = field.kind === "toggle" ? `${TOGGLE_PREFIX}${field.label}` : field.label;
    result.get(template).set(key, field);
  }
  return result;
}

// Compara una versión nueva con la activa (BR5.2): rechaza si pierde más del
// límite de servicios o de campos.
export function compareWithActive(candidate, active, maxLossRatio = 0.1) {
  if (!active) return { ok: true, serviceLoss: 0, fieldLoss: 0 };
  const loss = (next, prev) => (prev > 0 ? (prev - next) / prev : 0);
  const serviceLoss = loss(candidate.serviceCount, active.serviceCount);
  const fieldLoss = loss(candidate.fieldCount, active.fieldCount);
  return {
    ok: serviceLoss <= maxLossRatio && fieldLoss <= maxLossRatio,
    serviceLoss,
    fieldLoss,
  };
}

// Antigüedad en días de una versión (BR5.3, métrica InventoryAgeDays).
export function snapshotAgeDays(snapshot, nowMs) {
  return Math.floor((nowMs - Date.parse(snapshot.generatedAt)) / 86_400_000);
}
