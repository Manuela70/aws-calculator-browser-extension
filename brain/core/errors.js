// brain/core/errors.js — Errores tipados que cruzan la frontera entre adaptadores
// (SDK de AWS) y la lógica del cerebro. La lógica decide por `kind`, nunca por el
// mensaje del proveedor, que jamás se copia a una respuesta ni a un registro (BR1.3).

// kind: throttled | server | timeout | aborted | client
export class ModelError extends Error {
  constructor(kind, options) {
    super(`model_${kind}`, options);
    this.name = "ModelError";
    this.kind = kind;
  }
}

// El almacén de uso no respondió a tiempo o falló (NFR3.1).
export class StoreUnavailableError extends Error {
  constructor(reason, options) {
    super(`usage_store_${reason}`, options);
    this.name = "StoreUnavailableError";
    this.reason = reason;
  }
}

// Una versión del inventario no se pudo leer, no coincide su SHA-256 o no pasa
// la validación (NFR1.8).
export class InventoryLoadError extends Error {
  constructor(reason, options) {
    super(`inventory_${reason}`, options);
    this.name = "InventoryLoadError";
    this.reason = reason;
  }
}
