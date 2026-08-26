import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const data = JSON.parse(await fs.readFile(path.join(root, "site", "data", "professors.json"), "utf8"));
const client = await fs.readFile(path.join(root, "site", "app.js"), "utf8");
const pagesHtml = await fs.readFile(path.join(root, "docs", "index.html"), "utf8");
const worker = (await import(`${pathToFileURL(path.join(root, "dist", "server", "index.js")).href}?test=${Date.now()}`)).default;

function rowFromProgressArgs(id, args, offset, revision) {
  return {
    professor_id: id,
    contact_route: args[offset],
    email_contact: args[offset + 1],
    emailed: args[offset + 2],
    email_sent_date: args[offset + 3],
    follow_up_sent: args[offset + 4],
    replied: args[offset + 5],
    reply_date: args[offset + 6],
    response_class: args[offset + 7],
    disposition: args[offset + 8],
    meeting: args[offset + 9],
    meeting_date: args[offset + 10],
    application_planned: args[offset + 11],
    application_submitted: args[offset + 12],
    next_action: args[offset + 13],
    next_action_due: args[offset + 14],
    notes: args[offset + 15],
    last_updated: args[offset + 16],
    revision,
  };
}

class FakeD1Statement {
  constructor(db, sql) { this.db = db; this.sql = sql.replace(/\s+/g, " ").trim(); this.args = []; }
  bind(...args) { this.args = args; return this; }
  async run() {
    if (this.sql.startsWith("CREATE TABLE")) return { meta: { changes: 0 } };
    if (this.sql.startsWith("INSERT INTO professor_progress")) {
      const id = this.args[0];
      const existing = this.db.rows.get(id);
      const compareAtZero = this.sql.includes("WHERE professor_progress.revision = 0");
      if (compareAtZero && existing && Number(existing.revision) !== 0) return { meta: { changes: 0 } };
      const revision = existing ? Number(existing.revision) + 1 : 1;
      this.db.rows.set(id, rowFromProgressArgs(id, this.args, 1, revision));
      return { meta: { changes: 1 } };
    }
    if (this.sql.startsWith("UPDATE professor_progress SET")) {
      const id = this.args[17];
      const expectedRevision = this.args[18];
      const existing = this.db.rows.get(id);
      if (!existing || Number(existing.revision) !== expectedRevision) return { meta: { changes: 0 } };
      this.db.rows.set(id, rowFromProgressArgs(id, this.args, 0, expectedRevision + 1));
      return { meta: { changes: 1 } };
    }
    throw new Error(`Unsupported fake D1 run: ${this.sql}`);
  }
  async first() {
    if (this.sql.startsWith("SELECT * FROM professor_progress WHERE professor_id")) return this.db.rows.get(this.args[0]) || null;
    throw new Error(`Unsupported fake D1 first: ${this.sql}`);
  }
  async all() {
    if (this.sql === "SELECT * FROM professor_progress") return { results: [...this.db.rows.values()] };
    throw new Error(`Unsupported fake D1 all: ${this.sql}`);
  }
}

class FakeD1 {
  constructor() { this.rows = new Map(); }
  prepare(sql) { return new FakeD1Statement(this, sql); }
  async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
}

function completeProgress(overrides = {}) {
  return {
    contactRoute: "Email",
    emailContact: "professor@example.edu",
    emailed: false,
    emailSentDate: "",
    followUpSent: false,
    replied: false,
    replyDate: "",
    responseClass: "N/A",
    disposition: "Not contacted",
    meeting: false,
    meetingDate: "",
    applicationPlanned: false,
    applicationSubmitted: false,
    nextAction: "",
    nextActionDue: "",
    notes: "",
    ...overrides,
  };
}

function progressRequest(id, expectedRevision, progress) {
  return new Request("https://tracker.example/api/progress", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, expectedRevision, progress }),
  });
}

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
  assert.match(client, /expectedRevision/);
  await fs.access(path.join(root, "dist", ".openai", "drizzle", "0001_professor_progress_revision.sql"));
});

test("local mode persists progress in browser storage", () => {
  assert.match(client, /advisor-atlas-progress-v1/);
  assert.match(client, /window\.localStorage\.setItem\(localProgressKey/);
  assert.match(client, /Saved on this device/);
  assert.match(client, /saveLocalSnapshot\(\)/);
});

test("the GitHub Pages build works below a repository path", async () => {
  assert.match(pagesHtml, /href="\.\/styles\.css"/);
  assert.match(pagesHtml, /src="\.\/app\.js"/);
  assert.match(pagesHtml, /https:\/\/weakyman45\.github\.io\/advisor-atlas\/og\.png/);
  assert.doesNotMatch(pagesHtml, /(?:href|src)="\/(?:styles\.css|app\.js|og\.png)/);
  assert.match(client, /hostname\.endsWith\("\.github\.io"\)/);
  assert.match(client, /fetch\("\.\/data\/professors\.json"/);
  const pagesData = JSON.parse(await fs.readFile(path.join(root, "docs", "data", "professors.json"), "utf8"));
  assert.equal(pagesData.professors.length, 141);
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

test("cloud writes reject sparse records before changing D1", async () => {
  const db = new FakeD1();
  const id = data.professors[0].id;
  const response = await worker.fetch(progressRequest(id, 0, { emailed: true }), { DB: db });
  assert.equal(response.status, 400);
  assert.equal(db.rows.size, 0);
});

test("cloud writes increment revisions and reject stale writers", async () => {
  const db = new FakeD1();
  const id = data.professors[0].id;
  const initial = await worker.fetch(progressRequest(id, 0, completeProgress({ notes: "Initial note" })), { DB: db });
  assert.equal(initial.status, 200);
  assert.equal((await initial.json()).progress.revision, 1);

  const browserWrite = await worker.fetch(progressRequest(id, 1, completeProgress({ notes: "User-authored note", applicationPlanned: true })), { DB: db });
  assert.equal(browserWrite.status, 200);
  assert.equal((await browserWrite.json()).progress.revision, 2);

  const staleSync = await worker.fetch(progressRequest(id, 1, completeProgress({ emailed: true, emailSentDate: "2026-08-25" })), { DB: db });
  assert.equal(staleSync.status, 409);
  const conflict = await staleSync.json();
  assert.equal(conflict.current.revision, 2);
  assert.equal(conflict.current.notes, "User-authored note");
  assert.equal(conflict.current.applicationPlanned, true);

  const merged = { ...conflict.current, emailed: true, emailSentDate: "2026-08-25" };
  const retry = await worker.fetch(progressRequest(id, conflict.current.revision, merged), { DB: db });
  assert.equal(retry.status, 200);
  const saved = (await retry.json()).progress;
  assert.equal(saved.revision, 3);
  assert.equal(saved.emailed, true);
  assert.equal(saved.notes, "User-authored note");
  assert.equal(saved.applicationPlanned, true);
});

test("only one first writer can claim revision zero", async () => {
  const db = new FakeD1();
  const id = data.professors[0].id;
  const first = await worker.fetch(progressRequest(id, 0, completeProgress({ notes: "First" })), { DB: db });
  const second = await worker.fetch(progressRequest(id, 0, completeProgress({ notes: "Second" })), { DB: db });
  assert.equal(first.status, 200);
  assert.equal(second.status, 409);
  assert.equal((await second.json()).current.notes, "First");
});

test("cloud imports reject sparse replacement records", async () => {
  const db = new FakeD1();
  const id = data.professors[0].id;
  const request = new Request("https://tracker.example/api/progress/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ records: [{ id, emailed: true }] }),
  });
  const response = await worker.fetch(request, { DB: db });
  assert.equal(response.status, 400);
  assert.equal(db.rows.size, 0);
});
