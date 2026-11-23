import { request as httpRequest } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createJobServer } from "../../brain/jobs/job-server.mjs";

let server;

function start(runJob) {
  const logs = [];
  server = createJobServer({ runJob, log: (r) => logs.push(r), now: () => 5 });
  return new Promise((resolve) => server.listen(0, () => resolve(logs)));
}

function call(method, path) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port: server.address().port, method, path },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
      },
    );
    req.on("error", reject);
    req.end(method === "POST" ? "{}" : undefined);
  });
}

afterEach(() => new Promise((resolve) => server.close(resolve)));

describe("job-server (InventoryJob en Lambda)", () => {
  it("POST /events corre el job y responde 200 con su estado; /health responde 200", async () => {
    const runJob = vi.fn(async () => ({ status: "active" }));
    await start(runJob);
    expect(await call("GET", "/health")).toEqual({ status: 200, body: { ok: true } });
    expect(await call("POST", "/events")).toEqual({
      status: 200,
      body: { ok: true, status: "active" },
    });
    expect(runJob).toHaveBeenCalledTimes(1);
  });

  it("una excepción del job responde 500 y emite InventoryJobFailed", async () => {
    const logs = await start(async () => {
      throw new Error("s3 caído");
    });
    expect(await call("POST", "/events")).toEqual({
      status: 500,
      body: { ok: false, reason: "job_failed" },
    });
    expect(logs[0]).toEqual({ event: "inventory_job_failed", reason: "s3 caído" });
    expect(logs[1]).toMatchObject({ InventoryJobFailed: 1 });
  });

  it("rechaza otra ruta con 404 y un segundo evento simultáneo con 409", async () => {
    let release;
    await start(() => new Promise((resolve) => (release = resolve)));
    expect((await call("GET", "/otra")).status).toBe(404);
    const first = call("POST", "/events");
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    expect((await call("POST", "/events")).status).toBe(409);
    release({ status: "rejected" });
    expect(await first).toEqual({ status: 200, body: { ok: true, status: "rejected" } });
  });
});
