// infra/scripts/token-caps.mjs — Topes de tokens derivados del presupuesto y
// compuerta de costo de `cdk synth` (infrastructure-specification.md §4).
//   FIXED_MONTHLY          = suma de los componentes de infraestructura (todo salvo
//                            Bedrock); con Lambda varían con el uso, se estiman
//   TOKEN_BUDGET_MONTHLY   = presupuesto × 0,8 − FIXED_MONTHLY
//   GLOBAL_DAILY_TOKEN_CAP = floor(TOKEN_BUDGET_MONTHLY / 30 / precio mezclado por token)
//   DAILY_TOKEN_CAP        = floor(GLOBAL_DAILY_TOKEN_CAP / cantidad de SE)
// La compuerta falla si cost-inputs.json está incompleto, si FIXED_MONTHLY ≥ la
// mitad del presupuesto (USD 25 con USD 50) o si TOKEN_BUDGET_MONTHLY ≤ 0.
// Los precios los completa el mantenedor desde la AWS Pricing Calculator; este
// script no trae ninguna cifra de precio propia.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const FIXED_COMPONENTS = ["lambda", "inventoryJob", "dynamodb", "s3", "cloudwatch", "ecr"];

const BUDGET_MARGIN = 0.8;

export class CostGateError extends Error {
  constructor(message) {
    super(message);
    this.name = "CostGateError";
  }
}

function isNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveNumber(value) {
  return isNonNegativeNumber(value) && value > 0;
}

// Devuelve la lista de campos faltantes o inválidos.
export function missingInputs(inputs) {
  const missing = [];
  if (!inputs || typeof inputs !== "object") return ["cost-inputs"];
  if (!isPositiveNumber(inputs.monthlyBudgetUsd)) missing.push("monthlyBudgetUsd");
  for (const name of FIXED_COMPONENTS) {
    if (!isNonNegativeNumber(inputs.fixedMonthlyUsd?.[name]))
      missing.push(`fixedMonthlyUsd.${name}`);
  }
  for (const name of [
    "inputPricePerMillionTokensUsd",
    "outputPricePerMillionTokensUsd",
    "inputToOutputRatio",
    "seCount",
  ]) {
    if (!isPositiveNumber(inputs[name])) missing.push(name);
  }
  return missing;
}

export function computeTokenCaps(inputs) {
  const missing = missingInputs(inputs);
  if (missing.length > 0) {
    throw new CostGateError(
      `cost-inputs.json incompleto: faltan o son inválidos ${missing.join(", ")}. ` +
        "Completa los precios con la AWS Pricing Calculator (us-east-1) antes de sintetizar.",
    );
  }
  const fixedMonthly = FIXED_COMPONENTS.reduce((sum, n) => sum + inputs.fixedMonthlyUsd[n], 0);
  const halfBudget = inputs.monthlyBudgetUsd / 2;
  if (fixedMonthly >= halfBudget) {
    throw new CostGateError(
      `El costo fijo mensual (USD ${fixedMonthly.toFixed(2)}) alcanza o supera la mitad del ` +
        `presupuesto (USD ${halfBudget.toFixed(2)}). Revisa las palancas de R1 antes de desplegar.`,
    );
  }
  const tokenBudgetMonthly = inputs.monthlyBudgetUsd * BUDGET_MARGIN - fixedMonthly;
  if (tokenBudgetMonthly <= 0) {
    throw new CostGateError(
      `El presupuesto de tokens no es positivo (USD ${tokenBudgetMonthly.toFixed(2)}).`,
    );
  }
  const ratio = inputs.inputToOutputRatio;
  const blendedPricePerToken =
    (ratio * inputs.inputPricePerMillionTokensUsd + inputs.outputPricePerMillionTokensUsd) /
    (ratio + 1) /
    1_000_000;
  const globalDailyTokenCap = Math.floor(tokenBudgetMonthly / 30 / blendedPricePerToken);
  const dailyTokenCap = Math.floor(globalDailyTokenCap / inputs.seCount);
  if (dailyTokenCap <= 0) {
    throw new CostGateError("El tope diario por SE resulta en 0 tokens con estos precios.");
  }
  return {
    fixedMonthly,
    tokenBudgetMonthly,
    globalDailyTokenCap,
    dailyTokenCap,
  };
}

export function loadCostInputs(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new CostGateError(
      `No existe ${path}. Copia cost-inputs.example.json a cost-inputs.json y completa los ` +
        "precios reales con la AWS Pricing Calculator.",
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new CostGateError(`${path} no es JSON válido.`);
  }
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  try {
    const caps = computeTokenCaps(loadCostInputs(process.argv[2] ?? "cost-inputs.json"));
    process.stdout.write(`${JSON.stringify(caps, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
