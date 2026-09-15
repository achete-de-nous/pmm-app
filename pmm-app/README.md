# Production & Material Management App

Web app internal untuk production planning, weekly sales, material inventory,
COGS, vendor stock, dan reconciliation. Dibangun dengan Next.js, di-deploy ke
Vercel, dan menyimpan semua data secara permanen di Upstash Redis.

Database kosong saat pertama kali dibuka — semua data (article, material,
vendor, sales, dst) diisi manual oleh kamu lewat aplikasi. Tidak ada dummy data.

---

## Yang sudah tersedia di versi ini (Milestone 1)

- PIN screen (default `1234`, bisa diganti di Settings)
- "Siapa kamu?" user picker + audit history (siapa mengubah apa, kapan)
- Article master (bisa diketik manual, autocomplete otomatis)
- Initial Finished Product Balance + Weekly Sales + kalkulasi otomatis **Need to Produce**
- Materials master + Initial Material Balance
- Material Transactions (Purchase, Transfer, Vendor Transfer, Return, Direct
  Purchase) dengan Warehouse Balance & Vendor Balance yang dihitung otomatis
- Vendor Management + halaman detail vendor (production + material + history)
- Production Plan: Planned/Fulfilled/Unfulfilled qty, status otomatis, COGS
  yang bisa diedit sebelum Confirm lalu terkunci setelah Confirm
- COGS History (setiap perubahan COGS tercatat dengan difference & %)
- Month-End Reconciliation (System Balance vs Manual Count, variance otomatis)
- Dashboard ringkasan
- Empty state di semua modul saat data masih kosong

**Belum termasuk** (bisa ditambahkan di milestone berikutnya): halaman
Production Batch grouping khusus, halaman Outstanding Production dengan
filter lengkap (saat ini bisa dilihat lewat filter status di halaman
Production), dan data migration tooling untuk perubahan struktur data di
masa depan.

---

## Cara Deploy (Tanpa Perlu Terminal/CLI)

### Step 1 — Upload ke GitHub

1. Buka [github.com](https://github.com) dan login (atau buat akun baru, gratis).
2. Klik tombol hijau **New** di kiri atas untuk membuat repository baru.
3. Beri nama repo, misalnya `production-material-app`. Pilih **Private** kalau
   tidak ingin publik. Klik **Create repository**.
4. Di halaman repo yang masih kosong, klik link **uploading an existing file**.
5. **Drag & drop** seluruh isi folder project ini (semua file dan folder) ke
   area upload tersebut. Tunggu sampai semua file selesai ter-upload.
6. Scroll ke bawah, klik **Commit changes**.

Tidak perlu install Git atau pakai terminal sama sekali.

### Step 2 — Deploy ke Vercel

1. Buka [vercel.com](https://vercel.com) dan login memakai akun GitHub kamu.
2. Klik **Add New... → Project**.
3. Pilih repository `production-material-app` yang baru saja kamu upload,
   klik **Import**.
4. Biarkan semua pengaturan default (Vercel otomatis mendeteksi ini project
   Next.js), lalu klik **Deploy**.
5. Tunggu proses build selesai. Untuk sementara, situs akan error karena
   database belum terhubung — itu normal, lanjut ke Step 3.

### Step 3 — Hubungkan Upstash Redis

1. Di dashboard project Vercel kamu, buka tab **Storage**.
2. Klik **Create Database** atau **Browse Marketplace**, cari **Upstash**,
   lalu pilih **Upstash Redis**.
3. Ikuti langkah setup (beri nama database, pilih region terdekat, misal
   Singapore), lalu klik **Create** / **Connect**.
4. Vercel akan otomatis menambahkan environment variables yang dibutuhkan
   (seperti `KV_REST_API_URL` dan `KV_REST_API_TOKEN`, atau
   `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`) ke project kamu —
   tidak perlu kamu isi manual.

### Step 4 — Redeploy & Testing

1. Kembali ke tab **Deployments**, klik titik tiga (`...`) pada deployment
   terakhir, pilih **Redeploy** agar environment variables baru terpakai.
2. Setelah selesai, buka URL situs kamu (contoh: `nama-project.vercel.app`).
3. Checklist testing:
   - [ ] Masukkan PIN `1234` → berhasil masuk
   - [ ] Tambah User baru di pojok kanan atas
   - [ ] Tambah Vendor pertama
   - [ ] Tambah Article pertama (lewat Weekly Sales atau Production)
   - [ ] Tambah Material pertama + Initial Balance
   - [ ] Tambah Weekly Sales → cek Need to Produce di halaman Weekly Sales
   - [ ] Buat Production Plan → coba Confirm → coba Update Fulfilled
   - [ ] Tambah Material Transaction → cek Vendor Balance ter-update
   - [ ] Coba Month-End Reconciliation
   - [ ] Ganti PIN di Settings

Kalau semua checklist di atas berjalan, aplikasi sudah siap dipakai sehari-hari
oleh tim kamu, bisa diakses bersamaan dari HP dan laptop.

---

## Menjalankan secara lokal (opsional, untuk development)

```bash
npm install
# buat file .env.local, isi dengan:
# UPSTASH_REDIS_REST_URL=...
# UPSTASH_REDIS_REST_TOKEN=...
npm run dev
```
