// brain/core/operations.js — Flujos B1 (interpretar), B2 (residuo) y B3
// (Well-Architected) de functional-spec.md §4. Reciben pedidos ya validados y
// devuelven un resultado tipado; el servidor arma la respuesta HTTP y el registro.
// Resultado: { ok: true, body, usage } o { ok: false, code, retryAfterSeconds?, usage }.
// usage = { operation, inventoryVersion, attempts, inputTokens, outputTokens, outcome }.

import { selectCandidates } from "./candidate-selector.js";
import {
  parseModelJson,
  validateInterpretOutput,
  validateResidueOutput,
  validateWafOutput,
} from "./output-validators.js";
import { buildInterpretPrompt, buildResiduePrompt, buildWafPrompt } from "./prompt-builder.js";

function validateWith(validator, context) {
  return (text) => {
    const parsed = parseModelJson(text);
    if (!parsed.ok) return parsed;
    return validator(parsed.value, context);
  };
}

function usageOf(operation, inventoryVersion, run) {
  return {
    operation,
    inventoryVersion,
    attempts: run?.attempts ?? 0,
    inputTokens: run?.inputTokens ?? 0,
    outputTokens: run?.outputTokens ?? 0,
    outcome: run?.outcome ?? "ok",
  };
}

function failure(run, usage) {
  return { ok: false, code: run.code, retryAfterSeconds: run.retryAfterSeconds, usage };
}

// Lotes de hasta `size` servicios con su posición global en el pedido.
export function toBatches(services, size) {
  const batches = [];
  for (let i = 0; i < services.length; i += size) {
    batches.push(
      services.slice(i, i + size).map((service, j) => ({ serviceIndex: i + j, service })),
    );
  }
  return batches;
}

export function createOperations({ gateway, getInventory, instructions, maxTokens, wafBatchSize }) {
  function requireInventory(operation) {
    const inventory = getInventory();
    if (inventory) return { inventory };
    return {
      result: {
        ok: false,
        code: "inventory_unavailable",
        usage: usageOf(operation, null, null),
      },
    };
  }

  return {
    // B1 — Interpretar (C3).
    async interpret(request, { deadline }) {
      const { inventory, result } = requireInventory("interpret");
      if (result) return result;
      const version = inventory.version;
      const candidates = selectCandidates(inventory, request.text);
      if (candidates.length === 0) {
        // Sin candidatos: unresolved sin invocar el modelo (BR7.1).
        return {
          ok: true,
          body: {
            status: "unresolved",
            unresolved: [{ fragment: request.text, reason: "unknown_service" }],
            inventoryVersion: version,
          },
          usage: usageOf("interpret", version, null),
        };
      }
      const run = await gateway.run({
        deadline,
        maxTokens: maxTokens.interpret,
        buildPrompt: (previousError) =>
          buildInterpretPrompt(
            {
              instructions: instructions.interpret,
              text: request.text,
              canonicalNames: inventory.canonicalNames,
              candidates,
            },
            previousError,
          ),
        validate: validateWith(validateInterpretOutput, { candidates }),
      });
      const usage = usageOf("interpret", version, run);
      if (!run.ok) return failure(run, usage);
      return { ok: true, body: { ...run.value, inventoryVersion: version }, usage };
    },

    // B2 — Residuo (C1).
    async mapResidue(request, { deadline }) {
      const { inventory, result } = requireInventory("map_residue");
      if (result) return result;
      const version = inventory.version;
      const run = await gateway.run({
        deadline,
        maxTokens: maxTokens.map_residue,
        buildPrompt: (previousError) =>
          buildResiduePrompt({ instructions: instructions.mapResidue, request }, previousError),
        validate: validateWith(validateResidueOutput, request),
      });
      const usage = usageOf("map_residue", version, run);
      if (!run.ok) return failure(run, usage);
      return { ok: true, body: { ...run.value, inventoryVersion: version }, usage };
    },

    // B3 — Well-Architected (C2): lotes de hasta 5 en paralelo; si un lote falla,
    // la respuesta entera es el error de ese lote (nunca parcial).
    async wafEvaluate(request, { deadline }) {
      const operation = request.phase === "pre_fill" ? "waf_pre_fill" : "waf_post_fill";
      const { inventory, result } = requireInventory(operation);
      if (result) return result;
      const version = inventory.version;
      const batches = toBatches(request.services, wafBatchSize);
      const runs = await Promise.all(
        batches.map((batch) =>
          gateway.run({
            deadline,
            maxTokens: maxTokens.waf_evaluate,
            buildPrompt: (previousError) =>
              buildWafPrompt(
                { instructions: instructions.waf, phase: request.phase, batch },
                previousError,
              ),
            validate: validateWith(validateWafOutput, batch),
          }),
        ),
      );
      const total = {
        attempts: Math.max(...runs.map((r) => r.attempts)),
        inputTokens: runs.reduce((sum, r) => sum + r.inputTokens, 0),
        outputTokens: runs.reduce((sum, r) => sum + r.outputTokens, 0),
      };
      const failed = runs.find((r) => !r.ok);
      if (failed) {
        return failure(failed, usageOf(operation, version, { ...total, outcome: failed.outcome }));
      }
      return {
        ok: true,
        body: {
          perService: runs.flatMap((r) => r.value.perService),
          inventoryVersion: version,
        },
        usage: usageOf(operation, version, { ...total, outcome: "ok" }),
      };
    },
  };
}
