// brain/core/limits.js — Topes de C1-C3 declarados una sola vez (NFR1.2, BR1.1,
// BR4.2). Los importan los validadores de pedidos y de salidas y el contador de
// cuerpo del servidor.

export const MAX_BODY_BYTES = 256 * 1024;

// C3 /interpret
export const INTERPRET_TEXT_MAX = 2000;
export const INTERPRET_SCHEMA_VERSIONS = [1];
export const INTERPRET_MAX_SERVICES = 20;
export const PROJECT_MAX_LENGTH = 200;
export const MAX_CANDIDATES = 8;

// C1 /map-residue
export const RESIDUE_MAX_DOM_FIELDS = 500;

// C2 /waf-evaluate
export const WAF_MAX_SERVICES = 20;
export const WAF_MAX_CONFIG_KEYS = 30;
export const WAF_MAX_KEY_OR_VALUE = 100;
export const WAF_MAX_RECOMMENDATIONS = 5;
export const WAF_MAX_TEXT = 300;
export const WAF_PHASES = ["pre_fill", "post_fill"];
export const WAF_PILLARS = [
  "OperationalExcellence",
  "Security",
  "Reliability",
  "PerformanceEfficiency",
  "CostOptimization",
  "Sustainability",
];
export const WAF_SEVERITIES = ["high", "medium", "low"];

export const DOM_FIELD_TYPES = [
  "text",
  "number",
  "search",
  "select",
  "dropdown",
  "radio",
  "radiogroup",
  "checkbox",
  "toggle",
  "instance_radio",
  "slider",
];

export const ACTION_TYPES = [
  "fill",
  "select",
  "dropdown",
  "radio",
  "checkbox",
  "toggle_on",
  "toggle_off",
  "instance_search",
  "instance_radio",
];

export const UNRESOLVED_REASONS = [
  "unknown_service",
  "ambiguous_service",
  "unknown_field",
  "ambiguous_field",
  "missing_value",
  "unsupported_component",
  "region_unavailable",
];
