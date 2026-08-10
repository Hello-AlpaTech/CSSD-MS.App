# e-CSSD (Sistem Manajemen CSSD RSUD Benda)

Sistem Manajemen Central Sterile Services Department (CSSD) RSUD Benda untuk pelacakan alur sterilisasi instrumen medis, inventarisasi, pencetakan label QR Code via Bluetooth Printer, serta manajemen distribusi antar unit/instalasi rumah sakit.

---

## 🌟 Fitur Utama

- **Penerimaan Instrumen**: Pencatatan kotor masuk dari ruangan/instalasi (IBS, ICU, Poliklinik, dll) beserta scanner barcode/QR.
- **Dekontaminasi & Pencucian**: Alur proses perendaman, pembersihan, dan verifikasi kelayakan instrumen.
- **On Process CSSD**: Tracking visual seluruh tahap pengerjaan instrumen medis.
- **Pengemasan (Packaging)**: Pengelompokan set/single instrumen, penyusunan indikator internal/eksternal.
- **Sterilisasi**: Penginputan siklus sterilisator (Autoclave / Low Temp), suhu, tekanan, dan nomor lot/batch.
- **Penyimpanan (Storage)**: Manajemen rak & posisi barang steril di ruang penyimpanan CSSD.
- **Distribusi**: Serah terima instrumen steril ke unit peminta beserta tanda tangan/verifikasi petugas.
- **Inventaris**: Katalog instrumen set & single, stok barang, tambah/edit/hapus (termasuk hapus masal via checkbox).
- **Cetak Label QR Code**: Dukungan Bluetooth Thermal Printer untuk mencetak sticker label sterilisasi secara instan.
- **Activity Log**: Audit trail aktivitas pencatatan dan perubahan data secara real-time.
- **Fitur PWA**: Dapat diinstal di HP/Desktop sebagai aplikasi WebView/PWA.

---

## 🛠️ Teknologi yang Digunakan

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Build Tool**: Vite
- **Database & Realtime**: Firebase Firestore
- **PWA & Icons**: Lucide React, QR Code, HTML2Canvas, jsPDF
- **Animasi**: Motion (Framer Motion)

---

## 🚀 Cara Menjalankan Secara Lokal (Development)

### 1. Prasyarat
- Node.js (versi 18 ke atas)
- npm atau bun/yarn

### 2. Instalasi Dependency
```bash
npm install
```

### 3. Konfigurasi Environment Variable
Buat file `.env` di root project jika ingin menggunakan konfigurasi Firebase milik Anda sendiri:
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 4. Jalankan Dev Server
```bash
npm run dev
```
Buka browser di `http://localhost:3000`.

---

## 📦 Build untuk Produksi

Untuk menghasilkan file statis siap deploy:
```bash
npm run build
```
Hasil build akan berada di dalam folder `dist/`.

---

## 🌐 Panduan Deployment

Aplikasi ini dapat dideploy secara gratis dan cepat di berbagai platform hosting:

### 1. Vercel (Rekomendasi Utama)
1. Push kode ini ke GitHub.
2. Login ke [Vercel](https://vercel.com) dan hubungkan akun GitHub Anda.
3. Import repository ini.
4. Framework Preset akan otomatis terdeteksi sebagai **Vite**.
5. Klik **Deploy**.

### 2. Netlify
1. Login ke [Netlify](https://netlify.com).
2. Pilih **Add new site** > **Import an existing project**.
3. Hubungkan ke GitHub dan pilih repository ini.
4. Build command: `npm run build`
5. Publish directory: `dist`
6. Klik **Deploy**.

### 3. Firebase Hosting
1. Install Firebase CLI: `npm install -g firebase-tools`
2. Login Firebase: `firebase login`
3. Inisialisasi: `firebase init hosting` (pilih folder `dist` sebagai public directory dan set sebagai Single Page App).
4. Deploy: `firebase deploy --only hosting`
