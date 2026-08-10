import React, { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Search, Package, ShieldCheck, Calendar, ShieldAlert } from "lucide-react";
import { DEMO_KEYS, getDemoData } from "../lib/demoStore";

import { UserProfile } from "../types";

interface OriginUnitStockProps {
  isDemoMode?: boolean;
  currentUserProfile?: UserProfile | null;
}

interface StockItem {
  id: string;
  unit: string;
  instrumentId: string;
  instrumentName: string;
  qty: number;
  type: string;
  sterilizedAt?: any;
  sterilizedAtStr?: string;
  expiresAt?: any;
  expiresAtStr?: string;
  wrapType?: string;
  lotNumber?: string;
}

export default function OriginUnitStock({ isDemoMode = false, currentUserProfile }: OriginUnitStockProps) {
  const [activeUnit, setActiveUnit] = useState<string>("IGD");
  const [stockList, setStockList] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const MASTER_UNITS = [
    'IGD', 'IBS/OK', 'ICU', 'HCU', 'R YUDISTIRA', 'PICU', 'NICU', 'R ANJANI', 
    'KEBIDANAN', 'R SRIKANDI', 'R ARJUNA', 'POLI BEDAH', 'POLI GIGI', 
    'POLI OBGYN', 'POLI ANAK', 'POLI BIMA', 'POLI ANTASENA'
  ];

  // Load stock for all units to compute badges
  const [allUnitStock, setAllUnitStock] = useState<StockItem[]>([]);
  const [masterInstruments, setMasterInstruments] = useState<any[]>([]);

  useEffect(() => {
    if (isDemoMode) {
      const loadDemo = () => {
        const demoStock = getDemoData(DEMO_KEYS.UNIT_STOCK, []);
        const demoInst = getDemoData(DEMO_KEYS.INSTRUMENTS, []);
        setAllUnitStock(demoStock);
        setMasterInstruments(demoInst);
        const filtered = demoStock.filter((s: any) => s.unit === activeUnit);
        setStockList(filtered);
        setLoading(false);
      };
      loadDemo();

      const handleStoreChange = (e: any) => {
        if (!e.detail?.key || e.detail.key === DEMO_KEYS.UNIT_STOCK || e.detail.key === DEMO_KEYS.INSTRUMENTS || e.detail.key === "all") {
          loadDemo();
        }
      };

      window.addEventListener("cssd_demo_store_change", handleStoreChange);
      return () => window.removeEventListener("cssd_demo_store_change", handleStoreChange);
    } else {
      setLoading(true);
      const tenantId = currentUserProfile?.tenantId || "RSUD-BENDA";
      const q = query(collection(db, "unit_stock"), where("tenantId", "==", tenantId));
      const unsub = onSnapshot(q, (snap) => {
        const list: StockItem[] = [];
        snap.forEach(doc => {
          list.push({ id: doc.id, ...doc.data() } as StockItem);
        });
        setAllUnitStock(list);
        setStockList(list.filter(s => s.unit === activeUnit));
        setLoading(false);
      }, (err) => {
        console.error("Error fetching unit stock:", err);
        setLoading(false);
      });

      const unsubMaster = onSnapshot(query(collection(db, "instruments"), where("tenantId", "==", tenantId)), (snap) => {
        const list: any[] = [];
        snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
        setMasterInstruments(list);
      });

      return () => {
        unsub();
        unsubMaster();
      };
    }
  }, [activeUnit, isDemoMode, currentUserProfile]);

  // Merge unit stock with master data inventory instruments for activeUnit
  const mergedStockList = React.useMemo(() => {
    const result: StockItem[] = [...stockList];
    const existingInstIds = new Set(stockList.map(s => s.instrumentId));

    masterInstruments.forEach((inst: any) => {
      const instId = inst.id || inst.sku;
      if (!instId) return;
      const instUnit = inst.originUnit || 'IGD';
      const isMatchingUnit = instUnit === activeUnit || (instUnit === "OK Sentral" && (activeUnit === "IBS/OK" || activeUnit === "OK Sentral"));

      if (isMatchingUnit && !existingInstIds.has(instId)) {
        result.push({
          id: `master-${instId}`,
          unit: activeUnit,
          instrumentId: instId,
          instrumentName: inst.name,
          qty: inst.totalStock !== undefined ? Number(inst.totalStock) : 1,
          type: inst.type || 'single',
          sterilizedAtStr: new Date().toISOString(),
          expiresAtStr: new Date(Date.now() + (inst.sterileDurationDays || 30) * 86400000).toISOString(),
          wrapType: 'pouch_steril',
          lotNumber: `LOT-${instId}`
        });
        existingInstIds.add(instId);
      }
    });

    return result;
  }, [stockList, masterInstruments, activeUnit]);

  // Compute stock sum for each unit
  const unitBadgeCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    MASTER_UNITS.forEach(u => counts[u] = 0);
    allUnitStock.forEach(item => {
      if (counts[item.unit] !== undefined) {
        counts[item.unit] += Number(item.qty || 0);
      }
    });

    // Add master instruments to badge counts if not in unit_stock
    const trackedPairs = new Set(allUnitStock.map(s => `${s.unit}_${s.instrumentId}`));
    masterInstruments.forEach(inst => {
      const u = inst.originUnit || 'IGD';
      const instId = inst.id || inst.sku;
      if (counts[u] !== undefined && !trackedPairs.has(`${u}_${instId}`)) {
        counts[u] += Number(inst.totalStock ?? 1);
      }
    });

    return counts;
  }, [allUnitStock, masterInstruments]);

  const filteredStock = React.useMemo(() => {
    return mergedStockList.filter(item => {
      if (item.qty <= 0) return false;
      const term = searchQuery.toLowerCase().trim();
      if (!term) return true;
      return (
        item.instrumentName.toLowerCase().includes(term) ||
        item.instrumentId.toLowerCase().includes(term) ||
        (item.lotNumber && item.lotNumber.toLowerCase().includes(term))
      );
    });
  }, [mergedStockList, searchQuery]);

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

  const isExpired = (expiryObj: any, expiryStr?: string) => {
    if (!expiryObj && !expiryStr) return false;
    const expiryTime = expiryObj 
      ? (expiryObj.seconds ? expiryObj.seconds * 1000 : new Date(expiryObj).getTime())
      : new Date(expiryStr!).getTime();
    return expiryTime < Date.now();
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="bg-gradient-to-r from-sky-800 to-indigo-900 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none transform translate-y-4">
          <Package className="w-64 h-64" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight flex items-center gap-2">
              <Package className="w-7 h-7 text-amber-300" />
              STOK DI UNIT ASAL
            </h1>
            <p className="text-xs text-sky-100 mt-1 max-w-xl">
              Memantau ketersediaan instrumen steril yang berada di unit pelayanan. 
              Stok berkurang saat instrumen kotor dikirim kembali ke CSSD, dan bertambah saat distribusi steril selesai dilakukan.
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/10 self-start md:self-auto shrink-0">
            <div className="text-[10px] text-sky-200 uppercase font-bold tracking-wider">Total Instrumen Steril Aktif</div>
            <div className="text-3xl font-black mt-1 text-amber-300">
              {allUnitStock.reduce((acc, cur) => acc + (cur.qty > 0 ? cur.qty : 0), 0)} <span className="text-xs text-white font-medium">Alat</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* SIDEBAR: NAMA INSTALASI */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-4 space-y-3">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest px-2 mb-2">
            Instalasi / Ruangan
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
                      ? "bg-slate-100 text-slate-700" 
                      : "bg-slate-50 text-slate-400"
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* MAIN PANEL: DAFTAR STOK */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  Stok Aktif: {activeUnit}
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  Menampilkan inventaris steril siap pakai untuk unit {activeUnit}
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
                  placeholder="Cari nama atau ID instrumen..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-500 text-xs font-semibold">
                Memuat data stok steril unit...
              </div>
            ) : filteredStock.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Package className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <div className="text-xs font-bold text-slate-500">Tidak ada stok instrumen steril</div>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto mt-1">
                  Seluruh instrumen steril di {activeUnit} telah digunakan atau dikirim ke CSSD untuk rekondisi.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-4 w-12">No</th>
                      <th className="py-3 px-4">ID Alat</th>
                      <th className="py-3 px-4">Nama Alat / Set</th>
                      <th className="py-3 px-4">Tipe</th>
                      <th className="py-3 px-4 text-center">Jumlah</th>
                      <th className="py-3 px-4">Tgl Steril</th>
                      <th className="py-3 px-4">Tgl Expired</th>
                      <th className="py-3 px-4">Packing</th>
                      <th className="py-3 px-4">Lot Number</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                    {filteredStock.map((item, index) => {
                      const expired = isExpired(item.expiresAt, item.expiresAtStr);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-4 text-slate-400 font-mono">{index + 1}</td>
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
                          <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                            {formatFirebaseDate(item.sterilizedAt, item.sterilizedAtStr)}
                          </td>
                          <td className="py-3.5 px-4">
                            {expired ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded">
                                <ShieldAlert className="w-3.5 h-3.5" />
                                Kadaluarsa: {formatFirebaseDate(item.expiresAt, item.expiresAtStr).split(" ")[0]}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded">
                                <Calendar className="w-3.5 h-3.5" />
                                {formatFirebaseDate(item.expiresAt, item.expiresAtStr).split(" ")[0]}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 capitalize text-[11px]">
                            {(item.wrapType || "pouch steril").replace(/_/g, " ")}
                          </td>
                          <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                            {item.lotNumber || "-"}
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
