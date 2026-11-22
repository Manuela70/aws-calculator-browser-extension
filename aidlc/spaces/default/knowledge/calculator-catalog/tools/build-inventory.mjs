// Descarga por tandas las definiciones públicas de servicios de calculator.aws y
// arma un inventario de campos configurables. Uso (desde la raíz del repo):
//   node aidlc/spaces/default/knowledge/calculator-catalog/tools/build-inventory.mjs fetch <desde> <hasta>
//   node aidlc/spaces/default/knowledge/calculator-catalog/tools/build-inventory.mjs build
// Fuente: manifest/en_US.json (lista de servicios) y data/<serviceCode>/en_US.json
// (definición del formulario). Solo datos públicos; sin credenciales.

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(ROOT, "raw");
const DEFS = join(RAW, "definitions");
const CONCURRENCY = 6;

async function loadManifest() {
  const text = await readFile(join(RAW, "manifest-en_US.json"), "utf8");
  return JSON.parse(text).awsServices;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function fetchOne(svc) {
  const out = join(DEFS, `${svc.serviceCode}.json`);
  if (await exists(out)) return { code: svc.serviceCode, status: "cached" };
  if (!svc.serviceDefinitionLocation) return { code: svc.serviceCode, status: "no_definition" };
  const res = await fetch(svc.serviceDefinitionLocation);
  if (!res.ok) return { code: svc.serviceCode, status: `http_${res.status}` };
  await writeFile(out, await res.text());
  return { code: svc.serviceCode, status: "ok" };
}

async function fetchBatch(from, to) {
  await mkdir(DEFS, { recursive: true });
  const services = (await loadManifest()).slice(from, to);
  const results = [];
  for (let i = 0; i < services.length; i += CONCURRENCY) {
    const chunk = services.slice(i, i + CONCURRENCY);
    results.push(
      ...(await Promise.all(
        chunk.map((s) => fetchOne(s).catch((e) => ({ code: s.serviceCode, status: `error ${e.message}` }))),
      )),
    );
  }
  const failed = results.filter((r) => !["ok", "cached"].includes(r.status));
  console.log(`tanda ${from}-${to}: ${results.length} servicios, ${failed.length} con problema`);
  for (const f of failed) console.log(`  ${f.code}: ${f.status}`);
}

// Recorre la definición y junta todo objeto con type === "input".
function collectInputs(node, ctx, acc) {
  if (Array.isArray(node)) {
    for (const item of node) collectInputs(item, ctx, acc);
    return;
  }
  if (!node || typeof node !== "object") return;
  const next = { ...ctx };
  if (typeof node.title === "string" && Array.isArray(node.cards)) next.template = node.title;
  if (typeof node.title === "string" && node.inputSection) next.card = node.title;
  if (node.type === "input") {
    acc.push({
      template: ctx.template ?? null,
      card: ctx.card ?? null,
      id: node.id ?? null,
      label: typeof node.label === "string" ? node.label.trim() : null,
      subType: node.subType ?? null,
      options: Array.isArray(node.options)
        ? node.options.map((o) => (typeof o === "object" ? (o.label ?? o.id) : o))
        : null,
      unit: node.unit ?? node.units ?? node.unitLabel ?? null,
      defaultValue: node.defaultValue ?? node.defaultDropDownItem ?? null,
      required: node.validations?.required ?? null,
      min: node.validations?.min ?? node.min ?? null,
      max: node.validations?.max ?? node.max ?? null,
      conditional: Boolean(node.displayIf),
    });
  }
  for (const value of Object.values(node)) collectInputs(value, next, acc);
}

async function build() {
  const services = await loadManifest();
  const inventory = [];
  const subTypes = {};
  let missing = 0;
  for (const svc of services) {
    const path = join(DEFS, `${svc.serviceCode}.json`);
    if (!(await exists(path))) {
      missing += 1;
      continue;
    }
    const def = JSON.parse(await readFile(path, "utf8"));
    const inputs = [];
    collectInputs(def.templates ?? [], {}, inputs);
    for (const input of inputs) subTypes[input.subType] = (subTypes[input.subType] ?? 0) + 1;
    inventory.push({
      serviceCode: svc.serviceCode,
      name: svc.name.trim(),
      searchKeywords: svc.searchKeywords ?? [],
      regions: Array.isArray(svc.regions) ? svc.regions : [],
      layout: def.layout ?? null,
      templates: (def.templates ?? []).map((t) => t.title),
      inputs,
    });
  }
  await writeFile(join(ROOT, "inventory.json"), JSON.stringify(inventory, null, 1));
  console.log(`servicios con definición: ${inventory.length}; sin descargar: ${missing}`);
  console.log("subTypes:", subTypes);
}

const [cmd, from, to] = process.argv.slice(2);
if (cmd === "fetch") await fetchBatch(Number(from ?? 0), Number(to ?? 1000));
else if (cmd === "build") await build();
else console.log("uso: fetch <desde> <hasta> | build");
