/*
  The whole storage layer. Everything the dashboard needs to read or write
  lives behind these five functions, so swapping Blobs for Supabase later
  means editing this file and nothing else.

  The team code is held in sessionStorage: it clears when the tab closes,
  and it is never written into the timeline document itself.
*/

const CODE_KEY = "nw_team_code";

export const getCode = () => {
  try { return sessionStorage.getItem(CODE_KEY) || ""; } catch { return ""; }
};
export const setCode = (code) => {
  try { sessionStorage.setItem(CODE_KEY, code); } catch { /* private mode */ }
};
export const clearCode = () => {
  try { sessionStorage.removeItem(CODE_KEY); } catch { /* private mode */ }
};

/** Returns { data, etag } on success, or null if the server is unreachable. */
export async function loadShared(doc = "timeline") {
  try {
    const res = await fetch(`/api/${doc}`, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Publishes. Pass the etag you last read so a concurrent publish can't be
 * silently overwritten.
 * Returns { ok, etag, updatedAt } | { conflict, data, etag } | { unauthorized } | { error }
 */
export async function saveShared(state, etag, doc = "timeline") {
  try {
    const res = await fetch(`/api/${doc}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-team-code": getCode(),
      },
      body: JSON.stringify({ state, etag }),
    });

    if (res.status === 401) return { unauthorized: true };
    if (res.status === 409) {
      const body = await res.json();
      return { conflict: true, data: body.data, etag: body.etag };
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        error: body.error || `http_${res.status}`,
        message: body.message
          ? (body.name ? `${body.name}: ${body.message}` : body.message)
          : undefined,
      };
    }
    return await res.json();
  } catch {
    return { error: "network" };
  }
}

/** Checks a code without publishing anything. */
export async function verifyCode(code) {
  try {
    const res = await fetch("/api/unlock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (res.ok) { setCode(code); return { ok: true }; }
    if (res.status === 500) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, message: body.message || "This site isn't configured yet." };
    }
    return { ok: false };
  } catch {
    return { ok: false, message: "Couldn't reach the server. Check your connection." };
  }
}

/** Lists past published versions. Team code required. */
export async function listVersions(doc = "timeline") {
  try {
    const res = await fetch(`/api/history?doc=${doc}`, { headers: { "x-team-code": getCode() } });
    if (!res.ok) return { error: `http_${res.status}` };
    return await res.json();
  } catch { return { error: "network" }; }
}

/** Fetches one past version by its storage key. */
export async function getVersion(key, doc = "timeline") {
  try {
    const res = await fetch(`/api/history?doc=${doc}&key=${encodeURIComponent(key)}`, {
      headers: { "x-team-code": getCode() },
    });
    if (!res.ok) return { error: `http_${res.status}` };
    return await res.json();
  } catch { return { error: "network" }; }
}
