// infra/lib/build-app.mjs — Ensambla la app de CDK: valida los parámetros de
// despliegue (riesgo R3: si falta uno, `cdk synth` falla con un mensaje
// claro), aplica la compuerta de costo (token-caps.mjs) y crea los dos stacks. Lo usan bin/app.mjs y las pruebas de síntesis.

import { readFileSync } from "node:fs";
import { App } from "aws-cdk-lib";
import { computeTokenCaps } from "../scripts/token-caps.mjs";
import { BrainBootstrapStack } from "./brain-bootstrap-stack.mjs";
import { BrainStack } from "./brain-stack.mjs";

export { Match, Template } from "aws-cdk-lib/assertions";

export const PARAM_NAMES = [
  "alarmEmail",
  "extensionId",
  "cognitoDomainPrefix",
  "githubRepo",
  "imageTag",
];

const PARAM_PATTERNS = {
  extensionId: /^[a-p]{32}$/,
  githubRepo: /^[\w.-]+\/[\w.-]+$/,
  alarmEmail: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
  cognitoDomainPrefix: /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
  imageTag: /^[\w.-]{1,128}$/,
};

const BEDROCK_ROLE_ARN = /^arn:aws[\w-]*:iam::\d{12}:role\/[\w+=,.@/-]{1,128}$/;

export class DeployParamsError extends Error {
  constructor(message) {
    super(message);
    this.name = "DeployParamsError";
  }
}

export function validateParams(params) {
  const missing = PARAM_NAMES.filter(
    (name) => typeof params?.[name] !== "string" || params[name] === "",
  );
  if (missing.length > 0) {
    throw new DeployParamsError(
      `Faltan parámetros de despliegue: ${missing.join(", ")}. Defínelos en ` +
        "infra/deploy-params.json (ver deploy-params.example.json) o con -c <nombre>=<valor>.",
    );
  }
  const invalid = Object.entries(PARAM_PATTERNS)
    .filter(([name, pattern]) => !pattern.test(params[name]))
    .map(([name]) => name);
  if (invalid.length > 0) {
    throw new DeployParamsError(
      `Parámetros de despliegue con formato inválido: ${invalid.join(", ")}.`,
    );
  }
  // Opcional: rol de la cuenta que tiene Bedrock (cd-config.md §3.2). Sin él, el
  // modelo se invoca en esta misma cuenta.
  if (params.bedrockRoleArn !== undefined && !BEDROCK_ROLE_ARN.test(params.bedrockRoleArn)) {
    throw new DeployParamsError("Parámetro de despliegue con formato inválido: bedrockRoleArn.");
  }
  return params;
}

// Modelo y región del modelo: la única fuente es brain/config.json (NFR7.1).
export function loadModelConfig() {
  const config = JSON.parse(
    readFileSync(new URL("../../brain/config.json", import.meta.url), "utf8"),
  );
  return { modelId: config.model.modelId, region: config.model.region };
}

export function buildBrainApp({
  app = new App(),
  account,
  region = "us-east-1",
  params,
  costInputs,
}) {
  if (!account) {
    throw new DeployParamsError(
      "Falta la cuenta de AWS: usa -c account=<id> o CDK_DEFAULT_ACCOUNT.",
    );
  }
  validateParams(params);
  const caps = computeTokenCaps(costInputs);
  const env = { account, region };
  const bootstrap = new BrainBootstrapStack(app, "BrainBootstrapStack", {
    env,
    stackName: "brain-bootstrap",
    githubRepo: params.githubRepo,
    bedrockRoleArn: params.bedrockRoleArn,
  });
  const brain = new BrainStack(app, "BrainStack", {
    env,
    stackName: "brain",
    params: { ...params, monthlyBudgetUsd: costInputs.monthlyBudgetUsd },
    caps,
    model: loadModelConfig(),
  });
  return { app, bootstrap, brain, caps };
}
