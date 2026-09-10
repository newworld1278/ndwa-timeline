import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual } from "node:crypto";

/*
  GET  /api/timeline  → { data, etag }        public, this is what clients read
  POST /api/timeline  → { ok, etag, updatedAt } requires x-team-code header

  Strong consistency so a publish is visible to every viewer the moment it returns,
  rather than propagating over the next 60 seconds.
*/

const STORE = "askaya-store";
const KEY = "askaya-workplan";
const HISTORY_PREFIX = "history/";
const KEEP_VERSIONS = 40;
const MAX_BYTES = 2_000_000;

const store = () => getStore({ name: STORE, consistency: "strong" });

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/**
 * Constant-time compare. Hashing first gives both sides a fixed 32-byte length,
 * so there's no truncation on long codes and no length leak on short ones.
 */
const sha = (v) => createHash("sha256").update(String(v ?? ""), "utf8").digest();
function codeMatches(supplied) {
  const expected = process.env.TEAM_CODE || "";
  if (!expected) return false;
  return timingSafeEqual(sha(supplied), sha(expected));
}

/**
 * Reject anything that isn't recognisably a timeline document, and say which
 * field failed. Accepts `keyDates` (current) or `milestones` (pre-rename), so
 * a schema change on the client can't lock saving again.
 */
function validate(s) {
  const problems = [];
  if (!s || typeof s !== "object") return ["payload is not an object"];
  if (!Array.isArray(s.workstreams)) problems.push("workstreams must be an array");
  if (!Array.isArray(s.sessions)) problems.push("sessions must be an array");
  if (!Array.isArray(s.keyDates) && !Array.isArray(s.milestones))
    problems.push("keyDates must be an array");
  if (!s.project || typeof s.project !== "object") problems.push("project must be an object");
  return problems;
}

export default async (req) => {
  if (req.method === "GET") {
    try {
      const entry = await store().getWithMetadata(KEY, { type: "json" });
      if (!entry) return json({ data: null, etag: null });
      return json({ data: entry.data, etag: entry.etag });
    } catch (err) {
      console.error("timeline read failed", err);
      return json({
        error: "read_failed",
        name: err.name || "Error",
        message: err.message || String(err),
      }, 502);
    }
  }

  if (req.method === "POST") {
    if (!process.env.TEAM_CODE) {
      return json({ error: "not_configured", message: "TEAM_CODE is not set on this site." }, 500);
    }
    if (!codeMatches(req.headers.get("x-team-code"))) {
      return json({ error: "unauthorized" }, 401);
    }

    const length = Number(req.headers.get("content-length") || 0);
    if (length > MAX_BYTES) return json({ error: "too_large" }, 413);

    let body;
    try { body = await req.json(); }
    catch { return json({ error: "bad_json" }, 400); }

    const { state, etag } = body || {};
    const problems = validate(state);
    if (problems.length) {
      console.error("rejected payload", problems);
      return json({
        error: "bad_shape",
        message: `The saved document is missing or malformed: ${problems.join("; ")}.`,
      }, 400);
    }

    // The server owns the timestamp, and no secret ever lives in the document.
    const updatedAt = new Date().toISOString();
    const doc = { ...state, updatedAt };
    delete doc.passcode;

    try {
      // Atomic conditional write where supported. Older releases of
      // @netlify/blobs ignore these options and resolve to undefined, so the
      // result is probed rather than trusted — reading `.modified` off a void
      // return is what broke this the first time.
      const opts = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
      const res = await store().setJSON(KEY, doc, opts);

      if (res && res.modified === false) {
        const current = await store().getWithMetadata(KEY, { type: "json" });
        return json(
          { error: "conflict", data: current?.data ?? null, etag: current?.etag ?? null },
          409
        );
      }

      // Snapshot every published version so nothing is ever unrecoverable.
      // Best-effort: a snapshot failure must never fail the publish itself.
      try {
        const stamp = updatedAt.replace(/[:.]/g, "-");
        await store().setJSON(`${HISTORY_PREFIX}${stamp}`, doc);
        const listed = await store().list({ prefix: HISTORY_PREFIX });
        const keys = (listed?.blobs || []).map((b) => b.key).sort();
        for (const old of keys.slice(0, Math.max(0, keys.length - KEEP_VERSIONS))) {
          await store().delete(old);
        }
      } catch (snapErr) {
        console.error("snapshot failed (publish still succeeded)", snapErr);
      }

      // Re-read for the authoritative etag: works whether or not setJSON returned one.
      const after = await store().getWithMetadata(KEY, { type: "json" });
      return json({
        ok: true,
        etag: (res && res.etag) || after?.etag || null,
        updatedAt,
        conditional: Boolean(res && typeof res.modified === "boolean"),
      });
    } catch (err) {
      console.error("timeline write failed", err);
      return json({
        error: "write_failed",
        name: err.name || "Error",
        message: err.message || String(err),
      }, 502);
    }
  }

  return json({ error: "method_not_allowed" }, 405);
};

export const config = { path: "/api/timeline" };
