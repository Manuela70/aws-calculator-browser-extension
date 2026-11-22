// brain/core/model-gateway.js — Invocación del modelo con semáforo, cola FIFO y
// la regla única de reintentos (performance-design.md §2; scalability-design.md
// NFR3.4; reliability-design.md NFR1.7):
// - como máximo 2 invocaciones por operación (o por lote de WAF); el reintento
//   por error transitorio y el reintento por salida inválida comparten ese tope;
// - 10 s por intento; espera aleatoria de 1 a 2 s solo antes de reintentar un
//   transitorio; el segundo intento solo si quedan al menos 6 s del plazo, con
//   tope min(10 s, restante - 2 s);
// - código final según el último fallo: salida inválida → empty_result,
//   throttling → rate_limited (5 s), 5xx → model_unavailable, tope por intento o
//   plazo vencido → timeout.
// La cola rechaza con rate_limited cuando la espera estimada dejaría sin tiempo
// al primer intento.

const TRANSIENT = new Set(["throttled", "server", "timeout"]);

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class QueueRejection extends Error {
  constructor(code, retryAfterSeconds) {
    super(code);
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function createModelGateway({
  invoke,
  clock,
  config,
  sleep = defaultSleep,
  random = Math.random,
}) {
  const {
    slots,
    attemptTimeoutMs,
    minSecondAttemptMs,
    retryBackoffMinMs,
    retryBackoffMaxMs,
    secondAttemptMarginMs,
    initialLatencyMs,
    latencyWindow,
    rateLimitedRetryAfterSeconds,
  } = config;

  let active = 0;
  const queue = [];
  const latencies = [];

  function averageLatency() {
    if (latencies.length === 0) return initialLatencyMs;
    return latencies.reduce((a, b) => a + b, 0) / latencies.length;
  }

  function recordLatency(ms) {
    latencies.push(ms);
    if (latencies.length > latencyWindow) latencies.shift();
  }

  function acquire(deadline) {
    if (active < slots && queue.length === 0) {
      active += 1;
      return Promise.resolve();
    }
    const position = queue.length + 1;
    const estimatedWait = Math.ceil(position / slots) * averageLatency();
    if (clock.now() + estimatedWait + attemptTimeoutMs > deadline) {
      return Promise.reject(
        new QueueRejection("rate_limited", Math.max(1, Math.ceil(estimatedWait / 1000))),
      );
    }
    return new Promise((resolve, reject) => {
      const entry = { resolve };
      entry.timer = setTimeout(
        () => {
          const at = queue.indexOf(entry);
          if (at >= 0) queue.splice(at, 1);
          reject(new QueueRejection("timeout"));
        },
        Math.max(0, deadline - clock.now()),
      );
      queue.push(entry);
    });
  }

  function release() {
    const next = queue.shift();
    if (next) {
      clearTimeout(next.timer);
      next.resolve(); // el lugar pasa directo al siguiente de la cola
    } else {
      active -= 1;
    }
  }

  // Un intento con su tope; resuelve { ok, text, tokens } o { ok: false, kind }.
  async function attempt(prompt, maxTokens, timeoutMs) {
    const controller = new AbortController();
    let timer;
    const expired = new Promise((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ ok: false, kind: "timeout" });
      }, timeoutMs);
    });
    const started = clock.now();
    const call = invoke({ ...prompt, maxTokens, signal: controller.signal }).then(
      (result) => ({ ok: true, ...result }),
      (error) => ({
        ok: false,
        kind: controller.signal.aborted ? "timeout" : (error?.kind ?? "server"),
      }),
    );
    try {
      const outcome = await Promise.race([call, expired]);
      if (outcome.ok) recordLatency(clock.now() - started);
      return outcome;
    } finally {
      clearTimeout(timer);
    }
  }

  function finalFailure(lastFailure, deadline) {
    if (clock.now() >= deadline) return { code: "timeout", outcome: "timeout" };
    switch (lastFailure) {
      case "invalid":
        return { code: "empty_result", outcome: "invalid_output" };
      case "throttled":
        return {
          code: "rate_limited",
          retryAfterSeconds: rateLimitedRetryAfterSeconds,
          outcome: "model_error",
        };
      case "timeout":
      case "aborted":
        return { code: "timeout", outcome: "timeout" };
      default:
        return { code: "model_unavailable", outcome: "model_error" };
    }
  }

  async function runAttempts({ deadline, maxTokens, buildPrompt, validate }) {
    const usage = { attempts: 0, inputTokens: 0, outputTokens: 0 };
    let previousError;
    let lastFailure;
    for (let n = 1; n <= 2; n++) {
      const remaining = deadline - clock.now();
      const timeoutMs =
        n === 1
          ? Math.min(attemptTimeoutMs, remaining)
          : Math.min(attemptTimeoutMs, remaining - secondAttemptMarginMs);
      if (timeoutMs <= 0) break;
      const result = await attempt(buildPrompt(previousError), maxTokens, timeoutMs);
      usage.attempts += 1;
      if (result.ok) {
        usage.inputTokens += result.inputTokens;
        usage.outputTokens += result.outputTokens;
        const checked = validate(result.text);
        if (checked.ok) return { ok: true, value: checked.value, outcome: "ok", ...usage };
        lastFailure = "invalid";
        previousError = checked.error;
      } else {
        lastFailure = result.kind;
      }
      if (n === 2 || lastFailure === "client") break;
      if (TRANSIENT.has(lastFailure)) {
        await sleep(retryBackoffMinMs + random() * (retryBackoffMaxMs - retryBackoffMinMs));
      }
      if (deadline - clock.now() < minSecondAttemptMs) break;
    }
    return { ok: false, ...finalFailure(lastFailure, deadline), ...usage };
  }

  return {
    // Ejecuta una operación (o un lote) del modelo dentro del plazo `deadline`.
    // buildPrompt(previousError) → { system, user }; validate(text) → { ok, value } | { ok: false, error }.
    async run(job) {
      try {
        await acquire(job.deadline);
      } catch (rejection) {
        return {
          ok: false,
          code: rejection.code,
          retryAfterSeconds: rejection.retryAfterSeconds,
          outcome: rejection.code === "timeout" ? "timeout" : "model_error",
          attempts: 0,
          inputTokens: 0,
          outputTokens: 0,
        };
      }
      try {
        return await runAttempts(job);
      } finally {
        release();
      }
    },

    stats: () => ({ active, queued: queue.length, averageLatencyMs: averageLatency() }),
  };
}
