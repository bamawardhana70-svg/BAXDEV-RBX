import { Container } from "@cloudflare/containers";

// Worker + Container: menjalankan yt-dlp/ffmpeg (server.mjs) di dalam Cloudflare.
// Container bangun otomatis saat ada request, tidur lagi setelah 10 menit nganggur
// (sleepAfter lebih panjang = lebih jarang cold start, yang tadinya bikin convert pertama terasa lama).
export class YtContainer extends Container {
  defaultPort = 3000;
  sleepAfter = "10m";
  constructor(ctx, env) {
    super(ctx, env);
    this.envVars = { YT_BACKEND_SECRET: env.YT_BACKEND_SECRET, PORT: "3000" };
  }
}

const JSON_HEADERS = { "content-type": "application/json" };

export default {
  async fetch(request, env, ctx) {
    // Tolak lebih dulu di Worker (murah) sebelum container dibangunkan.
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response('{"ok":true}', { headers: JSON_HEADERS });
    if (request.headers.get("x-backend-secret") !== env.YT_BACKEND_SECRET) {
      return new Response('{"ok":false,"message":"Tidak diizinkan."}', { status: 401, headers: JSON_HEADERS });
    }
    const stub = env.YT.get(env.YT.idFromName("main"));

    // /warm: bangunkan container di belakang layar (dipanggil saat user membuka tab YouTube),
    // jadi saat tombol Convert ditekan container sudah siap.
    if (url.pathname === "/warm") {
      ctx.waitUntil(stub.fetch(new Request(new URL("/health", request.url).href)).catch(() => {}));
      return new Response('{"ok":true,"warming":true}', { status: 202, headers: JSON_HEADERS });
    }
    return stub.fetch(request);
  }
};
