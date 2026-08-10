import React, { useState, useEffect } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, CheckSquare, Square, Search, QrCode, AlertTriangle, ArrowRight, ShieldAlert, Check } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, where, updateDoc, doc, serverTimestamp, setDoc, getDoc, writeBatch } from 'firebase/firestore';
import { DEMO_KEYS, getDemoData, saveDemoData, INITIAL_DEMO_WORKFLOW_LOGS } from '../lib/demoStore';
import { triggerActionConfirm } from '../lib/actionToast';
import { writeAuditLog } from '../lib/auditLogger';
import { UserProfile } from '../types';
import { requireTenantId } from '../lib/permissions';

interface DecontaminationProps {
  currentUsername: string;
  currentUserProfile?: UserProfile | null;
  decontamQueue?: any[];
  setDecontamQueue?: React.Dispatch<React.SetStateAction<any[]>>;
  setPackagingQueue?: React.Dispatch<React.SetStateAction<any[]>>;
  isDemoMode?: boolean;
}

export default function Decontamination({ currentUsername, currentUserProfile = null, isDemoMode = false }: DecontaminationProps) {
  const [firestoreQueue, setFirestoreQueue] = useState<any[]>([]);
  const [expandedDocs, setExpandedDocs] = useState<string[]>([]);
  // Local state to track checked items before submitting to next stage
  const [checkedItems, setCheckedItems] = useState<{ [docId: string]: string[] }>({});

  // Scan & Lookup State
  const [scanQuery, setScanQuery] = useState("");
  const [scannedResult, setScannedResult] = useState<any | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (isDemoMode) {
      const loadDemoQueue = () => {
        const wfLogs = getDemoData(DEMO_KEYS.WORKFLOW_LOGS, INITIAL_DEMO_WORKFLOW_LOGS);
        const decontamItems = wfLogs.filter((d: any) => d.currentStage === "decontamination");
        setFirestoreQueue(decontamItems);
      };
      loadDemoQueue();
      const handleStoreChange = (e: any) => {
        if (!e.detail?.key || e.detail.key === DEMO_KEYS.WORKFLOW_LOGS || e.detail.key === "all") {
          loadDemoQueue();
        }
      };
      window.addEventListener("cssd_demo_store_change", handleStoreChange);
      return () => window.removeEventListener("cssd_demo_store_change", handleStoreChange);
    }

    const tenantId = currentUserProfile?.tenantId || "RSUD-BENDA";
    const q = query(
      collection(db, "workflow_logs"),
      where("tenantId", "==", tenantId),
      where("currentStage", "==", "decontamination")
    );
    const unsub = onSnapshot(q, (snap) => {
      const items: any[] = [];
      snap.forEach((docSnap) => {
        items.push({ firestoreDocId: docSnap.id, ...docSnap.data() });
      });
      setFirestoreQueue(items);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, "workflow_logs");
    });
    return () => unsub();
  }, [isDemoMode, currentUserProfile]);

  const toggleExpand = (docId: string) => {
    setExpandedDocs(prev => prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]);
  };

  const toggleCheck = (docId: string, itemId: string) => {
    setCheckedItems(prev => {
      const docChecks = prev[docId] || [];
      const newChecks = docChecks.includes(itemId) 
        ? docChecks.filter(id => id !== itemId)
        : [...docChecks, itemId];
      return { ...prev, [docId]: newChecks };
    });
  };

  // Scan & Verify Instrument ID against Live State SSoT
  const handleScanLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!scanQuery.trim()) return;

    const cleanId = scanQuery.trim().toUpperCase();
    setIsSearching(true);
    setScanError(null);
    setScannedResult(null);

    try {
      if (isDemoMode) {
        if (cleanId === "ST-HECST01-IGD1" || cleanId.startsWith("ST-")) {
          setScannedResult({
            id: cleanId,
            name: "Set Hecting Standar (IGD)",
            originUnit: "IGD",
            type: "set",
            statusAlur: "DEKONTAMINA",
            kondisi: "NORMAL",
            lokasiSaatIni: "CSSD_DEKONTAMINASI",
            pemegangSaatIni: "CSSD"
          });
        } else {
          setScanError(`ID INSTRUMEN TIDAK TERDAFTAR (${cleanId}). Silakan hubungi Admin untuk pendaftaran Master Instrument.`);
        }
        setIsSearching(false);
        return;
      }

      // Check instrument_live_state
      const lsSnap = await getDoc(doc(db, "instrument_live_state", cleanId));
      let lsData: any = null;

      if (lsSnap.exists()) {
        lsData = lsSnap.data();
      } else {
        // Fallback check master_instruments
        const masterSnap = await getDoc(doc(db, "master_instruments", cleanId));
        if (masterSnap.exists()) {
          const mData = masterSnap.data();
          lsData = {
            instrumentId: cleanId,
            instrumentName: mData.name,
            originUnit: mData.originUnit || "CSSD",
            statusAlur: "DITERIMA",
            kondisi: "NORMAL",
            lokasiSaatIni: "CSSD_DEKONTAMINASI",
            pemegangSaatIni: "CSSD"
          };
        }
      }

      if (!lsData) {
        setScanError(`ID INSTRUMEN TIDAK TERDAFTAR (${cleanId}). Silakan hubungi Admin untuk registrasi Master Instrumen.`);
        setIsSearching(false);
        return;
      }

      // Validation Rules
      const statusAlur = lsData.statusAlur || lsData.currentState || "DITERIMA";
      const kondisi = lsData.kondisi || lsData.condition || "NORMAL";
      const lokasi = lsData.lokasiSaatIni || lsData.currentLocation || "CSSD";

      if (statusAlur === "DIDISTRIBUSIKAN" || statusAlur === "DISTRIBUTED") {
        setScanError(`ALAT TIDAK DAPAT DIPROSES! ID Instrumen: ${cleanId} | Status: ${statusAlur} | Lokasi: ${lokasi}. Silakan lakukan proses pengembalian resmi dari instalasi terlebih dahulu.`);
        setIsSearching(false);
        return;
      }

      if (kondisi === "TAHAN" || statusAlur === "HOLD") {
        setScanError(`ALAT DALAM KONDISI TAHAN / KARANTINA! ID Instrumen: ${cleanId} | Alasan: ${lsData.holdReason || "Karantina"}. Silakan ajukan pelepasan HOLD di Modul Karantina terlebih dahulu.`);
        setIsSearching(false);
        return;
      }

      setScannedResult({
        id: cleanId,
        name: lsData.instrumentName || lsData.name || cleanId,
        originUnit: lsData.originUnit || "CSSD",
        type: lsData.type || "set",
        statusAlur,
        kondisi,
        lokasiSaatIni: lokasi,
        pemegangSaatIni: lsData.pemegangSaatIni || lsData.currentHolder || "CSSD"
      });
    } catch (err: any) {
      console.error("Error looking up instrument ID:", err);
      setScanError("Gagal memeriksa data instrumen: " + (err.message || "Error server"));
    } finally {
      setIsSearching(false);
    }
  };

  const handleProcessSingleScanned = async () => {
    if (!scannedResult) return;
    const cleanId = scannedResult.id;

    try {
      const nowISO = new Date().toISOString();

      if (!isDemoMode) {
        const lsRef = doc(db, "instrument_live_state", cleanId);
        await setDoc(lsRef, {
          instrumentId: cleanId,
          statusAlur: "SEDANG MENGEMAS",
          currentState: "PACKING",
          kondisi: "NORMAL",
          lokasiSaatIni: "CSSD_PACKAGING",
          pemegangSaatIni: "CSSD",
          updatedAt: nowISO
        }, { merge: true });

        // Append-only audit log
        const activeTenantId = (() => {
          try {
            return requireTenantId(currentUserProfile);
          } catch (e) {
            return currentUserProfile?.tenantId || scannedResult?.tenantId || "";
          }
        })();

        await writeAuditLog({
          tenantId: activeTenantId,
          module: "DEKONTAMINASI",
          action: "SELESAI_DEKONTAMINASI",
          entityType: "INSTRUMENT",
          entityId: cleanId,
          instrumentId: cleanId,
          beforeState: scannedResult.statusAlur,
          afterState: "SEDANG MENGEMAS",
          beforeLocation: scannedResult.lokasiSaatIni,
          afterLocation: "CSSD_PACKAGING",
          reason: "Pencucian & dekontaminasi selesai via scan ID",
          userName: currentUsername,
          userRole: "PETUGAS_CSSD"
        });
      }

      triggerActionConfirm({
        title: "Pencucian Selesai!",
        message: `${cleanId} (${scannedResult.name}) telah selesai dekontaminasi & dipindahkan ke CSSD Packaging.`
      });

      setScannedResult(null);
      setScanQuery("");
    } catch (err: any) {
      console.error("Gagal memperbarui status dekontaminasi:", err);
      alert("Gagal memproses pencucian: " + (err.message || "Error"));
    }
  };

  const handleFinishWash = async (docData: any) => {
    const docChecks = checkedItems[docData.firestoreDocId] || [];
    const allItemIds = (docData.items || []).map((i: any) => i.id);
    const allChecked = allItemIds.length > 0 && allItemIds.every((id: string) => docChecks.includes(id));

    if (!allChecked) {
      alert("Harap centang semua item/set terlebih dahulu untuk mengonfirmasi pencucian selesai.");
      return;
    }

    try {
      if (isDemoMode) {
        const wfLogs = getDemoData(DEMO_KEYS.WORKFLOW_LOGS, INITIAL_DEMO_WORKFLOW_LOGS);
        const updated = wfLogs.map((item: any) => {
          if (item.firestoreDocId === docData.firestoreDocId) {
            return {
              ...item,
              currentStage: 'packaging',
              status: 'Selesai Dicuci',
              history: [
                ...(item.history || []),
                {
                  stage: "decontamination",
                  timestamp: new Date(),
                  operatorName: currentUsername,
                  notes: `Selesai dicuci (Manual)`
                }
              ]
            };
          }
          return item;
        });
        saveDemoData(DEMO_KEYS.WORKFLOW_LOGS, updated);
      } else {
        // Update Live State & Audit Log for each item
        const activeTenantId = (() => {
          try {
            return requireTenantId(currentUserProfile);
          } catch (e) {
            return currentUserProfile?.tenantId || docData?.tenantId || "";
          }
        })();

        const batch = writeBatch(db);
        const nowISO = new Date().toISOString();

        if (docData.items) {
          for (const item of docData.items) {
            const instrumentId = item.instrumentId;
            if (instrumentId) {
              const lsRef = doc(db, "instrument_live_state", instrumentId);
              batch.set(lsRef, {
                instrumentId,
                statusAlur: "SEDANG MENGEMAS",
                currentState: "PACKING",
                kondisi: "NORMAL",
                currentLocation: "CSSD_PACKAGING",
                currentHolder: "CSSD",
                updatedAt: nowISO
              }, { merge: true });

              const instRef = doc(db, "instruments", instrumentId);
              batch.set(instRef, {
                currentState: "PACKING",
                updatedAt: serverTimestamp()
              }, { merge: true });
            }
          }
        }

        const wfRef = doc(db, "workflow_logs", docData.firestoreDocId);
        batch.update(wfRef, {
          currentStage: "packaging",
          status: "Selesai Dicuci",
          updatedAt: serverTimestamp(),
          history: [
            ...(docData.history || []),
            {
              stage: "decontamination",
              timestamp: new Date(),
              operatorName: currentUsername,
              notes: `Selesai dicuci (Manual)`
            }
          ]
        });

        await batch.commit();

        if (docData.items) {
          for (const item of docData.items) {
            const instrumentId = item.instrumentId;
            if (instrumentId) {
              await writeAuditLog({
                tenantId: activeTenantId,
                module: "DEKONTAMINASI",
                action: "SELESAI_DEKONTAMINASI",
                entityType: "INSTRUMENT",
                entityId: instrumentId,
                instrumentId: instrumentId,
                beforeState: "DEKONTAMINA",
                afterState: "SEDANG MENGEMAS",
                beforeLocation: "CSSD_DEKONTAMINASI",
                afterLocation: "CSSD_PACKAGING",
                reason: `Pencucian resi ${docData.idTerima} selesai`,
                userName: currentUsername,
                userRole: "PETUGAS_CSSD"
              });
            }
          }
        }
      }
      triggerActionConfirm({
        title: "Proses Pencucian Selesai!",
        message: `Instrumen (${docData.idTerima || 'Set'}) telah selesai dekontaminasi & diteruskan ke Ruang Pengemasan.`
      });
      // Clear checks for this doc
      setCheckedItems(prev => {
        const next = { ...prev };
        delete next[docData.firestoreDocId];
        return next;
      });
    } catch (err) {
      console.error(err);
      alert("Gagal memperbarui status.");
    }
  };

  return (
    <div className="space-y-4">
      {/* Scan & Lookup Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
        <form onSubmit={handleScanLookup} className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={scanQuery}
              onChange={(e) => setScanQuery(e.target.value)}
              placeholder="Scan Barcode / Ketik ID Instrumen Fisik (Contoh: ST-HECST01-IGD1)..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-lg transition flex items-center gap-1.5 cursor-pointer"
          >
            <QrCode className="w-4 h-4" />
            <span>Periksa ID</span>
          </button>
        </form>

        {/* Error / Validation Box */}
        {scanError && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Validasi Gagal:</strong> {scanError}
            </div>
          </div>
        )}

        {/* Scanned Result Card */}
        {scannedResult && (
          <div className="p-3.5 bg-slate-950 rounded-xl border border-emerald-500/30 space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-amber-400 font-mono font-bold text-sm block">{scannedResult.id}</span>
                <span className="text-slate-200 text-xs font-semibold">{scannedResult.name}</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold uppercase">
                Valid untuk Dekontaminasi
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded-lg font-mono">
              <div>Instalasi: <span className="text-slate-200 font-bold">{scannedResult.originUnit}</span></div>
              <div>Status: <span className="text-sky-400 font-bold">{scannedResult.statusAlur}</span></div>
              <div>Kondisi: <span className="text-emerald-400 font-bold">{scannedResult.kondisi}</span></div>
              <div>Lokasi: <span className="text-slate-200 font-bold">{scannedResult.lokasiSaatIni}</span></div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleProcessSingleScanned}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow flex items-center gap-1.5 cursor-pointer transition"
              >
                <Check className="w-4 h-4" />
                <span>Konfirmasi Pencucian &amp; Lanjut Packing</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Queue Cards */}
      {firestoreQueue.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-700">Tidak ada antrean pencucian</h3>
          <p className="text-xs text-slate-500 mt-1">Semua instrumen telah dicuci atau belum ada penerimaan baru.</p>
        </div>
      ) : (
        firestoreQueue.map((docData) => {
          const isExpanded = expandedDocs.includes(docData.firestoreDocId);
          const items = docData.items || [];
          const docChecks = checkedItems[docData.firestoreDocId] || [];
          const isAllChecked = items.length > 0 && items.every((i: any) => docChecks.includes(i.id));

          return (
            <div key={docData.firestoreDocId} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div 
                className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors"
                onClick={() => toggleExpand(docData.firestoreDocId)}
              >
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Resi: {docData.idTerima}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Dari: {docData.asal} • {docData.tanggalPenerimaan}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wider rounded-md">
                    {docData.status || 'Sedang di Cuci'}
                  </span>
                  {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                </div>
              </div>

              {isExpanded && (
                <div className="p-0">
                  <div className="divide-y divide-slate-100">
                    {items.map((item: any) => {
                      const isChecked = docChecks.includes(item.id);
                      return (
                        <div key={item.id} className="p-4 flex flex-col md:flex-row md:items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                              <span className="text-sm font-bold text-slate-800">{item.name}</span>
                              <span className="text-xs font-mono text-sky-600 bg-sky-50 px-2 py-0.5 rounded border border-sky-100">ID: {item.instrumentId || '-'}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${item.type === 'set' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {item.type}
                              </span>
                              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                {item.qty} Pcs
                              </span>
                            </div>
                            
                            {/* Set Details */}
                            {item.type === 'set' && item.components && item.components.length > 0 && (
                              <div className="mt-2 pl-3 border-l-2 border-slate-200">
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Isi Set:</p>
                                <ul className="text-xs text-slate-600 space-y-1">
                                  {item.components.map((comp: any, idx: number) => (
                                    <li key={idx}>• {comp.name} ({comp.standardQty} pcs)</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <div className="mt-2">
                              <span className="text-[10px] font-medium text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                                Kondisi: {item.condition}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-end">
                            <button
                              onClick={() => toggleCheck(docData.firestoreDocId, item.id)}
                              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                                isChecked 
                                  ? 'bg-emerald-500 text-white shadow-sm' 
                                  : 'bg-white border-2 border-slate-200 text-slate-500 hover:border-slate-300'
                              }`}
                            >
                              {isChecked ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                              {isChecked ? 'Sudah Dicuci' : 'Tandai Selesai'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">
                      {docChecks.length} dari {items.length} item dikonfirmasi
                    </span>
                    <button
                      onClick={() => handleFinishWash(docData)}
                      disabled={!isAllChecked}
                      className={`px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center gap-2 ${
                        isAllChecked 
                          ? 'bg-sky-500 hover:bg-sky-600 text-white' 
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Selesai &amp; Lanjut Packing
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

