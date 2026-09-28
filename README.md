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
qris.jpg                         Gambar QRIS untuk tombol Buy VIP
functions/_lib/auth.js            Verifikasi token login Google (dipakai semua endpoint /api/*; Project ID ditulis di file ini)
functions/api/
  roblox-upload.js               Upload audio ke Roblox Open Cloud
  roblox-test.js                 Cek koneksi API Key + User ID
  roblox-asset-status.js         Cek status upload yang masih diproses
  roblox-profile.js              Nama + avatar Roblox (avatar di pojok kanan atas dan Settings)
  youtube-download.js            Convert link YouTube ke MP3
  youtube-title.js               Ambil judul asli video (oEmbed YouTube)
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

## Buy VIP (QRIS) dan Owner Panel (Firebase)

Owner panel ada di `https://<nama-project>.pages.dev/owner`. Login pakai **Firebase Authentication**
(email + password), data VIP dan pesanan disimpan di **Firebase Realtime Database**.
Firebase Storage dan Firestore tidak dipakai.

### Setup Firebase (sekali saja)
1. console.firebase.google.com → buat project → **Add app → Web** → salin `firebaseConfig`.
2. `firebase-config.js` sudah terisi untuk project `baxdev-rbx`. Cek `databaseURL` sama dengan yang tampil di tab Data Realtime Database (region non-US punya URL berbeda).
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

### Kode akses premium
- Owner: `/owner` → kartu **Kode akses premium**. Isi teks kode sendiri (4–24 karakter: huruf, angka, tanda hubung; kosongkan untuk kode acak), durasi premium (jam atau hari, maks 365 hari), dan **maks. pemakai**. Tersimpan di `codes/<kode>`.
- Pengguna: Pengaturan → Akun → **Tukar kode**. Butuh login Google dan Roblox User ID terhubung. Masa aktif ditambahkan ke `vip/<userId>`; kalau sudah VIP, masa aktifnya diperpanjang, dan VIP permanen tidak diubah.
- Tiap akun Google hanya bisa memakai satu kode satu kali (`redeems/<kode>/<uid>`). Kalau pemakai sudah mencapai batas, kode otomatis habis.
- Penambahan hitungan pemakai, pencatatan pemakai, dan pemberian VIP ditulis dalam satu update atomik, dan **Security Rules** yang memvalidasinya. Setelah mengubah rules, publish ulang `database.rules.json`.
- Kode kustom lebih mudah ditebak daripada kode acak. Untuk kode yang bernilai, pakai kode acak dan batasi jumlah pemakainya.
- Jam perangkat yang meleset lebih dari sekitar 5 menit bisa membuat penukaran ditolak.

Konfigurasi harga/paket ada di objek `PAYMENT` di `index.html` (`plans`, `adminWhatsapp`).
