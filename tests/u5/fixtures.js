// Fábricas de datos de prueba de U5. Cada prueba arma sus propios datos; nada
// mutable se comparte. Las formas siguen entities.md de U5 y el contrato de U3
// (MappingOutcome con substituted/requestedValue, residueDetail, brainErrorCode).

import { makeServiceRequest } from "../u1/fixtures.js";

// Caso canónico del walking skeleton: EC2 con cuatro campos.
export function makeEc2Request(overrides = {}) {
  return makeServiceRequest(overrides);
}

// Bedrock con plantilla y toggle condicional (FIX-7): el campo del proveedor
// solo aparece tras activar el toggle.
export function makeBedrockRequest(overrides = {}) {
  return {
    requestId: "svc-2",
    serviceName: "Amazon Bedrock",
    searchTerm: "Amazon Bedrock",
    template: "Advanced estimate",
    region: "us-east-1",
    fields: [{ key: "Number of requests", value: "1000" }],
    toggles: [{ label: "Anthropic", wantOn: true }],
    ...overrides,
  };
}

export function makeLambdaRequest(overrides = {}) {
  return {
    requestId: "svc-3",
    serviceName: "AWS Lambda",
    searchTerm: "AWS Lambda",
    region: "us-east-1",
    fields: [{ key: "Number of requests", value: "1000" }],
    toggles: [],
    ...overrides,
  };
}

export function makeBedrockDomFields() {
  return [{ label: "Number of requests", type: "number" }];
}

export function makeMultiRunRequest(overrides = {}) {
  return {
    runId: "run-multi-1",
    project: "Multi servicio",
    services: [makeEc2Request(), makeBedrockRequest(), makeLambdaRequest()],
    ...overrides,
  };
}

// Dos servicios homónimos: el banner del primero no debe confirmar el segundo.
export function makeHomonymRunRequest() {
  return {
    runId: "run-homonym-1",
    services: [
      makeEc2Request({ requestId: "svc-1" }),
      makeEc2Request({ requestId: "svc-2", fields: [{ key: "Operating system", value: "Linux" }] }),
    ],
  };
}

// Acción aplicada tal como la deja U3 (C1 2.0.0).
export function makeAction(overrides = {}) {
  return {
    actionId: "act-1",
    fieldLabel: "Instance type",
    actionType: "instance_radio",
    value: "t3.micro",
    source: "deterministic",
    requestKey: "Instance type",
    substituted: false,
    ...overrides,
  };
}

export function makeSubstitutedAction(overrides = {}) {
  return makeAction({
    source: "brain",
    value: "t3.medium",
    requestedValue: "t3.m",
    substituted: true,
    ...overrides,
  });
}

// Candidatos por estrategia para selectByCascade (cada uno con su sección).
export function makeCandidates(overrides = {}) {
  return {
    aria_label: [],
    aria_labelledby: [],
    label_for: [],
    section_heading: [],
    ...overrides,
  };
}

export function candidate(id, section = null) {
  return { id, section };
}

export const SHARE_URL_OK = "https://calculator.aws/#/estimate?id=7c2f-11ab-90";
