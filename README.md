# baxdev — Roblox Audio Studio

Satu file `index.html` + Cloudflare Pages Functions di `functions/api/`.
Tanpa build step, tanpa login. Semua data (API Key, User ID, library, VIP, kuota)
disimpan di localStorage browser masing-masing.

## Struktur

```
index.html                       Aplikasi utama
_headers                         Security header untuk file statis
_routes.json                     Function cuma jalan untuk /api/* (file statis gak makan kuota Functions)
admin.html                       Admin panel VIP + pesanan (buka di /admin.html, pakai localStorage)
logo.png                         Logo untuk admin.html
qris.jpg                         Gambar QRIS untuk tombol Buy VIP
functions/api/
  roblox-upload.js               Upload audio ke Roblox Open Cloud
  roblox-test.js                 Cek koneksi API Key + User ID
  roblox-asset-status.js         Cek status upload yang masih diproses
  roblox-profile.js              Nama + avatar Roblox (belum dipakai di UI)
  youtube-download.js            Convert link YouTube ke MP3
  youtube-title.js               Ambil judul asli video (oEmbed YouTube)
  vip-check.js                   Cek apakah User ID termasuk VIP (baca KV)
  admin-vip.js                   Tambah/hapus/list VIP (butuh password admin)
```

## Deploy ke Cloudflare Pages

Harus **Pages**, bukan Workers.

**Cara 1 — Dashboard (paling gampang)**
1. dash.cloudflare.com → Workers & Pages → Create → Pages → **Upload assets**.
2. Kasih nama project, lalu drag-drop **isi** folder ini (bukan file zip-nya).
   Pastikan `index.html` dan folder `functions/` ada di level paling atas.
3. Deploy. Buka `https://<nama-project>.pages.dev`.

**Cara 2 — CLI**
```bash
npx wrangler login
npx wrangler pages deploy . --project-name baxdev
```
Jangan tambahkan `wrangler.toml`: kalau ada, binding dan variabel di dashboard jadi tidak bisa dipakai.

**Cara 3 — Git**
Push folder ini ke GitHub/GitLab, lalu Create → Pages → Connect to Git.
Build command dikosongkan, output directory diisi `/`.

## Setelah deploy
1. Buka Settings → Roblox, isi **API Key** (creator.roblox.com → Credentials, izin Assets: Read + Write) dan **User ID**.
2. Klik test koneksi. Kalau berhasil, upload dan convert YouTube sudah bisa dipakai.


## Catatan
- Coba lokal: `npx wrangler pages dev .`
- API key layanan convert YouTube ada di `functions/api/youtube-download.js` (konstanta `API_KEY`). Ganti di sana kalau berubah.
- Ganti nama domain: Pages → project → Custom domains.
- Kalau `/api/*` membalas HTML atau 404, berarti folder `functions/` tidak ikut ter-upload atau project dibuat sebagai Workers.

## Buy VIP (QRIS) dan Admin Panel — mode sementara (localStorage)

Alur:
1. Pengguna klik **Buy VIP** (harus sudah mengisi Roblox User ID), pilih paket (7 hari Rp25.000 atau
   1 bulan Rp50.000). Muncul QRIS dan nominal unik (harga paket + 1–99 rupiah) supaya pembayaran
   bisa dicocokkan dengan mutasi.
2. Setelah bayar, pengguna klik **Saya sudah bayar**. Pesanan berstatus menunggu dan tombol
   **Hubungi admin** membuka WhatsApp dengan pesan konfirmasi (User ID, kode, paket, nominal).
3. Admin cek mutasi di aplikasi merchant, lalu di `/admin.html` klik **Aktifkan** pada pesanan
   (atau tambah VIP manual lewat User ID). Masa aktif mengikuti paket yang dipilih (7 atau 30 hari).

Konfigurasi ada di objek `PAYMENT` di `index.html`: `plans` (hari, label, harga) dan
`adminWhatsapp` (nomor admin format internasional tanpa +).

Batasan mode sementara:
- Semua data ada di localStorage browser (`baxdev_vip`, `baxdev_orders`). VIP yang diaktifkan di
  admin.html hanya berlaku di browser yang sama, bukan di perangkat pengguna lain.
- Pesanan hanya muncul di admin.html kalau dibuat di browser yang sama dengan panel.
- Password admin (`baxdev_owner_hash`) hanya pintu di sisi klien, bukan keamanan sungguhan.
- QRIS statis tidak terverifikasi otomatis.

Supaya VIP berlaku lintas perangkat, pakai Cloudflare KV: `functions/api/vip-check.js` dan
`functions/api/admin-vip.js` sudah ada. Binding `VIP_KV` dan secret `ADMIN_PASSWORD` di Pages
(Settings → Bindings / Variables and Secrets), lalu admin.html perlu disambungkan kembali ke
`/api/admin-vip`. Situs mengecek `/api/vip-check` tiap dibuka dan tiap User ID disimpan.
