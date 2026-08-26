const CONTACT_ROUTES = new Set(["Email", "Application only", "Interest form", "Local introduction", "Do not contact", "TBD"]);
const RESPONSE_CLASSES = new Set(["N/A", "Pending", "Positive", "Neutral", "Negative"]);
const DISPOSITIONS = new Set(["Not contacted", "Awaiting reply", "Encouraged to apply", "Wants to talk", "Asked for materials", "Generic reply", "Committee-only", "Not recruiting", "No funding", "Declined", "Referred elsewhere", "No reply after follow-up", "Other"]);
const PROFESSOR_IDS = new Set(BASE_DATA.professors.map((professor) => professor.id));
const BOOLEAN_PROGRESS_FIELDS = ["emailed", "followUpSent", "replied", "meeting", "applicationPlanned", "applicationSubmitted"];
const STRING_PROGRESS_FIELDS = ["contactRoute", "emailContact", "emailSentDate", "replyDate", "responseClass", "disposition", "meetingDate", "nextAction", "nextActionDue", "notes"];
const DATE_PROGRESS_FIELDS = ["emailSentDate", "replyDate", "meetingDate", "nextActionDue"];
const REQUIRED_PROGRESS_FIELDS = [...BOOLEAN_PROGRESS_FIELDS, ...STRING_PROGRESS_FIELDS];

const createTableSql = `CREATE TABLE IF NOT EXISTS professor_progress (
  professor_id TEXT PRIMARY KEY NOT NULL,
  contact_route TEXT NOT NULL DEFAULT 'TBD',
  email_contact TEXT NOT NULL DEFAULT '',
  emailed INTEGER NOT NULL DEFAULT 0,
  email_sent_date TEXT NOT NULL DEFAULT '',
  follow_up_sent INTEGER NOT NULL DEFAULT 0,
  replied INTEGER NOT NULL DEFAULT 0,
  reply_date TEXT NOT NULL DEFAULT '',
  response_class TEXT NOT NULL DEFAULT 'N/A',
  disposition TEXT NOT NULL DEFAULT 'Not contacted',
  meeting INTEGER NOT NULL DEFAULT 0,
  meeting_date TEXT NOT NULL DEFAULT '',
  application_planned INTEGER NOT NULL DEFAULT 0,
  application_submitted INTEGER NOT NULL DEFAULT 0,
  next_action TEXT NOT NULL DEFAULT '',
  next_action_due TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  last_updated TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 0
)`;

function defaultProgress(professor) {
  return {
    contactRoute: professor.defaultContactRoute || "TBD",
    emailContact: "", emailed: false, emailSentDate: "", followUpSent: false, replied: false,
    replyDate: "", responseClass: "N/A", disposition: "Not contacted", meeting: false,
    meetingDate: "", applicationPlanned: false, applicationSubmitted: false, nextAction: "",
    nextActionDue: "", notes: "", lastUpdated: "", revision: 0,
  };
}

function rowToProgress(row) {
  return {
    contactRoute: row.contact_route, emailContact: row.email_contact, emailed: Boolean(row.emailed),
    emailSentDate: row.email_sent_date, followUpSent: Boolean(row.follow_up_sent), replied: Boolean(row.replied),
    replyDate: row.reply_date, responseClass: row.response_class, disposition: row.disposition,
    meeting: Boolean(row.meeting), meetingDate: row.meeting_date, applicationPlanned: Boolean(row.application_planned),
    applicationSubmitted: Boolean(row.application_submitted), nextAction: row.next_action,
    nextActionDue: row.next_action_due, notes: row.notes, lastUpdated: row.last_updated,
    revision: Number(row.revision || 0),
  };
}

function cleanString(value, maxLength = 500) { return typeof value === "string" ? value.trim().slice(0, maxLength) : ""; }
function cleanDate(value) { const text = cleanString(value, 10); return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ""; }
function isJsonRequest(request) { return (request.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase() === "application/json"; }

function validateCompleteProgress(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "Progress must be an object.";
  const missing = REQUIRED_PROGRESS_FIELDS.filter((field) => !Object.hasOwn(input, field));
  if (missing.length) return `Progress is incomplete: ${missing.join(", ")}.`;
  const invalidBoolean = BOOLEAN_PROGRESS_FIELDS.find((field) => typeof input[field] !== "boolean");
  if (invalidBoolean) return `${invalidBoolean} must be boolean.`;
  const invalidString = STRING_PROGRESS_FIELDS.find((field) => typeof input[field] !== "string");
  if (invalidString) return `${invalidString} must be a string.`;
  if (!CONTACT_ROUTES.has(input.contactRoute)) return "contactRoute is invalid.";
  if (!RESPONSE_CLASSES.has(input.responseClass)) return "responseClass is invalid.";
  if (!DISPOSITIONS.has(input.disposition)) return "disposition is invalid.";
  const invalidDate = DATE_PROGRESS_FIELDS.find((field) => input[field] && !/^\d{4}-\d{2}-\d{2}$/.test(input[field]));
  return invalidDate ? `${invalidDate} must be YYYY-MM-DD or empty.` : null;
}

function sanitizeProgress(input = {}, fallbackRoute = "TBD", preserveTimestamp = false) {
  const contactRoute = CONTACT_ROUTES.has(input.contactRoute) ? input.contactRoute : fallbackRoute;
  const responseClass = RESPONSE_CLASSES.has(input.responseClass) ? input.responseClass : "N/A";
  const disposition = DISPOSITIONS.has(input.disposition) ? input.disposition : "Not contacted";
  return {
    contactRoute, emailContact: cleanString(input.emailContact, 500), emailed: Boolean(input.emailed),
    emailSentDate: cleanDate(input.emailSentDate), followUpSent: Boolean(input.followUpSent),
    replied: Boolean(input.replied), replyDate: cleanDate(input.replyDate), responseClass, disposition,
    meeting: Boolean(input.meeting), meetingDate: cleanDate(input.meetingDate),
    applicationPlanned: Boolean(input.applicationPlanned) || Boolean(input.applicationSubmitted),
    applicationSubmitted: Boolean(input.applicationSubmitted), nextAction: cleanString(input.nextAction, 1000),
    nextActionDue: cleanDate(input.nextActionDue), notes: cleanString(input.notes, 10000),
    lastUpdated: preserveTimestamp && typeof input.lastUpdated === "string" ? input.lastUpdated.slice(0, 40) : new Date().toISOString(),
  };
}

async function ensureSchema(db) { await db.prepare(createTableSql).run(); }

function upsertStatement(db, id, progress) {
  return db.prepare(`INSERT INTO professor_progress (
    professor_id, contact_route, email_contact, emailed, email_sent_date, follow_up_sent,
    replied, reply_date, response_class, disposition, meeting, meeting_date,
    application_planned, application_submitted, next_action, next_action_due, notes, last_updated, revision
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  ON CONFLICT(professor_id) DO UPDATE SET
    contact_route = excluded.contact_route, email_contact = excluded.email_contact,
    emailed = excluded.emailed, email_sent_date = excluded.email_sent_date,
    follow_up_sent = excluded.follow_up_sent, replied = excluded.replied, reply_date = excluded.reply_date,
    response_class = excluded.response_class, disposition = excluded.disposition, meeting = excluded.meeting,
    meeting_date = excluded.meeting_date, application_planned = excluded.application_planned,
    application_submitted = excluded.application_submitted, next_action = excluded.next_action,
    next_action_due = excluded.next_action_due, notes = excluded.notes, last_updated = excluded.last_updated,
    revision = professor_progress.revision + 1`).bind(
      id, progress.contactRoute, progress.emailContact, progress.emailed ? 1 : 0, progress.emailSentDate,
      progress.followUpSent ? 1 : 0, progress.replied ? 1 : 0, progress.replyDate, progress.responseClass,
      progress.disposition, progress.meeting ? 1 : 0, progress.meetingDate, progress.applicationPlanned ? 1 : 0,
      progress.applicationSubmitted ? 1 : 0, progress.nextAction, progress.nextActionDue, progress.notes, progress.lastUpdated,
    );
}

function casUpsertAtZeroStatement(db, id, progress) {
  return db.prepare(`INSERT INTO professor_progress (
    professor_id, contact_route, email_contact, emailed, email_sent_date, follow_up_sent,
    replied, reply_date, response_class, disposition, meeting, meeting_date,
    application_planned, application_submitted, next_action, next_action_due, notes, last_updated, revision
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  ON CONFLICT(professor_id) DO UPDATE SET
    contact_route = excluded.contact_route, email_contact = excluded.email_contact,
    emailed = excluded.emailed, email_sent_date = excluded.email_sent_date,
    follow_up_sent = excluded.follow_up_sent, replied = excluded.replied, reply_date = excluded.reply_date,
    response_class = excluded.response_class, disposition = excluded.disposition, meeting = excluded.meeting,
    meeting_date = excluded.meeting_date, application_planned = excluded.application_planned,
    application_submitted = excluded.application_submitted, next_action = excluded.next_action,
    next_action_due = excluded.next_action_due, notes = excluded.notes, last_updated = excluded.last_updated,
    revision = professor_progress.revision + 1
  WHERE professor_progress.revision = 0`).bind(
      id, progress.contactRoute, progress.emailContact, progress.emailed ? 1 : 0, progress.emailSentDate,
      progress.followUpSent ? 1 : 0, progress.replied ? 1 : 0, progress.replyDate, progress.responseClass,
      progress.disposition, progress.meeting ? 1 : 0, progress.meetingDate, progress.applicationPlanned ? 1 : 0,
      progress.applicationSubmitted ? 1 : 0, progress.nextAction, progress.nextActionDue, progress.notes, progress.lastUpdated,
    );
}

function casUpdateStatement(db, id, progress, expectedRevision) {
  return db.prepare(`UPDATE professor_progress SET
    contact_route = ?, email_contact = ?, emailed = ?, email_sent_date = ?, follow_up_sent = ?,
    replied = ?, reply_date = ?, response_class = ?, disposition = ?, meeting = ?, meeting_date = ?,
    application_planned = ?, application_submitted = ?, next_action = ?, next_action_due = ?,
    notes = ?, last_updated = ?, revision = revision + 1
  WHERE professor_id = ? AND revision = ?`).bind(
      progress.contactRoute, progress.emailContact, progress.emailed ? 1 : 0, progress.emailSentDate,
      progress.followUpSent ? 1 : 0, progress.replied ? 1 : 0, progress.replyDate, progress.responseClass,
      progress.disposition, progress.meeting ? 1 : 0, progress.meetingDate, progress.applicationPlanned ? 1 : 0,
      progress.applicationSubmitted ? 1 : 0, progress.nextAction, progress.nextActionDue, progress.notes,
      progress.lastUpdated, id, expectedRevision,
    );
}

function changedRows(result) { return Number(result?.meta?.changes ?? result?.changes ?? 0); }

async function readCurrentProgress(db, id, professor) {
  const row = await db.prepare("SELECT * FROM professor_progress WHERE professor_id = ?").bind(id).first();
  return row ? rowToProgress(row) : defaultProgress(professor);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

function staticResponse(body, contentType, cache = "public, max-age=300") {
  return new Response(body, { headers: {
    "content-type": contentType, "cache-control": cache, "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  } });
}

async function readJsonBody(request, maxBytes = 2_000_000) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new Error("Payload too large");
  const text = await request.text();
  if (text.length > maxBytes) throw new Error("Payload too large");
  return JSON.parse(text || "{}");
}

async function getProfessors(env) {
  if (!env?.DB) return json({ professors: BASE_DATA.professors.map((professor) => ({ ...professor, ...defaultProgress(professor) })), persistent: false });
  try {
    await ensureSchema(env.DB);
    const result = await env.DB.prepare("SELECT * FROM professor_progress").all();
    const progressById = new Map((result.results || []).map((row) => [row.professor_id, rowToProgress(row)]));
    return json({ professors: BASE_DATA.professors.map((professor) => ({ ...professor, ...defaultProgress(professor), ...(progressById.get(professor.id) || {}) })), persistent: true });
  } catch {
    return json({ professors: BASE_DATA.professors.map((professor) => ({ ...professor, ...defaultProgress(professor) })), persistent: false, storageError: "Progress storage is temporarily unavailable." });
  }
}

async function saveOne(request, env) {
  if (!env?.DB) return json({ error: "Persistent storage is unavailable." }, 503);
  if (!isJsonRequest(request)) return json({ error: "Content-Type must be application/json." }, 415);
  let body;
  try { body = await readJsonBody(request); } catch { return json({ error: "Invalid request body." }, 400); }
  if (!PROFESSOR_IDS.has(body.id)) return json({ error: "Unknown professor." }, 404);
  if (!Number.isInteger(body.expectedRevision) || body.expectedRevision < 0) return json({ error: "expectedRevision must be a non-negative integer." }, 400);
  const validationError = validateCompleteProgress(body.progress);
  if (validationError) return json({ error: validationError }, 400);
  const professor = BASE_DATA.professors.find((item) => item.id === body.id);
  const progress = sanitizeProgress(body.progress, professor.defaultContactRoute);
  try {
    await ensureSchema(env.DB);
    const statement = body.expectedRevision === 0
      ? casUpsertAtZeroStatement(env.DB, body.id, progress)
      : casUpdateStatement(env.DB, body.id, progress, body.expectedRevision);
    const result = await statement.run();
    if (changedRows(result) !== 1) {
      const current = await readCurrentProgress(env.DB, body.id, professor);
      return json({ error: "Progress changed after it was loaded.", current }, 409);
    }
    return json({ ok: true, progress: await readCurrentProgress(env.DB, body.id, professor) });
  }
  catch { return json({ error: "Progress could not be saved." }, 500); }
}

async function importProgress(request, env) {
  if (!env?.DB) return json({ error: "Persistent storage is unavailable." }, 503);
  if (!isJsonRequest(request)) return json({ error: "Content-Type must be application/json." }, 415);
  let body;
  try { body = await readJsonBody(request); } catch { return json({ error: "Invalid request body." }, 400); }
  if (!Array.isArray(body.records) || body.records.length > 200) return json({ error: "Import must contain no more than 200 records." }, 400);
  const valid = body.records.filter((record) => record && PROFESSOR_IDS.has(record.id));
  if (!valid.length) return json({ error: "No matching professor records." }, 400);
  const invalid = valid.find((record) => validateCompleteProgress(record));
  if (invalid) return json({ error: `Import record ${invalid.id} is incomplete or invalid.` }, 400);
  try {
    await ensureSchema(env.DB);
    const statements = valid.map((record) => {
      const professor = BASE_DATA.professors.find((item) => item.id === record.id);
      return upsertStatement(env.DB, record.id, sanitizeProgress(record, professor.defaultContactRoute, true));
    });
    await env.DB.batch(statements);
    return json({ ok: true, imported: valid.length });
  } catch { return json({ error: "Progress could not be imported." }, 500); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/professors") return getProfessors(env);
    if (request.method === "POST" && url.pathname === "/api/progress") return saveOne(request, env);
    if (request.method === "POST" && url.pathname === "/api/progress/import") return importProgress(request, env);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) return staticResponse(INDEX_HTML.replaceAll("__ORIGIN__", url.origin), "text/html; charset=utf-8", "no-cache");
    if (request.method === "GET" && url.pathname === "/styles.css") return staticResponse(STYLES_CSS, "text/css; charset=utf-8");
    if (request.method === "GET" && url.pathname === "/app.js") return staticResponse(CLIENT_JS, "text/javascript; charset=utf-8");
    if (request.method === "GET" && url.pathname === "/data/professors.json") return json(BASE_DATA);
    if (request.method === "GET" && url.pathname === "/og.png" && OG_IMAGE_BYTES) return staticResponse(Uint8Array.from(atob(OG_IMAGE_BYTES), (character) => character.charCodeAt(0)), "image/png", "public, max-age=86400");
    return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  },
};
