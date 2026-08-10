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
  serverTimestamp,
  writeBatch
} from "firebase/firestore";
import { 
  AlertTriangle, 
  CheckCircle2, 
  ShieldAlert, 
  Wrench, 
  FileText, 
  Search, 
  Plus, 
  X, 
  ArrowRight, 
  Upload, 
  Clock, 
  User, 
  Building2, 
  QrCode, 
  RefreshCw,
  Eye,
  ShieldCheck,
  Lock
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

export interface HoldRecord {
  id: string; // Instrument ID, e.g. ST-HECST01-IGD1
  instrumentName: string;
  originUnit: string;
  holdReason: "PACKAGING_DAMAGE" | "INSTRUMENT_CONTAMINATED" | "STERILIZATION_FAILED" | "INSTRUMENT_DAMAGED" | "RECALL" | string;
  holdReasonLabel: string;
  currentLocation: string; // "KARANTINA_CSSD"
  reportedBy: string;
  reportedAt: string;
  notes: string;
  proofImageUrl?: string;
  status: "HOLD" | "RELEASE_PENDING" | "RELEASED";
  repairNotes?: string;
  releasedBy?: string;
  releasedAt?: string;
  nextStage?: "DEKONTAMINASI" | "PACKING";
}

export default function HoldKarantina({ currentUsername, currentRole = "admin", currentUserProfile = null, isDemoMode = false }: Props) {
  const [holdItems, setHoldItems] = useState<HoldRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterReason, setFilterReason] = useState("all");

  // Modal States
  const [isAddHoldOpen, setIsAddHoldOpen] = useState(false);
  const [selectedHoldItem, setSelectedHoldItem] = useState<HoldRecord | null>(null);
  const [isReleaseModalOpen, setIsReleaseModalOpen] = useState(false);

  // Form State - Add Hold
  const [addForm, setAddForm] = useState({
    instrumentId: "",
    reason: "INSTRUMENT_DAMAGED",
    notes: "",
    proofUrl: ""
  });
  const [scannedInstDetail, setScannedInstDetail] = useState<any | null>(null);
  const [isCheckingId, setIsCheckingId] = useState(false);

  // Form State - Release Hold
  const [releaseForm, setReleaseForm] = useState({
    repairNotes: "",
    nextStage: "DEKONTAMINASI" as "DEKONTAMINASI" | "PACKING"
  });

  // Load Hold records from instrument_live_state & hold_records
  useEffect(() => {
    setLoading(true);

    const tenantId = currentUserProfile?.tenantId || "RSUD-BENDA";
    const unsubLiveState = onSnapshot(
      query(collection(db, "instrument_live_state"), where("tenantId", "==", tenantId)),
      (snap) => {
        const liveHolds: HoldRecord[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.currentState === "HOLD" || data.status === "HOLD") {
            liveHolds.push({
              id: docSnap.id,
              instrumentName: data.instrumentName || data.name || docSnap.id,
              originUnit: data.originUnit || data.currentHolder || "CSSD",
              holdReason: data.holdReason || "INSTRUMENT_DAMAGED",
              holdReasonLabel: getReasonLabel(data.holdReason || "INSTRUMENT_DAMAGED"),
              currentLocation: data.currentLocation || "KARANTINA_CSSD",
              reportedBy: data.reportedBy || "Petugas CSSD",
              reportedAt: data.holdAt || data.updatedAt || new Date().toISOString(),
              notes: data.notes || data.holdNotes || "Masuk area karantina",
              status: data.releasePending ? "RELEASE_PENDING" : "HOLD",
              repairNotes: data.repairNotes,
              proofImageUrl: data.proofImageUrl
            });
          }
        });

        setHoldItems(liveHolds);
        setLoading(false);
      }, (err) => {
        console.warn("Snapshot live state hold error:", err);
        setLoading(false);
      });

    return () => unsubLiveState();
  }, [currentUserProfile]);

  function getReasonLabel(code: string): string {
    switch (code) {
      case "PACKAGING_DAMAGE":
        return "Kerusakan Kemasan";
      case "INSTRUMENT_CONTAMINATED":
        return "Instrumen Terkontaminasi / Kotor";
      case "STERILIZATION_FAILED":
        return "Kegagalan Sterilisasi / Indikator";
      case "INSTRUMENT_DAMAGED":
        return "Kerusakan Fisik Alat";
      case "RECALL":
        return "Penarikan Alat (Recall)";
      default:
        return code || "Karantina Umum";
    }
  }

  // Lookup instrument ID when typing/scanning
  const handleCheckInstrument = async (idToLook: string) => {
    if (!idToLook.trim()) {
      setScannedInstDetail(null);
      return;
    }
    setIsCheckingId(true);
    try {
      const cleanId = idToLook.trim().toUpperCase();
      let docSnap = await getDoc(doc(db, "master_instruments", cleanId));
      if (!docSnap.exists()) {
        docSnap = await getDoc(doc(db, "instruments", cleanId));
      }

      if (docSnap.exists()) {
        const data = docSnap.data();
        // Also get live state
        const lsSnap = await getDoc(doc(db, "instrument_live_state", cleanId));
        const lsData = lsSnap.exists() ? lsSnap.data() : {};

        setScannedInstDetail({
          id: cleanId,
          name: data.name || data.itemName || cleanId,
          originUnit: data.originUnit || "CSSD",
          type: data.type || "set",
          currentState: lsData.currentState || "READY",
          currentLocation: lsData.currentLocation || data.originUnit || "CSSD"
        });
      } else {
        setScannedInstDetail({
          id: cleanId,
          name: "Instrumen Tidak Ditemukan di Master",
          originUnit: "CSSD",
          type: "set",
          currentState: "UNKNOWN",
          currentLocation: "-"
        });
      }
    } catch (e) {
      console.error("Error checking instrument ID:", e);
    } finally {
      setIsCheckingId(false);
    }
  };

  // Handle Add Instrument to Hold
  const handleAddHold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.instrumentId.trim()) {
      alert("ID Instrumen wajib diisi!");
      return;
    }

    const cleanId = addForm.instrumentId.trim().toUpperCase();
    const instName = scannedInstDetail ? scannedInstDetail.name : cleanId;
    const originUnit = scannedInstDetail ? scannedInstDetail.originUnit : "CSSD";
    const previousState = scannedInstDetail ? scannedInstDetail.currentState : "READY";
    const previousLoc = scannedInstDetail ? scannedInstDetail.currentLocation : "CSSD";

    try {
      const nowISO = new Date().toISOString();

      const preservedStage = previousState && previousState !== "HOLD" && previousState !== "TAHAN" ? previousState : "SIAP";

      const batch = writeBatch(db);

      // Update instrument_live_state to HOLD condition
      const lsRef = doc(db, "instrument_live_state", cleanId);
      batch.set(lsRef, {
        instrumentId: cleanId,
        instrumentName: instName,
        originUnit: originUnit,
        statusAlur: preservedStage,
        currentState: preservedStage,
        kondisi: "TAHAN",
        currentLocation: "KARANTINA_CSSD",
        currentHolder: "CSSD",
        holdReason: addForm.reason,
        holdNotes: addForm.notes,
        reportedBy: currentUsername,
        holdAt: nowISO,
        updatedAt: nowISO,
        releasePending: false
      }, { merge: true });

      const instRef = doc(db, "instruments", cleanId);
      batch.set(instRef, {
        kondisi: "TAHAN",
        updatedAt: serverTimestamp()
      }, { merge: true });

      await batch.commit();

      // Write Append-Only Audit Log
      const activeTenantId = (() => {
        try {
          return requireTenantId(currentUserProfile);
        } catch (e) {
          return currentUserProfile?.tenantId || scannedInstDetail?.tenantId || "";
        }
      })();

      await writeAuditLog({
        tenantId: activeTenantId,
        module: "KARANTINA",
        action: "PLACE_ON_HOLD",
        entityType: "HOLD",
        entityId: cleanId,
        instrumentId: cleanId,
        beforeState: previousState,
        afterState: "HOLD",
        beforeLocation: previousLoc,
        afterLocation: "KARANTINA_CSSD",
        reason: `Masuk Karantina: ${getReasonLabel(addForm.reason)} - ${addForm.notes}`,
        userName: currentUsername,
        userRole: currentRole.toUpperCase()
      });

      triggerActionConfirm({
        title: "Instrumen Dalam Karantina",
        message: `${cleanId} (${instName}) berhasil dipindahkan ke Karantina CSSD. Total Inventaris resmi tetap terjaga.`,
        type: "warning"
      });

      setIsAddHoldOpen(false);
      setAddForm({ instrumentId: "", reason: "INSTRUMENT_DAMAGED", notes: "", proofUrl: "" });
      setScannedInstDetail(null);
    } catch (err: any) {
      console.error("Gagal menempatkan instrumen di Hold:", err);
      alert("Terjadi kesalahan: " + (err.message || "Gagal menyimpan data karantina"));
    }
  };

  // Handle Approve Release from Hold
  const handleApproveRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHoldItem) return;
    if (!releaseForm.repairNotes.trim()) {
      alert("Catatan perbaikan / hasil pemeriksaan wajib diisi!");
      return;
    }

    try {
      const cleanId = selectedHoldItem.id;
      const targetStage = releaseForm.nextStage; // "DEKONTAMINASI" or "PACKING"
      const nowISO = new Date().toISOString();

      const batch = writeBatch(db);

      // Update instrument_live_state to targetStage
      const lsRef = doc(db, "instrument_live_state", cleanId);
      batch.set(lsRef, {
        instrumentId: cleanId,
        statusAlur: targetStage,
        currentState: targetStage,
        kondisi: "NORMAL",
        currentLocation: targetStage === "DEKONTAMINASI" ? "CSSD_DEKONTAMINASI" : "CSSD_PACKAGING",
        currentHolder: "CSSD",
        holdReason: null,
        holdNotes: null,
        releasePending: false,
        lastReleasedAt: nowISO,
        lastReleasedBy: currentUsername,
        lastRepairNotes: releaseForm.repairNotes,
        updatedAt: nowISO
      }, { merge: true });

      const instRef = doc(db, "instruments", cleanId);
      batch.set(instRef, {
        kondisi: "NORMAL",
        updatedAt: serverTimestamp()
      }, { merge: true });

      await batch.commit();

      // Write Append-Only Audit Log for Release
      const activeTenantId = (() => {
        try {
          return requireTenantId(currentUserProfile);
        } catch (e) {
          return currentUserProfile?.tenantId || selectedHoldItem?.tenantId || "";
        }
      })();

      await writeAuditLog({
        tenantId: activeTenantId,
        module: "KARANTINA",
        action: "RELEASE_HOLD",
        entityType: "HOLD",
        entityId: cleanId,
        instrumentId: cleanId,
        beforeState: "HOLD",
        afterState: targetStage,
        beforeLocation: "KARANTINA_CSSD",
        afterLocation: targetStage === "DEKONTAMINASI" ? "CSSD_DEKONTAMINASI" : "CSSD_PACKAGING",
        reason: `Pelepasan Karantina disetujui (${currentUsername}): ${releaseForm.repairNotes}. Masuk tahap ${targetStage}.`,
        userName: currentUsername,
        userRole: currentRole.toUpperCase()
      });

      triggerActionConfirm({
        title: "Pelepasan Karantina Disetujui",
        message: `${cleanId} telah dilepas dari Karantina dan dikembalikan ke tahap ${targetStage} untuk re-proses.`,
        type: "success"
      });

      setIsReleaseModalOpen(false);
      setSelectedHoldItem(null);
      setReleaseForm({ repairNotes: "", nextStage: "DEKONTAMINASI" });
    } catch (err: any) {
      console.error("Gagal melepas instrumen dari Hold:", err);
      alert("Terjadi kesalahan: " + (err.message || "Gagal melepaskan karantina"));
    }
  };

  const filteredItems = holdItems.filter((item) => {
    const matchesSearch = 
      item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.instrumentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.originUnit.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesReason = filterReason === "all" || item.holdReason === filterReason;
    return matchesSearch && matchesReason;
  });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Title */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-slate-900/80 p-5 rounded-2xl border border-amber-900/40 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-amber-950/80 border border-amber-700/60 rounded-xl text-amber-400 shadow-inner">
            <AlertTriangle className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white tracking-wide flex items-center gap-2">
              Modul Karantina & HOLD Instrumen
              <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-0.5 rounded-full font-mono">
                {holdItems.length} Alat Terisolasi
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Pemisahan fisik & digital alat rusak/terkontaminasi dari stok distribusi tanpa mengurangi Inventaris Resmi.
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsAddHoldOpen(true)}
          className="px-4 py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold text-xs rounded-xl shadow-lg shadow-amber-950/50 flex items-center gap-2 transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Lapor Alat Bermasalah / Hold</span>
        </button>
      </div>

      {/* Standard SOP Alert Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 space-y-2">
        <div className="flex items-center gap-2 font-bold text-amber-300">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Ketentuan SOP Karantina & Pelepasan HOLD (Specification Rules):</span>
        </div>
        <ul className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] text-slate-400 pl-2">
          <li className="flex items-start gap-1.5">
            <span className="text-amber-400 font-bold">•</span>
            <span><strong>Inventaris Tetap:</strong> Alat HOLD tetap dihitung dalam Total Inventaris resmi instalasi pemilik.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-amber-400 font-bold">•</span>
            <span><strong>Blokir Distribusi:</strong> Alat berstatus HOLD dilarang masuk status Ready atau didistribusikan.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-amber-400 font-bold">•</span>
            <span><strong>Re-Proses Wajib:</strong> Pelepasan HOLD mengembalikan alat ke alur awal (Dekontaminasi/Packing).</span>
          </li>
        </ul>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap gap-3 items-center justify-between bg-slate-900/40 p-3 rounded-xl border border-slate-800">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari ID Instrumen (Mis: ST-HECST01-IGD1) / Nama / Unit..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Alasan:</span>
          <select
            value={filterReason}
            onChange={(e) => setFilterReason(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="all">Semua Alasan</option>
            <option value="PACKAGING_DAMAGE">Kerusakan Kemasan</option>
            <option value="INSTRUMENT_CONTAMINATED">Instrumen Terkontaminasi</option>
            <option value="STERILIZATION_FAILED">Kegagalan Sterilisasi</option>
            <option value="INSTRUMENT_DAMAGED">Kerusakan Fisik</option>
            <option value="RECALL">Penarikan (Recall)</option>
          </select>
        </div>
      </div>

      {/* Hold List Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
            <span className="text-xs">Memuat data instrumen di karantina...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-500/40 mx-auto" />
            <p className="text-sm font-semibold text-slate-300">Tidak ada instrumen dalam Karantina / HOLD</p>
            <p className="text-xs text-slate-500">Semua instrumen saat ini dalam kondisi laik pakai dan berada di alur operasional normal.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="p-3.5">ID Instrumen</th>
                  <th className="p-3.5">Nama & Type</th>
                  <th className="p-3.5">Instalasi Asal</th>
                  <th className="p-3.5">Alasan Karantina</th>
                  <th className="p-3.5">Lokasi Fisik</th>
                  <th className="p-3.5">Pelapor & Waktu</th>
                  <th className="p-3.5 text-center">Aksi / Release</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-3.5 font-mono font-bold text-amber-300">
                      {item.id}
                    </td>
                    <td className="p-3.5 font-medium text-slate-200">
                      {item.instrumentName}
                    </td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[11px]">
                        {item.originUnit}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span className="px-2.5 py-1 rounded-full bg-amber-950/80 border border-amber-700/80 text-amber-300 text-[11px] font-medium inline-flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                        {item.holdReasonLabel}
                      </span>
                      {item.notes && (
                        <p className="text-[10px] text-slate-400 mt-1 line-clamp-1 italic">
                          "{item.notes}"
                        </p>
                      )}
                    </td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 rounded bg-slate-950 text-amber-400 border border-amber-900/60 text-[11px]">
                        {item.currentLocation}
                      </span>
                    </td>
                    <td className="p-3.5 text-[11px] text-slate-400">
                      <div>{item.reportedBy}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {new Date(item.reportedAt).toLocaleString("id-ID")}
                      </div>
                    </td>
                    <td className="p-3.5 text-center">
                      <button
                        onClick={() => {
                          setSelectedHoldItem(item);
                          setIsReleaseModalOpen(true);
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] rounded-lg shadow flex items-center gap-1.5 mx-auto transition cursor-pointer"
                      >
                        <Wrench className="w-3.5 h-3.5" />
                        <span>Pelepasan HOLD</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Lapor Alat Bermasalah / Add Hold */}
      {isAddHoldOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-amber-800/80 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>Lapor Alat Masuk Karantina / HOLD</span>
              </div>
              <button
                onClick={() => setIsAddHoldOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddHold} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  ID Instrumen (Scan QR / Ketik) <span className="text-rose-400">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={addForm.instrumentId}
                    onChange={(e) => {
                      setAddForm({ ...addForm, instrumentId: e.target.value });
                      handleCheckInstrument(e.target.value);
                    }}
                    placeholder="Contoh: ST-HECST01-IGD1"
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono text-xs focus:border-amber-500 focus:outline-none"
                  />
                </div>
                {isCheckingId && (
                  <p className="text-[11px] text-slate-400 mt-1">Memeriksa ID Master...</p>
                )}
                {scannedInstDetail && (
                  <div className="mt-2 p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-[11px] space-y-1">
                    <div className="font-bold text-sky-400">{scannedInstDetail.name}</div>
                    <div className="text-slate-400">
                      Instalasi Asal: <span className="text-slate-200">{scannedInstDetail.originUnit}</span> | Status Saat Ini: <span className="text-emerald-400">{scannedInstDetail.currentState}</span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Alasan Masuk Karantina <span className="text-rose-400">*</span>
                </label>
                <select
                  value={addForm.reason}
                  onChange={(e) => setAddForm({ ...addForm, reason: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-amber-500 focus:outline-none"
                >
                  <option value="PACKAGING_DAMAGE">Kerusakan Kemasan (Re-pack)</option>
                  <option value="INSTRUMENT_CONTAMINATED">Instrumen Terkontaminasi / Kotor (Re-clean)</option>
                  <option value="STERILIZATION_FAILED">Kegagalan Sterilisasi / Indikator Mesin</option>
                  <option value="INSTRUMENT_DAMAGED">Kerusakan Fisik Alat (Bengkok/Rusak)</option>
                  <option value="RECALL">Penarikan Alat Bermasalah (Recall)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Catatan / Deskripsi Kerusakan <span className="text-rose-400">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={addForm.notes}
                  onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                  placeholder="Jelaskan detail kondisi kerusakan atau indikator yang tidak lolos..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-200 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl text-amber-300 text-[11px] leading-relaxed">
                <strong>Catatan SOP:</strong> Penempatan instrumen ke status HOLD akan memindahkan lokasi aktif ke <strong>KARANTINA_CSSD</strong> dan memblokir opsi distribusi. Total Inventaris resmi milik instalasi tidak berkurang.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddHoldOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition shadow-lg shadow-amber-950/50 flex items-center gap-1.5"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>Pindahkan ke Karantina</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Release Hold Approval */}
      {isReleaseModalOpen && selectedHoldItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-emerald-800/80 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <Wrench className="w-4 h-4" />
                <span>Pelepasan HOLD / Karantina</span>
              </div>
              <button
                onClick={() => setIsReleaseModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleApproveRelease} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                <div className="text-amber-400 font-mono font-bold text-sm">{selectedHoldItem.id}</div>
                <div className="text-slate-200 font-medium">{selectedHoldItem.instrumentName}</div>
                <div className="text-slate-400 text-[11px]">
                  Alasan Karantina: <span className="text-amber-300 font-semibold">{selectedHoldItem.holdReasonLabel}</span>
                </div>
                <div className="text-slate-400 text-[11px]">
                  Catatan Pelapor: <span className="text-slate-300 italic">"{selectedHoldItem.notes}"</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Tahap Alur Setelah Release <span className="text-rose-400">*</span>
                </label>
                <select
                  value={releaseForm.nextStage}
                  onChange={(e) => setReleaseForm({ ...releaseForm, nextStage: e.target.value as "DEKONTAMINASI" | "PACKING" })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="DEKONTAMINASI">Dekontaminasi (Cuci ulang - Wajib jika terkontaminasi/alat fisik)</option>
                  <option value="PACKING">Packing (Kemasa ulang - Hanya jika kerusakan kemasan)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Catatan Perbaikan / Hasil Pemeriksaan <span className="text-rose-400">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={releaseForm.repairNotes}
                  onChange={(e) => setReleaseForm({ ...releaseForm, repairNotes: e.target.value })}
                  placeholder="Deskripsikan bukti perbaikan, penggantian part, atau hasil re-inspeksi oleh Admin/CSSD..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-200 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-emerald-300 text-[11px] leading-relaxed">
                <strong>Ketentuan Lock Spec:</strong> Alat tidak langsung menjadi Ready/Steril secara otomatis. Alat wajib kembali mengikuti alur proses dari tahap <strong>{releaseForm.nextStage}</strong>. Semua riwayat Karantina & Pelepasan dicatat secara append-only di <code>audit_logs</code>.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsReleaseModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition shadow-lg shadow-emerald-950/50 flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Setujui Pelepasan HOLD</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
