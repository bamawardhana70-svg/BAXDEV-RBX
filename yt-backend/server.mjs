// Backend YouTube -> MP3 milik sendiri (tanpa API pihak ketiga).
// Jalankan di VPS / server Docker: butuh yt-dlp + ffmpeg (sudah ada di Dockerfile).
//
//   POST /convert   header x-backend-secret: <YT_BACKEND_SECRET>   body {"url":"https://youtu.be/..."}
//   -> 200 audio/mpeg (judul di header X-Audio-Title, URL-encoded) atau JSON {ok:false,message}
//   GET  /health    -> {ok:true}
//
// Env: YT_BACKEND_SECRET (wajib), PORT (3000), MAX_SECONDS (420), MAX_JOBS (2), YTDLP_COOKIES (opsional, path cookies.txt)

import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT || 3000);
const SECRET = String(process.env.YT_BACKEND_SECRET || "");
const MAX_SECONDS = Number(process.env.MAX_SECONDS || 420);   // batas audio Roblox: 7 menit
const MAX_JOBS = Number(process.env.MAX_JOBS || 2);
const MAX_BYTES = 20 * 1024 * 1024;                            // batas file audio Roblox
const JOB_TIMEOUT_MS = 150000;
const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);

if (SECRET.length < 16) {
  console.error("YT_BACKEND_SECRET wajib diisi (minimal 16 karakter).");
  process.exit(1);
}

let running = 0;

function send(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(obj));
}

function secretOk(given) {
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseYoutube(value) {
  try {
    const u = new URL(String(value || "").trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!HOSTS.has(u.hostname.toLowerCase())) return null;
    return u.href;
  } catch { return null; }
}

function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > limit) { reject(new Error("too_large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function runYtDlp(url, dir) {
  return new Promise((resolve) => {
    const args = [
      "--ignore-config", "--no-playlist", "--no-warnings", "--no-progress",
      "-f", "bestaudio/best",
      "-x", "--audio-format", "mp3", "--audio-quality", "64K",
      "--match-filter", `duration<=${MAX_SECONDS}`,
      "--print", "title", "--no-simulate",
      "-o", join(dir, "audio.%(ext)s")
    ];
    if (process.env.YTDLP_COOKIES) args.push("--cookies", process.env.YTDLP_COOKIES);
    args.push("--", url);

    const p = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d; if (out.length > 20000) out = out.slice(-20000); });
    p.stderr.on("data", (d) => { err += d; if (err.length > 20000) err = err.slice(-20000); });
    const timer = setTimeout(() => p.kill("SIGKILL"), JOB_TIMEOUT_MS);
    p.on("error", () => { clearTimeout(timer); resolve({ code: -1, out, err: "yt-dlp tidak terpasang di server." }); });
    p.on("close", (code) => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}

function explain(r) {
  const t = (r.out + "\n" + r.err).toLowerCase();
  if (t.includes("does not pass filter")) return `Video lebih dari ${Math.round(MAX_SECONDS / 60)} menit (batas audio Roblox).`;
  if (t.includes("sign in to confirm") || t.includes("not a bot")) return "YouTube meminta verifikasi dari IP server. Pasang cookies (YTDLP_COOKIES) atau pindah server.";
  if (t.includes("private video") || t.includes("members-only")) return "Video privat atau khusus member.";
  if (t.includes("unavailable") || t.includes("not available")) return "Video tidak tersedia.";
  if (t.includes("age") && t.includes("restrict")) return "Video dibatasi umur.";
  if (t.includes("tidak terpasang")) return "yt-dlp tidak terpasang di server.";
  return "Gagal mengambil audio dari YouTube.";
}

async function convert(url, res) {
  const dir = await mkdtemp(join(tmpdir(), "yt-"));
  const cleanup = () => rm(dir, { recursive: true, force: true }).catch(() => {});
  try {
    const r = await runYtDlp(url, dir);
    const files = (await readdir(dir)).filter((f) => f.endsWith(".mp3"));
    if (!files.length) {
      console.error("yt-dlp gagal:", r.code, (r.err || r.out).slice(-300));
      await cleanup();
      return send(res, 422, { ok: false, message: explain(r) });
    }
    const path = join(dir, files[0]);
    const { size } = await stat(path);
    if (!size || size > MAX_BYTES) { await cleanup(); return send(res, 413, { ok: false, message: "Hasil konversi melebihi batas 20 MB Roblox." }); }
    const title = (r.out.split("\n").map((s) => s.trim()).find(Boolean) || "").slice(0, 120);
    const headers = { "content-type": "audio/mpeg", "content-length": String(size), "cache-control": "no-store" };
    if (title) headers["x-audio-title"] = encodeURIComponent(title);
    res.writeHead(200, headers);
    const stream = createReadStream(path);
    stream.on("close", cleanup);
    stream.on("error", () => { res.destroy(); cleanup(); });
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  } catch (e) {
    await cleanup();
    if (!res.headersSent) send(res, 500, { ok: false, message: "Kesalahan server saat convert." });
  }
}

const server = http.createServer(async (req, res) => {
  const path = (req.url || "").split("?")[0];
  if (req.method === "GET" && path === "/health") return send(res, 200, { ok: true });
  if (req.method !== "POST" || path !== "/convert") return send(res, 404, { ok: false, message: "Tidak ditemukan." });
  if (!secretOk(req.headers["x-backend-secret"])) return send(res, 401, { ok: false, message: "Tidak diizinkan." });

  let body;
  try { body = JSON.parse(await readBody(req)); } catch { return send(res, 400, { ok: false, message: "Body harus JSON." }); }
  const url = parseYoutube(body && body.url);
  if (!url) return send(res, 400, { ok: false, message: "Link harus dari YouTube." });
  if (running >= MAX_JOBS) return send(res, 429, { ok: false, message: "Server sedang penuh. Coba lagi sebentar." });

  running++;
  res.on("close", () => { running = Math.max(0, running - 1); });
  await convert(url, res);
});

server.requestTimeout = 0;
server.listen(PORT, () => console.log("yt-backend jalan di :" + PORT));
