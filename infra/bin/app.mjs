// infra/bin/app.mjs — Punto de entrada de AWS CDK (`cdk synth`, `cdk diff`,
// `cdk deploy`). Parámetros: archivo infra/deploy-params.json (no versionado) o
// contexto `-c <nombre>=<valor>`, que tiene prioridad. Precios: archivo indicado
// por el contexto `costInputs` (cost-inputs.json por defecto).
// Si falta un parámetro o el estimado de costo no pasa la compuerta, termina con
// código 1 y explica el motivo.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { App } from "aws-cdk-lib";
import { DeployParamsError, PARAM_NAMES, buildBrainApp } from "../lib/build-app.mjs";
import { CostGateError, loadCostInputs } from "../scripts/token-caps.mjs";

const INFRA_DIR = fileURLToPath(new URL("../", import.meta.url));

function readParamsFile(path) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new DeployParamsError(`${path} no es JSON válido.`);
  }
}

const app = new App();
const context = (name) => app.node.tryGetContext(name);

try {
  const fileParams = readParamsFile(resolve(INFRA_DIR, context("params") ?? "deploy-params.json"));
  const overrides = Object.fromEntries(
    [...PARAM_NAMES, "bedrockRoleArn"]
      .filter((name) => context(name) !== undefined)
      .map((name) => [name, String(context(name))]),
  );
  buildBrainApp({
    app,
    account: context("account") ?? process.env.CDK_DEFAULT_ACCOUNT,
    region: context("region") ?? process.env.CDK_DEFAULT_REGION ?? "us-east-1",
    params: { ...fileParams, ...overrides },
    costInputs: loadCostInputs(resolve(INFRA_DIR, context("costInputs") ?? "cost-inputs.json")),
  });
} catch (error) {
  if (error instanceof CostGateError || error instanceof DeployParamsError) {
    process.stderr.write(`cdk synth detenido: ${error.message}\n`);
    process.exit(1);
  }
  throw error;
}
