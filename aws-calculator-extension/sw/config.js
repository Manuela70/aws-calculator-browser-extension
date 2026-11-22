// sw/config.js — Configuración del cerebro para el service worker (NFR1.1, NFR5.1).
// Archivo generado por scripts/sync-brain-config.js a partir de infra/cdk-outputs.json.
// Único lugar del bundle con la URL del cerebro y los datos públicos del proveedor
// de identidad; vive fuera de lib/** y de web_accessible_resources.
// Mientras u4 no esté desplegado, los valores quedan en null y BRAIN_CALL y
// BRAIN_LOGIN responden brain_unavailable sin hacer fetch.

export const BRAIN_BASE_URL = null;
export const COGNITO_DOMAIN = null;
export const CLIENT_ID = null;

export const OAUTH_SCOPES = Object.freeze(["openid", "email"]);

export const OPERATION_PATHS = Object.freeze({
  "map-residue": "/map-residue",
  interpret: "/interpret",
  "waf-evaluate": "/waf-evaluate",
});
