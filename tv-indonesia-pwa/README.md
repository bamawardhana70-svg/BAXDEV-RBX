# TV Nusantara — PWA Live TV Player

PWA statis untuk memutar channel dari playlist M3U/M3U8 yang legal dan dapat diakses. Tidak ada backend, database, akun, atau API key.

## Fitur
- Responsif untuk ponsel dan desktop; bisa dipasang sebagai PWA.
- Impor playlist dari URL atau file `.m3u` / `.m3u8`.
- Player HLS menggunakan hls.js, jika browser mendukungnya.
- Pencarian, kategori sederhana, dan favorit tersimpan lokal.
- Input EPG XMLTV jika sumber menyediakan file XML yang bisa diakses browser.
- Bisa deploy ke Vercel, Netlify, atau GitHub Pages.

## Deploy paling mudah
1. Unduh ZIP dan ekstrak.
2. Buat repository GitHub baru lalu unggah seluruh isi folder ini (bukan folder ZIP-nya).
3. Di Vercel, pilih **Add New → Project**, impor repository tersebut.
4. Framework Preset pilih **Other**; Build Command kosong dan Output Directory `.` (atau biarkan Vercel mendeteksi static site).
5. Deploy. Buka URL HTTPS hasil deploy dari Android Chrome, lalu pilih menu browser **Install app / Tambahkan ke layar utama**.

Alternatif: drag folder ke layanan static hosting yang mendukung deploy langsung.

## Cara pakai
1. Tekan **Sumber Channel**.
2. Tempel URL playlist M3U yang Anda punya izin untuk akses, atau unggah file lokal.
3. Pilih channel. Untuk EPG, masukkan URL XMLTV tanpa kompresi gzip agar bisa dibaca browser.
4. Gunakan pencarian, filter, dan tombol bintang untuk favorit.

## Tentang playlist Indonesia
Tombol **Coba playlist Indonesia komunitas** memuat playlist komunitas `https://iptv-org.github.io/iptv/countries/id.m3u` sebagai contoh teknis. Ini bukan sertifikasi hak siar. Tautan dalam playlist dapat berubah, tidak aktif, dibatasi wilayah, memerlukan autentikasi, atau tidak mengizinkan playback di situs lain. Verifikasi hak dan sumber tiap stream sebelum digunakan; untuk penggunaan publik, utamakan URL resmi yang secara eksplisit mengizinkan embedding/redistribusi.

## Batasan teknis
- Browser tidak dapat memutar semua format. HLS `.m3u8` paling didukung; RTMP/RTSP biasanya tidak diputar langsung oleh browser.
- Stream lintas domain perlu mengizinkan CORS. Jangan mengakali autentikasi, DRM, geo-block, atau pembatasan akses.
- Autoplay dengan suara biasanya diblokir sampai pengguna menekan Play.
- EPG hanya tampil jika format XMLTV, ID channel (`tvg-id`), zona waktu, dan CORS cocok. File `.xml.gz` tidak didekompresi oleh versi minimal ini.
- Service worker meng-cache file aplikasi, bukan video stream. Offline hanya untuk shell aplikasi, bukan siaran langsung.
- Playlist eksternal dimuat saat diminta pengguna; aplikasi tidak menyertakan atau meng-host konten video.

## Lisensi
Source code aplikasi ini disediakan di bawah MIT License. Lisensi aplikasi tidak memberikan hak atas siaran pihak ketiga atau playlist eksternal.
