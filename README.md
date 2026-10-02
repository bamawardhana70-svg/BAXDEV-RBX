# baxdev — Roblox Music Uploader

Platform upload musik ke Roblox. Satu file `index.html` + Cloudflare Pages Functions di `functions/api/`.
Tema hitam · putih · silver dengan gaya liquid glass.
Tanpa build step, tanpa login. Semua data (API Key, User ID, library, VIP, kuota)
disimpan di localStorage browser masing-masing.

## Struktur

```
index.html                       Aplikasi utama
_headers                         Security header untuk file statis
_routes.json                     Function cuma jalan untuk /api/* (file statis gak makan kuota Functions)
owner.html                       Owner panel VIP + pesanan (buka di /owner, login Firebase Auth)
firebase-config.js               Config web Firebase (isi sendiri)
database.rules.json              Security Rules Realtime Database (paste di Firebase Console)
_redirects                       /admin dan /admin.html diarahkan ke /owner
logo.png                         Logo untuk owner.html
functions/api/roblox-permission.js  Beri akses audio ke map (Universe)
qris.jpg                         Gambar QRIS bawaan (dipakai kalau owner belum upload foto QRIS)
functions/_lib/auth.js            Verifikasi token login Google (dipakai semua endpoint /api/*; Project ID ditulis di file ini)
functions/api/
  roblox-upload.js               Upload audio ke Roblox Open Cloud
  roblox-test.js                 Cek koneksi API Key + User ID
  roblox-asset-status.js         Cek status upload yang masih diproses
  roblox-profile.js              Nama + avatar Roblox (avatar di pojok kanan atas dan Settings)
  roblox-my-audio.js             Impor musik lama dari akun Roblox ke Library (cek ID, scan best-effort)
  roblox-toolbox.js              Pencarian Toolbox / Creator Store Roblox (menu Toolbox), tanpa API key
  youtube-download.js            Convert link YouTube ke MP3
  youtube-title.js               Ambil judul asli video (oEmbed YouTube)
  tiktok-download.js             Convert link TikTok ke MP3 (API tikwm.com)
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
2. Klik test koneksi. Kalau berhasil, upload dan convert YouTube/TikTok sudah bisa dipakai.


## Catatan
- Coba lokal: `npx wrangler pages dev .`
- API key layanan convert YouTube ada di `functions/api/youtube-download.js` (konstanta `API_KEY`). Ganti di sana kalau berubah.
- Convert TikTok memakai API publik tikwm.com (`functions/api/tiktok-download.js`, tanpa API key). Ini layanan pihak ketiga tanpa jaminan uptime dan dibatasi sekitar 1 request per detik; kalau gagal, pesan errornya diteruskan ke halaman Upload.
- Ganti nama domain: Pages → project → Custom domains.
- Kalau `/api/*` membalas HTML atau 404, berarti folder `functions/` tidak ikut ter-upload atau project dibuat sebagai Workers.

## Buy VIP (QRIS) dan Owner Panel (Firebase)

Owner panel ada di `https://<nama-project>.pages.dev/owner`. Login pakai **Firebase Authentication**
(email + password), data VIP dan pesanan disimpan di **Firebase Realtime Database**.
Firebase Storage dan Firestore tidak dipakai.

### Setup Firebase (sekali saja)
1. console.firebase.google.com → buat project → **Add app → Web** → salin `firebaseConfig`.
2. `firebase-config.js` sudah terisi untuk project `baxdev-rbx` (database region asia-southeast1). Cek `databaseURL` sama dengan yang tampil di tab Data Realtime Database (region non-US punya URL berbeda).
3. **Build → Authentication → Sign-in method** → aktifkan **Google** (login pengguna, wajib) dan **Email/Password** (login owner). Tab Users → **Add user**
   dengan email `baxdev@owner.id` dan password pilihanmu. Buat akun ini SEGERA setelah mengaktifkan Email/Password (lihat catatan keamanan di bawah).
4. **Build → Realtime Database → Create database**. Tab **Rules** → paste isi `database.rules.json` → Publish.
5. Tidak perlu node `admins`: owner dikenali dari email akun yang ditulis di `database.rules.json` (`auth.token.email`). Ganti owner = ganti email itu di rules lalu Publish.
6. **Authentication → Settings → Authorized domains** → tambahkan domain `xxx.pages.dev` (dan domain custom).
7. Deploy ulang ke Cloudflare Pages.

### Owner cadangan
`database.rules.json` mengenali dua email owner: `baxdev@owner.id` dan `bamawardhana70@gmail.com`.
Buat akun cadangan di **Authentication → Users → Add user** (email + password), lalu Publish ulang rules.
Password sengaja tidak ditulis di kode karena `owner.html` bisa dibaca siapa saja. Ganti password lewat
kartu **Ganti password owner** di /owner (tersimpan di Firebase Authentication).

### Login Google wajib
Situs bisa dibuka tanpa login, tapi kolom Roblox User ID dan API Key terkunci sampai login Google. Pojok kanan atas menampilkan tombol "Sign in" (ikon orang) sampai login Google
terhubung. Kalau baru login Google, ikon berganti foto akun Google. Begitu Roblox terhubung, berganti avatar Roblox, dan gambar avatarnya disimpan otomatis di perangkat (dihapus hanya saat Hapus data Roblox / logout Roblox). Saat pengguna belum login Google lalu mencoba
upload musik (klik/drop area upload) atau convert YouTube ke MP3, muncul pesan "Harus login..." dan
pindah ke halaman login Google. Token Firebase otomatis dikirim ke setiap panggilan `/api/*` dan diverifikasi
di server, jadi tidak bisa dilewati dengan memanggil API langsung. Pesanan VIP juga mencatat email Google pembelinya.
Tombol **Keluar Google** ada di header Pengaturan.

### Alur
1. Pengguna klik **Buy VIP**, pilih paket, bayar QRIS dengan nominal unik, lalu klik **Saya sudah bayar**.
   Pesanan otomatis dikirim ke Firebase (`orders/<kode>`) dan muncul real-time di /owner.
2. Owner cek mutasi, lalu klik **Aktifkan** (atau tambah VIP manual lewat User ID). Ini menulis `vip/<userId>`.
3. Situs mengecek `vip/<userId>` di Firebase tiap dibuka, jadi VIP berlaku lintas perangkat.

Keamanan: yang bisa baca daftar VIP/pesanan/kode dan menulis VIP secara bebas hanya akun dengan email owner di rules. Karena pengecekannya berdasarkan email, akun `baxdev@owner.id` harus dibuat lebih dulu oleh owner; kalau tidak, orang lain bisa mendaftarkan email itu lewat API Firebase. Kalau ada opsi menonaktifkan sign-up di Authentication → Settings → User actions, matikan. Pengguna hanya bisa menulis VIP lewat penukaran kode yang valid.
Publik cuma bisa membaca satu `vip/<userId>` (kalau tahu ID-nya) dan membuat pesanan baru berstatus pending.
Tidak ada environment variable, KV, atau secret di Cloudflare: Project ID Firebase (`baxdev-rbx`) ditulis di `functions/_lib/auth.js`. Kalau ganti project Firebase, ubah konstanta `FIREBASE_PROJECT_ID` di file itu dan `firebase-config.js`.

### Riwayat upload
Setiap upload (berhasil atau gagal) dicatat ke `uploads/` di Realtime Database: nama, file, ukuran, Asset ID, email Google, dan Roblox User ID.
API Key Roblox tidak ikut dikirim. Owner melihatnya di kartu **Riwayat upload** di /owner (200 terbaru, bisa dicari dan dihapus).
Setelah update, publish ulang `database.rules.json`.

### Kode akses premium
- Owner: `/owner` → kartu **Kode akses premium**. Isi teks kode sendiri (4–24 karakter: huruf, angka, tanda hubung; kosongkan untuk kode acak), durasi premium (jam atau hari, maks 365 hari), dan **maks. pemakai**. Tersimpan di `codes/<kode>`.
- Pengguna: Pengaturan → Akun → **Tukar kode**. Butuh login Google dan Roblox User ID terhubung. Masa aktif ditambahkan ke `vip/<userId>`; kalau sudah VIP, masa aktifnya diperpanjang, dan VIP permanen tidak diubah.
- Tiap akun Google hanya bisa memakai satu kode satu kali (`redeems/<kode>/<uid>`). Kalau pemakai sudah mencapai batas, kode otomatis habis.
- Penambahan hitungan pemakai, pencatatan pemakai, dan pemberian VIP ditulis dalam satu update atomik, dan **Security Rules** yang memvalidasinya. Setelah mengubah rules, publish ulang `database.rules.json`.
- Kode kustom lebih mudah ditebak daripada kode acak. Untuk kode yang bernilai, pakai kode acak dan batasi jumlah pemakainya.
- Jam perangkat yang meleset lebih dari sekitar 5 menit bisa membuat penukaran ditolak.

Konfigurasi harga/paket ada di objek `PAYMENT` di `index.html` (`plans`, `adminWhatsapp`).

### Mode maintenance
- Owner: `/owner` → kartu **Mode maintenance**. Isi teks pop-up (maks. 500 karakter), lalu **Aktifkan maintenance** atau **Matikan**. Tersimpan di `maintenance/` (`enabled`, `message`, `updatedAt`).
- Pengunjung: situs mengecek `maintenance.json` tiap 20 detik dan saat tab dibuka lagi, jadi pop-up muncul/hilang tanpa reload manual.
- Owner yang login Google di situs utama mendapat tombol **Lanjut sebagai owner** untuk melewati pop-up (dicek lewat akses baca `isAdmin` di rules). Halaman `/owner` tidak terpengaruh.
- Setelah update, publish ulang `database.rules.json` (node `maintenance` bisa dibaca publik, hanya owner yang bisa menulis).

### Maintenance terjadwal harian
Setiap hari **00.00 – 05.00 WIB** situs menampilkan pop-up maintenance otomatis (tanpa perlu diaktifkan owner) dan semua endpoint `/api/*` membalas HTTP 503 dengan teks yang sama, jadi tidak bisa dilewati lewat pemanggilan API langsung. Owner (lolos `/isAdmin`) tetap bisa memakai layanan. Jam dihitung dari UTC+7 tetap, bukan jam perangkat pengguna di server. Logikanya ada di `functions/_lib/auth.js` (`isScheduledMaintenance`) dan skrip overlay di akhir `index.html`.

### Tes koneksi & scope API key
API key Roblox cukup memakai scope **Assets (Read + Write)**. Tombol Cek Koneksi (dan otomatis setelah Simpan) membaca scope key lewat introspeksi Roblox, lalu cadangannya mengetes endpoint Assets. Kalau scope Assets tidak ada, muncul peringatan yang menyebut scope yang dibutuhkan. Kalau key punya scope tambahan, tes tetap lolos dengan catatan agar cukup Assets saja. User ID / Group ID dicek lewat API publik Roblox.

## PWA
`manifest.webmanifest` + `sw.js` (didaftarkan di akhir `index.html`). Situs bisa di-install ke layar utama (Chrome/Edge: ikon install di address bar; Android: menu ⋮ → Install app; iOS Safari: Bagikan → Add to Home Screen). Service worker memakai *network-first* untuk halaman (jadi update dan maintenance selalu terbaru) dan tidak pernah meng-cache `/api/*`, Firebase, maupun `/owner`. Kalau mengubah aset statis, naikkan `CACHE` di `sw.js`.

## Ubah durasi VIP dan pengguna & ban (di /owner)
- **Ubah durasi VIP**: isi Roblox ID + jumlah jam/hari, lalu Tambah atau Kurangi. Tombol "Durasi" di daftar VIP mengisi ID otomatis.
- **Pengguna**: daftar scroll semua akun Google yang pernah login (`users/<uid>`, ditulis otomatis saat login) plus akun lama dari riwayat upload. Tombol **Ban** menulis `bans/<uid>`: pop-up "Akun Diblokir" tampil di situs dan semua `/api/*` membalas 403 (dicek di `functions/_lib/auth.js`). **Unban** menghapusnya.
- **Wajib publish ulang `database.rules.json`** di Firebase Console → Realtime Database → Rules.

## Beri akses audio ke map / teman
Library -> tombol **Beri Akses Map / Teman**. Pilih banyak audio Published, isi banyak Universe ID (koma / baris baru), lalu proses.
Backend: `functions/api/roblox-permission.js` memanggil Open Cloud `PATCH /asset-permissions-api/v1/assets/permissions` (subjectType `Universe`, action `Use`), satu panggilan per map. API key Roblox perlu scope `asset-permissions:write`. Maks 50 audio dan 20 map per proses.

## Backend YouTube milik sendiri
Konversi YouTube -> MP3 tidak lagi memakai API pihak ketiga. Folder `yt-backend/` berisi server kecil (yt-dlp + ffmpeg) yang kamu jalankan di VPS/Docker.
Di Cloudflare Pages isi env `YT_BACKEND_URL` dan `YT_BACKEND_SECRET` (rahasia internal, sama dengan di server). Panduan lengkap ada di `yt-backend/README.md`.
Tanpa VPS: `yt-worker/` menjalankan backend yang sama di Cloudflare Containers (paket Workers Paid).
Default-nya convert YouTube tetap lewat API key lama (api.theresav.eu); backend sendiri hanya dipakai kalau kedua env di atas diisi.

## Atur harga VIP & QRIS
Buka `/owner` → kartu **Harga VIP & QRIS**. Isi harga paket 7 hari dan 1 bulan, upload foto QRIS baru (otomatis dikecilkan), lalu Simpan.
Data disimpan di Firebase `config/payment` dan langsung dipakai tombol Buy VIP. Kalau belum diatur, dipakai harga 25.000 / 50.000 dan `qris.jpg`.
**Wajib:** paste ulang `database.rules.json` di Firebase Console → Realtime Database → Rules → Publish, supaya node `config` bisa dibaca publik dan ditulis owner saja.

## Paket VIP, QRIS, dan tema
- Paket VIP: 7 hari, 15 hari, 1 bulan. Harga tiap paket diatur di /owner (Harga VIP & QRIS). Hanya ada 1 foto QRIS yang dipakai semua paket. Data disimpan di Firebase `config/payment` (`p7`/`p15`/`p30` untuk harga, `qris` untuk foto).
- Tema warna (Hitam, Biru, Hijau): Settings → Lanjutan. Berlaku untuk seluruh tampilan dan tersimpan di browser (`baxdev_theme`); halaman /owner ikut tema yang sama.
- Beli VIP boleh berkali-kali: paket baru ditambahkan setelah masa aktif yang sekarang (owner menekan Aktifkan, masa aktif otomatis menumpuk). Tombol berubah jadi "Perpanjang VIP" saat VIP masih aktif; VIP permanen tidak perlu beli lagi.
- Nominal pembayaran bulat sesuai harga paket (tanpa angka acak). Pesanan dicocokkan lewat kode pesanan `BX-XXXX` yang ikut terkirim di pesan WhatsApp dan tampil di /owner.
- Status upload: kalau Roblox belum selesai memproses dalam beberapa detik, track tampil "Diproses" dan dicek otomatis tiap 20 detik di Library sampai Asset ID muncul (`/api/roblox-asset-status`). Tidak ada lagi pengecekan moderasi atau Arsip; entri lama berstatus Arsip otomatis jadi "Gagal".
- Upload model Roblox (`.rbxm` / `.rbxmx`): menu **Model** (di hamburger dan navbar desktop) membuka halaman upload dalam mode model dengan dropzone sendiri, terpisah dari menu **Upload** (musik: file/YouTube/TikTok). Keduanya memakai satu antrean, jadi pindah antara Upload dan Model mengosongkan antrean (ditolak kalau upload sedang berjalan), pengaturan kecepatan audio disembunyikan untuk model, dan Library punya filter jenis (Semua/Musik/Model); dikirim ke Open Cloud Assets API sebagai `assetType: Model` (content type `model/x-rbxm`, maks 20 MB). `functions/api/roblox-upload.js` hanya menerima `Audio` dan `Model`, dan memeriksa ekstensi serta header file. File yang diedit di luar Roblox Studio bisa ditolak Roblox. Model memakai kuota publish yang sama dengan audio. ID model dipakai lewat `InsertService:LoadAsset(id)`, jadi tombol salin di Library menyalin angkanya saja, bukan `rbxassetid://`. API key perlu scope Assets (Read + Write).
- Limit akun free: 5 publish per hari (`FREE_UPLOAD_LIMIT` di `index.html`), reset tengah malam waktu perangkat. Hitungannya disimpan di localStorage per User ID Roblox, jadi tidak ditegakkan server: pengguna yang menghapus data browser atau memanggil `/api/*` langsung bisa melewatinya. VIP tanpa batas.
- Riwayat upload server (bagian bawah Home): 5 upload berhasil terbaru dari semua pengguna, diambil dari Firebase `feed` dan disegarkan tiap 5 detik selama Home terlihat. Hanya nama lagu dan waktu yang dipublikasikan (tanpa email, ID Roblox, atau asset ID). Ditulis oleh browser pengguna saat upload sukses. **Paste ulang `database.rules.json` ke Firebase Console** supaya node `feed` aktif. Owner bisa menghapus entri lewat Firebase Console.
- Popup install aplikasi: muncul dari bawah tiap kunjungan selama aplikasi belum terpasang; kalau ditutup (Nanti, Esc, atau membatalkan dialog install) tidak muncul lagi selama 24 jam (`baxdev_install_dismissed_at` di localStorage). Chrome/Edge/Android memakai `beforeinstallprompt`; iOS hanya menampilkan petunjuk Tambahkan ke Layar Utama.
- Informasi di Home: owner mengirim teks lewat /owner (kartu "Informasi di Home", disimpan di Firebase `config/info`, maks 500 karakter). Selama ada informasi, Home menampilkan itu; kalau dihapus, Home menampilkan jadwal sholat berikutnya (API AlAdhan; metode Kemenag RI untuk Indonesia). Kota mengikuti pengguna: GPS jika izin sudah diberikan, kalau belum memakai perkiraan kota dari jaringan lewat `functions/api/geo.js` (`request.cf` Cloudflare), dan Jakarta bila keduanya gagal. Tombol "Pakai lokasi presisi" meminta izin GPS. Kota dicek ulang tiap 30 menit dan saat aplikasi dibuka kembali; hitung mundur berjalan per detik. `_headers` harus mengizinkan `geolocation=(self)`. **Paste ulang `database.rules.json` ke Firebase Console** supaya node `config/info` bisa ditulis owner.
- Tema "Warna bebas" (Settings → Lanjutan) khusus VIP: pilih warna apa saja lewat swatch atau color picker; seluruh tampilan (dan /owner) mengikuti. Logikanya ada di `theme.js`. Kalau VIP habis, tampilan kembali ke Hitam; warna pilihan tetap tersimpan dan aktif lagi saat VIP diperpanjang. Catatan: ini pengaturan tampilan di sisi browser, bukan pengaman.
- Avatar VIP: cincin emas berputar, mahkota kecil, dan kilau di semua avatar (navbar, dropdown, Settings, Akun).
- Menu **Toolbox** (hamburger dan navbar desktop): cari aset Roblox seperti di create.roblox.com/store/models. Kategori Model, Decal, MeshPart, Plugin, Audio; ada kolom cari, tempel ID atau link `create.roblox.com/store/asset/ID` untuk melihat satu asset, dan tombol Muat lagi. Tiap kartu punya Salin ID (untuk Audio, Decal, MeshPart juga `rbxassetid://ID`) dan Buka di Creator Store. Frontend memanggil `GET /api/roblox-toolbox?category=10&q=...&cursor=...`; endpoint itu meneruskan ke `apis.roblox.com/toolbox-service/v1/marketplace/{kategori}` dan `.../items/details` plus thumbnail dari `thumbnails.roblox.com`. Endpoint publik ini tidak butuh API key, tapi tetap wajib login Google (`requireUser`). Roblox bisa membatasi permintaan (HTTP 429); pesannya diteruskan ke halaman. Tidak ada perubahan di `database.rules.json`.

## Referal (v55)
- Menu **Referal** (ikon hadiah): tiap user login punya link `https://domainmu/?ref=KODE`.
- Orang yang **belum pernah login/memakai BAXDEV** lalu login Google lewat link itu → pengundang otomatis dapat **+6 jam VIP** (menumpuk di atas masa aktif VIP yang ada, masuk ke akun Roblox pengundang).
- Syarat "orang baru" dijaga Security Rules: akun belum punya record `users/<uid>`, tiap akun cuma bisa diklaim sekali, tidak bisa mengundang diri sendiri, VIP permanen tidak diubah. Batas 8 undangan = maksimal 2 hari bonus referal sekaligus. Kalau bonus referalnya sudah habis (waktunya lewat), hitungan mulai dari 0 lagi dan bisa dapat tambahan lagi. Disimpan di `referrals/counts/<uid>` = `{n, until}` (ubah angka `8` di `database.rules.json` dan `index.html` kalau mau).
- Pengundang harus sudah mengisi Roblox User ID di Pengaturan.
- **Wajib**: paste ulang `database.rules.json` ke Firebase Console → Realtime Database → Rules → Publish, lalu deploy ulang.

## Referal v2 + Leaderboard (v61)
- Halaman **Referal** didesain ulang: kartu link undangan, statistik (total diundang, bonus aktif, peringkat), slot bonus 8 segmen, **Leaderboard Top 10 pengundang** (medali emas/perak/perunggu, baris "kamu" disorot), dan riwayat undangan.
- Data baru di Firebase: `referrals/board/<uid>` = `{total, at}` (naik +1 secara atomik bersama klaim referal, divalidasi rules, dibaca semua user login, di-index `total`) dan `referrals/profiles/<uid>` = `{name, at}` (nama depan Google, ditulis pemiliknya sendiri).
- Leaderboard menghitung undangan yang tercatat **sejak fitur ini aktif**. Untuk memberi skor awal ke pengundang lama, owner bisa mengisi `referrals/board/<uid>` manual di Firebase Console.
- **Wajib**: paste ulang `database.rules.json` ke Firebase Console → Realtime Database → Rules → Publish, lalu deploy ulang.

## Kuota publish tidak bisa direset (v55)
- Akun free: **5 publish per hari**, reset **00.00 WIB**. Dihitung di server (`functions/api/roblox-upload.js` + `functions/_lib/auth.js`) dan disimpan di Firebase `quota/<uid>` per akun Google, jadi hapus data browser / ganti Roblox ID / ubah kode di browser tidak mengubah hitungan.
- VIP aktif tidak dihitung (tanpa batas).
- Rules `quota/<uid>`: hitungan hanya bisa naik 1 per publish dan hanya bisa diturunkan oleh owner lewat Console.
- Ubah batas: `FREE_DAILY_LIMIT` di `functions/_lib/auth.js` dan `FREE_UPLOAD_LIMIT` di `index.html` (harus sama).
- Kalau rules belum dipublish, server tidak memblokir (fail-open) dan web memakai hitungan lokal lama.
