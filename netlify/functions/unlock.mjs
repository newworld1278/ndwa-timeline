import { createHash, timingSafeEqual } from "node:crypto";

/*
  POST /api/unlock  { code }  → { ok: true } | 401

  This only exists so the unlock button can say "wrong code" straight away.
  It is not the security boundary — every write to /api/timeline re-checks the
  code independently, so a forged response here gains nothing.
*/

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

export default async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!process.env.TEAM_CODE) {
    return json({ error: "not_configured", message: "TEAM_CODE is not set on this site." }, 500);
  }

  let code = "";
  try { ({ code } = await req.json()); } catch { /* fall through to 401 */ }

  // Small fixed delay to make guessing at scale unattractive.
  await new Promise((r) => setTimeout(r, 300));

  return codeMatches(code) ? json({ ok: true }) : json({ error: "unauthorized" }, 401);
};

export const config = { path: "/api/unlock" };
