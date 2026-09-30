# YouTube backend di Cloudflare (Workers + Containers)

Tanpa VPS: yt-dlp + ffmpeg jalan di Cloudflare Containers. Butuh paket **Workers Paid** (sekitar $5/bulan).

```
cd yt-worker
npm install
npx wrangler login
npx wrangler secret put YT_BACKEND_SECRET     # isi rahasia acak panjang (min 16 karakter)
npx wrangler deploy                            # butuh Docker terpasang untuk build image
```
Hasil deploy memberi alamat `https://baxdev-yt.<akunmu>.workers.dev`.
Lalu di Cloudflare Pages isi env: `YT_BACKEND_URL` = alamat itu, `YT_BACKEND_SECRET` = rahasia yang sama.

Catatan: kalau YouTube menolak IP Cloudflare ("sign in to confirm you're not a bot"), pakai cookies (lihat ../yt-backend/README.md) atau pindah ke server rumah. Update yt-dlp dengan deploy ulang. `server.mjs` di sini salinan dari ../yt-backend.
