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
functions/[[slug]].js             Link script lisensi di akar domain: /<nama-link>?u=<Universe ID>
functions/api/script/[slug].js   Alamat cadangan script lisensi: /api/script/<nama-link>
functions/_lib/license.js         Baca script dari Firebase (kredensial admin), cek Universe ID, sajikan Lua atau Lua kick
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

## Lisensi script Lua (owner)

Di `/owner` ada kartu **Lisensi script**: paste script Lua, beri **nama link**, lalu daftarkan **Universe ID** map yang boleh memakainya.
Game mengambil script lewat HTTP:

```
https://<nama-project>.pages.dev/musicserver                      (cadangan: /api/script/musicserver)
```

Universe ID **tidak ada di link**: loader mengirimnya lewat header HTTP `X-Baxdev-Universe` (isinya `game.GameId`). Query `?u=<Universe ID>` lama masih diterima supaya loader versi lama tetap jalan. Kalau Roblox menyertakan header `Roblox-Id` (Place ID asal request), server juga mencocokkan universe place itu dengan yang diklaim loader dan menolak kalau beda; kalau header itu tidak ada atau Roblox API tidak terjangkau, pengecekan ini dilewati.

- Universe ID ada di daftar dan script aktif: server membalas isi script Lua.
- Universe tidak terdaftar, tidak mengirim header Universe, atau script dinonaktifkan: server membalas Lua yang **meng-kick semua pemain** (yang ada dan yang masuk). Pesan kick bisa diatur per script.
- Nama link tidak ada: diteruskan ke 404 biasa. Database tidak terjangkau: HTTP 502 (loader hanya `warn`, tidak meng-kick siapa pun).
- **Ban (opsional per script)**: di editor pilih Hukuman: Kick saja (default), ban 1/7/30 hari, atau permanen. Lua penolak lalu memanggil `Players:BanAsync` (berlaku untuk seluruh universe map itu) dan kembali ke kick kalau gagal. Ban hanya untuk Universe ID valid yang tidak terdaftar: tidak untuk Universe 0, header hilang, mismatch Place, atau script nonaktif, dan dilewati di Studio. Nilainya disimpan di `banDays` (`scripts/` dan `pubmeta/`), jadi **publish ulang `database.rules.json`** dan klik **Simpan script** setelah memilih.
- Tiap script punya link sendiri. Tambah/cabut Universe ID di script yang sudah tersimpan berlaku langsung.
- Kartu menampilkan **loader** siap pakai. Tempel sebagai `Script` di `ServerScriptService` map pembeli. Loader memakai `game.GameId` (Universe ID) dan mengirim `game.PlaceId` lewat header `X-Baxdev-Place`. Kalau `GameId` bernilai 0 (place belum dipublish / file lokal Studio), server mencari Universe ID asli dari Place ID lewat API publik Roblox. Place yang benar-benar belum pernah dipublish (GameId dan PlaceId sama-sama 0) tetap ditolak: publish dulu.

### Tanpa secret: cara kerja data
Tidak ada environment variable atau secret baru di Cloudflare. Data di Firebase Realtime Database:

| Node | Isi | Akses |
|---|---|---|
| `scripts/<nama-link>` | data master (nama, kode, status, daftar Universe) | owner saja |
| `pubmeta/<nama-link>` | penanda script lisensi + pesan kick | baca publik per path, tulis owner |
| `pub/<nama-link>/<Universe ID>` | salinan kode Lua | baca publik per path persis (tidak bisa di-list), tulis owner |

Salinan di `pub/` hanya ada kalau script aktif dan Universe itu terdaftar. Karena tiap Universe punya salinan sendiri, script besar dengan banyak map memakai ruang Firebase lebih banyak (kode maks. 400.000 karakter per salinan). Setelah mengubah kode, klik **Simpan script** supaya semua salinan diperbarui.

### Setup sekali
1. Publish ulang `database.rules.json` (menambah node `scripts`, `pubmeta`, `pub`).
2. Deploy ulang.
3. Di map pembeli: Game Settings → Security → **Allow HTTP Requests** aktif, dan `ServerScriptService.LoadStringEnabled` dicentang.

### Batasan
- Universe ID bukan rahasia. Orang yang tahu nama link dan salah satu Universe ID terdaftar bisa membaca `pub/<nama-link>/<Universe ID>` langsung dari Firebase atau lewat link itu (bukan lewat Roblox) dan membaca isi script. Lisensi ini mencegah pemakaian di map lain lewat loader, bukan menyembunyikan source dari pembeli.
- Jangan taruh rahasia (webhook, API key) di script yang dijual.
- Slug yang dipakai situs (`api`, `owner`, `admin`, `index`, dll.) ditolak. Hanya satu segmen path huruf kecil/angka/`-`/`_` (2-40 karakter) yang diperiksa ke database; path lain tetap dilayani file statis.
- `_routes.json` menjalankan Functions untuk semua path kecuali halaman dan aset statis yang didaftarkan di `exclude`. Kalau kamu menambah file statis dengan ekstensi baru, tambahkan ke `exclude` supaya tidak memakan kuota Functions.

## Menu License (ModuleScript + require, tanpa loadstring)

Halaman owner di `https://<nama-project>.pages.dev/license` (tema Obsidian Black, login Firebase sama dengan `/owner`; ada kartu link di /owner).

- **Buat / aktifkan / nonaktifkan / perpanjang / hapus** lisensi. Key berformat `BXL-XXXX-XXXX-XXXX-XXXX` (80 bit acak). Masa berlaku: 7-365 hari, tanggal kustom, atau permanen. Perpanjangan dihitung dari masa berlaku sekarang (kalau belum lewat).
- Setelah lisensi dibuat, halaman detail terbuka: tutorial pemasangan, dua kode siap salin (**Copy Code**), tombol **Test License**, tab Error & solusi, Riwayat, dan Kelola (ubah Universe/Place ID tanpa memasang ulang kode).
- Kode yang dihasilkan: `ModuleScript BaxdevLicense` (mengirim `game.GameId` + `game.PlaceId` ke server) dan `Script BaxdevLoader` (memanggil modul, lalu `require()` ModuleScript produk atau Asset ID). **LoadStringEnabled tidak perlu aktif.** Yang wajib: Allow HTTP Requests.
- **ModuleScript `BaxdevLicense` di-obfuscate** (`obfuscateLua` di `license-lua.js`): komentar dan indentasi dibuang, nama variabel lokal diacak (seed dari key, jadi hasil selalu sama), semua string termasuk key dan URL dienkode XOR dan didekode lewat `bit32` saat jalan. Tombol di blok kode bisa beralih ke versi terbaca untuk dukungan; Script `BaxdevLoader` sengaja tetap terbaca karena pemilik map mengubah `KICK_ON_DENIED`. Ini penyamaran, bukan enkripsi.
- Verifikasi di `functions/api/license/verify.js` (logika di `functions/_lib/licverify.js`): cek key, status, kedaluwarsa, lalu Place ID dipetakan ke Universe ID lewat API Roblox dan dibandingkan dengan klaim modul. Header `Roblox-Id` (diisi Roblox) harus sama dengan Place ID modul. Universe harus ada di daftar lisensi; kalau Place ID dibatasi, Place harus ada di daftar. Respons memuat `nonce` yang dicek modul. Respons tidak pernah memuat key, catatan pembeli, atau kredensial.
- Error jaringan / database / lookup Roblox bertanda `retryable`: modul mencoba 3 kali dan loader tidak meng-kick pemain untuk error itu. `KICK_ON_DENIED` di loader (default `false`) bisa diaktifkan untuk lisensi yang ditolak.
- Data: `licenses/<id>` (master, owner saja), `licpub/<key>` (baca publik per path, tanpa data pembeli), `liclog/<key>` (riwayat, server menambah lewat REST publik; rules memvalidasi bentuk dan hanya untuk key yang ada), `licstat/<key>` (verifikasi terakhir). **Publish ulang `database.rules.json`** lalu deploy.
- Sistem lisensi lama (loadstring, `/<nama-link>`) tetap berjalan untuk loader yang sudah terpasang; kartunya diberi label "lama" di /owner.
- Batasan: pengecekan berjalan di server game, jadi pembeli yang mengedit loader bisa melewatinya. Lisensi menghalangi pemakaian lewat modul asli di map lain dan memberi kontrol cabut/perpanjang + riwayat; bukan penyembunyi source produk. Endpoint verify tidak punya rate limit sendiri (tanpa KV); riwayat per key dibatasi tampilan 100 terbaru.
- Slug `license` dan `licenses` dicadangkan (tidak bisa jadi nama link lisensi lama).

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
