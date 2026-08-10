import React, { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  getDoc, 
  query, 
  where,
  writeBatch
} from "firebase/firestore";
import { 
  RotateCcw, 
  AlertTriangle, 
  Search, 
  ShieldAlert, 
  CheckCircle2, 
  RefreshCw, 
  User, 
  Building2, 
  FileText, 
  Plus, 
  X,
  Send,
  Check
} from "lucide-react";
import { writeAuditLog } from "../lib/auditLogger";
import { triggerActionConfirm } from "../lib/actionToast";
import { UserProfile } from "../types";
import { requireTenantId } from "../lib/permissions";

interface Props {
  currentUsername: string;
  currentRole?: string;
  currentUserProfile?: UserProfile | null;
  isDemoMode?: boolean;
}

export interface RecallRecord {
  id: string; // Recall Log ID, e.g. RCL-20260804-001
  instrumentId: string;
  instrumentName: string;
  lotNumber?: string;
  originUnit: string;
  reason: string;
  status: "RECALL_INITIATED" | "RETURN_REQUESTED" | "HELD_IN_CSSD" | "RESOLVED";
  initiatedBy: string;
  initiatedAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionNotes?: string;
  tenantId?: string;
}

export default function RecallModule({ currentUsername, currentRole = "admin", currentUserProfile = null, isDemoMode = false }: Props) {
  const [recalls, setRecalls] = useState<RecallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Modal State
  const [isNewRecallOpen, setIsNewRecallOpen] = useState(false);
  const [recallType, setRecallType] = useState<"SINGLE_INSTRUMENT" | "BATCH_LOT">("SINGLE_INSTRUMENT");
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  const [scannedDetail, setScannedDetail] = useState<any | null>(null);

  useEffect(() => {
    setLoading(true);
    const tenantId = currentUserProfile?.tenantId || "RSUD-BENDA";
    const unsub = onSnapshot(query(collection(db, "recall_logs"), where("tenantId", "==", tenantId)), (snap) => {
      const list: RecallRecord[] = [];
      snap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as RecallRecord);
      });
      setRecalls(list);
      setLoading(false);
    }, (err) => {
      console.warn("Snapshot recall_logs error:", err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleLookupTarget = async (idVal: string) => {
    if (!idVal.trim()) {
      setScannedDetail(null);
      return;
    }
    const cleanId = idVal.trim().toUpperCase();
    try {
      const lsSnap = await getDoc(doc(db, "instrument_live_state", cleanId));
      if (lsSnap.exists()) {
        const data = lsSnap.data();
        setScannedDetail({
          id: cleanId,
          name: data.instrumentName || cleanId,
          currentState: data.currentState || "READY",
          currentLocation: data.currentLocation || "CSSD",
          originUnit: data.originUnit || "CSSD"
        });
      } else {
        const mSnap = await getDoc(doc(db, "master_instruments", cleanId));
        if (mSnap.exists()) {
          const data = mSnap.data();
          setScannedDetail({
            id: cleanId,
            name: data.name || cleanId,
            currentState: "READY",
            currentLocation: data.originUnit || "CSSD",
            originUnit: data.originUnit || "CSSD"
          });
        } else {
          setScannedDetail({
            id: cleanId,
            name: "ID / Lot Number Tidak Ditemukan",
            currentState: "-",
            currentLocation: "-",
            originUnit: "-"
          });
        }
      }
    } catch (e) {
      console.error("Lookup recall target error:", e);
    }
  };

  const handleExecuteRecall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetId.trim()) {
      alert("Masukkan ID Instrumen atau Nomor Lot!");
      return;
    }
    if (!reason.trim()) {
      alert("Alasan recall wajib diisi!");
      return;
    }

    const cleanTarget = targetId.trim().toUpperCase();
    const nowISO = new Date().toISOString();
    const rclId = `RCL-${Date.now()}`;

    try {
      // Rule Recall:
      // Check location of instrument
      let currentLoc = scannedDetail ? scannedDetail.currentLocation : "CSSD";
      let isInCSSD = currentLoc.includes("CSSD") || currentLoc.includes("RAK");

      let initialRecallStatus: "HELD_IN_CSSD" | "RETURN_REQUESTED" = isInCSSD ? "HELD_IN_CSSD" : "RETURN_REQUESTED";

      const batch = writeBatch(db);

      // If in CSSD -> place instrument condition on TAHAN in KARANTINA_CSSD
      if (isInCSSD) {
        const stage = scannedDetail && scannedDetail.currentState !== "HOLD" ? scannedDetail.currentState : "SIAP";
        const lsRef = doc(db, "instrument_live_state", cleanTarget);
        batch.set(lsRef, {
          statusAlur: stage,
          currentState: stage,
          kondisi: "TAHAN",
          currentLocation: "KARANTINA_CSSD",
          currentHolder: "CSSD",
          holdReason: "RECALL",
          holdNotes: `RECALL: ${reason}`,
          updatedAt: nowISO
        }, { merge: true });
      } else {
        // At unit -> mark condition RECALL_REQUESTED
        const stage = scannedDetail ? scannedDetail.currentState : "DIDISTRIBUSIKAN";
        const lsRef = doc(db, "instrument_live_state", cleanTarget);
        batch.set(lsRef, {
          statusAlur: stage,
          currentState: stage,
          kondisi: "RECALL_REQUESTED",
          holdReason: "RECALL",
          holdNotes: `MOHON DIKEMBALIKAN KE CSSD (RECALL): ${reason}`,
          updatedAt: nowISO
        }, { merge: true });
      }

      const activeTenantId = (() => {
        try {
          return requireTenantId(currentUserProfile);
        } catch (e) {
          return currentUserProfile?.tenantId || scannedDetail?.tenantId || "";
        }
      })();

      // Save to recall_logs
      const newRecallDoc: RecallRecord = {
        id: rclId,
        instrumentId: cleanTarget,
        instrumentName: scannedDetail ? scannedDetail.name : cleanTarget,
        originUnit: scannedDetail ? scannedDetail.originUnit : "CSSD",
        reason: reason,
        status: initialRecallStatus,
        initiatedBy: currentUsername,
        initiatedAt: nowISO,
        tenantId: activeTenantId
      };

      const recallRef = doc(db, "recall_logs", rclId);
      batch.set(recallRef, newRecallDoc);

      await batch.commit();

      // Write Audit Log
      await writeAuditLog({
        tenantId: activeTenantId,
        module: "RECALL",
        action: "RECALL_INITIATED",
        entityType: "RECALL",
        entityId: rclId,
        instrumentId: cleanTarget,
        beforeState: scannedDetail ? scannedDetail.currentState : "-",
        afterState: isInCSSD ? "HOLD" : "RECALL_REQUESTED",
        beforeLocation: currentLoc,
        afterLocation: isInCSSD ? "KARANTINA_CSSD" : currentLoc,
        reason: `Initiated Recall: ${reason}`,
        userName: currentUsername,
        userRole: currentRole.toUpperCase()
      });

      triggerActionConfirm({
        title: "Penarikan Alat (Recall) Berhasil",
        message: isInCSSD 
          ? `Alat ${cleanTarget} berada di CSSD dan langsung dipindahkan ke KARANTINA_CSSD.` 
          : `Alat ${cleanTarget} berada di unit ${currentLoc}. Permintaan pengembalian recall telah terdaftar.`,
        type: "warning"
      });

      setIsNewRecallOpen(false);
      setTargetId("");
      setReason("");
      setScannedDetail(null);
    } catch (err: any) {
      console.error("Execute recall error:", err);
      alert("Gagal memproses recall: " + err.message);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Title */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-slate-900/80 p-5 rounded-2xl border border-amber-900/40 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-amber-950/80 border border-amber-700/60 rounded-xl text-amber-400 shadow-inner">
            <RotateCcw className="w-6 h-6 animate-spin-slow" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white tracking-wide flex items-center gap-2">
              Modul Penarikan Alat (Recall Management)
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Penarikan selektif per ID Instrumen / Batch Sterilisasi tanpa mempengaruhi instrumen lain dalam lot yang sama.
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsNewRecallOpen(true)}
          className="px-4 py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold text-xs rounded-xl shadow-lg shadow-amber-950/50 flex items-center gap-2 transition cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Buat Perintah Recall</span>
        </button>
      </div>

      {/* Rules Notice */}
      <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-300 space-y-1.5">
        <div className="font-bold text-amber-400 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4" />
          <span>Aturan Spesifikasi Recall (Locked Specification):</span>
        </div>
        <p className="text-slate-400 text-[11px] leading-relaxed">
          Recall dapat berlaku terhadap <strong>1 atau beberapa ID Instrumen secara spesifik</strong>, bukan otomatis seluruh ID Penerimaan. 
          Jika alat masih berada di CSSD, alat langsung masuk kondisi HOLD di Karantina. Jika alat sudah di instalasi (IGD/OK), unit wajib melakukan pengembalian ke CSSD untuk alur penerimaan ulang.
        </p>
      </div>

      {/* Recall Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
            <span className="text-xs">Memuat daftar recall instrumen...</span>
          </div>
        ) : recalls.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-500/40 mx-auto" />
            <p className="text-sm font-semibold text-slate-300">Tidak Ada Perintah Recall Aktif</p>
            <p className="text-xs text-slate-500">Seluruh instrumen steril yang terdistribusi berjalan dalam kondisi normal.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="p-3.5">ID Recall</th>
                  <th className="p-3.5">ID Instrumen Target</th>
                  <th className="p-3.5">Nama Alat</th>
                  <th className="p-3.5">Alasan Recall</th>
                  <th className="p-3.5">Status Penarikan</th>
                  <th className="p-3.5">Inisiator & Waktu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {recalls.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-3.5 font-mono text-slate-400">{item.id}</td>
                    <td className="p-3.5 font-mono font-bold text-amber-300">{item.instrumentId}</td>
                    <td className="p-3.5 font-medium text-slate-200">{item.instrumentName}</td>
                    <td className="p-3.5 italic text-slate-300">"{item.reason}"</td>
                    <td className="p-3.5">
                      {item.status === "HELD_IN_CSSD" ? (
                        <span className="px-2.5 py-1 rounded-full bg-amber-950/80 border border-amber-700 text-amber-300 font-bold text-[10px]">
                          KARANTINA CSSD
                        </span>
                      ) : item.status === "RETURN_REQUESTED" ? (
                        <span className="px-2.5 py-1 rounded-full bg-rose-950/80 border border-rose-700 text-rose-300 font-bold text-[10px]">
                          DI-RECALL DARI INSTALASI
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-700 text-emerald-300 font-bold text-[10px]">
                          SELESAI
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-[11px] text-slate-400">
                      <div>{item.initiatedBy}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {new Date(item.initiatedAt).toLocaleString("id-ID")}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Recall Modal */}
      {isNewRecallOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-amber-800/80 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <RotateCcw className="w-4 h-4" />
                <span>Eksekusi Perintah Penarikan (Recall)</span>
              </div>
              <button
                onClick={() => setIsNewRecallOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteRecall} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  ID Instrumen Spesifik <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={targetId}
                  onChange={(e) => {
                    setTargetId(e.target.value);
                    handleLookupTarget(e.target.value);
                  }}
                  placeholder="Contoh: ST-HECST01-IGD1"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono text-xs focus:border-amber-500 focus:outline-none"
                />
                {scannedDetail && (
                  <div className="mt-2 p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-[11px] space-y-1">
                    <div className="font-bold text-amber-300">{scannedDetail.name}</div>
                    <div className="text-slate-400">
                      Lokasi Fisik: <span className="text-slate-200">{scannedDetail.currentLocation}</span> | State: <span className="text-sky-400">{scannedDetail.currentState}</span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Alasan Penarikan (Recall) <span className="text-rose-400">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Deskripsikan alasan recall (misal: indikator biologi mesin tidak lolos, laporan cacat sterilisasi, dll)..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-200 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl text-amber-300 text-[11px]">
                <strong>SOP Isolation:</strong> Penarikan ini hanya berdampak pada ID Instrumen yang dipilih. Instrumen lain tidak terganggu.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewRecallOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition flex items-center gap-1.5 shadow-lg shadow-amber-950/50"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Proses Recall</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
