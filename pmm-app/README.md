# Production & Material Management App

Web app internal untuk production planning, weekly sales, material inventory,
COGS, vendor stock, dan reconciliation. Dibangun dengan Next.js, di-deploy ke
Vercel, dan menyimpan semua data secara permanen di Upstash Redis.

Database kosong saat pertama kali dibuka — semua data (article, material,
vendor, sales, dst) diisi manual oleh kamu lewat aplikasi. Tidak ada dummy data.

---

## Update terbaru (revisi)

- **Vendors**: sekarang punya field **Vendor Type** (Fabric, Sewing, Accessories,
  Packaging, Dyeing & Printing, Bordir, atau tipe custom yang bisa ditambahkan
  sendiri). Vendor bisa **diedit** dan **dihapus**.
- **Tab Product baru**: master data product dengan SKU, Product Name, Product
  Name w/o Variant, Harga, Collection. Bisa add/edit/delete. Kolom
  **Product Name w/o Variant** menjadi sumber dropdown Product di tab COGS.
- **Tab COGS (dulu "COGS History")**: flow baru dengan aksi **Add COGS** dan
  **Change COGS**. Setiap COGS terikat pada kombinasi Vendor + Product + MOQ,
  bisa punya banyak baris Material (dropdown dari tab Materials, otomatis
  hitung Total Bahan per baris & Total Bahan Semuanya), plus Harga Jahit, dan
  Total COGS dihitung otomatis. Setiap kali **Change COGS** dilakukan, versi
  lama tersimpan sebagai history dan tidak hilang.

---

## Modul yang tersedia

- PIN screen (default `1234`, bisa diganti di Settings)
- "Siapa kamu?" user picker + audit history
- Articles (free-typed, auto-created), Initial Finished Balance, Weekly Sales → otomatis **Need to Produce**
- Materials + Initial Material Balance
- Material Transactions (Purchase / Transfer / Vendor Transfer / Return / Direct Purchase) → otomatis Warehouse & Vendor Balance
- Vendors (dengan Vendor Type, edit, delete) + halaman detail vendor
- Product master data (SKU, Product Name, Product Name w/o Variant, Harga, Collection)
- COGS (Add/Change flow, dynamic materials, Harga Jahit, Total COGS, history tersimpan)
- Production Plans: Planned/Fulfilled/Unfulfilled, auto status, COGS editable pre-Confirm lalu terkunci
- Month-End Reconciliation (system balance vs manual count, variance otomatis)
- Dashboard ringkasan, empty state di semua modul

---

## Cara Deploy (Tanpa Perlu Terminal/CLI)

### Step 1 — Upload ke GitHub

1. Buka [github.com](https://github.com) dan login.
2. Klik **New** repository, beri nama (misal `pmm-app`), **Create repository**.
3. Di halaman repo kosong, klik **uploading an existing file**.
4. Unzip project ini di komputer kamu, lalu **drag & drop isi folder** (bukan
   folder itu sendiri, dan bukan file zip-nya) ke area upload — pastikan
   `package.json` langsung terlihat di root repo, bukan di dalam subfolder.
5. Scroll ke bawah, klik **Commit changes**.

### Step 2 — Deploy ke Vercel

1. Buka [vercel.com](https://vercel.com), login dengan akun GitHub.
2. **Add New → Project** → pilih repo yang baru diupload → **Import**.
3. Biarkan default (Framework Preset: Next.js) → **Deploy**.

### Step 3 — Hubungkan Upstash Redis (opsional pakai jalur gratis tanpa kartu)

1. Buka [upstash.com](https://upstash.com), sign up gratis (tanpa kartu).
2. **Create Database**, beri nama, pilih region terdekat, tipe Regional → **Create**.
3. Di halaman database, buka bagian **REST API**, copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. Di project Vercel kamu → **Settings → Environment Variables**, tambahkan
   dua variable di atas dengan value yang sama persis (Environment: Production).
5. **Save**.

### Step 4 — Redeploy & Testing

1. Tab **Deployments** → **⋯** pada deployment terakhir → **Redeploy**.
2. Buka URL situs kamu dan cek:
   - [ ] PIN `1234` berhasil masuk
   - [ ] Tambah Vendor + Vendor Type
   - [ ] Edit & delete Vendor
   - [ ] Tambah Product
   - [ ] Add COGS (pilih vendor, product, isi MOQ, tambah material, isi harga jahit)
   - [ ] Change COGS untuk kombinasi yang sama → cek versi lama masuk History
   - [ ] Tambah Material + Initial Balance
   - [ ] Weekly Sales → cek Need to Produce
   - [ ] Production Plan → Confirm → Update Fulfilled
   - [ ] Material Transaction → cek Vendor Balance
   - [ ] Reconciliation
   - [ ] Ganti PIN di Settings

---

## Menjalankan secara lokal (opsional)

```bash
npm install
# buat file .env.local, isi dengan:
# UPSTASH_REDIS_REST_URL=...
# UPSTASH_REDIS_REST_TOKEN=...
npm run dev
```
