// lib/panel/url-check.js — Validador de la URL del estimado para el panel (NFR5.2, BR3.4).
// Dueño: U6. Zona A. Reexporta la regla única de U5 (validateShareUrl):
// https://calculator.aws/#/estimate?id= más un id [A-Za-z0-9-]{1,128}. El panel
// solo crea el enlace o el botón "Copiar" cuando esta función acepta la URL.

export {
  validateShareUrl as isValidEstimateUrl,
  SHARE_URL_PREFIX,
} from "../rpa/result-aggregator.js";
