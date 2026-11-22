// Fábricas de datos de prueba de U2. Cada test crea sus propios datos; nada
// mutable se comparte entre tests. El caso canónico es EC2 t3.micro
// (functional-spec §6) y cumple el esquema cerrado del Anexo A.

export function makeRunInput(overrides = {}) {
  return {
    project: "Skeleton EC2",
    region: "us-east-1",
    services: [
      {
        name: "Amazon EC2",
        search_term: "Amazon EC2",
        fields: {
          "Operating system": "Linux",
          "Number of instances": "1",
          "Instance type": "t3.micro",
          "Pricing strategy": "On-Demand",
        },
      },
    ],
    ...overrides,
  };
}

// S3 Standard de 100 GB en us-east-1 (AC2.1.1): mismo contenido para el JSON
// pegado y para la configuración que devuelve el cerebro (BR4.6).
export function makeS3RunInput() {
  return {
    region: "us-east-1",
    services: [
      {
        name: "Amazon Simple Storage Service (S3)",
        template: "S3 Standard",
        fields: { "S3 Standard storage": 100, "S3 Standard storage unit": "GB per month" },
      },
    ],
  };
}

export function makeService(index, overrides = {}) {
  return { name: `Service ${index + 1}`, fields: { Quantity: index + 1 }, ...overrides };
}

export function toText(value) {
  return JSON.stringify(value);
}

export function makeInterpretedResponse(runInput = makeS3RunInput()) {
  return { status: "interpreted", runInput, inventoryVersion: "test-1" };
}

export function makeUnresolvedResponse(unresolved) {
  return {
    status: "unresolved",
    unresolved: unresolved ?? [
      { fragment: "100 GB", service: "S3 Standard", reason: "ambiguous_field" },
    ],
    inventoryVersion: "test-1",
  };
}

// Error del canal del puerto (contract-summary: BrainCallError).
export function makeBrainCallError(code, extra = {}) {
  const error = new Error(`BrainCallError ${code}`);
  error.name = "BrainCallError";
  error.code = code;
  Object.assign(error, extra);
  return error;
}

// Doble del puerto: resuelve con la respuesta dada y registra las peticiones.
export function makeResolvingPort(response) {
  const calls = [];
  const port = async (request, options) => {
    calls.push({ request, options });
    return typeof response === "function" ? response(request) : response;
  };
  return { port, calls };
}

// Doble del puerto que rechaza con un BrainCallError.
export function makeRejectingPort(error) {
  return async () => {
    throw error;
  };
}

// Doble del puerto que no responde hasta que la prueba lo decide; ignora la
// señal a propósito para probar que U2 termina igual (NFR8.4).
export function makeDeferredPort() {
  let resolveResponse;
  const calls = [];
  const port = (request, options) => {
    calls.push({ request, options });
    return new Promise((resolve) => {
      resolveResponse = resolve;
    });
  };
  return { port, calls, respond: (response) => resolveResponse(response) };
}
