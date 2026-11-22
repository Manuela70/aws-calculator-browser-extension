// brain/core/prompt-builder.js — Armado de los pedidos al modelo (NFR1.10,
// NFR7.1, NFR8.5). Las instrucciones vienen de los archivos versionados
// prompts/*.md (los carga el servidor y los pasa como texto); los datos del SE
// viajan siempre como JSON en el mensaje del usuario, separados de las
// instrucciones, para acotar la inyección de instrucciones.

function compactField(field) {
  const out = { label: field.label, kind: field.kind };
  if (field.template) out.template = field.template;
  if (field.options) out.options = field.options;
  return out;
}

function withRetryHint(payload, previousError) {
  return previousError ? { ...payload, previousError } : payload;
}

// /interpret: nombres canónicos sin campos y campos completos solo de los candidatos.
export function buildInterpretPrompt({ instructions, text, canonicalNames, candidates }, retry) {
  const payload = {
    expression: text,
    canonicalServices: canonicalNames,
    candidates: candidates.map((service) => ({
      name: service.name,
      templates: service.templates,
      regions: service.regions,
      fields: service.fields.map(compactField),
    })),
  };
  return { system: instructions, user: JSON.stringify(withRetryHint(payload, retry)) };
}

// /map-residue: los campos escaneados, lo pedido y el residuo.
export function buildResiduePrompt({ instructions, request }, retry) {
  const payload = {
    service: request.service,
    domFields: request.domFields,
    requestedValues: request.requestedValues,
    unresolved: request.unresolved,
  };
  return { system: instructions, user: JSON.stringify(withRetryHint(payload, retry)) };
}

// /waf-evaluate: un lote de servicios con su posición global en el pedido.
export function buildWafPrompt({ instructions, phase, batch }, retry) {
  const payload = {
    phase,
    services: batch.map(({ serviceIndex, service }) => ({
      serviceIndex,
      name: service.name,
      config: service.config,
    })),
  };
  return { system: instructions, user: JSON.stringify(withRetryHint(payload, retry)) };
}
