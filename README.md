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
  tool.js                        Sajikan tool VIP Plus (Image to Mesh, SkyBox 360) setelah cek VIP Plus / Owner
                                 Tema halaman utama dikirim ke iframe tool lewat postMessage (bx:'theme'); upload mesh (GLB → Model) lewat roblox-upload.js
_tools/                          Sumber HTML kedua tool (modul JS, BUKAN file statis)
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
- Convert YouTube memakai API publik XyloAPI dan NexRay (tanpa API key); lihat bagian backend YouTube di bawah.
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
- Owner: `/owner` → kartu **Kode akses premium**. Pilih **paket kode** (VIP atau VIP Plus), isi teks kode sendiri (4–24 karakter: huruf, angka, tanda hubung; kosongkan untuk kode acak), durasi (menit, jam, atau hari; 1 menit sampai 365 hari), dan **maks. pemakai**. Tersimpan di `codes/<kode>`.
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

## Program Komisi Promotor

Halaman **Promotor** (tombol di Home) menampilkan tabel komisi dan ketentuan. Setelah login Google, pengguna mengisi nomor WhatsApp dan e-wallet penarikan
(DANA, GoPay, OVO, ShopeePay, LinkAja; rekening bank tidak didukung), lalu langsung mendapat kode 6 karakter dan link `/?ref=KODE`.

Alur:
1. Pembeli membuka link promotor (kode tersimpan di browser) atau mengetik kode di menu Buy VIP. Kode dicek ke `promoCodes/<kode>`; kode milik sendiri ditolak.
2. Kode ikut ke pesanan (`orders/<kode>/promo`). Rules menolak kode yang tidak terdaftar atau milik pembeli sendiri.
3. Saat owner menekan **Aktifkan** di /owner, komisi dihitung dari nominal pesanan x persentase yang berlaku lalu ditulis ke `commissions/<uid promotor>/<kode pesanan>`.
   Komisi dibuat oleh owner, bukan oleh browser, jadi nominalnya tidak bisa dimanipulasi dari sisi pengguna. Pesanan ditolak = tidak ada komisi.
4. Promotor melihat saldo dan riwayat di halaman Promotor, lalu menekan **Ajukan penarikan** (membuka WhatsApp admin dengan data terisi).
5. Owner mengirim ke e-wallet promotor lalu menekan **Tandai dibayar** di /owner > Promotor.

Persentase komisi diatur di /owner > Promotor (node `config/promo`: `rate`, `enabled`). Bawaan 20% dan aktif kalau node belum dibuat.
Komisi lama menyimpan persentasenya sendiri, jadi mengubah persentase tidak mengubah komisi yang sudah tercatat. Tabel di halaman publik memakai harga paket yang sedang berlaku.

Node baru di `database.rules.json`: `promoters`, `promoCodes`, `commissions`, `config/promo`, dan field `promo` di `orders`. **Publish ulang rules** setelah update ini,
kalau tidak pendaftaran promotor dan pencatatan komisi akan ditolak Firebase.

### Bonus VIP untuk pembeli yang pakai kode promotor
Pembeli yang memakai kode/link promotor (`/?ref=KODE`) otomatis dapat **bonus hari VIP** (bawaan **+2 hari**). Bonus ditambahkan owner saat menekan **Aktifkan** di /owner:
masa VIP = hari paket + bonus. Syarat: kode terdaftar di `promoters`, bukan kode milik pembeli sendiri, dan program promotor **Aktif**. Pesanan yang menunggu di /owner menampilkan `(+2 hari bonus)` dan kode yang dipakai.
Jumlah bonus diatur di /owner > Promotor > **Bonus hari VIP untuk pembeli** (0 = matikan, maks. 30), tersimpan di `config/promo/bonusDays`. Kalau node belum punya `bonusDays`, dipakai 2. **Publish ulang `database.rules.json`** (menambah field `bonusDays`), kalau tidak tombol Simpan komisi ditolak Firebase.
Form promotor mengisi: **nama promotor**, WhatsApp, e-wallet, nomor e-wallet, dan **atas nama e-wallet** (`ewalletName`, tampil di /owner > Promotor dan di pesan penarikan WA). **Nama promotor diisi manual** (tanpa isi otomatis dari Google), 3-6 huruf/angka, dan **dipakai sebagai kode referral** (mis. `BUDI` -> `BUDI` + 2 angka acak = `BUDI47`; tepat 6 karakter dipakai apa adanya; kalau bentrok, ujungnya diganti angka acak). Setelah mendaftar, nama dan kode tidak bisa diubah. Promotor lama tanpa `ewalletName` diminta mengisinya saat menyimpan data. Publish ulang `database.rules.json` (menambah `ewalletName`).
Mendaftar promotor **tidak butuh login Roblox**: cukup login Google lalu isi WhatsApp + e-wallet. Login Google dari halaman Promotor tidak lagi dialihkan ke form Roblox User ID / API Key.
Halaman Promotor kini punya kartu **Cara jadi promotor** (6 langkah), dan menu Buy VIP menampilkan info bonus di bawah kolom kode promotor.

### Video tutorial API Key
Di Pengaturan > Roblox, kartu **Cara mendapatkan Roblox API Key** memuat video `tutorial-api-key.mp4` (poster `tutorial-api-key-poster.jpg`, ~0,6 MB, dikompres dari video asli) plus langkah tertulisnya
(nama key, sistem API `assets` operasi read + write, batasan IP dua baris `0.0.0.0/0` (IPv4) dan `::/0` (IPv6), tidak kedaluwarsa, Simpan & Buat Kunci). Untuk mengganti video, timpa file `tutorial-api-key.mp4` dengan nama sama.
`sw.js` tidak meng-cache video (request Range), dan `_routes.json` mengecualikan `*.mp4` supaya tidak makan kuota Functions.

## Library tidak menyimpan animasi dan SkyBox

Hasil upload Animasi (spoof) dan 6 sisi SkyBox tidak masuk Library. Animasi tampil di kotak status upload selama halaman terbuka; SkyBox menampilkan ID tiap sisi di tool-nya.
Entri lama yang sudah ada di Library tidak dihapus otomatis; hapus lewat filter jenis Animasi/Decal di Library kalau mau.

## Tampilan /owner

Panel owner memakai sidebar (desktop) atau tab geser (layar kecil) dengan 7 bagian: Ringkasan, VIP & Kode, Pengguna, Promotor, Harga & QRIS, Situs, Sistem.
Bagian bisa dibuka langsung lewat hash, mis. `/owner#promo`. Angka di sidebar menunjukkan pesanan menunggu dan promotor yang masih punya saldo.

## PWA
`manifest.webmanifest` + `sw.js` (didaftarkan di akhir `index.html`). Situs bisa di-install ke layar utama (Chrome/Edge: ikon install di address bar; Android: menu ⋮ → Install app; iOS Safari: Bagikan → Add to Home Screen). Service worker memakai *network-first* untuk halaman (jadi update dan maintenance selalu terbaru) dan tidak pernah meng-cache `/api/*`, Firebase, maupun `/owner`. Kalau mengubah aset statis, naikkan `CACHE` di `sw.js`.

## Ubah durasi VIP dan pengguna & ban (di /owner)
- **Ubah durasi VIP**: isi Roblox ID + jumlah jam/hari, lalu Tambah atau Kurangi. Tombol "Durasi" di daftar VIP mengisi ID otomatis.
- **Pengguna**: daftar scroll semua akun Google yang pernah login (`users/<uid>`, ditulis otomatis saat login) plus akun lama dari riwayat upload. Tombol **Ban** menulis `bans/<uid>`: pop-up "Akun Diblokir" tampil di situs dan semua `/api/*` membalas 403 (dicek di `functions/_lib/auth.js`). **Unban** menghapusnya.
- **Wajib publish ulang `database.rules.json`** di Firebase Console → Realtime Database → Rules.

## Beri akses audio ke map / teman
Library -> tombol **Beri Akses Map / Teman**. Pilih banyak audio Published, isi banyak Universe ID (koma / baris baru), lalu proses.
Backend: `functions/api/roblox-permission.js` memanggil Open Cloud `PATCH /asset-permissions-api/v1/assets/permissions` (subjectType `Universe`, action `Use`), satu panggilan per map. API key Roblox perlu scope `asset-permissions:write`. Jumlah audio dan map **tanpa batas** (v81): `index.html` membagi otomatis per 50 audio x 20 map per request (batas per-request di server = subrequest Cloudflare), berurutan, dengan retry bila Roblox membalas 429 dan hasil digabung per map.

## Backend YouTube milik sendiri
Konversi YouTube -> MP3 tidak lagi memakai API pihak ketiga. Folder `yt-backend/` berisi server kecil (yt-dlp + ffmpeg) yang kamu jalankan di VPS/Docker.
Di Cloudflare Pages isi env `YT_BACKEND_URL` dan `YT_BACKEND_SECRET` (rahasia internal, sama dengan di server). Panduan lengkap ada di `yt-backend/README.md`.
Tanpa VPS: `yt-worker/` menjalankan backend yang sama di Cloudflare Containers (paket Workers Paid).
Convert YouTube mencoba beberapa jalur berurutan di `functions/api/youtube-download.js`: XyloAPI `server1`, NexRay, XyloAPI `server2`, `server3`, lalu backend sendiri (hanya kalau env di atas diisi). Jalur yang gagal otomatis pindah ke berikutnya. `api.theresav.eu` tidak dipakai lagi untuk YouTube. Kalau antrean lebih dari 3 link, tiap link dimulai dari jalur berbeda bergiliran (server1, NexRay, server2) supaya beban tersebar. Env opsional `XYLO_SERVERS` (contoh `server1,server2`) mengubah daftar server XyloAPI.

## Upscale SkyBox sebelum upload

Di tool SkyBox 360 ada pilihan "Upscale sebelum upload" (Tanpa / 2× / 4×). Saat publish, tiap sisi dikirim ke `functions/api/image-upscale.js` (diteruskan ke `api.theresav.eu/api/tools/hd`, API key tetap di server, hanya VIP Plus/Owner) lalu hasilnya yang diunggah ke Roblox. Hasil WebP atau di atas 19 MB otomatis dikodekan ulang jadi JPEG. Kalau upscale suatu sisi gagal, sisi itu ditandai gagal di daftar ID (tidak diam-diam diunggah versi kecil).

## Tool VIP Plus: Seamless Texture

Tool baru di samping Image to Mesh dan SkyBox 360, disajikan lewat `/api/tool?name=texture` (cek VIP Plus di server, jalan di iframe sandbox).

- `functions/_tools/seamless-texture.js`: gambar jadi ubin tanpa sambungan (cross-fade tepi, lebar blend bisa diatur), preview 3 x 3 dan mode "Cek sambungan", publish 1 gambar, script Command Bar yang memasang `Texture` di keenam sisi Part terpilih.
- `functions/_tools/_shell.js`: kerangka bersama tool baru (gaya, tema, tinggi otomatis, helper publish). Isinya tidak boleh memuat backtick, `${` atau backslash karena ditanam di template literal.
- Publish dilakukan halaman utama (`TOOL_PUBLISH` di `index.html`), jadi API key Roblox tidak masuk ke tool. Menu desktop sekarang 8 item; di lebar 1100-1359 px ikon menu disembunyikan supaya muat.

## Proses latar belakang (PWA)

Modul `BxBg` (script `#bx-bg-js` di `index.html`) melacak convert, upload, dan publish tool VIP Plus. Browser membekukan halaman yang disembunyikan, jadi ini bukan eksekusi latar belakang sungguhan: saat HP mati atau aplikasi ditutup paksa, proses berhenti. Yang dikerjakan:

- Pil progres di semua halaman (ketuk untuk kembali ke halaman prosesnya), judul tab `(2/5)`, dan peringatan sebelum menutup halaman saat proses berjalan.
- Wake Lock: layar tetap menyala selama halaman terlihat dan ada proses.
- Notifikasi selesai lewat service worker kalau halaman sedang disembunyikan (izin diminta sekali, saat proses pertama dimulai).
- Request yang putus karena halaman sempat dibekukan diulang otomatis (maksimal 2 percobaan tambahan di luar jatah normal) di `convertOne` dan `postWithRetry`.
- `sw.js` (cache v6) menangani klik notifikasi. Agar benar-benar jalan saat HP mati, dibutuhkan antrean di server (Cloudflare Queue + Worker) dan Roblox API key tersimpan di server; belum dibuat.


## Pagar endpoint /api (v100)

Semua endpoint yang memakai `requireUser` (`functions/_lib/auth.js`) sekarang hanya menerima request dari halaman situs ini di browser: header `Sec-Fetch-Site` harus `same-origin` (atau `Origin` sama dengan host situs bila header itu tidak ada). `curl` / skrip polos ditolak `403 forbidden_origin`.

Header itu bisa dipalsukan, jadi lapisan berikutnya adalah proof-of-work (v102).

## Proof-of-work, tanpa setup (v102, menggantikan App Check)

Tidak ada reCAPTCHA, secret, KV, atau layanan Google tambahan. `fetch` di `index.html` mencari nonce di Web Worker sehingga `SHA-256("bx1|<ts>|<METHOD>|<path>|<nonce>")` diawali minimal `POW_BITS` bit nol (default 16, rata-rata 65 ribu hash, puluhan sampai ratusan ms), lalu mengirimnya di header `X-BX-Pow: <ts>.<nonce>` ke setiap `/api/*`. `requireUser` (`functions/_lib/auth.js`) menghitung ulang satu hash, memeriksa jam (toleransi 120 detik), dan menolak pasangan yang sama dipakai dua kali (best effort per isolate). Tanpa header atau hash kurang: `403 pow_required` / `pow_stale` / `pow_failed` / `pow_replay`.

Kesulitan diatur di server saja: ubah `POW_BITS` di `functions/_lib/auth.js` (tiap +1 bit = 2x kerja). Respons 403 membawa `bits` dan `now`, jadi klien menyesuaikan kesulitan dan selisih jam sendiri lalu mengulang sekali.

Batas yang jujur: PoW tidak membuktikan permintaan datang dari situs ini (tidak ada secret yang bisa dibuktikan), hanya membuat tiap request membayar kerja CPU. Penyerang yang mau tetap bisa menghitungnya di luar browser; yang dicegah adalah tembakan massal murah. Pagar sebenarnya tetap login Google, kuota, ban, dan cek VIP. Matikan sementara dengan `POW_ENFORCE = false`.

Bila dulu sempat mengaktifkan App Check di Firebase Console (Enforce untuk Realtime Database / Authentication), matikan: klien kini tidak mengirim token App Check dan Realtime Database akan menolaknya. Aplikasi web App Check dan site key reCAPTCHA lama boleh dihapus.

## Fitur lisensi dan loadstring dihapus
Menu License (`/license`), lisensi script lama (loadstring, link `/<nama-link>` dan `/api/script/<nama-link>`), endpoint `/api/license/verify`, serta kartu Lisensi script di /owner sudah dihapus. `_routes.json` kini hanya menjalankan Functions untuk `/api/*`.
Data lama di Firebase (`scripts`, `pubmeta`, `pub`, `licenses`, `licpub`, `licstat`, `liclog`) tidak ikut terhapus otomatis: hapus node itu manual di Realtime Database kalau tidak dipakai lagi. Publish ulang `database.rules.json` (node tersebut sudah dihapus dari rules).
