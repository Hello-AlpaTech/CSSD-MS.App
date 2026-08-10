# e-CSSD System Specification (LOCKED)

This document contains the core business logic, rules, and specifications for the e-CSSD application. These rules are **LOCKED** and must be strictly adhered to during implementation. No changes or overrides to these rules are allowed without explicit user authorization.

---

## 1. ID INSTRUMEN (IDENTITAS PERMANEN)
- **Format ID**: `[Tipe]-[KodeInstrumen][NoUrut]-[KodeInstalasi]` (Contoh: `ST-HECST01-IGD1`).
- **Sifat ID**: Identitas permanen alat fisik yang tidak boleh berubah sepanjang umur alat, bahkan jika alat tersebut dipindahkan instalasinya.
- **Sequence Generator**:
  - Nomor urut (`NoUrut`) dihasilkan secara otomatis oleh sistem menggunakan **server-side atomic counters/transactions**.
  - Angka tidak boleh didaur ulang (jika `05` rusak/nonaktif, alat baru berikutnya wajib menggunakan `06`).
  - **Dilarang keras** menebak nomor urut di frontend, menggunakan baris Excel secara mentah, atau `max(nomor) + 1` tanpa locking.
- **Alur Registrasi & Impor Massal**:
  - Pengguna memasukkan data identitas alat atau upload file Excel.
  - Sistem menampilkan **Preview ID** (draft nomor urut) untuk ditinjau.
  - Setelah pengguna mengonfirmasi, sistem mengalokasikan nomor urut secara atomic di server, membuat data Master Instrument, dan mencatat Audit Log.

---

## 2. STATE MACHINE & FAILURE HANDLING (WORKFLOW)
Alur normal: `Penerimaan` → `Dekontaminasi` → `Packing` → `Sterilisasi` → `Ready` → `Rak` → `Distribusi`.
Jika terjadi kegagalan, tindakan ditentukan berdasarkan **Failure Reason** yang spesifik:

- **Kerusakan Kemasan (PACKAGING_DAMAGE)** saat pemeriksaan kelayakan:
  - Kembali ke tahap **Packing (re-pack)** saja (tidak perlu dekontaminasi ulang selama kebersihan instrumen terjamin).
- **Instrumen Kotor / Terkontaminasi (INSTRUMENT_CONTAMINATED)**:
  - Kembali ke tahap **Dekontaminasi ulang** (cuci ulang) lalu masuk ke alur normal.
- **Kegagalan Sterilisasi / Mesin / Indikator (STERILIZATION_FAILED / MACHINE_FAILED / INDICATOR_FAILED)**:
  - Semua instrumen dalam batch terdampak otomatis diubah statusnya menjadi **Blocked/Karantina** (ditolak masuk status Ready/Distribusi).
  - Alur: `Blocked` → `Investigation` → `Reprocess` (menentukan apakah perlu re-clean atau re-pack berdasarkan SOP/hasil investigasi).

---

## 3. SPECIAL CASES & KARANTINA (HOLD)
- **Status Master**: Alat yang rusak atau hilang **tidak dihapus** dari database Master agar histori dan penelusuran audit tetap terjaga.
- **Pelepasan HOLD**:
  - Petugas CSSD dapat mencatat kerusakan, melakukan perbaikan, mengunggah bukti perbaikan, dan mengajukan **Release Request**.
  - **Hanya Admin** (atau role yang diberi kewenangan verifikasi) yang dapat menyetujui pelepasan HOLD setelah memeriksa bukti.
  - Pelepasan HOLD tidak otomatis membuat alat berstatus Ready/Steril; alat harus kembali mengikuti alur proses dari awal (**Dekontaminasi**).
- **Perhitungan Stok**:
  - Alat berstatus HOLD/Karantina tetap dihitung dalam **Total Inventaris** instalasi pemilik.
  - Namun, alat tersebut **tidak dihitung dalam Available/Usable Stock**.
  - Formula: `Total Inventaris = Available + Hold + Lost/In-Use`.

---

## 4. RECONCILIATION & STOCK DISCREPANCY
- **Dilarang mengedit angka stok secara langsung**.
- Alur penyelesaian selisih stok (Stock Discrepancy):
  1. **Stock Opname**: Pencatatan jumlah fisik di lapangan.
  2. **Discrepancy Entry**: Sistem mendeteksi selisih (contoh: Expected 4, Found 3).
  3. **Investigation**: Mencari alat berdasarkan `ID Instrumen`.
     - *Klarifikasi Selisih*: Jika alat ditemukan di ruang lain atau sedang digunakan, update lokasi/state alat. Selisih terselesaikan tanpa penyesuaian angka inventaris.
  4. **Adjustment & Approval**: Jika benar-benar hilang, Admin menyetujui penyesuaian (status alat diubah menjadi `INACTIVE / LOST` dan tercatat di Audit Log).

---

## 5. DUAL PRINTING STRATEGY (THERMAL 58MM)
- **Target Utama**: Printer thermal 58 mm **VSC MP-58 C** menggunakan protokol **ESC/POS**.
- **Arsitektur Dual Printing**:
  - **Jalur Utama**: Direct printing melalui Web Bluetooth / Web API (bila perangkat & browser mendukung).
  - **Jalur Alternatif**: Share payload text/ESC-POS commands ke aplikasi printer pihak ketiga (seperti RawBT atau aplikasi ESC/POS eksternal).
  - **Fallback**: Output image atau PDF 58 mm yang dapat dicetak/dibagikan secara universal.
- **Ketergantungan Transaksi**: Kegagalan cetak/bluetooth **tidak boleh membatalkan transaksi bisnis** yang sudah berhasil (transaksi tetap selesai, sistem menyediakan tombol *Retry Print*).

---

## 6. MULTI-TENANT & ISOLASI DATABASE
- **Isolasi Data**: Setiap rumah sakit memiliki database Firebase Firestore terpisah (bukan satu Firestore global yang digabung).
- **Master Firebase**: Menyimpan konfigurasi dan registri tenant untuk mengarahkan aplikasi ke database tenant yang tepat sesuai context `tenantId`.

---

## 7. USER MANAGEMENT & SCOPE ACCESS
- **Registrasi Staff**: Pendaftaran akun baru berstatus `PENDING` dan membutuhkan approval Admin/Tenant Admin.
- **Role & Scope**:
  - **Admin**: Gabungan Administrator dan Petugas Operasional CSSD (dapat mengelola master data dan menjalankan seluruh aktivitas operasional).
  - **Petugas CSSD**: Akses operasional sesuai kewenangan yang diberikan.
  - **Petugas Instalasi**: Hanya dapat mengakses request/pengembalian sesuai scope instalasi unitnya (contoh: IGD hanya melihat IGD).
  - **Akses BMHP**: Unit biasa hanya melihat Kassa. Unit IBS/OK dapat melihat Kassa dan Linen. BMHP lain tidak ditampilkan di sisi instalasi.

---

## 8. DYNAMIC MACHINE CONFIGURATION
- **Master Mesin**: Konfigurasi mesin sterilisasi dibuat dinamis di Admin (bukan hardcoded).
- **Atribut**: ID Mesin, Tipe, Metode, Program Mode, Suhu, Waktu, dan status kelayakan mesin (`Ready`, `Belum Uji`, `Perbaikan`, `Tidak Aktif`).
