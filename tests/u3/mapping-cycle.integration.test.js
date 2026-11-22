// Integración del ciclo M2 + M3 de U3 (pasadas de escaneo y mapeo, luego el
// residuo) con dos dobles distintos del puerto mapResidue (NFR1.1): el mapeo no
// depende de dónde viva el cerebro.
import { describe, it, expect, vi } from "vitest";
import { mapDeterministic } from "../../aws-calculator-extension/lib/mapping/deterministic-mapper.js";
import { resolveResidue } from "../../aws-calculator-extension/lib/mapping/residue-resolver.js";
import { EBS, makeEc2DomFields, makeEc2DomFieldsWithIops } from "./fixtures.js";

// Recorre las pasadas como lo hace U5: cada escaneo sale de la lista `scans`
// (el último se repite) y las acciones nuevas se "aplican" antes de reescanear.
async function runCycle(scans, values, port, signal) {
  let outcome = null;
  let domFields;
  let scanIndex = 0;
  const applied = [];
  for (;;) {
    domFields = scans[Math.min(scanIndex, scans.length - 1)];
    scanIndex += 1;
    outcome = mapDeterministic(domFields, values, outcome);
    if (outcome.residueStatus !== "pending_passes") break;
    applied.push(...outcome.actions.slice(applied.length));
  }
  const final = await resolveResidue(
    outcome,
    { serviceName: "Amazon EC2", domFields, requestedValues: values },
    { mapResidue: port, signal },
  );
  return { final, scans: scanIndex };
}

const values = () => [
  { key: "Operating system", value: "Linux" },
  { key: `${EBS} > Storage for each EC2 instance`, value: "Provisioned IOPS SSD (io2)" },
  { key: "Provisioning IOPS io2", value: "3000" },
  { key: "Monitoreo detallado", value: "on" },
];

const brainAction = {
  requestKey: "Monitoreo detallado",
  fieldLabel: "Detailed monitoring",
  actionType: "toggle_on",
  value: "on",
};

// Doble 1: función async simple (p. ej. el cerebro detrás de un proxy).
function makeFunctionPort() {
  return vi.fn(async () => ({ actions: [brainAction], inventoryVersion: "v1" }));
}

// Doble 2: método de un objeto con estado y respuesta diferida (p. ej. n8n vía
// service worker), pasado como función ligada.
function makeObjectPort() {
  const adapter = {
    calls: 0,
    mapResidue(request) {
      this.calls += 1;
      const key = request.unresolved[0].key;
      return new Promise((resolve) =>
        queueMicrotask(() => resolve({ actions: [{ ...brainAction, requestKey: key }] })),
      );
    },
  };
  return { adapter, port: adapter.mapResidue.bind(adapter) };
}

describe("ciclo de pasadas + residuo (M2, M3; NFR1.1)", () => {
  it("con dos dobles distintos del puerto el resultado es el mismo", async () => {
    const scans = [makeEc2DomFields(), makeEc2DomFieldsWithIops()];
    const functionPort = makeFunctionPort();
    const { adapter, port } = makeObjectPort();

    const a = await runCycle(scans, values(), functionPort);
    const b = await runCycle(scans, values(), port);

    expect(a.final).toEqual(b.final);
    expect(functionPort).toHaveBeenCalledTimes(1);
    expect(adapter.calls).toBe(1);
    expect(a.scans).toBe(3);
    expect(a.final.residueStatus).toBe("resolved_by_brain");
    expect(a.final.actions.map((x) => [x.actionId, x.fieldLabel, x.source])).toEqual([
      ["act-1", "Operating system", "deterministic"],
      ["act-2", `${EBS} > Storage for each EC2 instance`, "deterministic"],
      ["act-3", `${EBS} > Provisioning IOPS io2`, "deterministic"],
      ["act-4", "Detailed monitoring", "brain"],
    ]);
  });

  it("sin puerto, o con el cerebro caído, el mismo ciclo falla sin acciones (BR3.4)", async () => {
    const scans = [makeEc2DomFields(), makeEc2DomFieldsWithIops()];
    const noPort = await runCycle(scans, values(), null);
    expect(noPort.final).toMatchObject({
      residueStatus: "brain_unavailable",
      residueDetail: "no_port",
      actions: [],
    });
    const down = await runCycle(scans, values(), async () => {
      throw Object.assign(new Error("down"), { code: "brain_unavailable" });
    });
    expect(down.final).toMatchObject({
      residueStatus: "brain_unavailable",
      brainErrorCode: "brain_unavailable",
      actions: [],
    });
    expect(down.final.unresolved.map((v) => [v.key, v.reason])).toEqual([
      ["Monitoreo detallado", "no_match"],
    ]);
  });
});
