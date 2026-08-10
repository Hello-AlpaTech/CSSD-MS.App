import React, { useState, useEffect } from "react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { 
  Activity, 
  Search, 
  Package, 
  RefreshCw, 
  Box, 
  Flame, 
  CheckCircle2, 
  Clock, 
  Building2, 
  Layers,
  Sparkles
} from "lucide-react";
import { DEMO_KEYS, getDemoData, INITIAL_DEMO_WORKFLOW_LOGS } from "../lib/demoStore";

import { UserProfile } from "../types";

interface OnProcessCSSDProps {
  currentUsername: string;
  isDemoMode?: boolean;
  currentUserProfile?: UserProfile | null;
}

interface ProcessItem {
  id: string;
  idTerima: string;
  unit: string;
  instrumentId: string;
  instrumentName: string;
  type: string;
  qty: number;
  stage: string;
  status: string;
  penyerah: string;
  penerima: string;
  tanggalPenerimaan: any;
  tanggalPenerimaanStr?: string;
  components?: any[];
}

export default function OnProcessCSSD({ currentUsername, isDemoMode = false, currentUserProfile }: OnProcessCSSDProps) {
  const [activeUnit, setActiveUnit] = useState<string>("IGD");
  const [allProcessItems, setAllProcessItems] = useState<ProcessItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const MASTER_UNITS = [
    'IGD', 'IBS/OK', 'ICU', 'HCU', 'R YUDISTIRA', 'PICU', 'NICU', 'R ANJANI', 
    'KEBIDANAN', 'R SRIKANDI', 'R ARJUNA', 'POLI BEDAH', 'POLI GIGI', 
    'POLI OBGYN', 'POLI ANAK', 'POLI BIMA', 'POLI ANTASENA'
  ];

  useEffect(() => {
    if (isDemoMode) {
      const loadDemoData = () => {
        const demoWf = getDemoData(DEMO_KEYS.WORKFLOW_LOGS, INITIAL_DEMO_WORKFLOW_LOGS);
        const parsedItems: ProcessItem[] = [];

        demoWf.forEach((data: any) => {
          if (data.currentStage === 'distributed' || data.currentStage === 'recalled') return;
          const unit = data.decontamination?.sourceUnit || data.asal || 'IGD';
          const idTerima = data.idTerima || data.firestoreDocId || 'TRM-DEMO';
          const stage = data.currentStage || 'decontamination';
          const status = data.status || 'Sedang Diproses';
          const penyerah = data.penyerah || '-';
          const penerima = data.penerima || '-';
          const tgl = data.tanggalPenerimaan || data.createdAtStr || data.createdAt;

          if (data.items && Array.isArray(data.items) && data.items.length > 0) {
            data.items.forEach((item: any, idx: number) => {
              parsedItems.push({
                id: `${idTerima}-${item.instrumentId || idx}`,
                idTerima,
                unit,
                instrumentId: item.instrumentId || data.instrumentId || `INST-00${idx+1}`,
                instrumentName: item.name || item.instrumentName || data.instrumentName || 'Unknown Instrument',
                type: (item.type || 'single').toLowerCase(),
                qty: Number(item.receivedQty || item.qty || 1),
                stage,
                status,
                penyerah,
                penerima,
                tanggalPenerimaan: tgl,
                tanggalPenerimaanStr: data.createdAtStr || data.updatedAtStr,
                components: item.receivedComponents || item.components || []
              });
            });
          } else {
            parsedItems.push({
              id: `${idTerima}-default`,
              idTerima,
              unit,
              instrumentId: data.instrumentId || 'INST-001',
              instrumentName: data.instrumentName || 'Unknown Instrument',
              type: (data.type || 'single').toLowerCase(),
              qty: Number(data.qty || data.totalPcs || 1),
              stage,
              status,
              penyerah,
              penerima,
              tanggalPenerimaan: tgl,
              tanggalPenerimaanStr: data.createdAtStr || data.updatedAtStr
            });
          }
        });

        setAllProcessItems(parsedItems);
        setLoading(false);
      };

      loadDemoData();

      const handleStoreChange = (e: any) => {
        if (!e.detail?.key || e.detail.key === DEMO_KEYS.WORKFLOW_LOGS || e.detail.key === "all") {
          loadDemoData();
        }
      };

      window.addEventListener("cssd_demo_store_change", handleStoreChange);
      return () => window.removeEventListener("cssd_demo_store_change", handleStoreChange);
    }

    const tenantId = currentUserProfile?.tenantId || "RSUD-BENDA";
    const unsubWf = onSnapshot(query(collection(db, "workflow_logs"), where("tenantId", "==", tenantId)), (snap) => {
      const parsedItems: ProcessItem[] = [];

      snap.forEach((docSnap) => {
        const data = docSnap.data() as any;
        if (data.currentStage === 'distributed' || data.currentStage === 'recalled') return;

        const unit = data.decontamination?.sourceUnit || data.asal || 'IGD';
        const idTerima = data.idTerima || docSnap.id;
        const stage = data.currentStage || 'decontamination';
        const status = data.status || 'Sedang Diproses';
        const penyerah = data.penyerah || '-';
        const penerima = data.penerima || '-';
        const tgl = data.tanggalPenerimaan || data.createdAt;

        if (data.items && Array.isArray(data.items) && data.items.length > 0) {
          data.items.forEach((item: any, idx: number) => {
            parsedItems.push({
              id: `${docSnap.id}-${item.instrumentId || idx}`,
              idTerima,
              unit,
              instrumentId: item.instrumentId || data.instrumentId || `INST-00${idx+1}`,
              instrumentName: item.name || item.instrumentName || data.instrumentName || 'Unknown Instrument',
              type: (item.type || 'single').toLowerCase(),
              qty: Number(item.receivedQty || item.qty || 1),
              stage,
              status,
              penyerah,
              penerima,
              tanggalPenerimaan: tgl,
              components: item.receivedComponents || item.components || []
            });
          });
        } else {
          parsedItems.push({
            id: `${docSnap.id}-default`,
            idTerima,
            unit,
            instrumentId: data.instrumentId || 'INST-001',
            instrumentName: data.instrumentName || 'Unknown Instrument',
            type: (data.type || 'single').toLowerCase(),
            qty: Number(data.qty || data.totalPcs || 1),
            stage,
            status,
            penyerah,
            penerima,
            tanggalPenerimaan: tgl
          });
        }
      });

      setAllProcessItems(parsedItems);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, "workflow_logs");
      setLoading(false);
    });

    return () => unsubWf();
  }, [isDemoMode]);

  // Compute stock sum for each unit currently on process
  const unitBadgeCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    MASTER_UNITS.forEach(u => counts[u] = 0);
    allProcessItems.forEach(item => {
      if (counts[item.unit] !== undefined) {
        counts[item.unit] += Number(item.qty || 0);
      } else {
        counts[item.unit] = Number(item.qty || 0);
      }
    });
    return counts;
  }, [allProcessItems]);

  // Total instruments currently being processed in CSSD
  const totalProcessQty = React.useMemo(() => {
    return allProcessItems.reduce((acc, cur) => acc + (cur.qty || 0), 0);
  }, [allProcessItems]);

  // Filter items for selected activeUnit and searchQuery
  const filteredItems = React.useMemo(() => {
    return allProcessItems.filter(item => {
      if (item.unit !== activeUnit) return false;
      const term = searchQuery.toLowerCase().trim();
      if (!term) return true;
      return (
        item.instrumentName.toLowerCase().includes(term) ||
        item.instrumentId.toLowerCase().includes(term) ||
        item.idTerima.toLowerCase().includes(term) ||
        item.penyerah.toLowerCase().includes(term)
      );
    });
  }, [allProcessItems, activeUnit, searchQuery]);

  const formatFirebaseDate = (dateObj: any, dateStr?: string) => {
    if (dateObj) {
      if (dateObj.seconds) {
        return new Date(dateObj.seconds * 1000).toLocaleString("id-ID", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        });
      }
      if (typeof dateObj.toDate === "function") {
        return dateObj.toDate().toLocaleString("id-ID", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        });
      }
      return new Date(dateObj).toLocaleString("id-ID", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
    }
    if (dateStr) {
      return new Date(dateStr).toLocaleString("id-ID", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
    }
    return "-";
  };

  const getStageBadge = (stage: string, status?: string) => {
    const s = (stage || '').toLowerCase();
    if (s === 'decontamination' || s === 'dekontaminasi') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-600" />
          1. Dekontaminasi ({status || 'Pencucian'})
        </span>
      );
    }
    if (s === 'packaging' || s === 'pengemasan') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
          <Box className="w-3.5 h-3.5 text-amber-600" />
          2. Pengemasan ({status || 'Setting & Packing'})
        </span>
      );
    }
    if (s === 'sterilization' || s === 'sterilisasi') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
          <Flame className="w-3.5 h-3.5 text-purple-600" />
          3. Sterilisasi ({status || 'Proses Mesin'})
        </span>
      );
    }
    if (s === 'storage' || s === 'penyimpanan') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          4. Storage Steril ({status || 'Siap Distribusi'})
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
        <Clock className="w-3.5 h-3.5 text-sky-600" />
        Loket Penerimaan ({status || 'Baru Diterima'})
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* HEADER GRADIENT BANNER */}
      <div className="bg-gradient-to-r from-sky-900 via-indigo-900 to-slate-900 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none transform translate-y-4">
          <Activity className="w-64 h-64" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight flex items-center gap-2">
              <Activity className="w-7 h-7 text-sky-400" />
              STOK ON PROSES CSSD
            </h1>
            <p className="text-xs text-sky-100 mt-1 max-w-xl">
              Memantau rincian instrumen kotor yang sedang dalam alur proses CSSD 
              (Penerimaan, Dekontaminasi, Pengemasan, Sterilisasi, Storage) terhubung langsung dengan Unit Asal.
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/10 self-start md:self-auto shrink-0">
            <div className="text-[10px] text-sky-200 uppercase font-bold tracking-wider">Total Instrumen On-Proses CSSD</div>
            <div className="text-3xl font-black mt-1 text-sky-400">
              {totalProcessQty} <span className="text-xs text-white font-medium">Alat / Set</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* SIDEBAR: NAMA INSTALASI */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-4 space-y-3">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest px-2 mb-2 flex items-center justify-between">
            <span>Instalasi / Ruangan</span>
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
          </h2>
          <div className="max-h-[500px] overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {MASTER_UNITS.map((unit) => {
              const count = unitBadgeCounts[unit] || 0;
              const isActive = activeUnit === unit;
              return (
                <button
                  key={unit}
                  onClick={() => setActiveUnit(unit)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left ${
                    isActive
                      ? "bg-sky-50 text-sky-700 border border-sky-100 shadow-sm"
                      : "hover:bg-slate-50 text-slate-600 border border-transparent"
                  }`}
                >
                  <span className="truncate">{unit}</span>
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isActive 
                      ? "bg-sky-500 text-white" 
                      : count > 0 
                      ? "bg-amber-100 text-amber-800" 
                      : "bg-slate-50 text-slate-400"
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* MAIN PANEL: DAFTAR INSTRUMEN ON PROSES */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-sky-500" />
                  Instrumen On-Proses: {activeUnit}
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  Rincian instrumen dari unit {activeUnit} yang sedang berada dalam pengerjaan CSSD
                </p>
              </div>

              {/* SEARCH BAR */}
              <div className="relative w-full sm:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all font-medium"
                  placeholder="Cari alat, ID, atau No Terima..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-500 text-xs font-semibold">
                Memuat data instrumen on-proses CSSD...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Package className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <div className="text-xs font-bold text-slate-500">Tidak ada instrumen sedang diproses untuk unit {activeUnit}</div>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto mt-1">
                  Seluruh instrumen dari {activeUnit} sudah diselesaikan dan didistribusikan kembali ke unit.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-4 w-12">No</th>
                      <th className="py-3 px-4">No. Penerimaan</th>
                      <th className="py-3 px-4">ID Alat</th>
                      <th className="py-3 px-4">Nama Alat / Set</th>
                      <th className="py-3 px-4">Tipe</th>
                      <th className="py-3 px-4 text-center">Jumlah</th>
                      <th className="py-3 px-4">Tahap CSSD Saat Ini</th>
                      <th className="py-3 px-4">Penyerah</th>
                      <th className="py-3 px-4">Tgl Masuk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                    {filteredItems.map((item, index) => {
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-4 text-slate-400 font-mono">{index + 1}</td>
                          <td className="py-3.5 px-4 font-mono font-semibold text-slate-600">{item.idTerima}</td>
                          <td className="py-3.5 px-4 text-sky-600 font-mono font-bold">{item.instrumentId}</td>
                          <td className="py-3.5 px-4">
                            <span className="font-bold text-slate-800">{item.instrumentName}</span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              item.type === 'set' 
                                ? 'bg-indigo-50 text-indigo-600 border border-indigo-100/50' 
                                : 'bg-emerald-50 text-emerald-600 border border-emerald-100/50'
                            }`}>
                              {item.type}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-slate-800 font-bold font-mono">
                              {item.qty}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            {getStageBadge(item.stage, item.status)}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 text-[11px]">
                            {item.penyerah}
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                            {formatFirebaseDate(item.tanggalPenerimaan, item.tanggalPenerimaanStr)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
