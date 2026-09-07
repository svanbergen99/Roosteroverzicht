const KCD_CHAT_URL = String(process.env.KCD_CHAT_URL || "").trim().replace(/\/+$/, "");
const KCD_ROSTER_EVENT_KEY = String(process.env.KCD_ROSTER_EVENT_KEY || "").trim();

export async function notifyKcdRoosterStatus(file, status) {
  const fileName = String(file || "").trim();
  const state = String(status || "").trim().toLowerCase();

  if (!KCD_CHAT_URL || !KCD_ROSTER_EVENT_KEY) {
    return { ok: false, skipped: true, reason: "KCD monitor niet geconfigureerd" };
  }
  if (!fileName || !["received", "sent"].includes(state)) {
    return { ok: false, skipped: true, reason: "Ongeldige KCD monitor-status" };
  }

  try {
    const response = await fetch(`${KCD_CHAT_URL}/api/internal/rooster-status`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-kcd-roster-key": KCD_ROSTER_EVENT_KEY,
      },
      body: JSON.stringify({ file: fileName, status: state }),
      signal: AbortSignal.timeout(5000),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      console.warn("KCD roster monitor gaf HTTP", response.status, data?.message || "");
      return { ok: false, status: response.status };
    }
    return { ok: true };
  } catch (error) {
    console.warn("KCD roster monitor niet bereikbaar:", error?.message || String(error));
    return { ok: false, reason: error?.message || String(error) };
  }
}
