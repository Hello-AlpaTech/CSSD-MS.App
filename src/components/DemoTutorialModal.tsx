import React, { useState } from "react";
import {
  BookOpen,
  X,
  CheckCircle2,
  ArrowRight,
  LayoutDashboard,
  Inbox,
  Sparkles,
  Layers,
  Box,
  Flame,
  Archive,
  Handshake,
  Activity,
  Package,
  FileText,
  Settings,
  Printer,
  ShieldCheck,
  Zap,
  RotateCcw
} from "lucide-react";

interface DemoTutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab?: (tab: string) => void;
}

export default function DemoTutorialModal({
  isOpen,
  onClose,
  onNavigateTab
}: DemoTutorialModalProps) {
  const [activeTab, setActiveTab] = useState<"alur" | "menu" | "dashboard" | "demo_tips">("alur");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative">
        {/* Header Modal */}
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-sky-500/20 to-emerald-500/20 border border-sky-500/30 rounded-xl text-sky-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-extrabold text-base text-slate-100">Panduan &amp; Penjelasan e-CSSD RSUD Benda</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Modul Demo
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Sistem Informasi Manajemen Rumah Sakit (SIMRS) — Pengelolaan &amp; Pelacakan Sterilisasi Instrumentasi Medis
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Tutup Panduan"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 bg-slate-950/60 border-b border-slate-800 overflow-x-auto shrink-0">
          <button
            onClick={() => setActiveTab("alur")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === "alur"
                ? "border-sky-500 text-sky-400 bg-slate-900/90"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>Alur Kerja Sterilisasi (6 Tahap)</span>
          </button>

          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === "dashboard"
                ? "border-sky-500 text-sky-400 bg-slate-900/90"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Penjelasan Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab("menu")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === "menu"
                ? "border-sky-500 text-sky-400 bg-slate-900/90"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Katalog &amp; Struktur Menu</span>
          </button>

          <button
            onClick={() => setActiveTab("demo_tips")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === "demo_tips"
                ? "border-amber-500 text-amber-400 bg-slate-900/90"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Tips Uji Coba Demo</span>
          </button>
        </div>

        {/* Modal Content Area */}
        <div className="p-6 overflow-y-auto flex-1 text-slate-300 space-y-6">
          {/* TAB 1: ALUR KERJA STERILISASI */}
          {activeTab === "alur" && (
            <div className="space-y-6">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-start gap-3">
                <div className="p-2 bg-sky-500/10 text-sky-400 rounded-lg shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-100">Prinsip Pelacakan Unik (Traceability System)</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Aplikasi e-CSSD RSUD Benda menjamin setiap set/instrumen medis terpantau secara presisi dari mulai serah terima alat kotor hingga pengiriman instrumen steril ke unit peminta (OK, ICU, Poli, dll.).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Tahap 1 */}
                <div className="bg-slate-950/70 border border-slate-800 p-4 rounded-xl relative hover:border-slate-700 transition">
                  <div className="flex items-center justify-between mb-2">
                    <span className="w-7 h-7 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg flex items-center justify-center font-black text-xs">
                      1
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded">
                      Area Kotor
                    </span>
                  </div>
                  <h4 className="font-bold text-slate-100 text-sm flex items-center gap-1.5 mb-1">
                    <Inbox className="w-4 h-4 text-rose-400" />
                    <span>Penerimaan</span>
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed mb-3">
                    Penerimaan alat kotor dari unit (OK, ICU, Poli). Pencatatan tanggal/waktu, nama penyerah, unit asal, foto instrumen, dan konfirmasi jumlah.
                  </p>
                  {onNavigateTab && (
                    <button
                      onClick={() => { onNavigateTab("penerimaan"); onClose(); }}
                      className="text-[11px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 transition cursor-pointer"
                    >
                      <span>Uji Coba Menu</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Tahap 2 */}
                <div className="bg-slate-950/70 border border-slate-800 p-4 rounded-xl relative hover:border-slate-700 transition">
                  <div className="flex items-center justify-between mb-2">
                    <span className="w-7 h-7 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg flex items-center justify-center font-black text-xs">
                      2
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded">
                      Pembersihan
                    </span>
                  </div>
                  <h4 className="font-bold text-slate-100 text-sm flex items-center gap-1.5 mb-1">
                    <Box className="w-4 h-4 text-amber-400" />
                    <span>Dekontaminasi</span>
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed mb-3">
                    Proses perendaman enzimatik, pencucian (Manual, Washer Disinfector, atau Ultrasonik), pembilasan air RO, dan pengeringan alat.
                  </p>
                  {onNavigateTab && (
                    <button
                      onClick={() => { onNavigateTab("dekor"); onClose(); }}
                      className="text-[11px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 transition cursor-pointer"
                    >
                      <span>Uji Coba Menu</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Tahap 3 */}
                <div className="bg-slate-950/70 border border-slate-800 p-4 rounded-xl relative hover:border-slate-700 transition">
                  <div className="flex items-center justify-between mb-2">
                    <span className="w-7 h-7 bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-lg flex items-center justify-center font-black text-xs">
                      3
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-sky-400 font-bold bg-sky-500/10 px-2 py-0.5 rounded">
                      Area Bersih
                    </span>
                  </div>
                  <h4 className="font-bold text-slate-100 text-sm flex items-center gap-1.5 mb-1">
                    <Package className="w-4 h-4 text-sky-400" />
                    <span>Pengemasan &amp; Resi</span>
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed mb-3">
                    Inspeksi kelayakan fungsi/kebersihan, perakitan set, pembungkusan pouch/kain, dan pencetakan stiker barcode/QR resi thermal 57mm.
                  </p>
                  {onNavigateTab && (
                    <button
                      onClick={() => { onNavigateTab("packaging"); onClose(); }}
                      className="text-[11px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 transition cursor-pointer"
                    >
                      <span>Uji Coba Menu</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Tahap 4 */}
                <div className="bg-slate-950/70 border border-slate-800 p-4 rounded-xl relative hover:border-slate-700 transition">
                  <div className="flex items-center justify-between mb-2">
                    <span className="w-7 h-7 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-lg flex items-center justify-center font-black text-xs">
                      4
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded">
                      Mesin Sterilizer
                    </span>
                  </div>
                  <h4 className="font-bold text-slate-100 text-sm flex items-center gap-1.5 mb-1">
                    <Flame className="w-4 h-4 text-indigo-400" />
                    <span>Sterilisasi</span>
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed mb-3">
                    Pemilihan mesin (Buma Vacum, BES Autoclave, Plasma Stera 120), mode suhu, nomor batch/siklus, serta pencatatan indikator Biologi &amp; Kimia.
                  </p>
                  {onNavigateTab && (
                    <button
                      onClick={() => { onNavigateTab("sterilization"); onClose(); }}
                      className="text-[11px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 transition cursor-pointer"
                    >
                      <span>Uji Coba Menu</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Tahap 5 */}
                <div className="bg-slate-950/70 border border-slate-800 p-4 rounded-xl relative hover:border-slate-700 transition">
                  <div className="flex items-center justify-between mb-2">
                    <span className="w-7 h-7 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg flex items-center justify-center font-black text-xs">
                      5
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">
                      Area Steril
                    </span>
                  </div>
                  <h4 className="font-bold text-slate-100 text-sm flex items-center gap-1.5 mb-1">
                    <Archive className="w-4 h-4 text-emerald-400" />
                    <span>Penyimpanan</span>
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed mb-3">
                    Penyimpanan barang steril di rak khusus (scan QR Rak), monitoring batas kadaluarsa (expired date), dan penerapan aturan rotasi FIFO.
                  </p>
                  {onNavigateTab && (
                    <button
                      onClick={() => { onNavigateTab("storage"); onClose(); }}
                      className="text-[11px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 transition cursor-pointer"
                    >
                      <span>Uji Coba Menu</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Tahap 6 */}
                <div className="bg-slate-950/70 border border-slate-800 p-4 rounded-xl relative hover:border-slate-700 transition">
                  <div className="flex items-center justify-between mb-2">
                    <span className="w-7 h-7 bg-teal-500/20 text-teal-400 border border-teal-500/30 rounded-lg flex items-center justify-center font-black text-xs">
                      6
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-teal-400 font-bold bg-teal-500/10 px-2 py-0.5 rounded">
                      Serah Terima
                    </span>
                  </div>
                  <h4 className="font-bold text-slate-100 text-sm flex items-center gap-1.5 mb-1">
                    <Handshake className="w-4 h-4 text-teal-400" />
                    <span>Distribusi &amp; Serah Terima</span>
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed mb-3">
                    Penyerahan instrumen steril kepada petugas unit pengguna (OK, ICU, Poliklinik) yang dilengkapi fitur Tanda Tangan Digital (TTE) penerima langsung di layar.
                  </p>
                  {onNavigateTab && (
                    <button
                      onClick={() => { onNavigateTab("distribution"); onClose(); }}
                      className="text-[11px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 transition cursor-pointer"
                    >
                      <span>Uji Coba Menu</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PENJELASAN DASHBOARD */}
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <LayoutDashboard className="w-5 h-5 text-sky-400" />
                    <h3 className="font-bold text-slate-100 text-sm">Fitur Utama &amp; Indikator Pada Dashboard</h3>
                  </div>
                  {onNavigateTab && (
                    <button
                      onClick={() => { onNavigateTab("dashboard"); onClose(); }}
                      className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs py-1 px-3 rounded-lg transition cursor-pointer"
                    >
                      Buka Dashboard
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-900 p-3.5 rounded-lg border border-slate-800">
                    <h4 className="font-bold text-xs text-sky-400 mb-1">1. Metric Cards (KPI Real-Time)</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Menampilkan statistik instrumen masuk hari ini, total set steril siap pakai, permintaan pending dari unit, serta status operasional mesin sterilisasi.
                    </p>
                  </div>

                  <div className="bg-slate-900 p-3.5 rounded-lg border border-slate-800">
                    <h4 className="font-bold text-xs text-amber-400 mb-1">2. Grafik Siklus Sterilisasi</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Visualisasi grafik tren pemrosesan mingguan/bulanan berdasarkan jenis mesin (Buma Vacum 121°C–134°C, BES Autoclave, &amp; Plasma Stera 120).
                    </p>
                  </div>

                  <div className="bg-slate-900 p-3.5 rounded-lg border border-slate-800">
                    <h4 className="font-bold text-xs text-emerald-400 mb-1">3. Monitoring Ruangan CSSD</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Pencatatan indikator lingkungan: Suhu (°C), Kelembaban (%), dan Tekanan Udara di Area Kotor, Area Bersih, &amp; Ruang Penyimpanan Steril.
                    </p>
                  </div>

                  <div className="bg-slate-900 p-3.5 rounded-lg border border-slate-800">
                    <h4 className="font-bold text-xs text-indigo-400 mb-1">4. Ringkasan Antrian Berjalan</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Pantau posisi terdepan instrumen yang sedang diproses di area Dekontaminasi, Packing, Sterilisasi, hingga Siap Kirim.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: KATALOG & STRUKTUR MENU */}
          {activeTab === "menu" && (
            <div className="space-y-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <h3 className="font-bold text-sm text-slate-100 mb-3 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-400" />
                  <span>Struktur Seluruh Menu Navigasi Modul e-CSSD</span>
                </h3>

                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-3 p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                    <LayoutDashboard className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-200">Dashboard:</span>
                      <span className="text-slate-400 ml-1.5">Pusat kendali monitoring grafik, statistik, dan kondisi fisik lingkungan CSSD.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                    <Activity className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-200">Alur On-Process:</span>
                      <span className="text-slate-400 ml-1.5">Peta status posisi instrumen real-time dari 6 tahapan secara menyeluruh.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                    <Inbox className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-200">Penerimaan &amp; Dekontaminasi:</span>
                      <span className="text-slate-400 ml-1.5">Mencatat kedatangan barang kotor dari IBS/OK, HCU, ICU, PICU, NICU, IGD, &amp; 10+ Poliklinik.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                    <Package className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-200">Pengemasan (Packing) &amp; Resi Thermal:</span>
                      <span className="text-slate-400 ml-1.5">Perakitan set, pemasangan indikator, &amp; cetak label resi thermal 57mm (Bluetooth/USB PC).</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                    <Flame className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-200">Sterilisasi &amp; Pilihan Mesin:</span>
                      <span className="text-slate-400 ml-1.5">Mendukung BUMA STERILIZER VACUM (Solid/Dressing/Rubber), BES AUTOCLAVE (Mode 1-4/Flash), &amp; PLASMA STERA 120 (Short/Long/Endo).</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                    <Archive className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-200">Penyimpanan Steril &amp; Distribusi:</span>
                      <span className="text-slate-400 ml-1.5">Manajemen rak penyimpanan, kontrol masa kadaluarsa (expired date), &amp; serah terima alat dengan TTE.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                    <Box className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-200">Inventaris &amp; Katalog Alat:</span>
                      <span className="text-slate-400 ml-1.5">Pendataan Master Instrumen (Set &amp; Single Item), foto alat, master BMHP, &amp; daftar unit/instalasi.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                    <FileText className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-200">Log Aktivitas &amp; Laporan Audit:</span>
                      <span className="text-slate-400 ml-1.5">Histori komprehensif seluruh transaksi sterilisasi untuk kebutuhan akreditasi rumah sakit.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                    <Settings className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-200">Pengaturan &amp; Hak Akses:</span>
                      <span className="text-slate-400 ml-1.5">Kelola akun petugas, peran (Admin, Operator, Supervisor), lisensi aplikasi, &amp; pengaturan thermal printer.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: TIPS UJI COBA DEMO */}
          {activeTab === "demo_tips" && (
            <div className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl text-amber-200 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-300 text-sm">
                  <Sparkles className="w-4 h-4" />
                  <span>Petunjuk Penting Mode Demo</span>
                </div>
                <p className="leading-relaxed">
                  Dalam Mode Demo ini, Anda bebas mencoba seluruh fitur e-CSSD RSUD Benda tanpa perlu login akun Google dan tanpa risiko merusak data produksi rumah sakit.
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-slate-100">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Langkah Simulasi Praktis:</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 text-slate-300 pl-1">
                    <li>Pindah ke tab <strong>Penerimaan</strong>, lalu coba klik <strong>"+ Terima Instrumen Kotor"</strong> untuk menambahkan instrumen kotor baru.</li>
                    <li>Lihat instrumen yang baru dimasukkan masuk ke antrian <strong>Dekontaminasi</strong> dan <strong>Pengemasan</strong>.</li>
                    <li>Uji coba cetak <strong>Resi Thermal 57mm</strong> di menu Pengemasan.</li>
                    <li>Ganti Peran Pengguna pada menu pojok kanan atas antara <strong>Admin</strong>, <strong>Operator</strong>, dan <strong>Supervisor</strong> untuk melihat perbedaan tampilan.</li>
                    <li>Gunakan tombol <strong>"Reset Data"</strong> di header atas kapan saja jika ingin mengembalikan kondisi antrian demo ke kondisi awal.</li>
                  </ol>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-100 text-sm">Siap Mencoba Simulasi?</h4>
                    <p className="text-xs text-slate-400 mt-0.5">Tutup panduan ini dan mulailah mencoba fitur e-CSSD.</p>
                  </div>
                  <button
                    onClick={onClose}
                    className="bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 text-white font-bold py-2 px-5 rounded-xl text-xs transition cursor-pointer shadow-lg"
                  >
                    Mulai Eksplorasi Demo
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Modal */}
        <div className="bg-slate-950 px-6 py-3 border-t border-slate-800 flex items-center justify-between shrink-0 text-xs">
          <div className="text-slate-500 flex items-center gap-1.5">
            <Printer className="w-3.5 h-3.5" />
            <span>Mendukung Cetak Thermal 57mm (USB/Bluetooth) &amp; Akses Multi-Device</span>
          </div>
          <button
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-1.5 px-4 rounded-lg transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
