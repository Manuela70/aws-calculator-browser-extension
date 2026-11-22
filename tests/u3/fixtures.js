// Fábricas de datos de prueba de U3. Cada prueba arma sus propios datos; nada
// mutable se comparte. Los DomField siguen la forma de C1 DomField y se derivan
// del inventario de calculator.aws (knowledge/calculator-catalog): EC2 con una
// etiqueta repetida en dos secciones y un campo condicional (IOPS de io2), y
// S3 Standard con campos valor + unidad ("<Campo> unit").

export const EBS = "Amazon Elastic Block Store (EBS)";
export const SNAPSHOT = "EBS Snapshot";

// Primer escaneo de EC2 (antes de elegir io2).
export function makeEc2DomFields() {
  return [
    { label: "Operating system", type: "dropdown", options: ["Linux", "Windows Server"] },
    { label: "EC2 specifications > Number of instances", type: "number" },
    { label: "Instance type", type: "instance_radio" },
    {
      label: "Pricing strategy",
      type: "radiogroup",
      options: ["On-Demand", "Compute Savings Plans"],
    },
    {
      label: `${EBS} > Storage for each EC2 instance`,
      section: EBS,
      type: "dropdown",
      options: ["General Purpose SSD (gp3)", "Provisioned IOPS SSD (io2)"],
    },
    {
      label: `${SNAPSHOT} > Storage for each EC2 instance`,
      section: SNAPSHOT,
      type: "dropdown",
      options: ["Standard", "Archive"],
    },
    { label: `${EBS} > Storage amount`, section: EBS, type: "number" },
    {
      label: `${EBS} > Storage amount unit`,
      section: EBS,
      type: "dropdown",
      options: ["GB", "TB"],
    },
    { label: "Detailed monitoring", type: "toggle" },
    { label: "Utilization", type: "slider" },
  ];
}

// Segundo escaneo de EC2: al elegir io2 aparece el campo condicional de IOPS.
export function makeEc2DomFieldsWithIops() {
  return [
    ...makeEc2DomFields(),
    { label: `${EBS} > Provisioning IOPS io2`, section: EBS, type: "number" },
  ];
}

// Caso canónico del walking skeleton (functional-spec §6).
export function makeCanonicalEc2Values() {
  return [
    { key: "Operating system", value: "Linux" },
    { key: "Number of instances", value: "1" },
    { key: "Instance type", value: "t3.micro" },
    { key: "Pricing strategy", value: "On-Demand" },
  ];
}

export function makeS3DomFields() {
  return [
    { label: "S3 Standard > S3 Standard storage", section: "S3 Standard", type: "number" },
    {
      label: "S3 Standard > S3 Standard storage unit",
      section: "S3 Standard",
      type: "dropdown",
      options: ["GB per month", "TB per month"],
    },
    { label: "S3 Standard > Requests", section: "S3 Standard", type: "number" },
    {
      label: "S3 Standard > Storage class",
      section: "S3 Standard",
      type: "select",
      options: ["Standard", "Standard-IA"],
    },
    { label: "S3 Standard > Versioning", section: "S3 Standard", type: "checkbox" },
  ];
}

// Valores de S3: "Number of requests" no existe tal cual en la página viva
// ("Requests"), así que queda como residuo enviable.
export function makeS3Values() {
  return [
    { key: "S3 Standard storage", value: "100" },
    { key: "S3 Standard storage unit", value: "GB per month" },
    { key: "Number of requests", value: "1000000" },
  ];
}

// Respuesta válida de /map-residue (C1 2.0.0) para el residuo de S3.
export function makeBrainResponse(overrides = {}) {
  return {
    actions: [
      {
        requestKey: "Number of requests",
        fieldLabel: "S3 Standard > Requests",
        actionType: "fill",
        value: "1000000",
      },
    ],
    inventoryVersion: "2026-11-21",
    ...overrides,
  };
}

// Error del canal de los puertos del cerebro (BrainCallError del contrato).
export function makeBrainCallError(code, extra = {}) {
  const error = new Error(`BrainCallError: ${code}`);
  error.name = "BrainCallError";
  error.code = code;
  Object.assign(error, extra);
  return error;
}

// Genera n DomField numéricos distintos (para el tope de 500 campos).
export function makeManyDomFields(count) {
  return Array.from({ length: count }, (_, i) => ({
    label: `Section > Field ${i + 1}`,
    type: "number",
  }));
}
