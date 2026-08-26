const state = {
  professors: [],
  activePipeline: "all",
  visibleLimit: 30,
  persistent: false,
  storageMode: "memory",
  editingId: null,
};

const byId = (id) => document.getElementById(id);
const todayIso = () => new Date().toISOString().slice(0, 10);
const localProgressKey = "advisor-atlas-progress-v1";
const positiveDispositions = new Set(["Encouraged to apply", "Wants to talk", "Asked for materials"]);
const negativeDispositions = new Set(["Not recruiting", "No funding", "Declined", "No reply after follow-up"]);
const trackLabels = { A: "Human–AI", B: "IR / search", C: "AI & science", D: "Agents", E: "Core NLP / ML" };
const progressKeys = [
  "contactRoute", "emailContact", "emailed", "emailSentDate", "followUpSent", "replied", "replyDate",
  "responseClass", "disposition", "meeting", "meetingDate", "applicationPlanned", "applicationSubmitted",
  "nextAction", "nextActionDue", "notes", "lastUpdated", "revision",
];

function defaultProgress(professor) {
  return {
    contactRoute: professor.defaultContactRoute || "TBD",
    emailContact: "",
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
    lastUpdated: "",
    revision: 0,
  };
}

function normalizeProfessor(professor) {
  return { ...professor, ...defaultProgress(professor), ...professor };
}

function applyProgressRecords(records) {
  if (!Array.isArray(records)) return 0;
  const known = new Map(state.professors.map((professor) => [professor.id, professor]));
  let applied = 0;
  records.forEach((record) => {
    const professor = record && known.get(record.id);
    if (!professor) return;
    progressKeys.forEach((key) => {
      if (key in record) professor[key] = record[key];
    });
    applied += 1;
  });
  return applied;
}

function enableLocalStorage() {
  try {
    const raw = window.localStorage.getItem(localProgressKey);
    if (raw) {
      const payload = JSON.parse(raw);
      applyProgressRecords(Array.isArray(payload) ? payload : payload.records);
    }
    window.localStorage.setItem(localProgressKey, raw || JSON.stringify({ version: 1, records: [] }));
    state.storageMode = "local";
    return true;
  } catch {
    state.storageMode = "memory";
    return false;
  }
}

function saveLocalSnapshot() {
  try {
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      records: state.professors.map(progressRecord),
    };
    window.localStorage.setItem(localProgressKey, JSON.stringify(payload));
    state.storageMode = "local";
    return true;
  } catch {
    state.storageMode = "memory";
    return false;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
  } catch {
    return "#";
  }
}

function truncate(value, length = 92) {
  const text = String(value ?? "");
  return text.length > length ? `${text.slice(0, length - 1).trim()}…` : text;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value, options = { month: "short", day: "numeric", year: "numeric" }) {
  const date = value instanceof Date ? value : parseDate(value);
  return date ? new Intl.DateTimeFormat("en", options).format(date) : "";
}

function followUpDue(professor) {
  if (!professor.emailed || !professor.emailSentDate || professor.replied || professor.followUpSent) return null;
  const date = parseDate(professor.emailSentDate);
  if (!date) return null;
  date.setDate(date.getDate() + 14);
  return date;
}

function isFollowUpDue(professor) {
  const due = followUpDue(professor);
  if (!due) return false;
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  return due <= endOfToday;
}

function isPositive(professor) {
  return professor.responseClass === "Positive" || positiveDispositions.has(professor.disposition);
}

function isNegative(professor) {
  return professor.responseClass === "Negative" || negativeDispositions.has(professor.disposition);
}

function derivedStatus(professor) {
  if (professor.applicationSubmitted) return { label: "Submitted", className: "submitted" };
  if (professor.meeting) return { label: "Meeting", className: "meeting" };
  if (isPositive(professor)) return { label: professor.disposition === "Wants to talk" ? "Wants to talk" : "Positive", className: "positive" };
  if (isNegative(professor)) return { label: professor.disposition === "Not contacted" ? "Negative" : professor.disposition, className: "negative" };
  if (professor.replied) return { label: professor.disposition === "Not contacted" ? "Reply received" : professor.disposition, className: "neutral" };
  if (professor.emailed) return { label: isFollowUpDue(professor) ? "Follow-up due" : "Awaiting reply", className: isFollowUpDue(professor) ? "due" : "awaiting" };
  if (professor.applicationPlanned) return { label: "Application planned", className: "planned" };
  if (professor.contactRoute === "Do not contact") return { label: "Do not contact", className: "muted" };
  if (professor.contactRoute === "Application only") return { label: "Application only", className: "muted" };
  return { label: "Not contacted", className: "not-contacted" };
}

function setSyncState(mode, message) {
  const node = byId("sync-state");
  node.className = `sync-state sync-${mode}`;
  node.innerHTML = `<span class="sync-dot"></span><span>${escapeHtml(message)}</span>`;
}

async function loadProfessors() {
  setSyncState("loading", "Connecting…");
  const staticHost = window.location.hostname.endsWith(".github.io");
  try {
    if (staticHost) throw new Error("GitHub Pages uses browser storage");
    const response = await fetch("./api/professors", { cache: "no-store" });
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const payload = await response.json();
    state.professors = payload.professors.map(normalizeProfessor);
    state.persistent = payload.persistent !== false;
    if (state.persistent) {
      state.storageMode = "cloud";
      setSyncState("saved", "Cloud saved");
    } else if (enableLocalStorage()) {
      setSyncState("local", "Saved on this device");
    } else {
      setSyncState("preview", "This tab only");
    }
  } catch {
    const response = await fetch("./data/professors.json", { cache: "no-store" });
    const payload = await response.json();
    state.professors = payload.professors.map(normalizeProfessor);
    state.persistent = false;
    if (enableLocalStorage()) setSyncState("local", "Saved on this device");
    else setSyncState("preview", "This tab only");
  }
  populateFilters();
  renderAll();
}

function populateSelect(id, values, labeler = (value) => value) {
  const select = byId(id);
  const first = select.options[0];
  select.replaceChildren(first);
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labeler(value);
    select.append(option);
  });
}

function populateFilters() {
  populateSelect("filter-region", [...new Set(state.professors.map((p) => p.region))].sort());
  populateSelect("filter-tier", ["Dream", "Strong-fit", "Comparatively safer"].filter((tier) => state.professors.some((p) => p.tier === tier)));
  populateSelect("filter-track", ["A", "B", "C", "D", "E"], (value) => `${value}: ${trackLabels[value]}`);
  populateSelect("filter-route", [...new Set(state.professors.map((p) => p.contactRoute))].sort());
}

function matchesPipeline(professor) {
  switch (state.activePipeline) {
    case "contacted": return professor.emailed;
    case "replied": return professor.replied;
    case "not-contacted": return !professor.emailed && professor.disposition === "Not contacted";
    case "awaiting": return professor.emailed && !professor.replied;
    case "positive": return isPositive(professor);
    case "negative": return isNegative(professor);
    case "meetings": return professor.meeting;
    case "applications": return professor.applicationPlanned || professor.applicationSubmitted;
    case "followups": return isFollowUpDue(professor);
    default: return true;
  }
}

function filteredProfessors() {
  const search = byId("search").value.trim().toLowerCase();
  const region = byId("filter-region").value;
  const tier = byId("filter-tier").value;
  const track = byId("filter-track").value;
  const route = byId("filter-route").value;
  const sort = byId("sort-by").value;
  const result = state.professors.filter((professor) => {
    const haystack = [professor.professor, professor.institution, professor.program, professor.track, professor.exactOverlap, professor.recruitmentStatus].join(" ").toLowerCase();
    return matchesPipeline(professor)
      && (!search || haystack.includes(search))
      && (region === "all" || professor.region === region)
      && (tier === "all" || professor.tier === tier)
      && (track === "all" || String(professor.track).split("+").includes(track))
      && (route === "all" || professor.contactRoute === route);
  });

  const mainRank = (professor) => Number(professor.priorityRank) || 999;
  const reportRank = (professor) => Number(professor.reportPriority) || 999;
  const comparePriority = (a, b) => mainRank(a) - mainRank(b) || reportRank(a) - reportRank(b) || b.opportunityScore - a.opportunityScore || a.professor.localeCompare(b.professor);
  result.sort((a, b) => {
    if (sort === "score") return b.opportunityScore - a.opportunityScore || comparePriority(a, b);
    if (sort === "name") return a.professor.localeCompare(b.professor);
    if (sort === "updated") return String(b.lastUpdated || "").localeCompare(String(a.lastUpdated || "")) || comparePriority(a, b);
    if (sort === "followup") {
      const aDue = followUpDue(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bDue = followUpDue(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aDue - bDue || comparePriority(a, b);
    }
    return comparePriority(a, b);
  });
  return result;
}

function renderMetrics() {
  const total = state.professors.length;
  const institutions = new Set(state.professors.map((p) => p.institution)).size;
  const contactable = state.professors.filter((p) => ["Email", "Interest form", "Local introduction"].includes(p.contactRoute)).length;
  const contacted = state.professors.filter((p) => p.emailed).length;
  const replies = state.professors.filter((p) => p.replied).length;
  const positive = state.professors.filter(isPositive).length;
  const negative = state.professors.filter(isNegative).length;
  const meetings = state.professors.filter((p) => p.meeting).length;
  const applications = state.professors.filter((p) => p.applicationPlanned || p.applicationSubmitted).length;
  const submitted = state.professors.filter((p) => p.applicationSubmitted).length;
  const followups = state.professors.filter(isFollowUpDue).length;
  byId("metric-total").textContent = total;
  byId("metric-institutions").textContent = `${institutions} institutions`;
  byId("metric-contacted").textContent = contacted;
  byId("metric-contact-rate").textContent = `${contactable ? Math.round(contacted / contactable * 100) : 0}% of contactable`;
  byId("metric-replies").textContent = replies;
  byId("metric-reply-rate").textContent = `${contacted ? Math.round(replies / contacted * 100) : 0}% response rate`;
  byId("metric-positive").textContent = positive;
  byId("metric-negative").textContent = negative;
  byId("metric-meetings").textContent = meetings;
  byId("metric-applications").textContent = applications;
  byId("metric-submitted").textContent = `${submitted} submitted`;
  byId("metric-followups").textContent = followups;
}

function renderNextMove() {
  const candidates = [];
  state.professors.forEach((professor) => {
    const nextDate = parseDate(professor.nextActionDue);
    if (nextDate) candidates.push({ professor, date: nextDate, action: professor.nextAction || "Complete next action" });
    const followDate = followUpDue(professor);
    if (followDate) candidates.push({ professor, date: followDate, action: "Send one concise follow-up" });
  });
  candidates.sort((a, b) => a.date - b.date);
  const next = candidates[0];
  if (!next) {
    byId("next-move-professor").textContent = "Build your outreach queue";
    byId("next-move-action").textContent = "Filter to “Not contacted” and open a professor to record your next action.";
    byId("next-move-date").textContent = "No deadline set";
    return;
  }
  byId("next-move-professor").textContent = next.professor.professor;
  byId("next-move-action").textContent = next.action;
  byId("next-move-date").textContent = `Due ${formatDate(next.date)}`;
}

function priorityMarkup(professor) {
  if (professor.priorityRank) return `<strong>#${escapeHtml(professor.priorityRank)}</strong><span>${escapeHtml(professor.tier)}</span>`;
  if (professor.reportPriority) return `<strong>R${escapeHtml(professor.reportPriority)}</strong><span>Report priority</span>`;
  return `<strong>—</strong><span>${escapeHtml(professor.tier)}</span>`;
}

function trackMarkup(track) {
  return String(track || "").split("+").filter(Boolean).map((letter) => `<span class="track-chip" title="${escapeHtml(trackLabels[letter] || letter)}">${escapeHtml(letter)}</span>`).join("");
}

function rowMarkup(professor) {
  const status = derivedStatus(professor);
  const due = followUpDue(professor);
  const nextDate = professor.nextActionDue || (due ? due.toISOString().slice(0, 10) : "");
  const nextAction = professor.nextAction || (due ? "Send follow-up" : truncate(professor.contactRecommendation, 80));
  const recruitingClass = professor.recruitmentScore >= 3 ? "confirmed" : professor.recruitmentScore >= 2 ? "active" : "verify";
  const recruitingLabel = professor.recruitmentScore >= 3 ? "Confirmed" : professor.recruitmentScore >= 2 ? "Active signal" : "Verify";
  return `<tr>
    <td class="priority-cell">${priorityMarkup(professor)}</td>
    <td class="professor-cell"><strong>${escapeHtml(professor.professor)}</strong><span>${escapeHtml(professor.institution)}</span><small>${escapeHtml(professor.region)} · ${escapeHtml(professor.program)}</small></td>
    <td><div class="track-stack">${trackMarkup(professor.track)}</div><span class="fit-summary">${escapeHtml(truncate(professor.exactOverlap, 92))}</span></td>
    <td><span class="signal-pill signal-${recruitingClass}"><i></i>${recruitingLabel}</span><small class="cell-note">${escapeHtml(truncate(professor.recruitmentStatus, 62))}</small></td>
    <td><span class="score-pill">${Number(professor.opportunityScore).toFixed(1)}</span></td>
    <td><span class="progress-pill progress-${status.className}">${escapeHtml(status.label)}</span><small class="cell-note">${escapeHtml(professor.contactRoute)}</small></td>
    <td><strong class="next-action">${escapeHtml(truncate(nextAction, 62))}</strong>${nextDate ? `<small class="${isFollowUpDue(professor) ? "date-due" : ""}">${escapeHtml(formatDate(nextDate, { month: "short", day: "numeric" }))}</small>` : ""}</td>
    <td><button class="edit-button" type="button" data-edit="${escapeHtml(professor.id)}" aria-label="Update ${escapeHtml(professor.professor)}">Update</button></td>
  </tr>`;
}

function renderTable() {
  const result = filteredProfessors();
  const visible = result.slice(0, state.visibleLimit);
  byId("result-count").textContent = result.length;
  const body = byId("professor-rows");
  if (!visible.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty-row"><strong>No professors match these filters.</strong><span>Clear a filter or try a broader search.</span></td></tr>`;
  } else {
    body.innerHTML = visible.map(rowMarkup).join("");
  }
  const loadMore = byId("load-more");
  loadMore.hidden = visible.length >= result.length;
  loadMore.textContent = `Show ${Math.min(30, result.length - visible.length)} more`;
}

function renderAll() {
  renderMetrics();
  renderNextMove();
  renderTable();
}

function setPipeline(pipeline) {
  state.activePipeline = pipeline;
  state.visibleLimit = 30;
  document.querySelectorAll(".pipeline-tab").forEach((tab) => {
    const active = tab.dataset.pipeline === pipeline;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  renderTable();
  byId("workspace-title").scrollIntoView({ behavior: "smooth", block: "start" });
}

function openEditor(id) {
  const professor = state.professors.find((item) => item.id === id);
  if (!professor) return;
  state.editingId = id;
  byId("editor-title").textContent = professor.professor;
  byId("editor-subtitle").textContent = `${professor.institution} · ${professor.program}`;
  byId("editor-priority").textContent = professor.priorityRank ? `Priority #${professor.priorityRank} · ${professor.tier}` : professor.reportPriority ? `Report priority #${professor.reportPriority} · ${professor.tier}` : professor.tier;
  byId("editor-score").textContent = Number(professor.opportunityScore).toFixed(1);
  byId("editor-fit").textContent = professor.exactOverlap;
  byId("editor-recruiting").textContent = professor.recruitmentEvidence || professor.recruitmentStatus;
  byId("editor-funding").textContent = professor.fundingEvidence;
  byId("editor-risk").textContent = professor.mainRisk;
  byId("editor-application-route").textContent = professor.applyThrough;
  byId("editor-official").href = safeUrl(professor.officialUrl);
  byId("editor-evidence").href = safeUrl(professor.evidenceUrl || professor.officialUrl);
  byId("editor-saved-at").textContent = professor.lastUpdated ? `Last updated ${formatDate(professor.lastUpdated.slice(0, 10))}` : "Not updated yet";
  const form = byId("editor-form");
  progressKeys.forEach((key) => {
    const field = form.elements.namedItem(key);
    if (!field) return;
    if (field.type === "checkbox") field.checked = Boolean(professor[key]);
    else field.value = professor[key] || "";
  });
  byId("editor-dialog").showModal();
}

function readEditorProgress() {
  const form = byId("editor-form");
  const value = (name) => form.elements.namedItem(name).value.trim();
  const checked = (name) => form.elements.namedItem(name).checked;
  return {
    contactRoute: value("contactRoute"),
    emailContact: value("emailContact"),
    emailed: checked("emailed"),
    emailSentDate: value("emailSentDate"),
    followUpSent: checked("followUpSent"),
    replied: checked("replied"),
    replyDate: value("replyDate"),
    responseClass: value("responseClass"),
    disposition: value("disposition"),
    meeting: checked("meeting"),
    meetingDate: value("meetingDate"),
    applicationPlanned: checked("applicationPlanned"),
    applicationSubmitted: checked("applicationSubmitted"),
    nextAction: value("nextAction"),
    nextActionDue: value("nextActionDue"),
    notes: value("notes"),
  };
}

async function saveProgress() {
  const professor = state.professors.find((item) => item.id === state.editingId);
  if (!professor) return;
  const button = byId("save-progress");
  button.disabled = true;
  button.textContent = "Saving…";
  const progress = readEditorProgress();
  setSyncState("loading", "Saving…");
  let saved = { ...progress, lastUpdated: new Date().toISOString() };
  try {
    if (state.persistent) {
      const response = await fetch("./api/progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: professor.id, expectedRevision: Number(professor.revision || 0), progress }) });
      const payload = await response.json();
      if (response.status === 409) {
        if (payload.current) {
          Object.assign(professor, payload.current);
          byId("editor-dialog").close();
          openEditor(professor.id);
        }
        setSyncState("error", "Review latest change");
        showToast("This record changed elsewhere. The latest version is loaded; reapply your edit.", "notice");
        return;
      }
      if (!response.ok) throw new Error(`Save returned ${response.status}`);
      saved = payload.progress;
      setSyncState("saved", "Cloud saved");
      showToast("Progress saved.", "success");
    } else {
      Object.assign(professor, saved);
      if (saveLocalSnapshot()) {
        setSyncState("local", "Saved on this device");
        showToast("Progress saved privately in this browser.", "success");
      } else {
        setSyncState("preview", "This tab only");
        showToast("This browser blocked local storage. Export a JSON backup before closing the tab.", "notice");
      }
    }
    Object.assign(professor, saved);
    byId("editor-dialog").close();
    renderAll();
  } catch {
    setSyncState("error", "Save needs retry");
    showToast("Cloud save failed. Your edits remain open; please retry.", "error");
  } finally {
    button.disabled = false;
    button.textContent = "Save progress";
  }
}

function progressRecord(professor) {
  return { id: professor.id, professor: professor.professor, ...Object.fromEntries(progressKeys.map((key) => [key, professor[key] ?? ""])) };
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function exportJson() {
  const payload = { version: 1, exportedAt: new Date().toISOString(), records: state.professors.map(progressRecord) };
  download(`phd-outreach-backup-${todayIso()}.json`, JSON.stringify(payload, null, 2), "application/json");
  showToast("JSON backup downloaded.", "success");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[\",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function exportCsv() {
  const headers = ["Priority Rank", "Report Priority", "Tier", "Region", "Institution", "Professor", "Program", "Track", "Opportunity Score", "Contact Route", "Email / Contact", "Emailed", "Email Sent Date", "Follow-up Due", "Follow-up Sent", "Replied", "Reply Date", "Response Class", "Disposition", "Meeting", "Meeting Date", "Application Planned", "Application Submitted", "Next Action", "Next Action Due", "Notes", "Last Updated", "Official URL"];
  const rows = state.professors.map((p) => [p.priorityRank, p.reportPriority, p.tier, p.region, p.institution, p.professor, p.program, p.track, p.opportunityScore, p.contactRoute, p.emailContact, p.emailed ? "Yes" : "No", p.emailSentDate, followUpDue(p)?.toISOString().slice(0, 10) || "", p.followUpSent ? "Yes" : "No", p.replied ? "Yes" : "No", p.replyDate, p.responseClass, p.disposition, p.meeting ? "Yes" : "No", p.meetingDate, p.applicationPlanned ? "Yes" : "No", p.applicationSubmitted ? "Yes" : "No", p.nextAction, p.nextActionDue, p.notes, p.lastUpdated, p.officialUrl]);
  download(`phd-outreach-tracker-${todayIso()}.csv`, [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n"), "text/csv;charset=utf-8");
  showToast("CSV export downloaded.", "success");
}

async function importBackup(file) {
  let payload;
  try { payload = JSON.parse(await file.text()); } catch { showToast("That file is not valid JSON.", "error"); return; }
  const records = Array.isArray(payload) ? payload : payload.records;
  if (!Array.isArray(records)) { showToast("No progress records were found in that backup.", "error"); return; }
  const known = new Set(state.professors.map((p) => p.id));
  const valid = records.filter((record) => record && known.has(record.id));
  if (!valid.length) { showToast("The backup does not match this professor roster.", "error"); return; }
  if (!window.confirm(`Import progress for ${valid.length} professors? Existing progress for those professors will be replaced.`)) return;
  setSyncState("loading", "Importing…");
  try {
    if (state.persistent) {
      const response = await fetch("./api/progress/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ records: valid }) });
      if (!response.ok) throw new Error(`Import returned ${response.status}`);
      const refresh = await fetch("./api/professors", { cache: "no-store" });
      if (!refresh.ok) throw new Error(`Refresh returned ${refresh.status}`);
      const refreshed = await refresh.json();
      state.professors = refreshed.professors.map(normalizeProfessor);
      setSyncState("saved", "Cloud saved");
    } else {
      const imported = new Map(valid.map((record) => [record.id, record]));
      state.professors.forEach((professor) => {
        const record = imported.get(professor.id);
        if (record) progressKeys.forEach((key) => { if (key in record) professor[key] = record[key]; });
      });
      if (saveLocalSnapshot()) setSyncState("local", "Saved on this device");
      else setSyncState("preview", "This tab only");
    }
    showToast(`Imported ${valid.length} progress records.`, "success");
    renderAll();
  } catch {
    setSyncState("error", "Import needs retry");
    showToast("The backup could not be imported. No cloud records were changed.", "error");
  }
}

let toastTimer;
function showToast(message, tone = "notice") {
  const toast = byId("toast");
  toast.textContent = message;
  toast.className = `toast toast-${tone}`;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
}

document.querySelectorAll("[data-pipeline]").forEach((button) => button.addEventListener("click", () => setPipeline(button.dataset.pipeline)));
["search", "filter-region", "filter-tier", "filter-track", "filter-route", "sort-by"].forEach((id) => byId(id).addEventListener(id === "search" ? "input" : "change", () => { state.visibleLimit = 30; renderTable(); }));
byId("clear-filters").addEventListener("click", () => {
  byId("search").value = "";
  ["filter-region", "filter-tier", "filter-track", "filter-route"].forEach((id) => { byId(id).value = "all"; });
  byId("sort-by").value = "priority";
  setPipeline("all");
});
byId("load-more").addEventListener("click", () => { state.visibleLimit += 30; renderTable(); });
byId("professor-rows").addEventListener("click", (event) => { const button = event.target.closest("[data-edit]"); if (button) openEditor(button.dataset.edit); });
byId("save-progress").addEventListener("click", saveProgress);
byId("export-json").addEventListener("click", exportJson);
byId("export-csv").addEventListener("click", exportCsv);
byId("import-json").addEventListener("click", () => byId("import-file").click());
byId("import-file").addEventListener("change", (event) => { const file = event.target.files[0]; if (file) importBackup(file); event.target.value = ""; });

const editorForm = byId("editor-form");
[["emailed", "emailSentDate"], ["replied", "replyDate"], ["meeting", "meetingDate"]].forEach(([checkboxName, dateName]) => {
  editorForm.elements.namedItem(checkboxName).addEventListener("change", (event) => {
    const dateField = editorForm.elements.namedItem(dateName);
    if (event.target.checked && !dateField.value) dateField.value = todayIso();
  });
});
editorForm.elements.namedItem("replied").addEventListener("change", (event) => {
  if (event.target.checked && editorForm.elements.namedItem("responseClass").value === "N/A") editorForm.elements.namedItem("responseClass").value = "Neutral";
});
editorForm.elements.namedItem("applicationSubmitted").addEventListener("change", (event) => {
  if (event.target.checked) editorForm.elements.namedItem("applicationPlanned").checked = true;
});

loadProfessors();
