// brain/adapters/usage-store.js — Contadores de uso en DynamoDB (NFR3.1, NFR3.2,
// NFR3.4). Claves: se#<sub>#min#<minuto>, se#<sub>#day#<día>, global#day#<día>;
// atributo `ttl` (48 horas). Cada consulta
// tiene un tope de 50 ms: si no responde, se aborta y se lanza
// StoreUnavailableError para que UsageGuard pase al limitador local.

import { GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { StoreUnavailableError } from "../core/errors.js";

export function createUsageStore({ dynamo, table, timeoutMs = 50 }) {
  async function send(command) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new StoreUnavailableError("timeout"));
      }, timeoutMs);
    });
    try {
      return await Promise.race([
        dynamo.send(command, { abortSignal: controller.signal }),
        timeout,
      ]);
    } catch (error) {
      if (error instanceof StoreUnavailableError) throw error;
      throw new StoreUnavailableError("error", { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    // Suma `amount` al contador y devuelve el valor nuevo.
    async increment(pk, amount, ttlEpochSeconds) {
      const response = await send(
        new UpdateItemCommand({
          TableName: table,
          Key: { pk: { S: pk } },
          UpdateExpression: "ADD #c :a SET #t = :ttl",
          ExpressionAttributeNames: { "#c": "count", "#t": "ttl" },
          ExpressionAttributeValues: {
            ":a": { N: String(amount) },
            ":ttl": { N: String(ttlEpochSeconds) },
          },
          ReturnValues: "UPDATED_NEW",
        }),
      );
      return Number(response?.Attributes?.count?.N ?? 0);
    },

    // Valor actual del contador (0 si no existe).
    async get(pk) {
      const response = await send(
        new GetItemCommand({ TableName: table, Key: { pk: { S: pk } }, ConsistentRead: true }),
      );
      return Number(response?.Item?.count?.N ?? 0);
    },
  };
}
