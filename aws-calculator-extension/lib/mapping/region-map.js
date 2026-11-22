// lib/mapping/region-map.js — Tabla código de región → nombre visible en calculator.aws.
// PROVISIONAL (U1, walking skeleton). Dueño final: U5. Portada tal cual desde
// el REGION_MAP del v6 (content.js, addService).

export const DEFAULT_REGION = "us-east-1";

export const REGION_MAP = Object.freeze({
  "us-east-1": "US East (N. Virginia)",
  "us-east-2": "US East (Ohio)",
  "us-west-1": "US West (N. California)",
  "us-west-2": "US West (Oregon)",
  "eu-west-1": "Europe (Ireland)",
  "eu-west-2": "Europe (London)",
  "eu-west-3": "Europe (Paris)",
  "eu-central-1": "Europe (Frankfurt)",
  "eu-north-1": "Europe (Stockholm)",
  "eu-south-1": "Europe (Milan)",
  "ap-southeast-1": "Asia Pacific (Singapore)",
  "ap-southeast-2": "Asia Pacific (Sydney)",
  "ap-northeast-1": "Asia Pacific (Tokyo)",
  "ap-northeast-2": "Asia Pacific (Seoul)",
  "ap-northeast-3": "Asia Pacific (Osaka)",
  "ap-south-1": "Asia Pacific (Mumbai)",
  "ap-east-1": "Asia Pacific (Hong Kong)",
  "sa-east-1": "South America (Sao Paulo)",
  "ca-central-1": "Canada (Central)",
  "me-south-1": "Middle East (Bahrain)",
  "af-south-1": "Africa (Cape Town)",
});

export function isKnownRegion(code) {
  return typeof code === "string" && Object.hasOwn(REGION_MAP, code);
}

// Devuelve el nombre visible o null si el código no existe (nunca adivina).
export function getRegionDisplayName(code) {
  return isKnownRegion(code) ? REGION_MAP[code] : null;
}
