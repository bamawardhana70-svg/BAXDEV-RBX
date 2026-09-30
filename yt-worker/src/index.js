import { Container } from "@cloudflare/containers";

// Worker + Container: menjalankan yt-dlp/ffmpeg (server.mjs) di dalam Cloudflare.
// Container bangun otomatis saat ada request, tidur lagi setelah 5 menit nganggur.
export class YtContainer extends Container {
  defaultPort = 3000;
  sleepAfter = "5m";
  constructor(ctx, env) {
    super(ctx, env);
    this.envVars = { YT_BACKEND_SECRET: env.YT_BACKEND_SECRET, PORT: "3000" };
  }
}

export default {
  async fetch(request, env) {
    // Tolak lebih dulu di Worker (murah) sebelum container dibangunkan.
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response('{"ok":true}', { headers: { "content-type": "application/json" } });
    if (request.headers.get("x-backend-secret") !== env.YT_BACKEND_SECRET) {
      return new Response('{"ok":false,"message":"Tidak diizinkan."}', { status: 401, headers: { "content-type": "application/json" } });
    }
    const stub = env.YT.get(env.YT.idFromName("main"));
    return stub.fetch(request);
  }
};
