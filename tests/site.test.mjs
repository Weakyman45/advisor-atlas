import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const data = JSON.parse(await fs.readFile(path.join(root, "site", "data", "professors.json"), "utf8"));
const client = await fs.readFile(path.join(root, "site", "app.js"), "utf8");
const worker = (await import(`${pathToFileURL(path.join(root, "dist", "server", "index.js")).href}?test=${Date.now()}`)).default;

test("the source roster contains 141 unique professors", () => {
  assert.equal(data.professors.length, 141);
  assert.equal(new Set(data.professors.map((professor) => professor.id)).size, 141);
  assert.equal(new Set(data.professors.map((professor) => professor.institution)).size, 38);
});

test("the worker serves the product page and client assets", async () => {
  const page = await worker.fetch(new Request("https://tracker.example/"), {});
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Make every outreach decision visible/);
  const css = await worker.fetch(new Request("https://tracker.example/styles.css"), {});
  assert.equal(css.status, 200);
  assert.match(css.headers.get("content-type"), /text\/css/);
  const js = await worker.fetch(new Request("https://tracker.example/app.js"), {});
  assert.equal(js.status, 200);
  assert.match(await js.text(), /loadProfessors/);
});

test("local mode persists progress in browser storage", () => {
  assert.match(client, /advisor-atlas-progress-v1/);
  assert.match(client, /window\.localStorage\.setItem\(localProgressKey/);
  assert.match(client, /Saved on this device/);
  assert.match(client, /saveLocalSnapshot\(\)/);
});

test("the API returns every professor with safe defaults when storage is unavailable", async () => {
  const response = await worker.fetch(new Request("https://tracker.example/api/professors"), {});
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.persistent, false);
  assert.equal(payload.professors.length, 141);
  assert.equal(payload.professors[0].emailed, false);
  assert.equal(payload.professors[0].disposition, "Not contacted");
});

test("writes fail safely without durable storage and unknown routes return 404", async () => {
  const write = await worker.fetch(new Request("https://tracker.example/api/progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: data.professors[0].id, progress: {} }) }), {});
  assert.equal(write.status, 503);
  const missing = await worker.fetch(new Request("https://tracker.example/missing"), {});
  assert.equal(missing.status, 404);
});
