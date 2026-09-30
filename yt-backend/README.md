# Backend YouTube (milik sendiri)

Server kecil yang menjalankan yt-dlp + ffmpeg. Tidak ada API pihak ketiga.

## Jalankan (VPS dengan Docker)
```
docker build -t baxdev-yt .
docker run -d --restart=always -p 3000:3000 -e YT_BACKEND_SECRET="isi-rahasia-panjang-acak" baxdev-yt
```
Pasang HTTPS di depannya (Caddy / Cloudflare Tunnel), lalu cek `https://domainmu/health`.

## Sambungkan ke situs
Cloudflare Pages -> Settings -> Environment variables (Production):
- `YT_BACKEND_URL`    = `https://domainmu` (tanpa garis miring di akhir)
- `YT_BACKEND_SECRET` = rahasia yang sama dengan di server

Rahasia ini hanya kunci internal kamu sendiri supaya server tidak dipakai orang lain.

## Catatan
- IP datacenter sering diminta verifikasi "sign in to confirm you're not a bot" oleh YouTube. Kalau muncul, ekspor cookies dari browser (format cookies.txt), mount ke container, lalu set `YTDLP_COOKIES=/path/cookies.txt`. Server rumah / IP residensial biasanya lebih lancar.
- Update rutin: rebuild image supaya yt-dlp terbaru (YouTube sering mengubah sistemnya).
- Batas: 7 menit (`MAX_SECONDS`), 20 MB, 2 proses bersamaan (`MAX_JOBS`).
