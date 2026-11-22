// brain/adapters/bedrock-client.js — Invocación de Claude en Amazon Bedrock con la
// identidad IAM de la tarea (BR1.3, NFR5.1): sin claves en el código ni en la
// configuración. Este adaptador no registra prompts ni respuestas; el registro
// de invocaciones de Bedrock queda desactivado en la cuenta (NFR5.5).
// Traduce cualquier fallo del SDK a ModelError con un `kind` y descarta el
// mensaje del proveedor.

import { InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { ModelError } from "../core/errors.js";

const THROTTLING = new Set([
  "ThrottlingException",
  "ServiceQuotaExceededException",
  "TooManyRequestsException",
]);
const SERVER = new Set([
  "InternalServerException",
  "ServiceUnavailableException",
  "ModelNotReadyException",
  "ModelTimeoutException",
  "ModelErrorException",
]);

export function classifyBedrockError(error, signal) {
  if (signal?.aborted || error?.name === "AbortError") return "aborted";
  if (THROTTLING.has(error?.name) || error?.$metadata?.httpStatusCode === 429) return "throttled";
  const status = error?.$metadata?.httpStatusCode;
  if (SERVER.has(error?.name) || (typeof status === "number" && status >= 500)) return "server";
  return "client";
}

export function createBedrockClient({ runtime, modelId, anthropicVersion }) {
  return {
    async invoke({ system, user, maxTokens, signal }) {
      const body = {
        anthropic_version: anthropicVersion,
        max_tokens: maxTokens,
        temperature: 0,
        system,
        messages: [{ role: "user", content: [{ type: "text", text: user }] }],
      };
      let response;
      try {
        response = await runtime.send(
          new InvokeModelCommand({
            modelId,
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify(body),
          }),
          { abortSignal: signal },
        );
      } catch (error) {
        throw new ModelError(classifyBedrockError(error, signal), { cause: error });
      }
      let payload;
      try {
        payload = JSON.parse(new TextDecoder().decode(response.body));
      } catch (error) {
        throw new ModelError("server", { cause: error });
      }
      const text = (payload.content ?? [])
        .filter((part) => part?.type === "text")
        .map((part) => part.text)
        .join("");
      return {
        text,
        inputTokens: Number(payload.usage?.input_tokens ?? 0),
        outputTokens: Number(payload.usage?.output_tokens ?? 0),
      };
    },
  };
}
