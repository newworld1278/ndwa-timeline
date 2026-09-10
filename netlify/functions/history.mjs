import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual } from "node:crypto";

/*
  GET /api/history                → { versions: [...] }   list of snapshots
  GET /api/history?key=history/…  → { data }              one past version

  Requires the team code, because an old version can contain text that was
  deliberately removed from the live page. Clients never see this.
  Pass it as the x-team-code header, or ?code= when opening in a browser.
*/

const STORE = "askaya-store";
const PREFIXES = { timeline: "history/" };
let HISTORY_PREFIX = "history/";

const store = () => getStore({ name: STORE, consistency: "strong" });

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const sha = (v) => createHash("sha256").update(String(v ?? ""), "utf8").digest();
function codeMatches(supplied) {
  const expected = process.env.TEAM_CODE || "";
  if (!expected) return false;
  return timingSafeEqual(sha(supplied), sha(expected));
}

/** history/2026-08-25T15-04-02-123Z → readable stamp */
function describe(key) {
  const raw = key.slice(HISTORY_PREFIX.length);
  const iso = raw.replace(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
    "$1-$2-$3T$4:$5:$6.$7Z"
  );
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? { key, iso: raw, label: raw } : {
    key,
    iso: d.toISOString(),
    label:
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " · " +
      d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
}

export default async (req) => {
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  if (!process.env.TEAM_CODE) return json({ error: "not_configured" }, 500);

  const url = new URL(req.url);
  const supplied = req.headers.get("x-team-code") || url.searchParams.get("code") || "";
  if (!codeMatches(supplied)) return json({ error: "unauthorized" }, 401);

  const doc = url.searchParams.get("doc") || "timeline";
  HISTORY_PREFIX = PREFIXES[doc] || PREFIXES.timeline;
  const wanted = url.searchParams.get("key");

  try {
    if (wanted) {
      if (!wanted.startsWith(HISTORY_PREFIX)) return json({ error: "bad_key" }, 400);
      const entry = await store().getWithMetadata(wanted, { type: "json" });
      if (!entry) return json({ error: "not_found" }, 404);
      return json({ ...describe(wanted), data: entry.data });
    }

    const listed = await store().list({ prefix: HISTORY_PREFIX });
    const versions = (listed?.blobs || [])
      .map((b) => describe(b.key))
      .sort((a, b) => (a.iso < b.iso ? 1 : -1));
    return json({ versions });
  } catch (err) {
    console.error("history failed", err);
    return json({ error: "history_failed", name: err.name, message: err.message }, 502);
  }
};

export const config = { path: "/api/history" };
