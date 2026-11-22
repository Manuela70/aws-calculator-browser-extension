import { defineConfig } from "vitest/config";

// Configuración de Vitest. Solo herramienta de desarrollo: no participa en la
// carga unpacked de la extensión (sin build step).
// La cobertura se mide agregada sobre los módulos puros de la Zona A; la Zona B
// (lib/dom/**, content.js, content-main.js, sidepanel.js, background.js) se
// verifica con el smoke manual de aws-calculator-extension/SMOKE.md.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: ["text", "html", "json-summary"],
      include: [
        "aws-calculator-extension/lib/messages.js",
        "aws-calculator-extension/lib/messages-es.js",
        "aws-calculator-extension/lib/validation.js",
        "aws-calculator-extension/lib/input/json-parser.js",
        "aws-calculator-extension/lib/input/input-normalizer.js",
        "aws-calculator-extension/lib/mapping/region-map.js",
        "aws-calculator-extension/lib/mapping/deterministic-mapper.js",
        "aws-calculator-extension/lib/mapping/option-match.js",
        "aws-calculator-extension/lib/rpa/retry.js",
        "aws-calculator-extension/lib/rpa/wait.js",
        "aws-calculator-extension/lib/rpa/service-timer.js",
        "aws-calculator-extension/lib/rpa/result-aggregator.js",
        "aws-calculator-extension/lib/rpa/orchestrator.js",
        "aws-calculator-extension/lib/log/log-format.js",
        "aws-calculator-extension/lib/log/log-index.js",
        "aws-calculator-extension/lib/log/run-logger.js",
        "aws-calculator-extension/lib/connection/handshake.js",
        "aws-calculator-extension/lib/panel/panel-state.js",
        "aws-calculator-extension/lib/panel/heartbeat.js",
      ],
      thresholds: {
        lines: 80,
      },
    },
  },
});
