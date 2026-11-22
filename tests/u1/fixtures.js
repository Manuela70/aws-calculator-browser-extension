// Fábricas de datos de prueba. Cada test crea sus propios datos; nada mutable
// se comparte entre tests. El caso canónico es EC2 t3.micro (functional-spec §6).

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

export function makeServiceRequest(overrides = {}) {
  return {
    requestId: "svc-1",
    serviceName: "Amazon EC2",
    searchTerm: "Amazon EC2",
    region: "us-east-1",
    fields: [
      { key: "Operating system", value: "Linux" },
      { key: "Number of instances", value: "1" },
      { key: "Instance type", value: "t3.micro" },
      { key: "Pricing strategy", value: "On-Demand" },
    ],
    toggles: [],
    ...overrides,
  };
}

export function makeRunRequest(overrides = {}) {
  return {
    runId: "run-test-1",
    project: "Skeleton EC2",
    services: [makeServiceRequest()],
    ...overrides,
  };
}

// Campos de EC2 tal como los produce scanForm: la tabla de instancias es un
// solo DomField instance_radio (entities.md, FIX-6).
export function makeDomFields() {
  return [
    {
      label: "Operating system",
      type: "dropdown",
      options: ["Linux", "Windows Server"],
    },
    { label: "EC2 specifications > Number of instances", type: "number" },
    { label: "Instance type", type: "instance_radio" },
    {
      label: "Pricing strategy",
      type: "radiogroup",
      options: ["On-Demand", "Compute Savings Plans"],
    },
  ];
}

export function makeServiceResult(overrides = {}) {
  return {
    requestId: "svc-1",
    serviceName: "Amazon EC2",
    status: "confirmed",
    ...overrides,
  };
}
