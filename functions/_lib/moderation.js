// Helper moderasi Roblox (dipakai roblox-upload.js dan roblox-asset-status.js).
//
// Operation Roblox bernilai done=true begitu asset SELESAI DIBUAT, padahal
// moderasinya bisa masih "Reviewing". Jadi assetId yang sudah ada belum berarti
// audio itu lolos / bisa dipakai publik. Status sebenarnya ada di
// moderationResult.moderationState pada asset (butuh readMask=moderationResult).

export function classifyModeration(state) {
  const s = String(state || "").toLowerCase();
  if (s.includes("reject")) return "rejected";
  if (s.includes("approv")) return "approved";
  if (s.includes("review")) return "reviewing";
  return "unknown";
}

// Kembalikan "approved" | "rejected" | "reviewing".
export async function resolveModeration(assetId, apiKey, opState) {
  let state = classifyModeration(opState);
  if (state === "approved" || state === "rejected") return state;
  try {
    const res = await fetch(
      `https://apis.roblox.com/assets/v1/assets/${encodeURIComponent(assetId)}?readMask=moderationResult`,
      { headers: { "x-api-key": apiKey } }
    );
    if (!res.ok) return "reviewing"; // tidak bisa memastikan -> anggap belum lolos, dicek lagi nanti
    const data = await res.json().catch(() => ({}));
    const st = classifyModeration(data && data.moderationResult && data.moderationResult.moderationState);
    if (st !== "unknown") return st;
    return state === "reviewing" ? "reviewing" : "approved"; // Roblox tidak memberi status apa pun
  } catch {
    return "reviewing";
  }
}
