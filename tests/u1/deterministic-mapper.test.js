import { describe, it, expect } from "vitest";
import {
  actionTypeFor,
  mapDeterministic,
} from "../../aws-calculator-extension/lib/mapping/deterministic-mapper.js";
import { makeDomFields, makeServiceRequest } from "./fixtures.js";

describe("mapDeterministic (BR3.1-BR3.3)", () => {
  it("mapea el caso canónico EC2 sin residuo", () => {
    const { actions, unresolved } = mapDeterministic(makeDomFields(), makeServiceRequest().fields);
    expect(unresolved).toEqual([]);
    expect(actions.map((a) => [a.fieldLabel, a.actionType, a.value])).toEqual([
      ["Operating system", "dropdown", "Linux"],
      ["EC2 specifications > Number of instances", "fill", "1"],
      ["Instance type", "instance_radio", "t3.micro"],
      ["Pricing strategy", "radio", "On-Demand"],
    ]);
    expect(actions.every((a) => a.source === "deterministic")).toBe(true);
    expect(new Set(actions.map((a) => a.actionId)).size).toBe(4);
  });

  it('coincide por el label completo "Sección > Campo" ignorando mayúsculas y espacios', () => {
    const { actions } = mapDeterministic(makeDomFields(), [
      { key: "  ec2 specifications >  number of INSTANCES ", value: "2" },
    ]);
    expect(actions[0].fieldLabel).toBe("EC2 specifications > Number of instances");
  });

  it('coincide por la parte "Campo" del label', () => {
    const { actions } = mapDeterministic(makeDomFields(), [
      { key: "Number of instances", value: "3" },
    ]);
    expect(actions).toHaveLength(1);
  });

  it("cero coincidencias → unresolved, sin acción", () => {
    const { actions, unresolved } = mapDeterministic(makeDomFields(), [
      { key: "Campo inexistente", value: "1" },
    ]);
    expect(actions).toEqual([]);
    expect(unresolved).toEqual([{ key: "Campo inexistente", value: "1" }]);
  });

  it("dos coincidencias → unresolved (nunca se elige una al azar)", () => {
    const fields = [
      { label: "Storage > Size", type: "number" },
      { label: "Backup > Size", type: "number" },
    ];
    const { actions, unresolved } = mapDeterministic(fields, [{ key: "Size", value: "10" }]);
    expect(actions).toEqual([]);
    expect(unresolved).toHaveLength(1);
  });

  it("slider no se mapea en el skeleton", () => {
    const { unresolved } = mapDeterministic(
      [{ label: "Utilization", type: "slider" }],
      [{ key: "Utilization", value: "50" }],
    );
    expect(unresolved).toHaveLength(1);
  });

  it("deriva el tipo de acción del tipo de campo (BR3.2)", () => {
    expect(actionTypeFor("text", "x")).toBe("fill");
    expect(actionTypeFor("search", "x")).toBe("fill");
    expect(actionTypeFor("select", "x")).toBe("select");
    expect(actionTypeFor("radiogroup", "x")).toBe("radio");
    expect(actionTypeFor("checkbox", "true")).toBe("checkbox");
    expect(actionTypeFor("toggle", "ON")).toBe("toggle_on");
    expect(actionTypeFor("toggle", "false")).toBe("toggle_off");
    expect(actionTypeFor("slider", "1")).toBeNull();
  });

  it("la tabla de instancias es un único instance_radio: una sola acción compuesta", () => {
    const { actions } = mapDeterministic(makeDomFields(), [
      { key: "Instance type", value: "t3.micro" },
    ]);
    expect(actions).toEqual([
      {
        actionId: "act-1",
        fieldLabel: "Instance type",
        actionType: "instance_radio",
        value: "t3.micro",
        source: "deterministic",
      },
    ]);
  });
});
