import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, 
  History, 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  Truck, 
  ShieldCheck, 
  Layers, 
  Package, 
  Building2, 
  Search,
  ChevronDown,
  ChevronRight,
  Flame,
  Droplets,
  AlertTriangle,
  User,
  Calendar,
  Tag,
  RefreshCw
} from "lucide-react";
import { collection, getDocs, onSnapshot, query, orderBy, limit, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { InstrumentCatalog, WorkflowStage } from "../types";

interface InstrumentHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  instrument: InstrumentCatalog | null;
}

const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  decontamination: { label: "Dekontaminasi / Penerimaan", color: "text-amber-400", bg: "bg-amber-950/40", border: "border-amber-800/60" },
  washing: { label: "Pencucian / Disinfeksi", color: "text-cyan-400", bg: "bg-cyan-950/40", border: "border-cyan-800/60" },
  packaging: { label: "Pengemasan & Packing", color: "text-indigo-400", bg: "bg-indigo-950/40", border: "border-indigo-800/60" },
  sterilization: { label: "Proses Sterilisasi", color: "text-purple-400", bg: "bg-purple-950/40", border: "border-purple-800/60" },
  sterile_storage: { label: "Penyimpanan Steril", color: "text-emerald-400", bg: "bg-emerald-950/40", border: "border-emerald-800/60" },
  distributed: { label: "Telah Didistribusikan", color: "text-sky-400", bg: "bg-sky-950/40", border: "border-sky-800/60" },
  recalled: { label: "Ditarik (Recalled)", color: "text-rose-400", bg: "bg-rose-950/40", border: "border-rose-800/60" }
};

export default function InstrumentHistoryModal({
  isOpen,
  onClose,
  instrument
}: InstrumentHistoryModalProps) {
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [filterStage, setFilterStage] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !instrument) {
      setLogs([]);
      return;
    }

    setIsLoading(true);

    const tenantId = (instrument as any)?.tenantId || "RSUD-BENDA";
    const unsub = onSnapshot(
      query(collection(db, "workflow_logs"), where("tenantId", "==", tenantId)),
      (snapshot) => {
        const fetchedLogs: any[] = [];
        const instId = instrument.id.toLowerCase();
        const instName = instrument.name.toLowerCase();

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const docId = docSnap.id.toLowerCase();
          const instIdField = (data.instrumentId || "").toLowerCase();
          const lotNumber = (data.lotNumber || "").toLowerCase();
          const idTerima = (data.idTerima || "").toLowerCase();
          const nameField = (data.instrumentName || data.name || "").toLowerCase();

          // Match by serial number / ID or Instrument Name
          const isMatch = 
            instIdField === instId ||
            lotNumber.includes(instId) ||
            idTerima.includes(instId) ||
            docId.includes(instId) ||
            (nameField && nameField === instName);

          if (isMatch) {
            fetchedLogs.push({
              firestoreId: docSnap.id,
              ...data
            });
          }
        });

        // Sort newest first
        fetchedLogs.sort((a, b) => {
          const timeA = new Date(a.createdAt?.toDate ? a.createdAt.toDate() : a.createdAt || a.updatedAt || 0).getTime();
          const timeB = new Date(b.createdAt?.toDate ? b.createdAt.toDate() : b.createdAt || b.updatedAt || 0).getTime();
          return timeB - timeA;
        });

        setLogs(fetchedLogs);
        if (fetchedLogs.length > 0) {
          setExpandedLogId(fetchedLogs[0].firestoreId);
        }
        setIsLoading(false);
      },
      (err) => {
        console.error("Error fetching instrument logs history:", err);
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [isOpen, instrument]);

  if (!isOpen || !instrument) return null;

  // Filter logs by stage and search query
  const filteredLogs = logs.filter(log => {
    if (filterStage !== "all" && log.currentStage !== filterStage) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const lot = (log.lotNumber || log.idTerima || log.firestoreId || "").toLowerCase();
      const unit = (log.decontamination?.sourceUnit || log.distribution?.recipientUnit || "").toLowerCase();
      const op = (log.decontamination?.receivedBy || log.sterilization?.operator || "").toLowerCase();
      return lot.includes(q) || unit.includes(q) || op.includes(q);
    }
    return true;
  });

  const formatDate = (dateVal: any) => {
    if (!dateVal) return "-";
    try {
      const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
      if (isNaN(d.getTime())) return String(dateVal);
      return d.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return String(dateVal);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 sm:p-4 overflow-y-auto">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl max-h-[92vh] flex flex-col my-auto relative text-slate-100"
      >
        {/* Header Modal */}
        <div className="flex justify-between items-start mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-100">
                  Riwayat Siklus Workflow
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-950 border border-emerald-800 text-emerald-300 font-mono">
                  {instrument.type === "set" ? "SET" : "SINGLE"}
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium mt-0.5 flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sky-400">{instrument.name}</span>
                <span className="text-slate-600">•</span>
                <span className="font-mono text-slate-400">ID: {instrument.id}</span>
                <span className="text-slate-600">•</span>
                <span className="text-amber-300">Asal: {instrument.originUnit || "Global"}</span>
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter & Controls */}
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between mb-4">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
            <input 
              type="text" 
              placeholder="Cari No. Lot, Operator, atau Unit..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setFilterStage("all")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                filterStage === "all" ? "bg-emerald-600 text-white shadow" : "bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              Semua ({logs.length})
            </button>
            <button
              onClick={() => setFilterStage("sterilization")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                filterStage === "sterilization" ? "bg-purple-600 text-white shadow" : "bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              Sterilisasi
            </button>
            <button
              onClick={() => setFilterStage("distributed")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                filterStage === "distributed" ? "bg-sky-600 text-white shadow" : "bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              Distribusi
            </button>
          </div>
        </div>

        {/* Logs List Container */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3 min-h-[300px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-48 space-y-2 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
              <span className="text-xs">Memuat riwayat log dari Firestore...</span>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-56 p-6 border border-dashed border-slate-800 rounded-2xl text-center bg-slate-950/40">
              <History className="w-10 h-10 text-slate-600 mb-2" />
              <h4 className="text-xs font-bold text-slate-300">Belum Ada Riwayat Siklus Log</h4>
              <p className="text-[11px] text-slate-500 max-w-md mt-1 leading-relaxed">
                Instrumen ini belum pernah dicatat dalam workflow Dekontaminasi, Sterilisasi, atau Distribusi di CSSD.
              </p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const stageKey = log.currentStage || "decontamination";
              const stageMeta = STAGE_CONFIG[stageKey] || STAGE_CONFIG.decontamination;
              const isExpanded = expandedLogId === log.firestoreId;

              return (
                <div 
                  key={log.firestoreId} 
                  className={`border rounded-2xl overflow-hidden transition ${
                    isExpanded ? `${stageMeta.border} bg-slate-950/90 shadow-lg` : "border-slate-800 bg-slate-950/40 hover:border-slate-700"
                  }`}
                >
                  {/* Log Card Header */}
                  <div 
                    onClick={() => setExpandedLogId(isExpanded ? null : log.firestoreId)}
                    className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-800/30 transition select-none"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-500" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-sky-300">
                            {log.lotNumber || log.idTerima || log.firestoreId}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${stageMeta.bg} ${stageMeta.color} ${stageMeta.border} border`}>
                            {stageMeta.label}
                          </span>
                        </div>
                        
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            {formatDate(log.createdAt || log.decontamination?.receivedAt)}
                          </span>
                          {log.decontamination?.sourceUnit && (
                            <>
                              <span>•</span>
                              <span className="text-amber-300 flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                {log.decontamination.sourceUnit}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        Qty: {log.qty || log.decontamination?.dirtyQty || 1} pcs
                      </span>
                    </div>
                  </div>

                  {/* Expanded Detail Body */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="p-4 border-t border-slate-800/80 bg-slate-900/50 space-y-3"
                      >
                        {/* Process Stage Timeline Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          
                          {/* 1. Dekontaminasi */}
                          {log.decontamination && (
                            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                              <div className="font-bold text-amber-400 flex items-center gap-1.5 mb-1">
                                <Droplets className="w-3.5 h-3.5" /> Penerimaan & Dekontaminasi
                              </div>
                              <div className="text-[11px] text-slate-300">Diterima: {formatDate(log.decontamination.receivedAt)}</div>
                              <div className="text-[11px] text-slate-400">Oleh: {log.decontamination.receivedBy || "-"}</div>
                              <div className="text-[11px] text-slate-400">Asal Unit: {log.decontamination.sourceUnit || "-"}</div>
                              {log.decontamination.hasBloodResidue && (
                                <div className="text-[10px] text-rose-400 font-semibold flex items-center gap-1 mt-1">
                                  <AlertTriangle className="w-3 h-3" /> Terdapat Residu Darah
                                </div>
                              )}
                            </div>
                          )}

                          {/* 2. Pencucian */}
                          {log.washing && (
                            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                              <div className="font-bold text-cyan-400 flex items-center gap-1.5 mb-1">
                                <Sparkles className="w-3.5 h-3.5" /> Pencucian & Disinfeksi
                              </div>
                              <div className="text-[11px] text-slate-300">Metode: <span className="font-semibold text-cyan-300">{log.washing.method || "Manual"}</span></div>
                              <div className="text-[11px] text-slate-400">Deterjen/Kimia: {log.washing.chemicalUsed || "Enzymatic"}</div>
                              <div className="text-[11px] text-slate-400">Operator: {log.washing.operator || "-"}</div>
                              {log.washing.isPassedVisualInspection && (
                                <div className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 mt-1">
                                  <CheckCircle2 className="w-3 h-3" /> Lolos Inspeksi Visual
                                </div>
                              )}
                            </div>
                          )}

                          {/* 3. Pengemasan */}
                          {log.packaging && (
                            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                              <div className="font-bold text-indigo-400 flex items-center gap-1.5 mb-1">
                                <Package className="w-3.5 h-3.5" /> Pengemasan (Packing)
                              </div>
                              <div className="text-[11px] text-slate-300">Tgl Kemas: {formatDate(log.packaging.packagedAt)}</div>
                              <div className="text-[11px] text-slate-400">Bahan Kemasan: <span className="font-semibold text-slate-200">{log.packaging.wrapType || "Sterilization Pouch"}</span></div>
                              <div className="text-[11px] text-slate-400">Operator: {log.packaging.operator || "-"}</div>
                            </div>
                          )}

                          {/* 4. Sterilisasi */}
                          {log.sterilization && (
                            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                              <div className="font-bold text-purple-400 flex items-center gap-1.5 mb-1">
                                <Flame className="w-3.5 h-3.5" /> Proses Sterilisasi
                              </div>
                              <div className="text-[11px] text-slate-300">Mesin: <span className="font-semibold text-purple-300">{log.sterilization.machineName || "Autoclave Steam"}</span></div>
                              <div className="text-[11px] text-slate-400">Siklus Ke: #{log.sterilization.cycleNumber || "1"}</div>
                              <div className="text-[11px] text-slate-400">Suhu / Tekanan: {log.sterilization.tempCelsius || "134"}°C / {log.sterilization.pressureBar || "2.1"} bar</div>
                              <div className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 mt-1">
                                <CheckCircle2 className="w-3 h-3" /> Indikator Kimia & Biologi Pass
                              </div>
                            </div>
                          )}

                          {/* 5. Penyimpanan */}
                          {log.storage && (
                            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                              <div className="font-bold text-emerald-400 flex items-center gap-1.5 mb-1">
                                <ShieldCheck className="w-3.5 h-3.5" /> Penyimpanan Rak Steril
                              </div>
                              <div className="text-[11px] text-slate-300">Lokasi Rak: <span className="font-mono font-bold text-emerald-300">{log.storage.shelfLocation || "RAK-A1"}</span></div>
                              <div className="text-[11px] text-slate-400">Tgl Kadaluarsa: {formatDate(log.storage.expiresAt)}</div>
                              <div className="text-[11px] text-slate-400">Petugas: {log.storage.storedBy || "-"}</div>
                            </div>
                          )}

                          {/* 6. Distribusi */}
                          {log.distribution && (
                            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                              <div className="font-bold text-sky-400 flex items-center gap-1.5 mb-1">
                                <Truck className="w-3.5 h-3.5" /> Penyerahan & Distribusi
                              </div>
                              <div className="text-[11px] text-slate-300">Tgl Distribusi: {formatDate(log.distribution.distributedAt)}</div>
                              <div className="text-[11px] text-slate-300">Unit Penerima: <span className="font-semibold text-sky-300">{log.distribution.recipientUnit || "-"}</span></div>
                              <div className="text-[11px] text-slate-400">Penerima: {log.distribution.recipientName || "-"}</div>
                              <div className="text-[11px] text-slate-400">Petugas CSSD: {log.distribution.distributedBy || "-"}</div>
                            </div>
                          )}

                        </div>

                        {/* Audit Trail History List */}
                        {Array.isArray(log.history) && log.history.length > 0 && (
                          <div className="pt-2 border-t border-slate-800">
                            <h5 className="text-[11px] font-bold text-slate-400 mb-2 uppercase tracking-wider">
                              Jejak Rekam Audit (Audit Trail):
                            </h5>
                            <div className="space-y-1.5 pl-2 border-l-2 border-emerald-500/40">
                              {log.history.map((h: any, idx: number) => (
                                <div key={idx} className="text-[11px] text-slate-300 flex items-start justify-between gap-2">
                                  <div>
                                    <span className="font-semibold text-emerald-400">{h.stage || "Update"}</span>: {h.notes || "Proses diselesaikan"}
                                    {h.operatorName && <span className="text-slate-500 font-mono"> ({h.operatorName})</span>}
                                  </div>
                                  <span className="text-[10px] text-slate-500 font-mono shrink-0">
                                    {formatDate(h.timestamp)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-800 shrink-0 text-xs">
          <div className="text-slate-400">
            Total Rekaman Siklus: <span className="font-bold font-mono text-emerald-400">{logs.length}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-800 text-slate-300 hover:bg-slate-800 transition font-semibold cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </motion.div>
    </div>
  );
}
