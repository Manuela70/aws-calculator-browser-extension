// brain/adapters/bedrock-client.js — Invocación de Claude en Amazon Bedrock con la
// identidad IAM de la tarea (BR1.3, NFR5.1): sin claves en el código ni en la
// configuración. Si Bedrock vive en otra cuenta, `runtime` llega con credenciales
// temporales del rol de esa cuenta (server/index.js); este módulo no lo distingue. Este adaptador no registra prompts ni respuestas; el registro
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

// Cuerpo del pedido. Sin `temperature` ni otros parámetros de muestreo: los modelos
// Claude actuales (Opus 5.5 y posteriores) los rechazan con 400. El esfuerzo, si la
// configuración lo fija, va en `output_config.effort` y acota el razonamiento, que en
// esos modelos siempre está activo y cuenta dentro de `max_tokens`.
export function buildRequestBody({ anthropicVersion, maxTokens, effort, system, user }) {
  const body = {
    anthropic_version: anthropicVersion,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: [{ type: "text", text: user }] }],
  };
  if (effort) body.output_config = { effort };
  return body;
}

// Metadatos del error de Bedrock para el registro: nombre y estado HTTP del SDK,
// nunca el mensaje (puede citar el pedido).
export function bedrockErrorInfo(error) {
  const name = typeof error?.name === "string" ? error.name.slice(0, 64) : "Unknown";
  const status = error?.$metadata?.httpStatusCode;
  return { name, status: Number.isInteger(status) ? status : null };
}

export function createBedrockClient({
  runtime,
  modelId,
  anthropicVersion,
  effort,
  log = () => {},
}) {
  return {
    async invoke({ system, user, maxTokens, signal }) {
      const body = buildRequestBody({ anthropicVersion, maxTokens, effort, system, user });
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
        const kind = classifyBedrockError(error, signal);
        if (kind !== "aborted") log({ event: "bedrock_error", kind, ...bedrockErrorInfo(error) });
        throw new ModelError(kind, { cause: error });
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
