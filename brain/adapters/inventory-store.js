// brain/adapters/inventory-store.js — Acceso al inventario versionado en S3
// (NFR1.8, NFR3.5). Objetos: `versions/<version>.json` y el puntero `active`
// = { version, sha256, previous }. El servicio solo lee; InventoryJob además
// publica versiones y reescribe el puntero en una sola escritura (activación
// atómica).

import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { InventoryLoadError } from "../core/errors.js";

export const ACTIVE_KEY = "active";

export function versionKey(version) {
  return `versions/${version}.json`;
}

export function sha256Hex(text) {
  return createHash("sha256").update(text).digest("hex");
}

function isMissing(error) {
  return error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404;
}

export function createInventoryStore({ s3, bucket }) {
  async function getText(key) {
    const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return response.Body.transformToString("utf-8");
  }

  async function putJson(key, text) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: text,
        ContentType: "application/json",
      }),
    );
  }

  return {
    // Puntero activo o null si todavía no existe.
    async readPointer() {
      let text;
      try {
        text = await getText(ACTIVE_KEY);
      } catch (error) {
        if (isMissing(error)) return null;
        throw new InventoryLoadError("pointer_unreadable", { cause: error });
      }
      let pointer;
      try {
        pointer = JSON.parse(text);
      } catch (error) {
        throw new InventoryLoadError("pointer_invalid", { cause: error });
      }
      if (typeof pointer?.version !== "string" || typeof pointer?.sha256 !== "string") {
        throw new InventoryLoadError("pointer_invalid");
      }
      return pointer;
    },

    // Texto de una versión, verificado contra el SHA-256 esperado.
    async readVersion(version, expectedSha256) {
      let text;
      try {
        text = await getText(versionKey(version));
      } catch (error) {
        throw new InventoryLoadError("version_unreadable", { cause: error });
      }
      if (sha256Hex(text) !== expectedSha256) throw new InventoryLoadError("sha256_mismatch");
      return text;
    },

    async publishVersion(version, text) {
      await putJson(versionKey(version), text);
      return sha256Hex(text);
    },

    async writePointer(pointer) {
      await putJson(ACTIVE_KEY, JSON.stringify(pointer));
    },
  };
}
