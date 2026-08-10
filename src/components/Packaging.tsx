import React, { useState, useEffect, useMemo } from 'react';
import { Package, CheckSquare, ArrowRight, Printer, AlertTriangle, RefreshCw, RotateCcw, X, ShieldAlert } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp, query, where, onSnapshot, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { bluetoothPrinterService } from '../lib/BluetoothPrinterService';
import { DEMO_KEYS, getDemoData, saveDemoData, INITIAL_DEMO_WORKFLOW_LOGS, INITIAL_DEMO_ACTIVITY_LOGS } from '../lib/demoStore';
import { triggerActionConfirm } from '../lib/actionToast';
import { writeAuditLog } from '../lib/auditLogger';
import { UserProfile } from '../types';
import { requireTenantId } from '../lib/permissions';

interface PackagingProps {
  currentUsername: string;
  currentUserProfile?: UserProfile | null;
  packagingQueue: any[];
  setPackagingQueue: React.Dispatch<React.SetStateAction<any[]>>;
  isDemoMode?: boolean;
}

export default function Packaging({ currentUsername, currentUserProfile = null, packagingQueue, setPackagingQueue, isDemoMode = false }: PackagingProps) {
  const [completedLog, setCompletedLog] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('assembly');
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [firestoreQueue, setFirestoreQueue] = useState<any[]>([]);
  const [instruments, setInstruments] = useState<any[]>([]);

  // Load master data instruments for ID synchronization
  useEffect(() => {
    if (isDemoMode) {
      setInstruments([
        { id: "INST-001", sku: "INST-001", name: "Gunting Jaringan", type: "single" },
        { id: "INST-002", sku: "INST-002", name: "Pinset Anatomis", type: "single" },
        { id: "INST-003", sku: "INST-003", name: "Nalpuder", type: "single" },
        { id: "INST-004", sku: "INST-004", name: "Hecting Set", type: "set", components: [{ name: "Gunting Angkat Jahitan", standardQty: 1 }, { name: "Pinset Cirurgis", standardQty: 2 }] }
      ]);
      return;
    }
    const tenantId = currentUserProfile?.tenantId || "RSUD-BENDA";
    const unsub = onSnapshot(query(collection(db, "instruments"), where("tenantId", "==", tenantId)), (snap) => {
      const list: any[] = [];
      snap.forEach(docSnap => list.push({ id: docSnap.id, ...docSnap.data() }));
      setInstruments(list);
    }, (err) => handleFirestoreError(err, OperationType.GET, "instruments"));

    return () => unsub();
  }, [isDemoMode, currentUserProfile]);

  // Subscribe to real-time workflow_logs in packaging stage
  useEffect(() => {
    if (isDemoMode) {
      const loadDemoQueue = () => {
        const wfLogs = getDemoData(DEMO_KEYS.WORKFLOW_LOGS, INITIAL_DEMO_WORKFLOW_LOGS);
        const pkgItems = wfLogs.filter((d: any) => d.currentStage === "packaging");
        const items = pkgItems.map((data: any) => {
          const formattedItems = Array.isArray(data.items) 
            ? data.items.map((i: any) => typeof i === 'string' ? i : `${i.qty || i.receivedQty || 1}x ${i.name}`)
            : [data.instrumentName || 'Instrumen Medical'];

          return {
            firestoreDocId: data.firestoreDocId,
            idTerima: data.idTerima || data.firestoreDocId,
            asal: data.asal || 'IGD',
            waktuMasuk: data.decontaminationFinishedAtStr
              ? new Date(data.decontaminationFinishedAtStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
              : 'Baru saja',
            items: formattedItems,
            rawItems: data.items || [],
            instrumentId: data.instrumentId || ''
          };
        });
        setFirestoreQueue(items);
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
      where("currentStage", "==", "packaging")
    );
    const unsub = onSnapshot(q, (snap) => {
      const items: any[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const formattedItems = Array.isArray(data.items) 
          ? data.items.map((i: any) => typeof i === 'string' ? i : `${i.qty || i.receivedQty || 1}x ${i.name}`)
          : [data.instrumentName || 'Instrumen Medical'];

        items.push({
          firestoreDocId: docSnap.id,
          idTerima: data.idTerima || docSnap.id,
          asal: data.asal || 'IGD',
          waktuMasuk: data.decontaminationFinishedAt?.toDate?.() 
            ? data.decontaminationFinishedAt.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
            : 'Baru saja',
          items: formattedItems,
          rawItems: data.items || [],
          instrumentId: data.instrumentId || ''
        });
      });
      setFirestoreQueue(items);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, "workflow_logs");
    });
    return () => unsub();
  }, [isDemoMode, currentUserProfile]);

  // Merge local and firestore packaging queue, excluding finished
  const combinedQueue = useMemo(() => {
    const list = [...packagingQueue];
    firestoreQueue.forEach(fItem => {
      if (!list.some(cItem => cItem.idTerima === fItem.idTerima)) {
        list.push(fItem);
      }
    });
    return list.filter(item => !completedLog.some(c => c.idTerima === item.idTerima));
  }, [packagingQueue, firestoreQueue, completedLog]);

  const getTimeSterilValue = (pkgType: string) => {
    if (pkgType === 'Duk/Linen') return '7 Day';
    if (pkgType === 'Poch Plasma') return '90 Day';
    return '30 Day'; // default for 'Packing Poch'
  };

  const getExpDays = (pkgType: string) => {
    if (pkgType === 'Duk/Linen') return 7;
    if (pkgType === 'Poch Plasma') return 90;
    return 30; // default for 'Packing Poch'
  };

  const handleSelectToPack = (item: any) => {
    const initializedRawItems = (item.rawItems && item.rawItems.length > 0 ? item.rawItems : [
      { name: item.items.join(', '), type: 'single', qty: 1, instrumentId: item.instrumentId || '' }
    ]).map((ri: any) => {
      const actualQty = ri.qty || ri.receivedQty || 1;
      return {
        ...ri,
        qty: actualQty,
        receivedQty: actualQty,
        packCount: actualQty,
        packagingType: 'Packing Poch',
        indicatorIncluded: true,
        condition: 'baik'
      };
    });

    setSelectedItem({
      ...item,
      packConfigs: initializedRawItems
    });
  };

  const updatePackConfig = (idx: number, field: string, val: any) => {
    const updated = [...selectedItem.packConfigs];
    updated[idx] = { ...updated[idx], [field]: val };
    setSelectedItem({ ...selectedItem, packConfigs: updated });
  };

  const handleFinishPackaging = async () => {
    if (!selectedItem || !selectedItem.packConfigs) return;

    for (const cfg of selectedItem.packConfigs) {
      if (!cfg.indicatorIncluded) {
        alert(`Mohon pastikan Indikator Kimia / Internal dicentang untuk item "${cfg.name}"!`);
        return;
      }
      if (!cfg.packCount || cfg.packCount < 1) {
        alert(`Jumlah packing untuk "${cfg.name}" minimal 1.`);
        return;
      }
    }

    try {
      setPackagingQueue(prev => prev.filter(i => i.idTerima !== selectedItem.idTerima));
      
      const now = new Date();
      const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      const baseLot = `LOT-${selectedItem.idTerima.replace('RCV-', '')}`;
      
      let totalPacksCreated = 0;
      const createdLogs: any[] = [];

      let docId = selectedItem.firestoreDocId;
      if (!docId && selectedItem.idTerima) {
        const qSearch = query(collection(db, "workflow_logs"), where("idTerima", "==", selectedItem.idTerima));
        const snapSearch = await getDocs(qSearch);
        if (!snapSearch.empty) {
          docId = snapSearch.docs[0].id;
        }
      }

      const batch = writeBatch(db);
      const auditLogTasks: Array<() => Promise<void>> = [];

      for (let itemIdx = 0; itemIdx < selectedItem.packConfigs.length; itemIdx++) {
        const cfg = selectedItem.packConfigs[itemIdx];
        const pCount = Number(cfg.packCount) || 1;

        for (let p = 1; p <= pCount; p++) {
          totalPacksCreated++;
          const packLotNumber = `${baseLot}-S${itemIdx + 1}P${p}`;
          const packIdTerima = `${selectedItem.idTerima}-P${totalPacksCreated}`;

          const packagingPayload = {
            packagedAt: serverTimestamp(),
            operator: currentUsername,
            wrapType: cfg.packagingType,
            indicatorInternalPlaced: true,
            lotLabelGenerated: true,
            packNumber: p,
            totalPacks: pCount,
            skuName: cfg.name
          };

          // Match with Master Data instruments to ensure perfect synchronization of ID
          const matchedInst = instruments.find(ins => 
            ins.id === cfg.instrumentId || 
            ins.sku === cfg.instrumentId || 
            ins.id === cfg.id ||
            ins.sku === cfg.id ||
            ins.name?.toLowerCase().trim() === cfg.name?.toLowerCase().trim()
          );
          const finalInstId = matchedInst?.id || cfg.instrumentId || selectedItem.instrumentId || cfg.id || selectedItem.idTerima;

          const receiptText = bluetoothPrinterService.buildReceiptTemplate({
            title: cfg.name,
            subtitle: "CSSD RSUD BENDA - PACKING",
            typeHeader: `LABEL PACKING (PAKET ${p} OF ${pCount})`,
            id: packIdTerima,
            unit: selectedItem.asal,
            packingType: cfg.packagingType,
            packingDate: `${now.toLocaleDateString('id-ID')} ${timeStr}`,
            timeSteril: getTimeSterilValue(cfg.packagingType),
            isSet: cfg.type === 'set',
            items: cfg.type === 'set' && (cfg.components || cfg.receivedComponents) ? (cfg.components || cfg.receivedComponents) : [{ name: cfg.name, qty: cfg.type === 'set' ? 1 : Math.ceil((cfg.qty || cfg.receivedQty || 1) / pCount) }],
            operator: currentUsername,
            barcode1D: packLotNumber,
            qrCode: finalInstId,
            hideNoteAndTtd: true
          });

          await bluetoothPrinterService.printText(receiptText);

          if (isDemoMode) {
            const demoWf = getDemoData(DEMO_KEYS.WORKFLOW_LOGS, INITIAL_DEMO_WORKFLOW_LOGS);
            const newWfPack = {
              firestoreDocId: `demo-wf-${Date.now()}-${p}`,
              lotNumber: packLotNumber,
              idTerima: packIdTerima,
              parentReceiveId: selectedItem.idTerima,
              instrumentId: finalInstId,
              instrumentName: `${cfg.name} (Pack ${p}/${pCount})`,
              instrumentType: cfg.type || 'single',
              qty: cfg.type === 'set' ? 1 : Math.ceil((cfg.qty || cfg.receivedQty || 1) / pCount),
              currentStage: "sterilization",
              createdAtStr: new Date().toISOString(),
              updatedAtStr: new Date().toISOString(),
              packaging: packagingPayload,
              components: cfg.components || cfg.receivedComponents || cfg.items || [],
              items: cfg.components || cfg.receivedComponents || cfg.items || [],
              history: [
                {
                  stage: "decontamination",
                  timestampStr: new Date().toISOString(),
                  operatorName: currentUsername,
                  notes: `Diterima dari ${selectedItem.asal}`
                },
                {
                  stage: "packaging",
                  timestampStr: new Date().toISOString(),
                  operatorName: currentUsername,
                  notes: `Dikemas jadi ${pCount} pack (Pack ke-${p}) dengan ${cfg.packagingType}`
                }
              ]
            };
            saveDemoData(DEMO_KEYS.WORKFLOW_LOGS, [newWfPack, ...demoWf]);

            const demoAct = getDemoData(DEMO_KEYS.ACTIVITY_LOGS, INITIAL_DEMO_ACTIVITY_LOGS);
            const newAct = {
              id: `demo-act-${Date.now()}-${p}`,
              timestampStr: new Date().toISOString(),
              dateStr: new Date().toLocaleString("id-ID"),
              instrumentName: `${cfg.name} (Pack ${p}/${pCount})`,
              installation: selectedItem.asal || 'IGD',
              qty: cfg.type === 'set' ? 1 : Math.ceil((cfg.qty || cfg.receivedQty || 1) / pCount),
              type: cfg.type === 'set' ? 'Set' : 'Single',
              status: 'Packaging',
              operator: currentUsername
            };
            saveDemoData(DEMO_KEYS.ACTIVITY_LOGS, [newAct, ...demoAct]);
          } else {
            const newWfRef = doc(collection(db, "workflow_logs"));
            batch.set(newWfRef, {
              lotNumber: packLotNumber,
              idTerima: packIdTerima,
              parentReceiveId: selectedItem.idTerima,
              instrumentId: finalInstId,
              instrumentName: `${cfg.name} (Pack ${p}/${pCount})`,
              instrumentType: cfg.type || 'single',
              qty: cfg.type === 'set' ? 1 : Math.ceil((cfg.qty || cfg.receivedQty || 1) / pCount),
              currentStage: "sterilization",
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              packaging: packagingPayload,
              components: cfg.components || cfg.receivedComponents || cfg.items || [],
              items: cfg.components || cfg.receivedComponents || cfg.items || [],
              history: [
                {
                  stage: "decontamination",
                  timestamp: new Date(),
                  operatorName: currentUsername,
                  notes: `Diterima dari ${selectedItem.asal}`
                },
                {
                  stage: "packaging",
                  timestamp: new Date(),
                  operatorName: currentUsername,
                  notes: `Dikemas jadi ${pCount} pack (Pack ke-${p}) dengan ${cfg.packagingType}`
                }
              ]
            });

            const newActRef = doc(collection(db, "activity_logs"));
            batch.set(newActRef, {
              timestamp: serverTimestamp(),
              instrumentName: `${cfg.name} (Pack ${p}/${pCount})`,
              installation: selectedItem.asal || 'IGD',
              qty: cfg.type === 'set' ? 1 : Math.ceil((cfg.qty || cfg.receivedQty || 1) / pCount),
              type: cfg.type === 'set' ? 'Set' : 'Single',
              status: 'Packaging',
              operator: currentUsername
            });

            if (finalInstId) {
              const lsRef = doc(db, "instrument_live_state", finalInstId);
              batch.set(lsRef, {
                instrumentId: finalInstId,
                statusAlur: "STERILIZATION",
                currentState: "STERILIZATION",
                kondisi: "NORMAL",
                currentLocation: "CSSD_PACKAGING",
                currentHolder: "CSSD",
                updatedAt: new Date().toISOString()
              }, { merge: true });

              const activeTenantId = (() => {
                try {
                  return requireTenantId(currentUserProfile);
                } catch (e) {
                  return currentUserProfile?.tenantId || selectedItem?.tenantId || "";
                }
              })();

              const captureInstId = finalInstId;
              const capturePkgType = cfg.packagingType;
              const captureP = p;
              const capturePCount = pCount;

              auditLogTasks.push(async () => {
                await writeAuditLog({
                  tenantId: activeTenantId,
                  module: "PACKING",
                  action: "PACKING_LULUS",
                  entityType: "INSTRUMENT",
                  entityId: captureInstId,
                  instrumentId: captureInstId,
                  beforeState: "SEDANG MENGEMAS",
                  afterState: "STERILISASI",
                  beforeLocation: "CSSD_PACKAGING",
                  afterLocation: "CSSD_PACKAGING",
                  reason: `Dikemas dengan ${capturePkgType} + Indikator internal OK (Pack ${captureP}/${capturePCount})`,
                  userName: currentUsername,
                  userRole: "PETUGAS_CSSD"
                });
              });
            }
          }

          createdLogs.push({
            idTerima: packIdTerima,
            asal: selectedItem.asal,
            waktuSelesai: timeStr,
            petugas: currentUsername,
            packagingType: `${cfg.name} (${cfg.packagingType} - Pack ${p}/${pCount})`,
            lotNumber: packLotNumber,
            status: 'Menunggu Sterilisasi'
          });
        }
      }

      if (isDemoMode) {
        const demoWf = getDemoData(DEMO_KEYS.WORKFLOW_LOGS, INITIAL_DEMO_WORKFLOW_LOGS);
        const updatedWf = demoWf.map((item: any) => {
          if (item.firestoreDocId === docId || item.idTerima === selectedItem.idTerima) {
            return {
              ...item,
              currentStage: "sterilized_split_completed",
              updatedAtStr: new Date().toISOString()
            };
          }
          return item;
        });
        saveDemoData(DEMO_KEYS.WORKFLOW_LOGS, updatedWf);
      } else {
        if (docId) {
          batch.update(doc(db, "workflow_logs", docId), {
            currentStage: "sterilized_split_completed",
            updatedAt: serverTimestamp()
          });
        }
        await batch.commit();

        for (const task of auditLogTasks) {
          await task();
        }
      }

      setCompletedLog(prev => [...createdLogs, ...prev]);
      triggerActionConfirm({
        title: "Pengemasan & Labeling Berhasil!",
        message: `Sebanyak ${totalPacksCreated} kemasan & label etiket QR berhasil diproses dan diteruskan ke Sterilisasi.`
      });
      setSelectedItem(null);
    } catch (error) {
      console.error("Error finishing packaging:", error);
      alert("Terjadi kesalahan saat menyimpan atau mencetak label packing.");
    }
  };

  const handleRejectPackaging = async (reasonType: 'INSTRUMENT_CONTAMINATED' | 'PACKAGING_DAMAGE') => {
    if (!selectedItem) return;

    const docId = selectedItem.firestoreDocId || selectedItem.id;
    const isContaminated = reasonType === 'INSTRUMENT_CONTAMINATED';
    const targetStage = isContaminated ? 'decontamination' : 'packaging';
    const targetStatusAlur = isContaminated ? 'DEKONTAMINA' : 'SEDANG MENGEMAS';
    const targetLocation = isContaminated ? 'CSSD_DEKONTAMINASI' : 'CSSD_PACKAGING';
    const reasonText = isContaminated 
      ? 'Instrumen kotor / terkontaminasi, dikembalikan ke area Dekontaminasi' 
      : 'Kerusakan kemasan / sealing gagal, dilakukan re-pack di area Packaging';

    try {
      if (isDemoMode) {
        const demoWf = getDemoData(DEMO_KEYS.WORKFLOW_LOGS, INITIAL_DEMO_WORKFLOW_LOGS);
        const updatedWf = demoWf.map((item: any) => {
          if (item.firestoreDocId === docId || item.idTerima === selectedItem.idTerima) {
            return {
              ...item,
              currentStage: targetStage,
              status: isContaminated ? 'Di-cuci Ulang' : 'Perbaikan Kemasan',
              updatedAtStr: new Date().toISOString()
            };
          }
          return item;
        });
        saveDemoData(DEMO_KEYS.WORKFLOW_LOGS, updatedWf);
      } else {
        const batch = writeBatch(db);
        const auditLogTasks: Array<() => Promise<void>> = [];

        if (docId) {
          batch.update(doc(db, "workflow_logs", docId), {
            currentStage: targetStage,
            status: isContaminated ? 'Di-cuci Ulang' : 'Perbaikan Kemasan',
            updatedAt: serverTimestamp()
          });
        }

        if (selectedItem.items) {
          for (const item of selectedItem.items) {
            const instId = item.instrumentId;
            if (instId) {
              const lsRef = doc(db, "instrument_live_state", instId);
              batch.set(lsRef, {
                instrumentId: instId,
                statusAlur: targetStatusAlur,
                currentState: targetStatusAlur,
                kondisi: "NORMAL",
                currentLocation: targetLocation,
                currentHolder: "CSSD",
                updatedAt: new Date().toISOString()
              }, { merge: true });

              const activeTenantId = (() => {
                try {
                  return requireTenantId(currentUserProfile);
                } catch (e) {
                  return currentUserProfile?.tenantId || selectedItem?.tenantId || "";
                }
              })();

              const captureInstId = instId;
              auditLogTasks.push(async () => {
                await writeAuditLog({
                  tenantId: activeTenantId,
                  module: "PACKING",
                  action: "PACKING_REJECTED",
                  entityType: "INSTRUMENT",
                  entityId: captureInstId,
                  instrumentId: captureInstId,
                  beforeState: "SEDANG MENGEMAS",
                  afterState: targetStatusAlur,
                  beforeLocation: "CSSD_PACKAGING",
                  afterLocation: targetLocation,
                  reason: reasonText,
                  userName: currentUsername,
                  userRole: "PETUGAS_CSSD"
                });
              });
            }
          }
        }

        await batch.commit();

        for (const task of auditLogTasks) {
          await task();
        }
      }

      triggerActionConfirm({
        title: isContaminated ? "Dikembalikan ke Dekontaminasi" : "Ditetapkan Re-pack",
        message: `${selectedItem.idTerima || 'Instrumen'}: ${reasonText}`
      });

      setSelectedItem(null);
    } catch (err) {
      console.error("Error rejecting packaging:", err);
      alert("Gagal memproses penolakan pengemasan.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-4 border-b border-slate-800">
        <button 
          className={`py-2 px-4 font-bold text-sm border-b-2 transition flex items-center gap-2 ${activeTab === 'assembly' ? 'text-sky-400 border-sky-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
          onClick={() => setActiveTab('assembly')}
        >
          <Package className="w-4 h-4" /> Assembly & Labeling
        </button>
        <button 
          className={`py-2 px-4 font-bold text-sm border-b-2 transition flex items-center gap-2 ${activeTab === 'logbook' ? 'text-sky-400 border-sky-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
          onClick={() => setActiveTab('logbook')}
        >
          <CheckSquare className="w-4 h-4" /> Log Siap Steril
        </button>
      </div>

      {activeTab === 'assembly' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* KOLOM KIRI: ANTREAN DARI DEKONTAMINASI */}
          <div className="bg-slate-900/50 border border-slate-800/60 p-4 rounded-xl backdrop-blur-md flex flex-col h-[600px]">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center justify-between">
              <span>Antrean Pengemasan</span>
              <span className="bg-sky-500/10 text-sky-400 px-2 py-0.5 rounded text-[10px] font-mono">
                {combinedQueue.length} Pending
              </span>
            </h2>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {combinedQueue.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center p-6">
                  <Package className="w-10 h-10 mb-2 opacity-30" />
                  <p className="text-xs">Tidak ada alat dalam antrean pengemasan.</p>
                </div>
              ) : (
                combinedQueue.map((item) => (
                  <div 
                    key={item.firestoreDocId}
                    onClick={() => handleSelectToPack(item)}
                    className={`p-3 rounded-lg border cursor-pointer transition ${
                      selectedItem?.idTerima === item.idTerima 
                        ? 'bg-sky-950/40 border-sky-500/50 shadow-lg shadow-sky-950/30' 
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1.5">
                      <span className="font-mono text-xs font-bold text-sky-400">{item.idTerima}</span>
                      <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded">{item.asal}</span>
                    </div>
                    <div className="text-[11px] text-slate-300 font-medium line-clamp-2">
                      {Array.isArray(item.items) ? item.items.join(', ') : item.items}
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-900 flex justify-between items-center text-[10px] text-slate-500">
                      <span>Masuk: {item.waktuMasuk}</span>
                      <span className="text-sky-400 font-bold flex items-center gap-1">Proses <ArrowRight className="w-3 h-3" /></span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* KOLOM KANAN: WORKSTATION PACKAGING */}
          <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800/60 rounded-xl flex flex-col backdrop-blur-md min-h-[600px]">
            <div className="p-4 border-b border-slate-800 bg-slate-950/50 rounded-t-xl">
              <h2 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-2">
                <Package className="w-4 h-4" /> Workstation Pengemasan & Pembagian Pack
              </h2>
            </div>
            
            <div className="p-5 flex-1 overflow-y-auto">
              {!selectedItem ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50">
                  <Package className="w-16 h-16 mb-4" />
                  <p className="text-sm">Pilih alat dari daftar antrean di sebelah kiri</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-mono font-bold text-slate-200">{selectedItem.idTerima}</h3>
                      <p className="text-xs text-slate-400">Asal: {selectedItem.asal}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-500">Petugas Assembly:</p>
                      <p className="text-sm font-bold text-sky-400">{currentUsername}</p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 border-b border-slate-800 pb-2">Konfigurasi Qty & Pembagian Packing per SKU</h4>
                    <div className="space-y-3">
                      {selectedItem.packConfigs && selectedItem.packConfigs.map((cfg: any, idx: number) => (
                        <div key={idx} className="bg-slate-950 border border-slate-800/80 p-3.5 rounded-lg space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-slate-200">
                              {idx + 1}. {cfg.name} 
                              <span className={`text-[10px] px-2 py-0.5 rounded-full ml-2 font-semibold uppercase ${
                                cfg.type === 'set' 
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                                  : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                              }`}>
                                {cfg.type === 'set' ? 'Instrumen Set' : `Single (${cfg.qty || cfg.receivedQty || 1} Pcs)`}
                              </span>
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800">
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                                {cfg.type === 'set' ? 'Jumlah Set (1 Set = 1 Pack)' : 'Jumlah Pack (Pemisahan Qty)'}
                              </label>
                              <div className="flex items-center gap-2">
                                <div className="flex items-center">
                                  <button
                                    type="button"
                                    className="w-7 h-7 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-l border border-r-0 border-slate-700"
                                    onClick={() => updatePackConfig(idx, 'packCount', Math.max(1, (cfg.packCount || 1) - 1))}
                                  >
                                    -
                                  </button>
                                  <input 
                                    type="number" 
                                    min="1" 
                                    max={cfg.type === 'set' ? 10 : (cfg.qty || cfg.receivedQty || 1)}
                                    value={cfg.packCount || 1} 
                                    onChange={(e) => updatePackConfig(idx, 'packCount', parseInt(e.target.value) || 1)}
                                    className="w-12 h-7 bg-slate-950 text-center border-y border-slate-700 p-1 text-xs font-bold text-sky-400 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                                  <button
                                    type="button"
                                    className="w-7 h-7 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-r border border-l-0 border-slate-700"
                                    onClick={() => {
                                      const max = cfg.type === 'set' ? 10 : (cfg.qty || cfg.receivedQty || 1);
                                      updatePackConfig(idx, 'packCount', Math.min(max, (cfg.packCount || 1) + 1));
                                    }}
                                  >
                                    +
                                  </button>
                                </div>
                                <span className="text-[11px] text-slate-400">Pack / Bungkus</span>
                              </div>
                            </div>

                             <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800">
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Material Kemasan</label>
                              <select 
                                value={cfg.packagingType}
                                onChange={(e) => updatePackConfig(idx, 'packagingType', e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 text-xs rounded p-1.5 text-slate-300 focus:border-sky-500"
                              >
                                <option value="Packing Poch">Packing Poch</option>
                                <option value="Duk/Linen">Duk/Linen</option>
                                <option value="Poch Plasma">Poch Plasma</option>
                              </select>
                            </div>

                            <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800 flex items-center justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Indikator Kimia</span>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  checked={cfg.indicatorIncluded}
                                  onChange={(e) => updatePackConfig(idx, 'indicatorIncluded', e.target.checked)}
                                  className="rounded bg-slate-950 border-slate-600 text-emerald-500 focus:ring-emerald-500" 
                                />
                                <span className="text-[11px] font-semibold text-emerald-400">OK</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 flex flex-col sm:flex-row gap-2 border-t border-slate-800">
                    <button 
                      onClick={() => setSelectedItem(null)}
                      className="px-3 py-2 rounded-lg text-xs font-bold border border-slate-700 text-slate-400 hover:bg-slate-800 transition"
                    >
                      Batal
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleRejectPackaging('INSTRUMENT_CONTAMINATED')}
                      className="px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold transition flex items-center gap-1"
                      title="Kembalikan ke Dekontaminasi untuk dicuci ulang"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Instrumen Kotor
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleRejectPackaging('PACKAGING_DAMAGE')}
                      className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-bold transition flex items-center gap-1"
                      title="Kemasan rusak, re-pack di area Packaging"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Kemasan Rusak
                    </button>
                    <button 
                      onClick={handleFinishPackaging}
                      className="flex-1 bg-sky-600 hover:bg-sky-500 text-white py-2 rounded-lg text-xs font-bold flex justify-center items-center gap-2 transition shadow-lg shadow-sky-900/20 cursor-pointer"
                    >
                      <Printer className="w-4 h-4" /> Kemas, Cetak Label &amp; Lanjut Sterilisasi
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'logbook' && (
        <div className="bg-slate-900/50 border border-slate-800/60 p-5 rounded-xl backdrop-blur-md">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">Log Siap Sterilisasi</h2>
          <div className="overflow-x-auto overflow-y-hidden touch-pan-x overscroll-x-contain pb-2">
            <div className="text-[10px] text-sky-400 mb-2 italic sm:hidden flex items-center gap-1 font-mono">
              <span>← Geser tabel ke kiri/kanan untuk melihat semua kolom →</span>
            </div>
            <table className="min-w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono bg-slate-950/40">
                  <th className="p-3">ID Proses</th>
                  <th className="p-3">Instalasi Asal</th>
                  <th className="p-3">Jenis Kemasan</th>
                  <th className="p-3">Waktu Selesai & Petugas</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {completedLog.length === 0 ? (
                  <tr><td colSpan={5} className="text-center p-8 text-slate-500">Belum ada alat yang selesai dikemas hari ini.</td></tr>
                ) : (
                  completedLog.map((log, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/20 transition">
                      <td className="p-3 font-mono font-bold text-slate-200">{log.idTerima}</td>
                      <td className="p-3 text-slate-300">{log.asal}</td>
                      <td className="p-3 text-slate-300">{log.packagingType}</td>
                      <td className="p-3">
                        <div className="text-sky-400 font-bold">{log.waktuSelesai}</div>
                        <div className="text-[10px] text-slate-500">Oleh: {log.petugas}</div>
                      </td>
                      <td className="p-3 text-center">
                        <span className="bg-purple-500/10 border border-purple-500/20 text-purple-400 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase">
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
