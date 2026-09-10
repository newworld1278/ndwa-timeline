import { getStore } from "@netlify/blobs";

/*
  GET /api/diagnose

  Read-only health check. Open it in a browser and it says, in plain English,
  which part of the chain is broken. It never writes, and it never reveals the
  team code — only whether one is configured.
*/

const STORE = "askaya-store";
const KEY = "askaya-workplan";

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export default async (req) => {
  const checks = [];
  const add = (name, ok, detail, fix) => checks.push({ name, ok, detail, fix });

  // 1. Is the team code configured?
  const hasCode = Boolean(process.env.TEAM_CODE);
  add(
    "Team code is set",
    hasCode,
    hasCode ? "TEAM_CODE is present." : "TEAM_CODE is missing.",
    "Netlify → Project configuration → Environment variables → add TEAM_CODE, then redeploy."
  );

  // 2. Has Netlify wired the Blobs environment into this function?
  const blobsEnv = Boolean(
    process.env.NETLIFY_BLOBS_CONTEXT || (process.env.SITE_ID && process.env.NETLIFY_API_TOKEN)
  );
  add(
    "Netlify Blobs is connected",
    blobsEnv,
    blobsEnv
      ? "Blobs credentials were injected into this function."
      : "No Blobs credentials found in this function's environment.",
    "This is the usual cause of saves failing. Trigger a fresh deploy (Deploys → Trigger deploy → Clear cache and deploy site). If it persists, Blobs may need enabling on the project."
  );

  // 3. Can a store handle actually be created?
  let store = null;
  try {
    store = getStore({ name: STORE, consistency: "strong" });
    add("Storage handle opens", true, `Store "${STORE}" opened.`, "");
  } catch (err) {
    add(
      "Storage handle opens",
      false,
      `${err.name || "Error"}: ${err.message}`,
      "If this says MissingBlobsEnvironment, the function isn't receiving Blobs credentials — redeploy with cleared cache."
    );
  }

  // 4. Can it read, and is anything saved?
  let record = null;
  if (store) {
    try {
      record = await store.getWithMetadata(KEY, { type: "json" });
      add(
        "Storage is readable",
        true,
        record ? "Read succeeded." : "Read succeeded, but nothing is stored yet.",
        ""
      );
      add(
        "A saved workplan exists",
        Boolean(record),
        record
          ? `Saved ${record.data?.updatedAt || "at an unknown time"} · ${
              JSON.stringify(record.data).length
            } bytes · ${record.data?.workstreams?.length ?? "?"} workstreams`
          : `Key "${KEY}" is empty — no publish has ever succeeded.`,
        record ? "" : "Unlock team editing on the site and publish once."
      );
    } catch (err) {
      add(
        "Storage is readable",
        false,
        `${err.name || "Error"}: ${err.message}`,
        "The store exists but can't be read. Check Netlify → Logs → Functions."
      );
    }
  }

  // 5. Are version snapshots accumulating?
  if (store) {
    try {
      const listed = await store.list({ prefix: "history/" });
      const n = (listed?.blobs || []).length;
      add(
        "Version history is building",
        n > 0,
        n > 0
          ? `${n} published version${n === 1 ? "" : "s"} retained (most recent 40 are kept).`
          : "No snapshots yet — the next publish will create the first.",
        n > 0 ? "" : "Publish once and re-run this check."
      );
    } catch (err) {
      add("Version history is building", false, `${err.name || "Error"}: ${err.message}`,
        "Snapshots are best-effort and never block a publish, but this is worth reporting.");
    }
  }

  const allOk = checks.every((c) => c.ok);

  if (new URL(req.url).searchParams.get("format") === "json") {
    return new Response(JSON.stringify({ ok: allOk, checks }, null, 2), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const rows = checks
    .map(
      (c) => `
      <div class="row ${c.ok ? "ok" : "bad"}">
        <div class="mark">${c.ok ? "✓" : "✕"}</div>
        <div>
          <div class="name">${esc(c.name)}</div>
          <div class="detail">${esc(c.detail)}</div>
          ${!c.ok && c.fix ? `<div class="fix">${esc(c.fix)}</div>` : ""}
        </div>
      </div>`
    )
    .join("");

  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ask Aya workplan — diagnostics</title>
<style>
 body{background:#FAFBEF;color:#0A0A08;font:14px/1.55 Inter,'Helvetica Neue',Helvetica,Arial,sans-serif;
   margin:0;padding:30px 20px;max-width:660px;}
 h1{font:500 34px/1 Fraunces,Georgia,serif;letter-spacing:-.02em;margin:6px 0 4px;}
 .eyebrow{font:10px/1 'IBM Plex Mono',ui-monospace,Menlo,monospace;text-transform:uppercase;letter-spacing:.14em;color:#1FB356;}
 .verdict{margin:18px 0 22px;padding:13px 15px 13px 18px;border-left:3px solid;font-size:13px;}
 .verdict.ok{border-color:#1FB356;}
 .verdict.bad{border-color:#06213D;color:#06213D;}
 .row{display:flex;gap:12px;padding:14px 0;border-bottom:1px solid rgba(10,10,8,.25);}
 .mark{width:20px;height:20px;flex:0 0 20px;display:flex;align-items:center;justify-content:center;
   font-size:12px;color:#FAFBEF;background:#1FB356;border-radius:999px;}
 .row.bad .mark{background:#06213D;}
 .name{font-weight:600;font-size:13px;}
 .detail{color:rgba(10,10,8,.7);font-size:12.5px;margin-top:3px;word-break:break-word;}
 .fix{margin-top:7px;padding:8px 10px 8px 14px;border-left:3px solid #06213D;font-size:12px;color:#06213D;}
 footer{margin-top:22px;font-size:11px;color:rgba(10,10,8,.5);}
</style>
<div class="eyebrow">NewWorld × NDWA</div>
<h1>Diagnostics</h1>
<div class="verdict ${allOk ? "ok" : "bad"}">${
      allOk
        ? "Everything checks out. Saving should work — if it doesn't, send the Netlify function logs."
        : "Something below is failing. The first ✕ is the one to fix."
    }</div>
${rows}
<footer>Read-only check. Nothing was written. Add ?format=json for the raw output.</footer>`,
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
  );
};

export const config = { path: "/api/diagnose" };
