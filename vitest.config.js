import { defineConfig } from "vitest/config";

// Configuración de Vitest. Solo herramienta de desarrollo: no participa en la
// carga unpacked de la extensión (sin build step).
// La cobertura se mide agregada sobre los módulos puros de la Zona A; la Zona B
// (lib/dom/**, content.js, content-main.js, sidepanel.js, background.js) se
// verifica con el smoke manual de aws-calculator-extension/SMOKE.md.
// El cerebro (brain/) y su IaC (infra/) viven fuera del bundle de la extensión.
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
        "aws-calculator-extension/lib/input/input-schema.js",
        "aws-calculator-extension/lib/input/input-errors.js",
        "aws-calculator-extension/lib/input/json-parser.js",
        "aws-calculator-extension/lib/input/nl-interpreter.js",
        "aws-calculator-extension/lib/input/input-normalizer.js",
        "aws-calculator-extension/lib/mapping/region-map.js",
        "aws-calculator-extension/lib/mapping/deterministic-mapper.js",
        "aws-calculator-extension/lib/mapping/option-match.js",
        "aws-calculator-extension/lib/mapping/residue-resolver.js",
        "aws-calculator-extension/lib/dom/aria-label.js",
        "aws-calculator-extension/lib/dom/cascade.js",
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
        // U6: Zona A del panel (NFR6.1).
        "aws-calculator-extension/lib/panel/url-check.js",
        "aws-calculator-extension/lib/panel/history-model.js",
        "aws-calculator-extension/lib/panel/timers.js",
        "aws-calculator-extension/lib/panel/session-rule.js",
        "aws-calculator-extension/lib/panel/waf-model.js",
        // U7: cliente del cerebro en el service worker y adaptador de página (NFR6.1).
        "aws-calculator-extension/sw/**",
        "aws-calculator-extension/lib/connection/brain-port.js",
        // Cerebro u4: lógica pura de BrainCore y servicios de dominio (NFR6.1).
        "brain/core/**",
      ],
      thresholds: {
        lines: 80,
        // Umbral propio de U2 sobre la capa de entrada (unit-test-instructions.md).
        "aws-calculator-extension/lib/input/**": { lines: 80, branches: 80 },
        // Umbral propio de U3 (NFR6.1): líneas y ramas sobre sus tres módulos.
        // Vitest evalúa estos archivos solo contra este umbral.
        "aws-calculator-extension/lib/mapping/{deterministic-mapper,option-match,residue-resolver}.js":
          { lines: 80, branches: 80 },
        // Umbral propio de U5 (NFR6.1): líneas y ramas sobre sus seis módulos de Zona A.
        "aws-calculator-extension/lib/{rpa/orchestrator,rpa/result-aggregator,rpa/retry,rpa/service-timer,dom/aria-label,dom/cascade}.js":
          { lines: 80, branches: 80 },
        // Umbral propio de U6 (NFR6.1): líneas y ramas sobre sus siete módulos de Zona A.
        "aws-calculator-extension/lib/{panel/panel-state,panel/url-check,panel/history-model,panel/timers,panel/session-rule,panel/waf-model,messages-es}.js":
          { lines: 80, branches: 80 },
        // Umbral propio de U7 (NFR6.1): líneas y ramas sobre el service worker y brain-port.
        "aws-calculator-extension/sw/**": { lines: 80, branches: 80 },
        "aws-calculator-extension/lib/connection/brain-port.js": { lines: 80, branches: 80 },
        // Umbral propio del cerebro: 80 % en líneas y ramas (cicd-pipeline.md, job verify).
        "brain/core/**": {
          lines: 80,
          branches: 80,
        },
      },
    },
  },
});
