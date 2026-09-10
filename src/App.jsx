import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Lock, Unlock, Download, History, Plus, Trash2, X, ChevronDown, ChevronUp, Check,
} from "lucide-react";
import { loadShared, saveShared, verifyCode, clearCode, getCode, listVersions, getVersion } from "./api.js";

/* ═══════════════════════════════════════════════════════════════════════════
   NewWorld × NDWA — Ask Aya Launch Command Center · workplan

   Dates come from SOW 001 (Aug 15 – Nov 30, 2026). Where the proposal and the
   SOW disagree, the SOW wins. Nothing below invents a date the SOW doesn't give:
   items the SOW leaves undated sit in the "Not scheduled" tray.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── house tokens ─────────────────────────────────────────────────────────── */
const NW = {
  creme: "#FAFBEF", grey: "#D3D3CD", black: "#000000", brown: "#20201E",
  green: "#1FB356", blue: "#06213D", ink: "#0A0A08",
};

/* ── status vocabulary (no yellow: green is ours/winning, blue is sober/problem) */
const STATUS = {
  notStarted: { label: "Not started", color: "rgba(10,10,8,.45)", ink: NW.ink,   fill: "transparent", track: "rgba(10,10,8,.06)" },
  onTrack:    { label: "On track",    color: NW.green,            ink: NW.creme, fill: NW.green,      track: "rgba(31,179,86,.18)" },
  atRisk:     { label: "At risk",     color: NW.blue,             ink: NW.blue,  fill: "transparent", track: "rgba(6,33,61,.10)" },
  delayed:    { label: "Delayed",     color: NW.blue,             ink: NW.creme, fill: NW.blue,       track: "rgba(6,33,61,.18)" },
  complete:   { label: "Complete",    color: NW.green,            ink: NW.creme, fill: NW.green,      track: "rgba(31,179,86,.30)" },
};
const STATUS_KEYS = Object.keys(STATUS);

/* Who a date depends on. The most useful thing an anxious client can see is
   which dates are theirs. */
const OWNERS = {
  NDWA: { label: "NDWA",     color: NW.blue },
  NW:   { label: "NewWorld", color: NW.green },
  JT:   { label: "Both",     color: NW.ink },
};
const CLIENT = "NDWA";

/* MOCHA — one accountable owner per workstream, spanning both orgs. */
const ORGS = { NW: { label: "NewWorld", color: NW.green }, NDWA: { label: "NDWA", color: NW.blue } };
const ROLES = [
  { k: "manager",   ltr: "M", name: "Manager",   multi: false, def: "Checks in on progress and holds the owner accountable." },
  { k: "owner",     ltr: "O", name: "Owner",     multi: false, def: "Drives the work and makes the call. One person only." },
  { k: "consulted", ltr: "C", name: "Consulted", multi: true,  def: "Weighs in before a decision is made." },
  { k: "helpers",   ltr: "H", name: "Helpers",   multi: true,  def: "Does pieces of the work." },
  { k: "approver",  ltr: "A", name: "Approver",  multi: false, def: "Signs off. Can veto." },
];
const emptyMocha = () => ({
  confirmed: false,
  manager: { name: "", org: "NW" }, owner: { name: "", org: "NW" }, approver: { name: "", org: "NDWA" },
  consulted: [], helpers: [],
});
const person = (name, org) => ({ name, org });

/* ── calendar ─────────────────────────────────────────────────────────────── */
// Week 0 is the Monday of the week containing the SOW effective date (Aug 15).
// Week 18 is the Monday of the week the retrospective is due (Dec 15).
const PROJECT_START = new Date(2026, 7, 10);
const WEEK_COUNT = 19;
const TERM_END = new Date(2026, 10, 30);
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const WEEK_DATES = Array.from({ length: WEEK_COUNT }, (_, i) => {
  const d = new Date(PROJECT_START); d.setDate(d.getDate() + i * 7); return d;
});
const WEEKS = WEEK_DATES.map((d) => `${MONTHS[d.getMonth()]} ${d.getDate()}`);
const fmt = (d) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
const parseDate = (s) => {
  if (!s || typeof s !== "string") return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};
const weekOfDate = (s) => {
  const d = parseDate(s);
  if (!d) return null;
  return Math.floor((d - PROJECT_START) / (7 * 86400000));
};
const showDate = (s) => { const d = parseDate(s); return d ? fmt(d) : ""; };
const currentWeekIndex = () =>
  Math.min(WEEK_COUNT - 1, Math.max(0, Math.floor((new Date() - PROJECT_START) / (7 * 86400000))));

const uid = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ── seed — the plan as it stands on first load, before any publish ────────── */
const mocha = (m, o, c, h, a) => ({ confirmed: false, manager: m, owner: o, consulted: c, helpers: h, approver: a });
const P = {
  andre:   person("Andre Banks", "NW"),
  clarence:person("Clarence Kwan", "NW"),
  joseph:  person("Joseph Huff-Hannon", "NW"),
  jinah:   person("Jinah Lee", "NW"),
  sam:     person("Sam Freel", "NW"),
  ipshita: person("Ipshita Raval", "NW"),
  bcm:     person("Bilingual Creator Manager (to be hired)", "NW"),
  ndOwner: person("NDWA engagement owner", "NDWA"),
  ndLegal: person("NDWA legal and compliance reviewer", "NDWA"),
  ndComms: person("NDWA communications", "NDWA"),
};
const ph = (id, label, startWeek, endWeek, status, bullets = [], notes = "") =>
  ({ id, label, bullets, startWeek, endWeek, progress: 0, status, notes, baseline: null });

const SEED = {
  project: {
    client: "NDWA",
    clientFull: "National Domestic Workers Alliance",
    name: "Ask Aya Launch Command Center",
    sow: "SOW 001",
    term: "August 15 – November 30, 2026",
    edition: "September 2026",
    lede: "A creator-led Command Center to drive awareness, trust and activation of Ask Aya among unaffiliated domestic workers. Three phases, one always-on team, publish-only updates from NewWorld.",
  },
  weeklyNote: {
    headline: "Phase 1 research is underway. NDWA's Meta ads tests are running, with results due Sep 17.",
    body: "Audience research, the content-appetite survey and creator sourcing all started the week of Aug 31. The draft message bank is the one Phase 1 deliverable that depends on a client input: NDWA's Meta ads test results, now due back September 17. Phase 2 (Command Center launch) begins September 14.",
    author: "NewWorld",
    date: "2026-09-10",
  },
  todos: [
    { id: "td_1", label: "Fold Meta ads test results into the draft message bank when they land (Sep 17)", done: false },
    { id: "td_2", label: "Name NDWA engagement owner and legal/compliance reviewer", done: false },
    { id: "td_3", label: "Share creator longlist for roster approval before contracting", done: false },
  ],
  workstreams: [
    {
      id: "ws_research", name: "Research and Stand-Up",
      summary: "Phase 1 · Aug 30 – Sep 30. What this workforce believes about AI and about NDWA, who reaches them, and what we will say.",
      mocha: mocha(P.joseph, P.sam, [P.ipshita, P.ndOwner], [P.ipshita], P.ndOwner),
      phases: [
        ph("p_res_1", "Audience research summary", 3, 7, "onTrack",
          ["Covers NDWA's priority worker segments", "Behavioural definition: what they consume, where, how, why"]),
        ph("p_res_2", "Content-appetite survey", 3, 7, "onTrack",
          ["Design, fielding and findings", "Respondent sourcing passed through at cost ($2–3K)"]),
        ph("p_res_3", "Creator sourcing longlist", 3, 7, "onTrack",
          ["Vetting status by tier: worker-creators, community voices, lifestyle-adjacent", "Content history, brand safety, audience authenticity, disclosure history"]),
        ph("p_res_4", "Draft message bank", 3, 7, "onTrack",
          ["Incorporates NDWA's Meta ads test results (due Sep 17)", "Written natively in English and Spanish"],
          "Depends on the Meta ads results. The SOW allows Phase 2 and 3 to shift if this input is late, with no change to fees."),
        ph("p_res_5", "Phase 2 workplan and production calendar", 5, 7, "notStarted",
          ["Governs how the $95K committed creator fund is disbursed"]),
      ],
    },
    {
      id: "ws_creators", name: "Creator Program",
      summary: "The engine. Three tiers, five languages, vetted before contracting. Contracting starts when the committed media fund is received and NDWA has approved the roster.",
      mocha: mocha(P.joseph, P.bcm, [P.ndOwner], [], P.ndOwner),
      phases: [
        ph("p_cre_1", "Contracted creator roster", 5, 9, "notStarted",
          ["NDWA approves the roster before contracting", "Worker-creators · community voices · lifestyle-adjacent creators", "Tagalog, Haitian Creole and Portuguese via creator content"]),
        ph("p_cre_2", "First creator content published", 5, 9, "notStarted",
          ["Green-tier content from the pre-cleared bank publishes without review"]),
        ph("p_cre_3", "Ongoing production, publication and amplification", 9, 14, "notStarted",
          ["Phase 3 · Oct 12 – Nov 16", "Amplification coordinated against the production calendar"]),
      ],
    },
    {
      id: "ws_creative", name: "Creative and Message Bank",
      summary: "Every asset developed in English and Spanish from the outset. The pre-cleared bank is what makes rapid response possible.",
      mocha: mocha(P.clarence, P.jinah, [P.joseph, P.ndComms], [], P.ndLegal),
      phases: [
        ph("p_crv_1", "Creative assets in English and Spanish", 5, 9, "notStarted",
          ["Briefed, reviewed and cleared natively in both languages"]),
        ph("p_crv_2", "Final pre-cleared message bank and rapid-response playbook", 5, 9, "notStarted",
          ["Green: pre-cleared, publishes · Amber: 24h, NDWA comms · Red: 72h, leadership and legal",
           "Amber content not returned in 24h is deemed approved; Red requires affirmative approval"]),
        ph("p_crv_3", "Creative learnings handed to NDWA paid social team", 12, 14, "notStarted",
          ["Tested creative and audience insight, in scope not extra", "Paid social itself is NDWA-managed"]),
      ],
    },
    {
      id: "ws_ops", name: "Command Center Operations",
      summary: "Proactive: saturate the launch message week after week. Reactive: answer skepticism while the doubt is still live.",
      mocha: mocha(P.andre, P.joseph, [P.jinah], [P.bcm], P.ndOwner),
      phases: [
        ph("p_ops_1", "Operating cadence live", 5, 9, "notStarted",
          ["Weekly production call · biweekly performance summary · monthly executive check-in"]),
        ph("p_ops_2", "Social listening and performance dashboard", 5, 9, "notStarted",
          ["Comment sentiment tracked, AI skepticism specifically"]),
        ph("p_ops_3", "Rapid-response coverage against emerging conversation", 9, 14, "notStarted",
          ["Escalation protocol: pre-drafted holding statements, a named decision-maker on both sides"]),
      ],
    },
    {
      id: "ws_report", name: "Reporting and Handoff",
      summary: "Two required reports, one playbook handoff. Attribution stated honestly: reach and engagement with confidence, activations directionally.",
      mocha: mocha(P.andre, P.joseph, [P.sam], [P.ipshita], P.ndOwner),
      phases: [
        ph("p_rep_1", "Biweekly performance summaries", 5, 14, "notStarted",
          ["Runs from Command Center launch to the end of Phase 3"]),
        ph("p_rep_2", "Mid-campaign performance report", 9, 11, "notStarted",
          ["SOW §9: delivered in October 2026 — the day is not set", "Media Fund reconciled here"],
          "The SOW gives the month, not the day. The bar shows the second half of October as a working window."),
        ph("p_rep_3", "Command Center playbook handoff", 13, 14, "notStarted",
          ["Phase 3 deliverable, due by Nov 16"]),
        ph("p_rep_4", "End-of-campaign retrospective", 14, 18, "notStarted",
          ["Due within 15 days of term end: by Dec 15", "Final Media Fund reconciliation; unspent committed funds credited or refunded"]),
      ],
    },
  ],
  keyDates: [
    { id: "kd_1", date: "2026-08-15", label: "SOW effective · term begins", owner: "JT", status: "complete", deliverable: true, note: "Term runs Aug 15 – Nov 30, 2026." },
    { id: "kd_2", date: "2026-08-30", label: "Phase 1 begins · $15K Phase 1 fee invoiced", owner: "NW", status: "complete", deliverable: true, note: "Research and Stand-Up. Survey respondent sourcing ($2–3K) invoiced with this fee." },
    { id: "kd_3", date: "2026-09-17", label: "Meta ads test results delivered to NewWorld", owner: "NDWA", status: "onTrack", deliverable: true, note: "Tests are running; results due back Sep 17 (the SOW dated this Sep 1). Phase 2 creative and the message bank depend on this." },
    { id: "kd_4", date: "2026-09-14", label: "Phase 2 begins · Command Center launch · $35K invoiced", owner: "NW", status: "notStarted", deliverable: true, note: "" },
    { id: "kd_5", date: "2026-09-30", label: "Phase 1 deliverables due", owner: "NW", status: "notStarted", deliverable: true, note: "Research summary, survey findings, creator longlist, draft message bank, Phase 2 workplan." },
    { id: "kd_6", date: "2026-10-12", label: "Phase 3 begins · Scale and Optimize · $35K invoiced", owner: "NW", status: "notStarted", deliverable: true, note: "" },
    { id: "kd_7", date: "2026-11-16", label: "Phase 3 ends · final $35K invoiced", owner: "NW", status: "notStarted", deliverable: true, note: "Learnings transfer and playbook handoff due." },
    { id: "kd_8", date: "2026-11-30", label: "Term ends", owner: "JT", status: "notStarted", deliverable: false, note: "" },
    { id: "kd_9", date: "2026-12-15", label: "End-of-campaign retrospective due", owner: "NW", status: "notStarted", deliverable: true, note: "Within 15 days of term end." },
    // Not scheduled — the SOW names these but gives no date.
    { id: "kd_10", date: "", label: "MSA and SOW signed", owner: "JT", status: "notStarted", deliverable: false, note: "MSA date is blank in the SOW." },
    { id: "kd_11", date: "", label: "$95K committed Media Fund invoiced and received", owner: "NDWA", status: "notStarted", deliverable: false, note: "Invoiced on execution, due on receipt. Creator contracting starts when funds arrive." },
    { id: "kd_12", date: "", label: "Creator roster approved", owner: "NDWA", status: "notStarted", deliverable: false, note: "Required before contracting." },
    { id: "kd_13", date: "", label: "Ask Aya product access, brand assets and tracking links", owner: "NDWA", status: "notStarted", deliverable: false, note: "UTM conventions included." },
    { id: "kd_15", date: "", label: "Decision: release of the $105K reserve", owner: "NDWA", status: "notStarted", deliverable: false, note: "Decision pending. Written authorization, in whole or part. Can fund creators, amplification, or an OOH/radio addendum." },
  ],
  sessions: [
    { id: "s_1", label: "Phase 2 launch readiness", week: 5, status: "notStarted", feedbackDue: "", note: "Roster, message bank and cadence ready to go live." },
    { id: "s_2", label: "Phase 1 findings review", week: 7, status: "notStarted", feedbackDue: "", note: "Research summary and survey findings walked through with NDWA." },
    { id: "s_3", label: "Phase 3 kickoff and mid-campaign review", week: 9, status: "notStarted", feedbackDue: "", note: "" },
  ],
  constraints: [
    { id: "c_1", label: "Thanksgiving week", startWeek: 15, endWeek: 15 },
  ],
  log: [],
};

/* ── hydrate() — forward-migrate every stored document ───────────────────── */
/** Backfills MOCHA onto records saved before this feature existed. */
function hydrate(state) {
  const d = clone(state);
  // Never let a missing field take the whole page down.
  d.project = { ...SEED.project, ...(d.project || {}) };
  d.weeklyNote = { headline: "", body: "", author: "", date: "", ...(d.weeklyNote || {}) };
  ["workstreams", "sessions", "log"].forEach((k) => { if (!Array.isArray(d[k])) d[k] = []; });
  if (!Array.isArray(d.constraints)) d.constraints = [];
  if (!Array.isArray(d.todos)) d.todos = [];
  // Old records stored `milestones`; key dates supersede them.
  if (!Array.isArray(d.keyDates)) {
    d.keyDates = (d.milestones || []).map((m) => ({
      id: m.id, week: m.week, date: m.date || "", label: m.label,
      owner: "JT", status: m.status || "notStarted", deliverable: true, note: m.note || "",
    }));
  }
  delete d.milestones;
  d.keyDates.forEach((k) => {
    // The date is the fact; the week is where it sits on the chart.
    const w = weekOfDate(k.date);
    if (w !== null) k.week = w;
    else if (typeof k.week === "number" && !k.date) k.week = k.week; // legacy week-only record
    else k.week = null;
    if (typeof k.date !== "string") k.date = "";
    if (!OWNERS[k.owner]) k.owner = "JT";
    if (!STATUS[k.status]) k.status = "notStarted";
    if (typeof k.deliverable !== "boolean") k.deliverable = true;
    if (typeof k.note !== "string") k.note = "";
  });
  d.sessions.forEach((x) => {
    if (typeof x.feedbackDue !== "string") x.feedbackDue = "";
    if (typeof x.note !== "string") x.note = "";
    if (!STATUS[x.status]) x.status = "notStarted";
  });
  d.todos.forEach((t) => { if (typeof t.done !== "boolean") t.done = false; });
  d.workstreams.forEach((w) => {
    if (!Array.isArray(w.phases)) w.phases = [];
    if (typeof w.summary !== "string") w.summary = "";
    w.phases.forEach((p) => {
      if (!Array.isArray(p.bullets)) p.bullets = [];
      if (typeof p.notes !== "string") p.notes = "";
      if (typeof p.progress !== "number") p.progress = 0;
      if (!STATUS[p.status]) p.status = "notStarted";
      if (p.baseline && (typeof p.baseline.startWeek !== "number" || typeof p.baseline.endWeek !== "number")) p.baseline = null;
      if (!p.baseline) p.baseline = null;
    });
  });
  d.workstreams.forEach((ws) => {
    if (!ws.mocha) {
      ws.mocha = emptyMocha();
      if (ws.owner) ws.mocha.owner = person(ws.owner, "NW");
    }
    ROLES.forEach((r) => {
      if (r.multi && !Array.isArray(ws.mocha[r.k])) ws.mocha[r.k] = [];
      if (!r.multi && !ws.mocha[r.k]) ws.mocha[r.k] = { name: "", org: "NW" };
    });
    if (typeof ws.mocha.confirmed !== "boolean") ws.mocha.confirmed = false;
    delete ws.owner;
  });
  return d;
}

/* ── packLanes() — stop overlapping bars printing on each other ─────────── */
/**
 * Assigns each phase to a horizontal lane so overlapping date ranges stack
 * vertically instead of printing on top of each other. Greedy first-fit:
 * a phase reuses the topmost lane whose last bar has already finished.
 */
function packLanes(phases) {
  const sorted = [...phases].sort(
    (a, b) => a.startWeek - b.startWeek || a.endWeek - b.endWeek
  );
  const laneEnds = [];
  const lanes = {};
  sorted.forEach((p) => {
    let lane = laneEnds.findIndex((end) => p.startWeek > end);
    if (lane === -1) { laneEnds.push(p.endWeek); lane = laneEnds.length - 1; }
    else laneEnds[lane] = p.endWeek;
    lanes[p.id] = lane;
  });
  return lanes;
}

/* ── diffState() — writes the client-facing changelog automatically ───────── */
const short = (s = "") => (s.length > 48 ? s.slice(0, 46).trimEnd() + "…" : s);
function indexPhases(state) {
  const out = {};
  (state.workstreams || []).forEach((w) => (w.phases || []).forEach((p) => { out[p.id] = { ...p, wsName: w.name }; }));
  return out;
}
const wk = (i) => (typeof i === "number" && WEEKS[i]) || "not scheduled";

/** Human-readable diff, used to auto-write the update log. */
function diffState(prev, next) {
  const out = [];
  if (!prev) return ["Workplan published."];
  const a = indexPhases(prev), b = indexPhases(next);

  Object.keys(b).forEach((id) => {
    const n = b[id], o = a[id];
    const tag = `${n.wsName}`;
    if (!o) { out.push(`${tag}: added “${short(n.label)}”`); return; }
    if (o.status !== n.status) out.push(`${tag}: “${short(n.label)}” moved to ${STATUS[n.status].label.toLowerCase()}`);
    if (o.startWeek !== n.startWeek || o.endWeek !== n.endWeek)
      out.push(`${tag}: “${short(n.label)}” rescheduled to ${WEEKS[n.startWeek]}–${WEEKS[n.endWeek]}`);
    if (Math.abs((o.progress || 0) - (n.progress || 0)) >= 5)
      out.push(`${tag}: “${short(n.label)}” now ${n.progress}% complete`);
  });
  Object.keys(a).forEach((id) => { if (!b[id]) out.push(`${a[id].wsName}: removed “${short(a[id].label)}”`); });

  const am = Object.fromEntries((prev.keyDates || []).map((m) => [m.id, m]));
  (next.keyDates || []).forEach((m) => {
    const o = am[m.id];
    if (!o) { out.push(`Key date added: ${short(m.label)} — ${showDate(m.date) || "not scheduled"}`); return; }
    if (o.date !== m.date) out.push(`“${short(m.label)}” moved from ${showDate(o.date) || "not scheduled"} to ${showDate(m.date) || "not scheduled"}`);
    if (o.status !== m.status) out.push(`“${short(m.label)}” is ${STATUS[m.status].label.toLowerCase()}`);
    if (o.owner !== m.owner) out.push(`“${short(m.label)}” now sits with ${OWNERS[m.owner].label}`);
  });
  (prev.keyDates || []).forEach((m) => {
    if (!(next.keyDates || []).find((x) => x.id === m.id)) out.push(`Key date removed: ${short(m.label)}`);
  });

  const at = Object.fromEntries((prev.todos || []).map((x) => [x.id, x]));
  (next.todos || []).forEach((x) => {
    const o = at[x.id];
    if (!o) { out.push(`To-do added: ${short(x.label)}`); return; }
    if (!o.done && x.done) out.push(`Done: ${short(x.label)}`);
  });

  const as = Object.fromEntries(prev.sessions.map((s) => [s.id, s]));
  next.sessions.forEach((s) => {
    const o = as[s.id];
    if (!o) { out.push(`Session added: ${short(s.label)}`); return; }
    if (o.week !== s.week) out.push(`“${short(s.label)}” moved to week of ${wk(s.week)}`);
    if (o.status !== s.status && s.status === "complete") out.push(`“${short(s.label)}” held`);
    if ((o.feedbackDue || "") !== (s.feedbackDue || ""))
      out.push(`Feedback deadline for “${short(s.label)}” set to ${s.feedbackDue || "none"}`);
  });

  const ac = Object.fromEntries((prev.constraints || []).map((c) => [c.id, c]));
  (next.constraints || []).forEach((c) => {
    const o = ac[c.id];
    if (!o) { out.push(`Constraint added: ${short(c.label)} (week of ${wk(c.startWeek)})`); return; }
    if (o.startWeek !== c.startWeek || o.endWeek !== c.endWeek)
      out.push(`Constraint “${short(c.label)}” moved to ${wk(c.startWeek)}–${wk(c.endWeek)}`);
  });
  (prev.constraints || []).forEach((c) => {
    if (!(next.constraints || []).find((x) => x.id === c.id)) out.push(`Constraint removed: ${short(c.label)}`);
  });

  const aw = Object.fromEntries(prev.workstreams.map((w) => [w.id, w]));
  next.workstreams.forEach((w) => {
    const o = aw[w.id];
    if (!o || !o.mocha || !w.mocha) return;
    ROLES.forEach((r) => {
      if (JSON.stringify(o.mocha[r.k]) !== JSON.stringify(w.mocha[r.k])) {
        const v = r.multi ? (w.mocha[r.k] || []).map((x) => x.name).join(", ") : (w.mocha[r.k].name || "unassigned");
        out.push(`${w.name} — ${r.name}: ${v || "unassigned"}`);
      }
    });
    if (!o.mocha.confirmed && w.mocha.confirmed) out.push(`${w.name}: MOCHA confirmed`);
  });

  if (JSON.stringify(prev.weeklyNote) !== JSON.stringify(next.weeklyNote)) out.push("Weekly update posted.");
  if (prev.workstreams.length !== next.workstreams.length) out.push("Workstreams changed.");
  return out;
}

/* ── computeStats() — including the Waiting-on-client counter ────────────── */
function mochaGaps(w) {
  if (!w.mocha) return ROLES.length;
  return ROLES.filter((r) => (r.multi ? (w.mocha[r.k] || []).length === 0 : !(w.mocha[r.k] && w.mocha[r.k].name))).length;
}
function computeStats(state) {
  const phases = state.workstreams.flatMap((w) => w.phases);
  const weight = phases.reduce((a, p) => a + (p.endWeek - p.startWeek + 1), 0) || 1;
  const done = phases.reduce((a, p) => a + (p.endWeek - p.startWeek + 1) * ((p.progress || 0) / 100), 0);
  const overall = Math.round((done / weight) * 100);
  const risk = phases.filter((p) => p.status === "atRisk" || p.status === "delayed").length
    + (state.keyDates || []).filter((k) => k.status === "atRisk" || k.status === "delayed").length;
  const week = currentWeekIndex() + 1;
  const daysToEnd = Math.max(0, Math.ceil((TERM_END - new Date()) / 86400000));
  const nextSession = state.sessions.filter((s) => s.week >= currentWeekIndex() && s.status !== "complete")[0];
  const nextMs = (state.keyDates || [])
    .filter((m) => typeof m.week === "number" && m.week >= currentWeekIndex() && m.status !== "complete")
    .sort((a, b) => a.week - b.week)[0];
  const awaitingClient = (state.keyDates || []).filter((m) => m.owner === CLIENT && m.status !== "complete").length;
  const todosOpen = (state.todos || []).filter((x) => !x.done).length;
  const unscheduled = (state.keyDates || []).filter((m) => m.week === null && m.status !== "complete").length;
  const mochaSet = state.workstreams.filter((w) => w.mocha && w.mocha.confirmed).length;
  const mochaOpen = state.workstreams.reduce((a, w) => a + mochaGaps(w), 0);
  return { overall, risk, week, total: WEEKS.length, daysToEnd, nextSession, nextMs,
           mochaSet, mochaOpen, awaitingClient, todosOpen, unscheduled };
}

const stripMeta = (s) => { const { updatedAt, log, ...rest } = s || {}; return rest; };

/* ═══════════════════════════════════════════════════════════════════════════
   Styles — NewWorld house system. No yellow anywhere.
   ═══════════════════════════════════════════════════════════════════════════ */
function Styles() {
  return (
    <style>{`
:root{
  --creme:#FAFBEF; --grey:#D3D3CD; --black:#000000; --brown:#20201E;
  --green:#1FB356; --blue:#06213D; --ink:#0A0A08;
  --ink75:rgba(10,10,8,.78); --ink55:rgba(10,10,8,.55); --ink45:rgba(10,10,8,.45);
  --hair:rgba(10,10,8,.25); --hairDark:rgba(250,251,239,.28); --edge:rgba(10,10,8,.9);
  --serif:'Fraunces',Georgia,serif; --sans:'Inter',system-ui,sans-serif; --mono:'IBM Plex Mono',ui-monospace,Menlo,monospace;
  --pad:clamp(24px,4.5vw,72px); --gap:clamp(14px,2vw,28px);
  --rCard:22px; --rChip:14px;
  --h1:clamp(30px,4.6vw,64px); --h2:clamp(24px,3vw,46px); --h3:clamp(20px,2.1vw,32px);
  --lede:clamp(13px,1.25vw,17px); --body:clamp(12px,1.05vw,14.5px); --eye:clamp(10px,1.05vw,13px);
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{background:var(--creme);color:var(--ink);font-family:var(--sans);font-size:var(--body);line-height:1.58;
  font-feature-settings:"ss01","cv11";}
.serif{font-family:var(--serif);font-weight:500;font-variation-settings:"opsz" auto;letter-spacing:-.01em}
.mono{font-family:var(--mono);text-transform:uppercase;letter-spacing:.12em;font-size:11px;font-weight:500}
.amp{font-family:var(--sans);font-weight:500}
.nb{white-space:nowrap}
button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}
button:disabled{cursor:not-allowed;opacity:.45}
input,textarea,select{font:inherit;color:var(--ink);background:var(--creme);border:1px solid var(--hair);border-radius:8px;padding:8px 10px;width:100%;font-size:13px}
input:focus,textarea:focus,select:focus{outline:2px solid var(--green);outline-offset:1px;border-color:transparent}
textarea{resize:vertical;min-height:72px;line-height:1.5}
a{color:inherit}
:focus-visible{outline:2px solid var(--green);outline-offset:3px}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}

/* ── chrome ── */
.hdr{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px;padding:18px var(--pad);
  border-bottom:1px solid var(--hair);position:sticky;top:0;z-index:30;background:rgba(250,251,239,.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.logo{display:flex;align-items:center;gap:9px;font-family:var(--sans);font-weight:600;font-size:13px;letter-spacing:-.01em;text-decoration:none}
.logo .ring{width:13px;height:13px;border-radius:999px;border:3.5px solid var(--ink);flex:0 0 13px}
.logo .x{color:var(--ink45);font-weight:400;margin:0 2px}
.tabs{display:flex;gap:22px;justify-content:center}
.tabs .mono{color:var(--ink);opacity:.35;text-decoration:none}
.tabs .mono.on{opacity:1}
.edition{text-align:right}
.edition .mono{color:var(--ink55)}

/* ── layout ── */
.wrap{padding:0 var(--pad)}
.sec{padding:clamp(34px,4.5vw,72px) var(--pad)}
.sec.grey{background:var(--grey)}
.sec.dark{background:var(--black);color:var(--creme)}
.eyebrow{display:flex;align-items:center;gap:9px;color:var(--green);font-family:var(--mono);text-transform:uppercase;letter-spacing:.14em;font-size:var(--eye);font-weight:500}
.eyebrow .dot{width:9px;height:9px;border-radius:999px;border:2px solid var(--green);flex:0 0 9px}
h1{font-family:var(--serif);font-weight:500;font-size:var(--h1);line-height:1.02;letter-spacing:-.02em;margin:14px 0 18px;max-width:22ch;font-variation-settings:"opsz" 144}
h2{font-family:var(--serif);font-weight:500;font-size:var(--h2);line-height:1.08;letter-spacing:-.015em;margin:12px 0 10px;max-width:30ch;font-variation-settings:"opsz" 72}
h3{font-family:var(--serif);font-weight:500;font-size:var(--h3);line-height:1.15;letter-spacing:-.01em;margin:0}
.lede{font-size:var(--lede);line-height:1.6;max-width:62ch;color:var(--ink75);margin:0}
p{margin:0}
.body{color:var(--ink75);max-width:70ch}
.cap{color:var(--ink55);font-size:12px}
.grid{display:grid;gap:var(--gap)}
.g2{grid-template-columns:1fr 1fr}
.g3{grid-template-columns:repeat(3,1fr)}
.g4{grid-template-columns:repeat(4,1fr)}
@media (max-width:820px){.g2,.g3,.g4{grid-template-columns:1fr 1fr}}
@media (max-width:560px){.g2,.g3,.g4{grid-template-columns:1fr}}

/* ── hero ── */
.hero{padding:clamp(40px,6vw,92px) var(--pad) clamp(30px,4vw,56px);border-bottom:1px solid var(--hair)}
.hero .meta{display:flex;gap:18px;flex-wrap:wrap;margin-top:20px}
.hero .meta .mono{color:var(--ink55)}

/* ── stat block ── */
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--gap)}
@media (max-width:820px){.stats{grid-template-columns:1fr 1fr}}
.stat{border-top:1px solid var(--edge);padding-top:14px}
.stat .n{font-family:var(--serif);font-weight:500;font-size:clamp(26px,3vw,48px);line-height:1;letter-spacing:-.02em;font-variation-settings:"opsz" 96}
.stat .n.g{color:var(--green)} .stat .n.b{color:var(--blue)}
.stat .d{margin-top:8px;color:var(--ink75);font-size:var(--body);max-width:24ch}
.dark .stat{border-top-color:var(--hairDark)} .dark .stat .d{color:rgba(250,251,239,.75)}

/* ── card ── */
.card{background:var(--creme);border:1px solid var(--edge);border-radius:var(--rCard);padding:clamp(16px,1.9vw,28px)}
.card .k{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}
.card .k .eyebrow{font-size:11px}

/* ── callout ── */
.callout{border-left:3px solid var(--green);padding-left:18px;max-width:70ch}
.callout.b{border-left-color:var(--blue)}
.callout .h{font-family:var(--serif);font-weight:500;font-size:clamp(17px,1.5vw,22px);line-height:1.3;letter-spacing:-.01em;margin-bottom:8px}
.callout .by{margin-top:10px}

/* ── numbered rows ── */
.rows{display:flex;flex-direction:column}
.row{display:grid;grid-template-columns:auto 1fr;gap:14px;padding:14px 0;border-bottom:1px solid var(--hair);align-items:start}
.row:last-child{border-bottom:0}
.row .num{font-family:var(--mono);color:var(--green);font-size:11px;letter-spacing:.1em;padding-top:5px;min-width:22px}
.row .num.b{color:var(--blue)} .row .num.k{color:var(--ink45)}
.row .t{font-family:var(--serif);font-weight:500;font-size:clamp(15px,1.3vw,19px);line-height:1.25;letter-spacing:-.01em}
.row .t.date{color:var(--ink);white-space:nowrap}
.row .desc{color:var(--ink75);font-size:var(--body);margin-top:3px}
.row .side{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px}
.row.done .t{color:var(--ink45);text-decoration:line-through;text-decoration-color:var(--hair)}
.row.click{cursor:pointer} .row.click:hover .t{text-decoration:underline;text-underline-offset:5px;text-decoration-color:var(--green)}
.row.sel{background:rgba(31,179,86,.06);margin:0 -10px;padding-left:10px;padding-right:10px;border-radius:10px}

/* ── chips / tags ── */
.tag{display:inline-flex;align-items:center;gap:6px;font-family:var(--mono);text-transform:uppercase;letter-spacing:.1em;font-size:9.5px;font-weight:500;
  padding:3px 8px;border-radius:var(--rChip);border:1px solid var(--hair);color:var(--ink55);white-space:nowrap}
.tag.g{color:var(--green);border-color:rgba(31,179,86,.5)} .tag.b{color:var(--blue);border-color:rgba(6,33,61,.45)}
.tag.fill{background:var(--green);border-color:var(--green);color:var(--creme)}
.tag.fillb{background:var(--blue);border-color:var(--blue);color:var(--creme)}
.tag .sq{width:7px;height:7px;border-radius:999px;background:currentColor}
.chip{display:inline-block;border:1px solid var(--edge);border-radius:var(--rChip);background:var(--creme);padding:5px 10px;font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em}
.chip.done{background:var(--green);border-color:var(--green);color:var(--creme)}

/* ── links & buttons ── */
.lnk{font-family:var(--mono);text-transform:uppercase;letter-spacing:.12em;font-size:11px;font-weight:500;text-decoration:underline;text-underline-offset:3px;color:var(--ink)}
.lnk:hover{color:var(--green)}
.btn{display:inline-flex;align-items:center;gap:8px;font-family:var(--mono);text-transform:uppercase;letter-spacing:.12em;font-size:11px;font-weight:500;
  padding:10px 16px;border-radius:999px;border:1px solid var(--edge);color:var(--ink);background:transparent;transition:background .15s,color .15s}
.btn:hover{background:var(--ink);color:var(--creme)}
.btn.g{background:var(--green);border-color:var(--green);color:var(--creme)} .btn.g:hover{background:#17964a}
.btn.ghost{border-color:var(--hairDark);color:var(--creme)} .btn.ghost:hover{background:var(--creme);color:var(--ink)}
.btn.sm{padding:7px 12px;font-size:10px}
.icb{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:999px;border:1px solid var(--hair);color:var(--ink55)}
.icb:hover{color:var(--ink);border-color:var(--edge)}

/* ── this week ── */
.tw{display:grid;grid-template-columns:1.4fr 1fr;gap:var(--gap)}
@media (max-width:820px){.tw{grid-template-columns:1fr}}
.todo{display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--hair)}
.todo:last-child{border-bottom:0}
.todo .bx{width:16px;height:16px;flex:0 0 16px;border-radius:5px;border:1px solid var(--edge);margin-top:2px;display:flex;align-items:center;justify-content:center;color:var(--creme)}
.todo.done .bx{background:var(--green);border-color:var(--green)}
.todo.done span{color:var(--ink45);text-decoration:line-through}

/* ── gantt ── */
.gantt{overflow-x:auto;padding-bottom:6px;-webkit-overflow-scrolling:touch}
.gin{min-width:980px}
.grow{display:grid;grid-template-columns:230px 1fr;gap:0;border-bottom:1px solid var(--hair)}
.grow.head{border-bottom:1px solid var(--edge)}
.glbl{padding:14px 14px 14px 0;border-right:1px solid var(--hair)}
.glbl .t{font-family:var(--serif);font-weight:500;font-size:clamp(15px,1.3vw,19px);line-height:1.2;letter-spacing:-.01em}
.glbl .s{margin-top:4px}
.gcell{position:relative}
.scale{display:grid;height:38px;align-items:end}
.scale .w{font-family:var(--mono);font-size:9.5px;letter-spacing:.08em;color:var(--ink55);text-transform:uppercase;padding:0 0 9px 6px;border-left:1px solid var(--hair);white-space:nowrap;overflow:hidden}
.scale .w.now{color:var(--green);font-weight:500}
.gridlines{position:absolute;inset:0;display:grid;pointer-events:none}
.gridlines i{border-left:1px solid rgba(10,10,8,.10)}
.gridlines i.month{border-left-color:rgba(10,10,8,.28)}
.today{position:absolute;top:0;bottom:0;width:2px;background:var(--green);z-index:5;pointer-events:none}
.today.lbl::after{content:"Today";position:absolute;top:2px;left:5px;font-family:var(--mono);font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--green)}
.shade{position:absolute;top:0;bottom:0;background:var(--grey);border-left:1px solid var(--hair);border-right:1px solid var(--hair);opacity:.7;pointer-events:none}
.shade span{position:absolute;bottom:4px;left:6px;font-family:var(--mono);font-size:8.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink55);white-space:nowrap}
.rail{position:relative;min-height:46px;display:grid;align-content:center;padding:8px 0}
.pt{position:absolute;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:3px;cursor:default}
.pt .mk{width:11px;height:11px;border-radius:999px;border:1.5px solid var(--edge);background:var(--creme)}
.pt.g .mk{background:var(--green);border-color:var(--green)}
.pt.b .mk{border-color:var(--blue);border-width:2px}
.pt.bf .mk{background:var(--blue);border-color:var(--blue)}
.pt .lb{font-family:var(--mono);font-size:8.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink55);white-space:nowrap;max-width:112px;overflow:hidden;text-overflow:ellipsis}
.pt.g .lb{color:var(--green)} .pt.b .lb,.pt.bf .lb{color:var(--blue)}
.pt.click{cursor:pointer} .pt.click:hover .lb{text-decoration:underline;text-underline-offset:3px}
.pt.sel .mk{outline:2px solid var(--green);outline-offset:2px}
.lanes{position:relative;padding:10px 0}
.bar{position:absolute;height:22px;border-radius:999px;border:1px solid transparent;display:flex;align-items:center;overflow:hidden;cursor:default;transition:transform .12s}
.bar.click{cursor:pointer} .bar.click:hover{transform:translateY(-1px)}
.bar.sel{outline:2px solid var(--green);outline-offset:2px}
.bar .fill{position:absolute;left:0;top:0;bottom:0;border-radius:999px}
.bar .lab{position:relative;z-index:1;font-family:var(--mono);font-size:9px;letter-spacing:.06em;text-transform:uppercase;padding:0 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500}
.bar.notStarted{border-color:var(--hair);background:transparent} .bar.notStarted .lab{color:var(--ink45)}
.bar.onTrack{background:rgba(31,179,86,.18);border-color:rgba(31,179,86,.45)} .bar.onTrack .fill{background:var(--green)} .bar.onTrack .lab{color:var(--ink);mix-blend-mode:normal}
.bar.complete{background:var(--green);border-color:var(--green)} .bar.complete .lab{color:var(--creme)}
.bar.atRisk{background:var(--creme);border-color:var(--blue);border-width:1.5px} .bar.atRisk .fill{background:rgba(6,33,61,.14)} .bar.atRisk .lab{color:var(--blue)}
.bar.delayed{background:var(--blue);border-color:var(--blue)} .bar.delayed .fill{background:rgba(250,251,239,.18)} .bar.delayed .lab{color:var(--creme)}
.ghostbar{position:absolute;height:22px;border-radius:999px;border:1px dashed rgba(10,10,8,.45);pointer-events:none;z-index:2}
.legend{display:flex;gap:16px;flex-wrap:wrap;margin-top:14px}
.legend .it{display:flex;align-items:center;gap:7px;font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink55)}
.legend .sw{width:22px;height:10px;border-radius:999px;border:1px solid var(--hair)}

/* ── workstream detail ── */
.wsdet{display:grid;grid-template-columns:1fr 1fr;gap:var(--gap);padding:18px 0 26px;border-bottom:1px solid var(--hair)}
@media (max-width:820px){.wsdet{grid-template-columns:1fr}}
.phl{display:flex;flex-direction:column;gap:12px}
.phi{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start}
.phi .st{width:10px;height:10px;border-radius:999px;margin-top:6px;border:1.5px solid}
.phi .st.notStarted{border-color:var(--hair);background:transparent}
.phi .st.onTrack,.phi .st.complete{border-color:var(--green);background:var(--green)}
.phi .st.atRisk{border-color:var(--blue);background:transparent}
.phi .st.delayed{border-color:var(--blue);background:var(--blue)}
.phi .nm{font-weight:500}
.phi .when{font-family:var(--mono);font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink55);margin-top:2px}
.phi ul{margin:5px 0 0;padding-left:16px;color:var(--ink75)}
.phi li{margin:2px 0}
.phi .note{margin-top:6px;border-left:3px solid var(--blue);padding-left:10px;color:var(--ink75);font-size:12.5px}
.mocha{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
@media (max-width:560px){.mocha{grid-template-columns:repeat(3,1fr)}}
.mocha .r{border:1px solid var(--hair);border-radius:var(--rChip);padding:9px 10px;min-height:74px}
.mocha .r .l{font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:var(--blue);font-weight:500}
.mocha .r .p{font-family:var(--serif);font-weight:500;font-size:13.5px;line-height:1.25;margin-top:5px;letter-spacing:-.01em}
.mocha .r .p.empty{color:var(--ink45)}
.mocha .r .o{font-family:var(--mono);font-size:8.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink55);margin-top:4px}
.mochakey{display:grid;grid-template-columns:repeat(5,1fr);gap:var(--gap)}
@media (max-width:820px){.mochakey{grid-template-columns:1fr 1fr}}
.mochakey .ltr{font-family:var(--serif);font-weight:500;font-size:clamp(26px,3vw,44px);line-height:1;color:var(--green)}
.mochakey .nm{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;margin:10px 0 6px}
.mochakey .df{color:rgba(250,251,239,.75);font-size:12.5px;max-width:22ch}
.accd{border-bottom:1px solid var(--hair)}
.accd .hd{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;padding:16px 0;cursor:pointer;width:100%;text-align:left}
.accd .hd .num{font-family:var(--mono);color:var(--green);font-size:11px;letter-spacing:.1em}
.accd .hd .t{font-family:var(--serif);font-weight:500;font-size:clamp(17px,1.6vw,24px);line-height:1.2;letter-spacing:-.01em}
.accd .hd .sub{color:var(--ink55);font-size:12px;margin-top:3px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.accd .hd .pm{color:var(--ink55)}
.accd .hd:hover .t{text-decoration:underline;text-underline-offset:6px;text-decoration-color:var(--green)}

/* ── big link block ── */
.biglink{border-top:1px solid var(--edge);padding-top:18px}
.biglink a{font-family:var(--serif);font-weight:500;font-size:var(--h3);line-height:1.15;letter-spacing:-.01em;text-decoration:underline;text-underline-offset:7px;text-decoration-thickness:1px}
.biglink a:hover{color:var(--green)}

/* ── log ── */
.logv .row .desc ul{margin:4px 0 0;padding-left:16px}

/* ── action bar (dark emphasis) ── */
.abar{position:sticky;bottom:0;z-index:40;background:rgba(10,10,8,.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:var(--creme);
  border-top:1px solid var(--hairDark);padding:14px var(--pad);display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
.abar .msg{font-size:12.5px;color:rgba(250,251,239,.78);max-width:62ch}
.abar .acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.abar.narrow{padding-right:calc(min(440px,100vw) + 18px)}
@media (max-width:820px){.abar.narrow{padding-right:var(--pad)}}
.abar .mono{color:rgba(250,251,239,.6)}
.flash{position:fixed;left:50%;bottom:86px;transform:translateX(-50%);z-index:60;background:var(--black);color:var(--creme);
  padding:12px 18px 12px 16px;border-left:3px solid var(--green);font-size:13px;max-width:min(560px,90vw);box-shadow:0 10px 30px rgba(0,0,0,.25)}
.flash.b{border-left-color:var(--blue)}
body.editing{padding-bottom:92px}

/* ── editor drawer ── */
.drawer{position:fixed;top:0;right:0;bottom:0;width:min(440px,100vw);background:var(--creme);border-left:1px solid var(--edge);z-index:50;overflow-y:auto;padding:22px 22px 110px;box-shadow:-16px 0 40px rgba(10,10,8,.10)}
.drawer .dh{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:18px}
.fld{margin-bottom:14px}
.fld label{display:block;font-family:var(--mono);font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink55);margin-bottom:5px}
.fld2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.seg{display:flex;flex-wrap:wrap;gap:6px}
.seg button{font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;padding:6px 10px;border-radius:999px;border:1px solid var(--hair);color:var(--ink55)}
.seg button.on{border-color:var(--edge);color:var(--ink);background:rgba(10,10,8,.05)}
.seg button.on.g{border-color:var(--green);color:var(--green)} .seg button.on.b{border-color:var(--blue);color:var(--blue)}
.lst{display:flex;flex-direction:column;gap:6px}
.lst .li{display:grid;grid-template-columns:1fr auto;gap:6px;align-items:center}
.lst .li.org{grid-template-columns:1fr 92px auto}
.danger{color:var(--blue)}

/* ── modal ── */
.ovl{position:fixed;inset:0;background:rgba(10,10,8,.45);z-index:70;display:flex;align-items:center;justify-content:center;padding:20px}
.mdl{background:var(--creme);border:1px solid var(--edge);border-radius:var(--rCard);padding:clamp(20px,2.4vw,32px);width:min(520px,100%);max-height:88vh;overflow-y:auto}
.mdl .k{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}

/* ── footer ── */
.foot{padding:26px var(--pad) 40px;border-top:1px solid var(--hair);display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap}
.foot .mono{color:var(--ink45);font-size:9.5px}

@media (max-width:820px){
  .hdr{grid-template-columns:1fr auto;padding:12px var(--pad)}
  .tabs{display:none}
  body{padding-bottom:92px}
  .drawer{padding-bottom:130px}
}
    `}</style>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Small building blocks
   ═══════════════════════════════════════════════════════════════════════════ */
const Eyebrow = ({ children }) => (<div className="eyebrow"><span className="dot" />{children}</div>);
const cls = (...a) => a.filter(Boolean).join(" ");
const toneOf = (status) => (status === "complete" || status === "onTrack" ? "g" : status === "notStarted" ? "" : "b");
const StatusTag = ({ status }) => {
  const t = toneOf(status);
  return <span className={cls("tag", t, status === "complete" && "fill", status === "delayed" && "fillb")}><span className="sq" />{STATUS[status]?.label || status}</span>;
};
const OwnerTag = ({ owner }) => {
  const o = OWNERS[owner] || OWNERS.JT;
  return <span className={cls("tag", owner === "NW" && "g", owner === CLIENT && "b")}>{o.label}</span>;
};
const pct = (w) => `${(w / WEEK_COUNT) * 100}%`;
const mid = (w) => `${((w + 0.5) / WEEK_COUNT) * 100}%`;
const span = (s, e) => ({ left: pct(s), width: `calc(${pct(e - s + 1)} - 4px)`, marginLeft: 2 });

/* ── header ── */
function Header({ project }) {
  return (
    <header className="hdr">
      <a className="logo" href="/"><span className="ring" />NewWorld<span className="x">×</span>{project.client}</a>
      <nav className="tabs">
        <a className="mono on" href="/">Workplan</a>
      </nav>
      <div className="edition"><span className="mono">{project.edition}</span></div>
    </header>
  );
}

/* ── hero ── */
function Hero({ project, stats }) {
  return (
    <section className="hero">
      <Eyebrow>{project.sow} · {project.term}</Eyebrow>
      <h1>{project.name}.</h1>
      <p className="lede">{project.lede}</p>
      <div className="meta">
        <span className="mono">Week {stats.week} of {stats.total}</span>
        {stats.nextMs && <span className="mono">Next key date · {showDate(stats.nextMs.date)} · {stats.nextMs.label}</span>}
      </div>
    </section>
  );
}

/* ── stat strip ── */
function StatStrip({ stats }) {
  return (
    <section className="sec" style={{ paddingTop: "clamp(26px,3.5vw,48px)", paddingBottom: "clamp(26px,3.5vw,48px)" }}>
      <div className="stats">
        <div className="stat"><div className="n g">{stats.overall}%</div><div className="d">Overall progress, weighted by phase length.</div></div>
        <div className="stat"><div className="n">{stats.daysToEnd}</div><div className="d">Days until the term ends on Nov 30.</div></div>
        <div className="stat"><div className="n b">{stats.awaitingClient}</div><div className="d">Waiting on {CLIENT}: inputs, approvals and decisions that are theirs.</div></div>
        <div className="stat"><div className="n b">{stats.risk}</div><div className="d">At risk or delayed, across phases and key dates.</div></div>
      </div>
    </section>
  );
}

/* ── this week ── */
function ThisWeek({ state, editing, update }) {
  const n = state.weeklyNote;
  const set = (k, v) => update((d) => { d.weeklyNote[k] = v; });
  return (
    <section className="sec grey">
      <Eyebrow>This week</Eyebrow>
      <div className="tw" style={{ marginTop: 18 }}>
        <div className="callout">
          {editing ? (
            <>
              <div className="fld"><label>Headline</label><input value={n.headline} onChange={(e) => set("headline", e.target.value)} /></div>
              <div className="fld"><label>Note</label><textarea value={n.body} onChange={(e) => set("body", e.target.value)} /></div>
              <div className="fld2">
                <div className="fld"><label>Your name</label><input value={n.author} onChange={(e) => set("author", e.target.value)} /></div>
                <div className="fld"><label>Date</label><input type="date" value={n.date} onChange={(e) => set("date", e.target.value)} /></div>
              </div>
            </>
          ) : (
            <>
              <div className="h">{n.headline || "No update posted yet."}</div>
              <p className="body">{n.body}</p>
              {(n.author || n.date) && <div className="by mono" style={{ color: "var(--ink55)" }}>{n.author}{n.author && n.date ? " · " : ""}{showDate(n.date)}</div>}
            </>
          )}
        </div>
        <div className="card">
          <div className="k"><Eyebrow>To do</Eyebrow>
            {editing && <button className="icb" title="Add to-do" onClick={() => update((d) => { d.todos.push({ id: uid("td"), label: "New to-do", done: false }); })}><Plus size={14} /></button>}
          </div>
          {state.todos.length === 0 && <p className="cap">Nothing open.</p>}
          {state.todos.map((t) => (
            <div key={t.id} className={cls("todo", t.done && "done")}>
              <button className="bx" disabled={!editing} aria-label={t.done ? "Mark open" : "Mark done"}
                onClick={() => update((d) => { const x = d.todos.find((y) => y.id === t.id); x.done = !x.done; })}>
                {t.done && <Check size={11} />}
              </button>
              {editing ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, flex: 1 }}>
                  <input value={t.label} onChange={(e) => update((d) => { d.todos.find((y) => y.id === t.id).label = e.target.value; })} />
                  <button className="icb" aria-label="Remove" onClick={() => update((d) => { d.todos = d.todos.filter((y) => y.id !== t.id); })}><Trash2 size={13} /></button>
                </div>
              ) : <span>{t.label}</span>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── key dates: one list, rendered as a dated list and a Not-scheduled tray ── */
function KeyDates({ state, editing, sel, setSel, update }) {
  const dated = state.keyDates.filter((k) => typeof k.week === "number").sort((a, b) => (a.date < b.date ? -1 : 1));
  const tray = state.keyDates.filter((k) => k.week === null);
  const Row = ({ k, i }) => {
    const isSel = sel?.type === "keyDate" && sel.id === k.id;
    return (
      <div className={cls("row", k.status === "complete" && "done", editing && "click", isSel && "sel")}
        onClick={() => editing && setSel({ type: "keyDate", id: k.id })}>
        <div className={cls("num", k.owner === CLIENT && "b", k.owner === "JT" && "k")}>{typeof i === "number" ? String(i + 1).padStart(2, "0") : "—"}</div>
        <div>
          <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
            {k.date && <span className="t date">{showDate(k.date)}</span>}
            <span className="t" style={{ fontFamily: "var(--sans)", fontWeight: 500, fontSize: "var(--body)" }}>{k.label}</span>
          </div>
          {k.note && <div className="desc">{k.note}</div>}
          <div className="side"><OwnerTag owner={k.owner} /><StatusTag status={k.status} /></div>
        </div>
      </div>
    );
  };
  return (
    <section className="sec">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div>
          <Eyebrow>Key dates</Eyebrow>
          <h2>Every locked date, tagged with who it depends on.</h2>
          <p className="lede">The SOW is the source. Where it names a moment but gives no date, the item sits in the tray below rather than on the chart.</p>
        </div>
        {editing && <button className="btn sm" onClick={() => update((d) => { const id = uid("kd"); d.keyDates.push({ id, date: "", week: null, label: "New key date", owner: "JT", status: "notStarted", deliverable: true, note: "" }); setSel({ type: "keyDate", id }); })}><Plus size={13} />Add date</button>}
      </div>
      <div className="grid g2" style={{ marginTop: 26 }}>
        <div className="card">
          <div className="k"><Eyebrow>Dated</Eyebrow><span className="mono" style={{ color: "var(--ink45)" }}>{dated.length}</span></div>
          <div className="rows">{dated.map((k, i) => <Row key={k.id} k={k} i={i} />)}</div>
        </div>
        <div className="card">
          <div className="k"><Eyebrow>Not scheduled</Eyebrow><span className="mono" style={{ color: "var(--ink45)" }}>{tray.length}</span></div>
          {tray.length === 0 && <p className="cap">Everything has a date.</p>}
          <div className="rows">{tray.map((k) => <Row key={k.id} k={k} />)}</div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   The Gantt
   ═══════════════════════════════════════════════════════════════════════════ */
function GridLines() {
  return (
    <div className="gridlines" style={{ gridTemplateColumns: `repeat(${WEEK_COUNT},1fr)` }}>
      {WEEK_DATES.map((d, i) => <i key={i} className={i > 0 && d.getMonth() !== WEEK_DATES[i - 1].getMonth() ? "month" : ""} />)}
    </div>
  );
}
function TodayLine({ label = false }) {
  const frac = (new Date() - PROJECT_START) / (7 * 86400000);
  if (frac < 0 || frac > WEEK_COUNT) return null;
  return <div className={cls("today", label && "lbl")} style={{ left: `${(frac / WEEK_COUNT) * 100}%` }} />;
}
function Shades({ constraints, editing, sel, setSel, label = false }) {
  return constraints.map((c) => (
    <div key={c.id} className="shade" style={{ ...span(c.startWeek, c.endWeek), marginLeft: 0, width: pct(c.endWeek - c.startWeek + 1), cursor: editing ? "pointer" : "default", pointerEvents: editing ? "auto" : "none", outline: sel?.type === "constraint" && sel.id === c.id ? "2px solid var(--green)" : "none" }}
      onClick={() => editing && setSel({ type: "constraint", id: c.id })}>
      {label && <span>{c.label}</span>}
    </div>
  ));
}

/* ── Bar — grid placement, ghost baseline, progress fill ── */
function Bar({ p, lane = 0, editing, selected, onClick }) {
  const top = 4 + lane * 30;
  return (
    <>
      <div className={cls("bar", p.status, editing && "click", selected && "sel")}
        style={{ ...span(p.startWeek, p.endWeek), top }}
        title={`${p.label} · ${WEEKS[p.startWeek]}–${WEEKS[p.endWeek]} · ${p.progress}%`}
        onClick={editing ? onClick : undefined}>
        {p.status !== "notStarted" && p.status !== "complete" && <div className="fill" style={{ width: `${p.progress || 0}%` }} />}
        <span className="lab">{p.label}</span>
      </div>
      {p.baseline && (p.baseline.startWeek !== p.startWeek || p.baseline.endWeek !== p.endWeek) && (
        <div className="ghostbar" style={{ ...span(p.baseline.startWeek, p.baseline.endWeek), top }} title={`Originally ${WEEKS[p.baseline.startWeek]}–${WEEKS[p.baseline.endWeek]}`} />
      )}
    </>
  );
}

/* ── the Gantt: sessions rail → deliverables rail → constraints → week scale → rows ── */
function Gantt({ state, editing, sel, setSel, update }) {
  const now = currentWeekIndex();
  const deliverables = state.keyDates.filter((k) => k.deliverable && typeof k.week === "number" && k.week >= 0 && k.week < WEEK_COUNT);
  const pointTone = (s) => (s === "complete" ? "g" : s === "delayed" ? "bf" : s === "atRisk" ? "b" : "");
  // Sessions close together alternate rows so their labels don't print on each other.
  const sessionsStaggered = useMemo(() => {
    const sorted = state.sessions.filter((s) => typeof s.week === "number").sort((a, b) => a.week - b.week);
    let prev = null;
    return sorted.map((s) => { const level = prev && s.week - prev.week <= 2 && prev.level === 0 ? 1 : 0; prev = { week: s.week, level }; return { ...s, level }; });
  }, [state.sessions]);
  return (
    <section className="sec">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div>
          <Eyebrow>Timeline</Eyebrow>
          <h2>Nineteen weeks, three phases, one chart.</h2>
          <p className="lede">Sessions and deliverables sit above the scale. Grey bands are weeks with a constraint. A dashed outline behind a bar is where it was originally scheduled.</p>
        </div>
        {editing && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn sm" onClick={() => update((d) => { const id = uid("s"); d.sessions.push({ id, label: "New session", week: now, status: "notStarted", feedbackDue: "", note: "" }); setSel({ type: "session", id }); })}><Plus size={13} />Session</button>
            <button className="btn sm" onClick={() => update((d) => { const id = uid("c"); d.constraints.push({ id, label: "New constraint", startWeek: now, endWeek: now }); setSel({ type: "constraint", id }); })}><Plus size={13} />Constraint</button>
            <button className="btn sm" onClick={() => update((d) => { const id = uid("ws"); d.workstreams.push({ id, name: "New Workstream", summary: "", mocha: emptyMocha(), phases: [] }); setSel({ type: "workstream", id }); })}><Plus size={13} />Workstream</button>
          </div>
        )}
      </div>

      <div className="gantt" style={{ marginTop: 26 }}>
        <div className="gin">
          {/* sessions rail */}
          <div className="grow">
            <div className="glbl"><div className="t">Sessions</div><div className="s cap">Weekly production call · biweekly summary · monthly exec check-in</div></div>
            <div className="gcell rail" style={{ minHeight: 82 }}>
              <GridLines /><Shades constraints={state.constraints} editing={editing} sel={sel} setSel={setSel} label />
              {sessionsStaggered.filter((s) => typeof s.week === "number").map((s) => (
                <div key={s.id} className={cls("pt", pointTone(s.status), editing && "click", sel?.type === "session" && sel.id === s.id && "sel")}
                  style={{ left: mid(s.week), top: 8 + s.level * 34 }} title={`${s.label} · week of ${WEEKS[s.week]}${s.feedbackDue ? ` · feedback due ${showDate(s.feedbackDue)}` : ""}`}
                  onClick={() => editing && setSel({ type: "session", id: s.id })}>
                  <div className="mk" style={{ borderRadius: 3 }} /><div className="lb">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
          {/* deliverables rail */}
          <div className="grow">
            <div className="glbl"><div className="t">Key dates</div><div className="s cap">Blue label: depends on {CLIENT}</div></div>
            <div className="gcell rail" style={{ minHeight: 58 }}>
              <GridLines /><Shades constraints={state.constraints} editing={editing} sel={sel} setSel={setSel} />
              {deliverables.map((k) => (
                <div key={k.id} className={cls("pt", pointTone(k.status) || (k.owner === CLIENT ? "b" : ""), editing && "click", sel?.type === "keyDate" && sel.id === k.id && "sel")}
                  style={{ left: mid(k.week), top: 10 }} title={`${k.label} · ${showDate(k.date)} · ${OWNERS[k.owner].label}`}
                  onClick={() => editing && setSel({ type: "keyDate", id: k.id })}>
                  <div className="mk" /><div className="lb">{showDate(k.date)}</div>
                </div>
              ))}
            </div>
          </div>
          {/* week scale */}
          <div className="grow head">
            <div className="glbl" style={{ padding: "8px 14px 8px 0" }}><span className="mono" style={{ color: "var(--ink45)" }}>Week of</span></div>
            <div className="gcell">
              <TodayLine label />
              <div className="scale" style={{ gridTemplateColumns: `repeat(${WEEK_COUNT},1fr)` }}>
                {WEEKS.map((w, i) => <div key={i} className={cls("w", i === now && "now")}>{w}</div>)}
              </div>
            </div>
          </div>
          {/* workstream rows */}
          {state.workstreams.map((w) => {
            const lanes = packLanes(w.phases);
            const laneCount = Math.max(1, ...Object.values(lanes).map((l) => l + 1));
            return (
              <div key={w.id} className="grow">
                <div className="glbl">
                  <div className={cls("t", editing && "click")} style={{ cursor: editing ? "pointer" : "default" }} onClick={() => editing && setSel({ type: "workstream", id: w.id })}>{w.name}</div>
                  <div className="s cap">{w.mocha?.owner?.name ? `Owner: ${w.mocha.owner.name}` : "Owner unassigned"}{w.mocha?.confirmed ? "" : " · Draft"}</div>
                  {editing && <button className="lnk" style={{ marginTop: 8, fontSize: 9.5 }} onClick={() => update((d) => { const ws = d.workstreams.find((x) => x.id === w.id); const id = uid("p"); ws.phases.push(ph(id, "New phase", now, Math.min(WEEK_COUNT - 1, now + 2), "notStarted")); setSel({ type: "phase", id, wsId: w.id }); })}>+ Add phase</button>}
                </div>
                <div className="gcell lanes" style={{ height: 10 + laneCount * 30 + 8 }}>
                  <GridLines /><Shades constraints={state.constraints} editing={editing} sel={sel} setSel={setSel} /><TodayLine />
                  {w.phases.map((p) => (
                    <Bar key={p.id} p={p} lane={lanes[p.id]} editing={editing} selected={sel?.type === "phase" && sel.id === p.id}
                      onClick={() => setSel({ type: "phase", id: p.id, wsId: w.id })} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="legend">
        <div className="it"><span className="sw" style={{ background: "var(--green)", borderColor: "var(--green)" }} />On track / complete</div>
        <div className="it"><span className="sw" style={{ borderColor: "var(--blue)", borderWidth: 1.5 }} />At risk</div>
        <div className="it"><span className="sw" style={{ background: "var(--blue)", borderColor: "var(--blue)" }} />Delayed</div>
        <div className="it"><span className="sw" />Not started</div>
        <div className="it"><span className="sw" style={{ borderStyle: "dashed" }} />Original dates</div>
        <div className="it"><span className="sw" style={{ background: "var(--grey)" }} />Constraint week</div>
        <div className="it"><span className="sw" style={{ width: 2, background: "var(--green)", border: 0, height: 12 }} />Today</div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Workstreams in detail — what is and isn't happening, and who owns it
   ═══════════════════════════════════════════════════════════════════════════ */
function MochaCards({ m, editing, onEdit }) {
  return (
    <div>
      <div className="k" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <Eyebrow>MOCHA</Eyebrow>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className={cls("tag", m.confirmed ? "fill" : "b")}>{m.confirmed ? "Confirmed" : "Draft"}</span>
          {editing && <button className="lnk" style={{ fontSize: 9.5 }} onClick={onEdit}>Edit</button>}
        </div>
      </div>
      <div className="mocha">
        {ROLES.map((r) => {
          const v = m[r.k];
          const people = r.multi ? (v || []) : (v && v.name ? [v] : []);
          return (
            <div className="r" key={r.k}>
              <div className="l">{r.ltr}</div>
              {people.length === 0 ? <div className="p empty">Unassigned</div> : people.map((x, i) => (
                <div key={i}><div className="p">{x.name}</div><div className="o">{ORGS[x.org]?.label || x.org}</div></div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Workstreams({ state, editing, sel, setSel }) {
  const [open, setOpen] = useState(() => Object.fromEntries(state.workstreams.map((w) => [w.id, true])));
  return (
    <section className="sec grey">
      <Eyebrow>Workstreams</Eyebrow>
      <h2>What is happening under each workstream, and what is not yet.</h2>
      <p className="lede">Every phase is listed, including the ones that haven't started. A Draft MOCHA means the names are proposed, not confirmed.</p>
      <div style={{ marginTop: 22 }}>
        {state.workstreams.map((w, i) => {
          const isOpen = open[w.id] !== false;
          const gaps = mochaGaps(w);
          return (
            <div className="accd" key={w.id}>
              <button className="hd" onClick={() => setOpen((o) => ({ ...o, [w.id]: !isOpen }))} aria-expanded={isOpen}>
                <span className="num">{String(i + 1).padStart(2, "0")}</span>
                <span>
                  <div className="t">{w.name}</div>
                  <div className="sub">
                    <span>{w.phases.length} phase{w.phases.length === 1 ? "" : "s"}</span>
                    <span>{w.phases.filter((p) => p.status === "notStarted").length} not started</span>
                    {gaps > 0 && <span style={{ color: "var(--blue)" }}>{gaps} MOCHA role{gaps === 1 ? "" : "s"} unassigned</span>}
                  </div>
                </span>
                <span className="pm">{isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
              </button>
              {isOpen && (
                <div className="wsdet">
                  <div>
                    {w.summary && <p className="body" style={{ marginBottom: 16 }}>{w.summary}</p>}
                    <div className="phl">
                      {w.phases.map((p) => (
                        <div className={cls("phi", editing && "click")} key={p.id} style={{ cursor: editing ? "pointer" : "default" }} onClick={() => editing && setSel({ type: "phase", id: p.id, wsId: w.id })}>
                          <span className={cls("st", p.status)} />
                          <div>
                            <div className="nm">{p.label}</div>
                            <div className="when">Weeks of {WEEKS[p.startWeek]} – {WEEKS[p.endWeek]} · {STATUS[p.status].label}{p.status !== "notStarted" && p.status !== "complete" ? ` · ${p.progress}%` : ""}
                              {p.baseline && (p.baseline.startWeek !== p.startWeek || p.baseline.endWeek !== p.endWeek) ? ` · was ${WEEKS[p.baseline.startWeek]} – ${WEEKS[p.baseline.endWeek]}` : ""}</div>
                            {p.bullets.length > 0 && <ul>{p.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>}
                            {p.notes && <div className="note">{p.notes}</div>}
                          </div>
                        </div>
                      ))}
                      {w.phases.length === 0 && <p className="cap">No phases yet.</p>}
                    </div>
                  </div>
                  <MochaCards m={w.mocha} editing={editing} onEdit={() => setSel({ type: "mocha", id: w.id })} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MochaKey() {
  return (
    <section className="sec dark">
      <Eyebrow>How ownership works</Eyebrow>
      <h2 style={{ color: "var(--creme)" }}>One accountable owner per workstream, across both organizations.</h2>
      <div className="mochakey" style={{ marginTop: 26 }}>
        {ROLES.map((r) => (
          <div key={r.k}><div className="ltr">{r.ltr}</div><div className="nm">{r.name}</div><div className="df">{r.def}</div></div>
        ))}
      </div>
    </section>
  );
}

/* ── update history ── */
function LogView({ log }) {
  const [all, setAll] = useState(false);
  const shown = all ? log : log.slice(0, 5);
  return (
    <section className="sec logv">
      <Eyebrow>Updates</Eyebrow>
      <h2>What changed, and when.</h2>
      <p className="lede">Written automatically each time the team publishes.</p>
      <div className="card" style={{ marginTop: 22 }}>
        {log.length === 0 && <p className="cap">No updates published yet.</p>}
        <div className="rows">
          {shown.map((e) => {
            const d = new Date(e.ts);
            return (
              <div className="row" key={e.id}>
                <div className="num">{fmt(d)}</div>
                <div>
                  <div className="t" style={{ fontSize: "clamp(14px,1.2vw,17px)" }}>{e.author ? `${e.author} published an update.` : "Update published."}</div>
                  <div className="desc"><ul>{(e.items || []).map((it, i) => <li key={i}>{it}</li>)}</ul></div>
                </div>
              </div>
            );
          })}
        </div>
        {log.length > 5 && <button className="lnk" style={{ marginTop: 14 }} onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${log.length}`}</button>}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Editing — drawer, forms, modal, action bar
   ═══════════════════════════════════════════════════════════════════════════ */
function Modal({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="ovl" onClick={onClose}>
      <div className="mdl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="k"><h3>{title}</h3><button className="icb" onClick={onClose} aria-label="Close"><X size={15} /></button></div>
        {children}
      </div>
    </div>
  );
}

const Fld = ({ label, children }) => (<div className="fld"><label>{label}</label>{children}</div>);
const WeekSelect = ({ value, onChange }) => (
  <select value={value} onChange={(e) => onChange(Number(e.target.value))}>{WEEKS.map((w, i) => <option key={i} value={i}>{w}</option>)}</select>
);
const Seg = ({ value, options, onChange, tone }) => (
  <div className="seg">{options.map(([k, l]) => <button key={k} className={cls(value === k && "on", value === k && tone && tone(k))} onClick={() => onChange(k)}>{l}</button>)}</div>
);
const ListEdit = ({ items, onChange, placeholder = "Item" }) => (
  <div className="lst">
    {items.map((it, i) => (
      <div className="li" key={i}>
        <input value={it} placeholder={placeholder} onChange={(e) => { const n = [...items]; n[i] = e.target.value; onChange(n); }} />
        <button className="icb" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
      </div>
    ))}
    <button className="lnk" style={{ fontSize: 9.5, alignSelf: "flex-start" }} onClick={() => onChange([...items, ""])}>+ Add</button>
  </div>
);
const PersonEdit = ({ value, onChange }) => (
  <div className="li org" style={{ display: "grid", gridTemplateColumns: "1fr 92px", gap: 6 }}>
    <input value={value.name} placeholder="Name or role placeholder" onChange={(e) => onChange({ ...value, name: e.target.value })} />
    <select value={value.org} onChange={(e) => onChange({ ...value, org: e.target.value })}>{Object.entries(ORGS).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}</select>
  </div>
);

const statusTone = (k) => toneOf(k);
const STATUS_OPTS = STATUS_KEYS.map((k) => [k, STATUS[k].label]);
const OWNER_OPTS = Object.entries(OWNERS).map(([k, o]) => [k, o.label]);
const ownerTone = (k) => (k === "NW" ? "g" : k === CLIENT ? "b" : "");

function PhaseForm({ state, sel, update, close }) {
  const ws = state.workstreams.find((w) => w.id === sel.wsId);
  const p = ws?.phases.find((x) => x.id === sel.id);
  if (!p) return null;
  const set = (fn) => update((d) => { const w = d.workstreams.find((x) => x.id === sel.wsId); const q = w.phases.find((x) => x.id === sel.id); fn(q); });
  // Moving a bar keeps the original dates as a ghost, so slippage stays visible.
  const move = (k, v) => set((q) => { if (!q.baseline) q.baseline = { startWeek: q.startWeek, endWeek: q.endWeek }; q[k] = v; if (q.endWeek < q.startWeek) q.endWeek = q.startWeek; });
  return (
    <>
      <div className="cap" style={{ marginBottom: 12 }}>{ws.name}</div>
      <Fld label="Phase"><input value={p.label} onChange={(e) => set((q) => { q.label = e.target.value; })} /></Fld>
      <div className="fld2">
        <Fld label="Starts week of"><WeekSelect value={p.startWeek} onChange={(v) => move("startWeek", v)} /></Fld>
        <Fld label="Ends week of"><WeekSelect value={p.endWeek} onChange={(v) => move("endWeek", v)} /></Fld>
      </div>
      {p.baseline && (p.baseline.startWeek !== p.startWeek || p.baseline.endWeek !== p.endWeek) && (
        <div className="callout b" style={{ marginBottom: 14, fontSize: 12.5 }}>Originally {WEEKS[p.baseline.startWeek]} – {WEEKS[p.baseline.endWeek]}. The ghost bar records this. <button className="lnk" style={{ fontSize: 9.5, marginLeft: 6 }} onClick={() => set((q) => { q.baseline = null; })}>Clear</button></div>
      )}
      <Fld label="Status"><Seg value={p.status} options={STATUS_OPTS} tone={statusTone} onChange={(v) => set((q) => { q.status = v; if (v === "complete") q.progress = 100; })} /></Fld>
      <Fld label={`Progress · ${p.progress}%`}><input type="range" min={0} max={100} step={5} value={p.progress} onChange={(e) => set((q) => { q.progress = Number(e.target.value); })} /></Fld>
      <Fld label="What's in this phase"><ListEdit items={p.bullets} onChange={(v) => set((q) => { q.bullets = v; })} placeholder="Bullet" /></Fld>
      <Fld label="Note (shown to the client)"><textarea value={p.notes} onChange={(e) => set((q) => { q.notes = e.target.value; })} /></Fld>
      <button className="lnk danger" style={{ fontSize: 9.5 }} onClick={() => { update((d) => { const w = d.workstreams.find((x) => x.id === sel.wsId); w.phases = w.phases.filter((x) => x.id !== sel.id); }); close(); }}>Remove phase</button>
    </>
  );
}

function KeyDateForm({ state, sel, update, close }) {
  const k = state.keyDates.find((x) => x.id === sel.id);
  if (!k) return null;
  const set = (fn) => update((d) => { const q = d.keyDates.find((x) => x.id === sel.id); fn(q); q.week = weekOfDate(q.date); });
  return (
    <>
      <Fld label="Key date"><input value={k.label} onChange={(e) => set((q) => { q.label = e.target.value; })} /></Fld>
      <Fld label="Date (leave blank for Not scheduled)"><input type="date" value={k.date} onChange={(e) => set((q) => { q.date = e.target.value; })} /></Fld>
      <Fld label="Depends on"><Seg value={k.owner} options={OWNER_OPTS} tone={ownerTone} onChange={(v) => set((q) => { q.owner = v; })} /></Fld>
      <Fld label="Status"><Seg value={k.status} options={STATUS_OPTS} tone={statusTone} onChange={(v) => set((q) => { q.status = v; })} /></Fld>
      <Fld label="Chart"><label style={{ display: "flex", gap: 8, alignItems: "center", textTransform: "none", letterSpacing: 0, fontFamily: "var(--sans)", fontSize: 13, color: "var(--ink)" }}><input type="checkbox" style={{ width: "auto" }} checked={k.deliverable} onChange={(e) => set((q) => { q.deliverable = e.target.checked; })} />Show on the key-dates rail</label></Fld>
      <Fld label="Note (shown to the client)"><textarea value={k.note} onChange={(e) => set((q) => { q.note = e.target.value; })} /></Fld>
      <button className="lnk danger" style={{ fontSize: 9.5 }} onClick={() => { update((d) => { d.keyDates = d.keyDates.filter((x) => x.id !== sel.id); }); close(); }}>Remove key date</button>
    </>
  );
}

function PointForm({ state, sel, update, close }) {
  const s = state.sessions.find((x) => x.id === sel.id);
  if (!s) return null;
  const set = (fn) => update((d) => { fn(d.sessions.find((x) => x.id === sel.id)); });
  return (
    <>
      <Fld label="Session"><input value={s.label} onChange={(e) => set((q) => { q.label = e.target.value; })} /></Fld>
      <Fld label="Week of"><WeekSelect value={s.week} onChange={(v) => set((q) => { q.week = v; })} /></Fld>
      <Fld label="Status"><Seg value={s.status} options={STATUS_OPTS} tone={statusTone} onChange={(v) => set((q) => { q.status = v; })} /></Fld>
      <Fld label="Feedback due"><input type="date" value={s.feedbackDue} onChange={(e) => set((q) => { q.feedbackDue = e.target.value; })} /></Fld>
      <Fld label="Note"><textarea value={s.note} onChange={(e) => set((q) => { q.note = e.target.value; })} /></Fld>
      <button className="lnk danger" style={{ fontSize: 9.5 }} onClick={() => { update((d) => { d.sessions = d.sessions.filter((x) => x.id !== sel.id); }); close(); }}>Remove session</button>
    </>
  );
}

function ConstraintForm({ state, sel, update, close }) {
  const c = state.constraints.find((x) => x.id === sel.id);
  if (!c) return null;
  const set = (fn) => update((d) => { const q = d.constraints.find((x) => x.id === sel.id); fn(q); if (q.endWeek < q.startWeek) q.endWeek = q.startWeek; });
  return (
    <>
      <Fld label="Constraint"><input value={c.label} onChange={(e) => set((q) => { q.label = e.target.value; })} /></Fld>
      <div className="fld2">
        <Fld label="From week of"><WeekSelect value={c.startWeek} onChange={(v) => set((q) => { q.startWeek = v; })} /></Fld>
        <Fld label="To week of"><WeekSelect value={c.endWeek} onChange={(v) => set((q) => { q.endWeek = v; })} /></Fld>
      </div>
      <button className="lnk danger" style={{ fontSize: 9.5 }} onClick={() => { update((d) => { d.constraints = d.constraints.filter((x) => x.id !== sel.id); }); close(); }}>Remove constraint</button>
    </>
  );
}

function MochaForm({ state, sel, update }) {
  const w = state.workstreams.find((x) => x.id === sel.id);
  if (!w) return null;
  const m = w.mocha;
  const set = (fn) => update((d) => { fn(d.workstreams.find((x) => x.id === sel.id).mocha); });
  return (
    <>
      <div className="cap" style={{ marginBottom: 12 }}>{w.name}</div>
      {ROLES.map((r) => (
        <Fld key={r.k} label={`${r.ltr} · ${r.name}`}>
          {r.multi ? (
            <div className="lst">
              {(m[r.k] || []).map((x, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6 }}>
                  <PersonEdit value={x} onChange={(v) => set((q) => { q[r.k][i] = v; })} />
                  <button className="icb" aria-label="Remove" onClick={() => set((q) => { q[r.k] = q[r.k].filter((_, j) => j !== i); })}><Trash2 size={13} /></button>
                </div>
              ))}
              <button className="lnk" style={{ fontSize: 9.5, alignSelf: "flex-start" }} onClick={() => set((q) => { q[r.k].push({ name: "", org: "NW" }); })}>+ Add</button>
            </div>
          ) : <PersonEdit value={m[r.k]} onChange={(v) => set((q) => { q[r.k] = v; })} />}
        </Fld>
      ))}
      <Fld label="Confirmed with the client">
        <Seg value={m.confirmed ? "y" : "n"} options={[["n", "Draft"], ["y", "Confirmed"]]} tone={(k) => (k === "y" ? "g" : "b")} onChange={(v) => set((q) => { q.confirmed = v === "y"; })} />
      </Fld>
    </>
  );
}

function WorkstreamForm({ state, sel, update, close }) {
  const w = state.workstreams.find((x) => x.id === sel.id);
  if (!w) return null;
  const set = (fn) => update((d) => { fn(d.workstreams.find((x) => x.id === sel.id)); });
  return (
    <>
      <Fld label="Workstream"><input value={w.name} onChange={(e) => set((q) => { q.name = e.target.value; })} /></Fld>
      <Fld label="Summary (shown to the client)"><textarea value={w.summary} onChange={(e) => set((q) => { q.summary = e.target.value; })} /></Fld>
      <button className="lnk danger" style={{ fontSize: 9.5 }} onClick={() => { if (!window.confirm(`Remove “${w.name}” and its ${w.phases.length} phases?`)) return; update((d) => { d.workstreams = d.workstreams.filter((x) => x.id !== sel.id); }); close(); }}>Remove workstream</button>
    </>
  );
}

const TITLES = { phase: "Phase", keyDate: "Key date", session: "Session", constraint: "Constraint", mocha: "MOCHA", workstream: "Workstream" };
function Editor({ state, sel, setSel, update }) {
  const close = () => setSel(null);
  const props = { state, sel, update, close };
  return (
    <aside className="drawer">
      <div className="dh"><Eyebrow>{TITLES[sel.type]}</Eyebrow><button className="icb" onClick={close} aria-label="Close"><X size={15} /></button></div>
      {sel.type === "phase" && <PhaseForm {...props} />}
      {sel.type === "keyDate" && <KeyDateForm {...props} />}
      {sel.type === "session" && <PointForm {...props} />}
      {sel.type === "constraint" && <ConstraintForm {...props} />}
      {sel.type === "mocha" && <MochaForm {...props} />}
      {sel.type === "workstream" && <WorkstreamForm {...props} />}
    </aside>
  );
}

function ActionBar({ editing, drawerOpen, dirty, firstPublish, publishing, unreachable, loadedOk, onPublish, onDiscard, onLock, onVersions, onBackup, author, setAuthor }) {
  if (!editing) return null;
  return (
    <div className={cls("abar", drawerOpen && "narrow")}>
      <div className="msg">
        {!loadedOk ? "This page couldn't load the saved version. Publishing is disabled so nothing gets overwritten — reload to try again."
          : firstPublish ? "Nothing has been published yet. The plan as shown will become the client's view."
          : dirty ? "You have unpublished edits. The client link still shows the last published version."
          : "Everything shown is published."}
        {unreachable && loadedOk ? " The server was unreachable on the last attempt." : ""}
      </div>
      <div className="acts">
        <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your name" style={{ width: 130, background: "transparent", color: "var(--creme)", borderColor: "var(--hairDark)", borderRadius: 999, padding: "8px 12px" }} />
        <button className="btn ghost sm" onClick={onBackup}><Download size={13} />Backup</button>
        <button className="btn ghost sm" onClick={onVersions}><History size={13} />Versions</button>
        {dirty && !firstPublish && <button className="btn ghost sm" onClick={onDiscard}>Discard</button>}
        <button className="btn g sm" disabled={!loadedOk || publishing || !(dirty || firstPublish)} onClick={onPublish}>{publishing ? "Publishing…" : "Publish"}</button>
        <button className="btn ghost sm" onClick={onLock}><Lock size={13} />Lock</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   App — load, edit locally, publish
   ═══════════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [state, setState] = useState(() => hydrate(SEED));
  const [published, setPublished] = useState(null);   // last version read from or written to the server
  const [etag, setEtag] = useState(null);
  const [loadedOk, setLoadedOk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sel, setSel] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [unpublished, setUnpublished] = useState(false);
  const [lastError, setLastError] = useState("");
  const [author, setAuthor] = useState("");
  const [modal, setModal] = useState(null);     // "unlock" | "versions" | null
  const [code, setCodeInput] = useState("");
  const [codeMsg, setCodeMsg] = useState("");
  const [versions, setVersions] = useState(null);
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState("");
  const flashTimer = useRef(null);

  const flash = (text, tone = "") => {
    setMsg(text); setMsgTone(tone);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setMsg(""), 6500);
  };

  // Initial read. A failed read shows the seed but disables publishing.
  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await loadShared("timeline");
      if (!alive) return;
      if (!res) { setUnreachable(true); setLoadedOk(false); setLoading(false); return; }
      if (res.data) {
        const h = hydrate(res.data);
        setState(h); setPublished(h); setEtag(res.etag);
      } else {
        setPublished(null); setEtag(null);
      }
      setLoadedOk(true); setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("editing", editing);
  }, [editing]);

  const update = (fn) => { setState((s) => { const d = clone(s); fn(d); return d; }); setUnpublished(true); };

  const stats = useMemo(() => computeStats(state), [state]);

  // With nothing saved yet there's no baseline to differ from, so the plan as
  // shown is itself publishable. Gating on `published !== null` here is what
  // hid the publish button on a fresh site and made the first publish impossible.
  const firstPublish = loadedOk && published === null;
  const dirty = useMemo(
    () => loadedOk && (published === null ||
      JSON.stringify(stripMeta(state)) !== JSON.stringify(stripMeta(published))),
    [state, published, loadedOk]
  );

  const publish = async () => {
    // Never let a failed read turn into a destructive write.
    if (!loadedOk) {
      flash("Can’t publish: this page never loaded the saved version, so publishing would overwrite it. Reload first.", "b");
      return;
    }
    setPublishing(true);
    const items = diffState(published, state);
    const next = {
      ...state,
      log: [{ id: uid("lg"), ts: new Date().toISOString(), author, items: items.length ? items : ["Minor edits."] }, ...state.log].slice(0, 60),
    };

    const res = await saveShared(next, etag);
    setPublishing(false);

    if (res.ok) {
      const saved = { ...next, updatedAt: res.updatedAt };
      setState(saved); setPublished(saved); setEtag(res.etag);
      setUnpublished(false); setUnreachable(false);
      flash("Published. The client link now shows these updates.");
      return;
    }
    if (res.conflict) {
      setPublished(res.data ? hydrate(res.data) : null); setEtag(res.etag);
      flash("Someone else published while you were editing. Nothing was overwritten — check the change list, then publish again.", "b");
      return;
    }
    if (res.unauthorized) {
      clearCode(); setEditing(false); setSel(null);
      flash("The team code was rejected. Unlock again to keep editing.", "b");
      return;
    }
    // A 4xx rejection means the server answered and said no — quite different
    // from being offline, and it must not disable publishing.
    const rejected = res.error === "bad_shape" || res.error === "too_large" || res.error === "bad_json";
    if (!rejected) setUnreachable(true);
    setLastError(res.message || res.error || "unknown");
    flash(res.message
      ? `Save failed — ${res.message}`
      : "Couldn’t reach the server. Your edits are still here — try publishing again.", "b");
  };

  const unlock = async () => {
    setCodeMsg("");
    const r = await verifyCode(code.trim());
    if (r.ok) { setEditing(true); setModal(null); setCodeInput(""); flash("Unlocked. Edits stay on this page until you publish."); }
    else setCodeMsg(r.message || "That code wasn't recognised.");
  };
  const lock = () => { setEditing(false); setSel(null); };
  const discard = () => { if (published) { setState(published); setUnpublished(false); setSel(null); flash("Edits discarded."); } };
  const backup = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `askaya-workplan-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const openVersions = async () => {
    setModal("versions"); setVersions(null);
    const r = await listVersions("timeline");
    setVersions(r.error ? { error: r.error } : r.versions || []);
  };
  const restore = async (key) => {
    const r = await getVersion(key, "timeline");
    if (r.error || !r.data) { flash("Couldn't load that version.", "b"); return; }
    setState(hydrate(r.data)); setUnpublished(true); setModal(null);
    flash(`Loaded the version from ${r.label}. Publish to make it live, or Discard to go back.`);
  };

  // Resume an editing session if the tab still has a code.
  useEffect(() => { if (getCode()) setEditing(true); }, []);

  const showLede = !loading;
  return (
    <>
      <Styles />
      <Header project={state.project} />
      {unreachable && !loadedOk && (
        <div className="wrap" style={{ paddingTop: 18 }}>
          <div className="callout b" style={{ fontSize: 13 }}>This page couldn't reach the saved workplan, so it is showing the starting plan. Reload to try again. If it persists, open <a className="lnk" href="/api/diagnose">/api/diagnose</a>.</div>
        </div>
      )}
      <Hero project={state.project} stats={stats} />
      <StatStrip stats={stats} />
      <ThisWeek state={state} editing={editing} update={update} />
      <Gantt state={state} editing={editing} sel={sel} setSel={setSel} update={update} />
      <KeyDates state={state} editing={editing} sel={sel} setSel={setSel} update={update} />
      <Workstreams state={state} editing={editing} sel={sel} setSel={setSel} />
      <MochaKey />
      <LogView log={state.log} />
      <footer className="foot">
        <span className="mono">NewWorld × {state.project.clientFull} · {state.project.sow}</span>
        <span className="mono">{state.updatedAt ? `Published ${new Date(state.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Not yet published"}</span>
        {!editing && <button className="lnk" style={{ fontSize: 9.5 }} onClick={() => setModal("unlock")}><Unlock size={10} style={{ verticalAlign: "-1px", marginRight: 6 }} />Team editing</button>}
      </footer>

      <ActionBar editing={editing} drawerOpen={Boolean(sel)} dirty={dirty} firstPublish={firstPublish} publishing={publishing} unreachable={unreachable} loadedOk={loadedOk}
        onPublish={publish} onDiscard={discard} onLock={lock} onVersions={openVersions} onBackup={backup} author={author} setAuthor={setAuthor} />

      {editing && sel && <Editor state={state} sel={sel} setSel={setSel} update={update} />}

      {modal === "unlock" && (
        <Modal title="Team editing" onClose={() => setModal(null)}>
          <p className="body" style={{ marginBottom: 14 }}>Enter the team code to edit. Clients only need the link.</p>
          <Fld label="Team code"><input type="password" value={code} onChange={(e) => setCodeInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && unlock()} autoFocus /></Fld>
          {codeMsg && <div className="callout b" style={{ fontSize: 12.5, marginBottom: 12 }}>{codeMsg}</div>}
          <button className="btn g" onClick={unlock}>Unlock</button>
        </Modal>
      )}
      {modal === "versions" && (
        <Modal title="Published versions" onClose={() => setModal(null)}>
          {versions === null && <p className="cap">Loading…</p>}
          {versions?.error && <div className="callout b" style={{ fontSize: 12.5 }}>Couldn't list versions ({versions.error}).</div>}
          {Array.isArray(versions) && versions.length === 0 && <p className="cap">No versions yet — the first publish creates one.</p>}
          {Array.isArray(versions) && versions.length > 0 && (
            <div className="rows">
              {versions.map((v) => (
                <div className="row" key={v.key}>
                  <div className="num">·</div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <span className="t" style={{ fontSize: 15 }}>{v.label}</span>
                    <button className="lnk" style={{ fontSize: 9.5 }} onClick={() => restore(v.key)}>Load</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="cap" style={{ marginTop: 14 }}>Loading a version brings it onto this page. Nothing changes for the client until you publish.</p>
        </Modal>
      )}
      {msg && <div className={cls("flash", msgTone)} role="status">{msg}</div>}
    </>
  );
}
