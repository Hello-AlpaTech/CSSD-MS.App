import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import InlineScanner from './InlineScanner';
import { Camera, CameraOff, QrCode, Search, Trash2, CheckCircle, Package, Loader2, Ticket, FileText, AlertTriangle } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, where, getDocs, doc } from 'firebase/firestore';
import { DEMO_KEYS, getDemoData, saveDemoData, INITIAL_DEMO_UNIT_STOCK } from '../lib/demoStore';
import { triggerActionConfirm } from '../lib/actionToast';
import ReceptionTicket, { ReceptionTicketData } from './ReceptionTicket';
import PickupTicket from './PickupTicket';
import { checkInstrumentCSSDEligibility, executeReceptionTransaction, ScannedReceptionItem } from '../lib/receptionTransaction';
import { writeAuditLog } from '../lib/auditLogger';

const DEFAULT_MASTER_UNITS = [
  'IBS/OK', 'HCU', 'R YUDISTIRA', 'ICU', 'PICU', 'NICU', 'R ANJANI', 
  'KEBIDANAN', 'IGD', 'R SRIKANDI', 'R ARJUNA', 'POLI BEDAH', 'POLI GIGI', 
  'POLI OBGYN', 'POLI ANAK', 'POLI BIMA', 'POLI ANTASENA'
];

interface PenerimaanProps {
  currentUsername: string;
  currentUserProfile: UserProfile | null;
  onAddNewItem: (item: any) => void;
  isDemoMode?: boolean;
}

export default function Penerimaan({ currentUsername, currentUserProfile, onAddNewItem, isDemoMode = false }: PenerimaanProps) {
  // Navigation Sub-tab
  const [activeSubTab, setActiveSubTab] = useState<'form' | 'pickup'>('form');

  // Form State
  const [tanggalPenerimaan, setTanggalPenerimaan] = useState(new Date().toISOString().split('T')[0]);
  const [asalInstalasi, setAsalInstalasi] = useState('IGD');
  const [namaPenyerah, setNamaPenyerah] = useState('');
  const [idTerima, setIdTerima] = useState('');
  const [receptionIdempotencyKey, setReceptionIdempotencyKey] = useState<string>('');

  const generateNewPenerimaanId = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    return `TRM-${yyyy}${mm}${dd}-${randomSuffix}`;
  };

  const generateIdempotencyKey = () => {
    return `IDEMP-REC-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  };

  useEffect(() => {
    setIdTerima(generateNewPenerimaanId());
    setReceptionIdempotencyKey(generateIdempotencyKey());
  }, []);
  
  // Data State
  const [firestoreInstruments, setFirestoreInstruments] = useState<any[]>([]);
  const [firestoreUnits, setFirestoreUnits] = useState<string[]>([]);
  
  // Scanner & List State
  const [isScanning, setIsScanning] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [scannedItems, setScannedItems] = useState<ScannedReceptionItem[]>([]);
  
  // Modal & Print Ticket State
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketModalData, setTicketModalData] = useState<ReceptionTicketData | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  
  // Real-time catalog & units from Firestore
  useEffect(() => {
    if (isDemoMode) {
      const loadDemoData = () => {
        const units = getDemoData(DEMO_KEYS.UNITS, DEFAULT_MASTER_UNITS.map(name => ({ id: name, name })));
        setFirestoreUnits(units.map((u: any) => u.name));
        
        setFirestoreInstruments([
          { id: "INST-001", sku: "INST-001", name: "Gunting Jaringan", type: "single", originUnit: "IGD" },
          { id: "INST-002", sku: "INST-002", name: "Pinset Anatomis", type: "single", originUnit: "IGD" },
          { id: "INST-003", sku: "INST-003", name: "Nalpuder", type: "single", originUnit: "IBS/OK" },
          { id: "INST-004", sku: "INST-004", name: "Hecting Set", type: "set", components: [{ name: "Gunting Angkat Jahitan", standardQty: 1 }, { name: "Pinset Cirurgis", standardQty: 2 }], originUnit: "IGD" }
        ]);
      };
      loadDemoData();
      return;
    }

    const unsubInst = onSnapshot(collection(db, "instruments"), (snap) => {
      const list: any[] = [];
      snap.forEach(docSnap => list.push({ id: docSnap.id, ...docSnap.data() }));
      setFirestoreInstruments(list);
    }, (err) => handleFirestoreError(err, OperationType.GET, "instruments"));

    const unsubUnits = onSnapshot(collection(db, "master_units"), (snap) => {
      const list: string[] = [];
      snap.forEach(docSnap => {
        const data = docSnap.data();
        if (data.name) list.push(data.name);
      });
      setFirestoreUnits(list);
    }, (err) => handleFirestoreError(err, OperationType.GET, "master_units"));

    return () => {
      unsubInst();
      unsubUnits();
    };
  }, [isDemoMode]);

  const [unitStockList, setUnitStockList] = useState<any[]>([]);

  useEffect(() => {
    if (!asalInstalasi) return;
    
    if (isDemoMode) {
      const loadDemoStock = () => {
        const allStock = getDemoData(DEMO_KEYS.UNIT_STOCK, INITIAL_DEMO_UNIT_STOCK);
        const filtered = allStock.filter((s: any) => s.unit === asalInstalasi && s.qty > 0);
        setUnitStockList(filtered);
      };
      loadDemoStock();
      
      const handleStoreChange = (e: any) => {
        if (!e.detail?.key || e.detail.key === DEMO_KEYS.UNIT_STOCK || e.detail.key === "all") {
          loadDemoStock();
        }
      };
      window.addEventListener("cssd_demo_store_change", handleStoreChange);
      return () => window.removeEventListener("cssd_demo_store_change", handleStoreChange);
    } else {
      const q = query(
        collection(db, "unit_stock"),
        where("unit", "==", asalInstalasi)
      );
      const unsub = onSnapshot(q, (snap) => {
        const list: any[] = [];
        snap.forEach(docSnap => {
          const data = docSnap.data();
          if (data && typeof data.qty === "number" && data.qty > 0) {
            list.push({ id: docSnap.id, ...data });
          }
        });
        setUnitStockList(list);
      }, (error) => {
        console.error("Error fetching unit stock:", error);
      });
      return () => unsub();
    }
  }, [asalInstalasi, isDemoMode]);

  const aggregatedUnitStock = React.useMemo(() => {
    const map = new Map<string, { instrumentId: string; name: string; totalQty: number; type: string; originUnit: string; components?: any[] }>();
    
    // 1. Populate active unit stock
    unitStockList.forEach(item => {
      const instId = item.instrumentId;
      if (!map.has(instId)) {
        const rawComp = item.components || item.items || [];
        const formattedComp = rawComp.map((c: any) => ({
          name: c.name || '',
          standardQty: Number(c.qty || c.standardQty || 1),
          receivedQty: Number(c.qty || c.receivedQty || 1)
        }));
        map.set(instId, {
          instrumentId: instId,
          name: item.instrumentName || item.name || 'Unknown',
          totalQty: item.qty || 0,
          type: item.type || 'single',
          originUnit: item.unit || asalInstalasi,
          components: formattedComp
        });
      } else {
        const existing = map.get(instId)!;
        existing.totalQty += (item.qty || 0);
      }
    });

    // 2. Include catalog instruments for selected unit
    firestoreInstruments.forEach(inst => {
      const instId = inst.id || inst.sku;
      if (!map.has(instId)) {
        const isMatchingUnit = inst.originUnit === asalInstalasi;
        if (isMatchingUnit) {
          const rawComp = inst.items || inst.components || [];
          const formattedComp = rawComp.map((c: any) => ({
            name: c.name || '',
            standardQty: Number(c.qty || c.standardQty || 1),
            receivedQty: Number(c.qty || c.receivedQty || 1)
          }));
          map.set(instId, {
            instrumentId: instId,
            name: inst.name,
            totalQty: 0,
            type: inst.type || 'single',
            originUnit: inst.originUnit || asalInstalasi,
            components: formattedComp
          });
        }
      }
    });

    return Array.from(map.values());
  }, [unitStockList, firestoreInstruments, asalInstalasi]);

  const groupedUnitStock = React.useMemo(() => {
    const matchingItems: typeof aggregatedUnitStock = [];
    const otherItems: typeof aggregatedUnitStock = [];

    aggregatedUnitStock.forEach(item => {
      if (!asalInstalasi || item.originUnit === asalInstalasi) {
        matchingItems.push(item);
      } else {
        otherItems.push(item);
      }
    });

    const matchingGroups: { [unit: string]: typeof aggregatedUnitStock } = {};
    matchingItems.forEach(item => {
      const u = item.originUnit || 'Lainnya';
      if (!matchingGroups[u]) matchingGroups[u] = [];
      matchingGroups[u].push(item);
    });

    const otherGroups: { [unit: string]: typeof aggregatedUnitStock } = {};
    otherItems.forEach(item => {
      const u = item.originUnit || 'Lainnya';
      if (!otherGroups[u]) otherGroups[u] = [];
      otherGroups[u].push(item);
    });

    return { matchingGroups, otherGroups, hasMatching: matchingItems.length > 0 };
  }, [aggregatedUnitStock, asalInstalasi]);

  const handleScan = async (code: string) => {
    if (!code) return;
    const cleanCode = code.trim();

    // Check if code matches an instrumentId, SKU, or name
    let stockItem = aggregatedUnitStock.find(i => i.instrumentId === cleanCode || i.name.toLowerCase() === cleanCode.toLowerCase());
    if (!stockItem) {
      const lotMatch = unitStockList.find(s => s.lotNumber === cleanCode);
      if (lotMatch) {
        stockItem = aggregatedUnitStock.find(i => i.instrumentId === lotMatch.instrumentId);
      }
    }

    // Fallback search in master instruments if not found yet
    if (!stockItem) {
      const masterFallback = firestoreInstruments.find(i => i.id === cleanCode || i.sku === cleanCode || i.name.toLowerCase() === cleanCode.toLowerCase());
      if (masterFallback) {
        const rawComp = masterFallback.items || masterFallback.components || [];
        const formattedComp = rawComp.map((c: any) => ({
          name: c.name || '',
          standardQty: Number(c.qty || c.standardQty || 1),
          receivedQty: Number(c.qty || c.receivedQty || 1)
        }));
        stockItem = {
          instrumentId: masterFallback.id || masterFallback.sku,
          name: masterFallback.name,
          totalQty: 0,
          type: masterFallback.type || 'single',
          originUnit: masterFallback.originUnit || asalInstalasi,
          components: formattedComp
        };
      }
    }

    const targetInstrumentId = stockItem ? stockItem.instrumentId : cleanCode;

    // 🔒 DUPLICATE RECEPTION CHECK: SSoT Check in instrument_live_state
    const checkResult = await checkInstrumentCSSDEligibility(targetInstrumentId, asalInstalasi, isDemoMode);

    if (!checkResult.isEligible) {
      // Record audit log REJECT_DUPLICATE_RECEPTION
      await writeAuditLog({
        action: "REJECT_DUPLICATE_RECEPTION",
        module: "PENERIMAAN",
        entityType: "RECEIVING",
        instrumentId: targetInstrumentId,
        transactionId: idTerima,
        ticketId: idTerima,
        reason: `Penerimaan ditolak: ${checkResult.reason}`,
        result: "REJECTED",
        userName: currentUsername
      });

      alert(
        `⚠️ ALAT SUDAH BERADA DI CSSD\n\n` +
        `ID Instrumen: ${checkResult.instrumentId}\n` +
        `Status: ${checkResult.statusAlur}\n` +
        `Lokasi: ${checkResult.location}\n` +
        `ID Penerimaan Aktif: ${checkResult.activeTransaction}\n\n` +
        `Alat ini tidak dapat dimasukkan ke penerimaan baru.`
      );
      setScanInput('');
      return;
    }

    if (stockItem) {
      setScannedItems(prev => {
        const existingIdx = prev.findIndex(item => item.instrumentId === stockItem!.instrumentId && item.condition === 'Bekas Pakai');
        if (existingIdx >= 0) {
          // Physical instruments with ID format (e.g. ST-HECST01-IGD1) cannot be scanned twice
          if (stockItem!.instrumentId.includes('-')) {
            alert(`⚠️ DUPLIKAT\nInstrumen ${stockItem!.instrumentId} sudah ada dalam daftar penerimaan ini.`);
            return prev;
          }
          const newItems = [...prev];
          newItems[existingIdx].qty += 1;
          return newItems;
        }
        return [...prev, {
          id: Date.now().toString() + Math.random().toString(36).slice(2),
          instrumentId: stockItem!.instrumentId || targetInstrumentId,
          name: stockItem!.name || 'Unknown Instrument',
          type: stockItem!.type || 'single',
          qty: 1,
          condition: 'Bekas Pakai',
          components: stockItem!.components || []
        }];
      });
    } else {
      alert(`Instrumen dengan ID/SKU/Nama "${cleanCode}" tidak ditemukan di Master Data maupun Stok Unit ${asalInstalasi}.`);
    }
    setScanInput('');
  };

  const handleQrScanSuccess = (decodedText: string) => {
    handleScan(decodedText);
    setIsScanning(false);
  };

  const updateScannedItem = (id: string, field: string, value: any) => {
    setScannedItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const removeScannedItem = (id: string) => {
    setScannedItems(prev => prev.filter(item => item.id !== id));
  };

  const handleSubmit = async () => {
    if (scannedItems.length === 0) {
      alert("Belum ada instrumen yang di-scan.");
      return;
    }
    if (!namaPenyerah.trim()) {
      alert("Nama penyerah (petugas ruangan/instalasi) wajib diisi.");
      return;
    }

    const currentIdTerima = idTerima || generateNewPenerimaanId();
    if (!idTerima) setIdTerima(currentIdTerima);

    const activeIdempotencyKey = receptionIdempotencyKey || generateIdempotencyKey();
    if (!receptionIdempotencyKey) setReceptionIdempotencyKey(activeIdempotencyKey);

    setIsSubmitting(true);

    try {
      // Atomic Transaction Execution
      const result = await executeReceptionTransaction({
        idTerima: currentIdTerima,
        idempotencyKey: activeIdempotencyKey,
        tanggalPenerimaan,
        asalInstalasi,
        namaPenyerah,
        namaPenerima: currentUsername,
        items: scannedItems,
        userProfile: currentUserProfile as UserProfile,
        userScope: asalInstalasi,
        isDemoMode
      });

      triggerActionConfirm({
        title: "Penerimaan Alat Berhasil!",
        message: `Tanda terima ${currentIdTerima} dari ${asalInstalasi} telah dikonfirmasi & masuk ke Dekontaminasi.`
      });

      // Prepare ticket modal data
      let totalPcs = 0;
      scannedItems.forEach(i => {
        if (i.type === 'set' && i.components) {
          let pcs = 0;
          i.components.forEach((c: any) => pcs += Number(c.standardQty || 1));
          totalPcs += pcs * i.qty;
        } else {
          totalPcs += i.qty;
        }
      });

      setTicketModalData({
        idPenerimaan: currentIdTerima,
        tanggalPenerimaan,
        asalInstalasi,
        namaPenyerah,
        namaPenerima: currentUsername,
        items: scannedItems,
        totalPcs,
        status: "AKTIF"
      });

      setSubmitSuccess(true);
      setTimeout(() => {
        setSubmitSuccess(false);
        setIsSubmitting(false);
        setShowTicketModal(true); // Auto show printable ticket
        setScannedItems([]);
        setNamaPenyerah('');
        setIdTerima(generateNewPenerimaanId());
        setReceptionIdempotencyKey(generateIdempotencyKey());
      }, 1500);

    } catch (err: any) {
      console.error(err);
      alert(err.message || "Gagal memproses penerimaan.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* Top Module Sub-tab Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-1.5 flex gap-2">
        <button
          onClick={() => setActiveSubTab('form')}
          className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
            activeSubTab === 'form'
              ? 'bg-sky-500 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Package className="w-4 h-4" />
          1. Form Penerimaan Alat CSSD
        </button>

        <button
          onClick={() => setActiveSubTab('pickup')}
          className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
            activeSubTab === 'pickup'
              ? 'bg-sky-500 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Ticket className="w-4 h-4" />
          2. Pengambilan & Status Tiket (Pickup)
        </button>
      </div>

      {activeSubTab === 'pickup' ? (
        <PickupTicket currentUsername={currentUsername} currentUserProfile={currentUserProfile as UserProfile} isDemoMode={isDemoMode} />
      ) : (
        <>
          {/* Form Header */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Package className="w-4 h-4 text-sky-500" />
                Form Penerimaan Fisik Instrumen (SSoT Live State)
              </h2>
            </div>
            
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 bg-sky-50/50 border border-sky-100 rounded-xl p-3.5 flex items-center justify-between shadow-inner">
                <div>
                  <span className="block text-[10px] font-black text-sky-600 uppercase tracking-wider mb-0.5">ID Penerimaan (Otomatis / Atomic)</span>
                  <span className="text-base font-extrabold font-mono text-sky-800">{idTerima}</span>
                </div>
                <div className="text-right">
                  <span className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Tahap Awal</span>
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded text-[11px] font-bold uppercase mt-0.5">
                    DITERIMA / DEKONTAMINASI
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Tanggal Penerimaan</label>
                <input 
                  type="date" 
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                  value={tanggalPenerimaan}
                  onChange={(e) => setTanggalPenerimaan(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Asal Instalasi</label>
                <select 
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                  value={asalInstalasi}
                  onChange={(e) => {
                    setAsalInstalasi(e.target.value);
                    setScanInput('');
                  }}
                >
                  {(firestoreUnits.length > 0 ? firestoreUnits : DEFAULT_MASTER_UNITS).map((unit) => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Nama Penyerah (Petugas Ruangan)</label>
                <input 
                  type="text" 
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                  placeholder="Contoh: Budi (Perawat IGD)"
                  value={namaPenyerah}
                  onChange={(e) => setNamaPenyerah(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Penerima (Petugas CSSD)</label>
                <input 
                  type="text" 
                  readOnly
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-500 font-medium outline-none cursor-not-allowed"
                  value={currentUsername}
                />
              </div>
            </div>
          </div>

          {/* Scanner & Input Panel */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <QrCode className="w-4 h-4 text-sky-500" />
                Scan ID Instrumen
              </h2>
              <button
                onClick={() => setIsScanning(!isScanning)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  isScanning 
                    ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' 
                    : 'bg-sky-50 text-sky-600 hover:bg-sky-100'
                }`}
              >
                {isScanning ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                {isScanning ? 'Tutup Scanner' : 'Buka Scanner Kamera'}
              </button>
            </div>
            
            <div className="p-4">
              {isScanning && (
                <div className="w-full max-w-sm mx-auto aspect-square bg-black rounded-xl overflow-hidden relative mb-4 shadow-inner ring-4 ring-slate-100">
                  <InlineScanner onScan={handleQrScanSuccess} isScanning={isScanning} />
                  <div className="absolute inset-0 pointer-events-none border-[3px] border-sky-500/50 border-dashed rounded-xl m-8"></div>
                  <div className="absolute bottom-4 left-0 right-0 text-center">
                    <span className="bg-black/60 text-white text-[10px] uppercase tracking-wider font-medium px-3 py-1.5 rounded-full backdrop-blur-sm">
                      Arahkan QR Code ID Instrumen
                    </span>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                    <Search className="h-4 w-4 text-slate-400" />
                  </div>
                  <select
                    className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all cursor-pointer font-medium"
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                  >
                    <option value="">
                      {asalInstalasi 
                        ? `-- Pilih ID Instrumen / Alat (${asalInstalasi}) --`
                        : "-- Pilih ID Instrumen / Nama Alat --"
                      }
                    </option>

                    {(Object.entries(groupedUnitStock.matchingGroups) as [string, typeof aggregatedUnitStock][]).map(([unitGroup, items]) => (
                      <optgroup key={unitGroup} label={`Asal Instalasi: ${unitGroup}`}>
                        {items.map(inst => (
                          <option key={inst.instrumentId} value={inst.instrumentId}>
                            {inst.name} ({inst.instrumentId}) {inst.totalQty > 0 ? `- [Stok Steril: ${inst.totalQty}]` : ''}
                          </option>
                        ))}
                      </optgroup>
                    ))}

                    {asalInstalasi && !groupedUnitStock.hasMatching && (
                      <option value="" disabled className="text-slate-400">
                        Belum ada ID Instrumen khusus terdaftar untuk unit {asalInstalasi}
                      </option>
                    )}
                  </select>
                </div>
                
                <button 
                  type="button"
                  onClick={() => {
                    if (scanInput) {
                      handleScan(scanInput);
                    } else {
                      alert("Silakan pilih instrumen terlebih dahulu.");
                    }
                  }}
                  disabled={!scanInput}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Tambah Ke Daftar
                </button>
              </div>
            </div>
          </div>

          {/* Scanned Items List */}
          {scannedItems.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                  Daftar Barang Dalam Transaksi Penerimaan ini ({scannedItems.length} Item)
                </h2>
              </div>

              <div className="divide-y divide-slate-100">
                {scannedItems.map((item) => (
                  <div key={item.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-slate-800">{item.name}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${item.type === 'set' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {item.type}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 font-mono font-medium">ID: {item.instrumentId}</div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1">Jumlah</label>
                        <div className="flex items-center">
                          <button
                            type="button"
                            className="w-8 h-[34px] flex items-center justify-center bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-l-lg border border-r-0 border-slate-200"
                            onClick={() => updateScannedItem(item.id, 'qty', Math.max(1, item.qty - 1))}
                          >
                            -
                          </button>
                          <input 
                            type="number" 
                            min="1"
                            className="w-12 h-[34px] px-1 bg-slate-50 border-y border-slate-200 text-sm text-center outline-none focus:border-sky-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={item.qty}
                            onChange={(e) => updateScannedItem(item.id, 'qty', parseInt(e.target.value) || 1)}
                          />
                          <button
                            type="button"
                            className="w-8 h-[34px] flex items-center justify-center bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-r-lg border border-l-0 border-slate-200"
                            onClick={() => updateScannedItem(item.id, 'qty', item.qty + 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col">
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1">Kondisi</label>
                        <select
                          className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-500 font-medium"
                          value={item.condition}
                          onChange={(e) => updateScannedItem(item.id, 'condition', e.target.value)}
                        >
                          <option value="Bekas Pakai">Bekas Pakai - Normal</option>
                          <option value="Bekas Pakai - Rusak">Bekas Pakai - Rusak (Tahan/Hold)</option>
                          <option value="Expired Date">Expired Date</option>
                        </select>
                      </div>

                      {item.type === 'set' && (
                        <div className="flex flex-col justify-center">
                          <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200">
                            <input 
                              type="checkbox"
                              checked={!!item.isIncomplete}
                              onChange={(e) => updateScannedItem(item.id, 'isIncomplete', e.target.checked)}
                              className="rounded text-amber-600 focus:ring-amber-500"
                            />
                            Set Tidak Lengkap
                          </label>
                          {item.isIncomplete && (
                            <input 
                              type="text"
                              placeholder="Catatan komponen kurang..."
                              className="mt-1 px-2 py-1 text-xs bg-white border border-amber-300 rounded outline-none focus:ring-1 focus:ring-amber-500"
                              value={item.missingComponentsNote || ''}
                              onChange={(e) => updateScannedItem(item.id, 'missingComponentsNote', e.target.value)}
                            />
                          )}
                        </div>
                      )}

                      <button 
                        type="button"
                        onClick={() => removeScannedItem(item.id)}
                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors mt-5"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 print:hidden">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold rounded-xl transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  Proses & Buat Tiket Penerimaan
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Ticket Modal */}
      {showTicketModal && ticketModalData && (
        <ReceptionTicket 
          data={ticketModalData} 
          onClose={() => setShowTicketModal(false)} 
          currentUser={currentUsername}
        />
      )}

      {/* Submit Loading Overlay */}
      {(isSubmitting || submitSuccess) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full flex flex-col items-center text-center transform transition-all scale-100 animate-in zoom-in-95 duration-300">
            {isSubmitting && !submitSuccess && (
              <>
                <Loader2 className="w-16 h-16 text-sky-500 animate-spin mb-4" />
                <h3 className="text-lg font-bold text-slate-800">Memproses Transaksi Penerimaan...</h3>
                <p className="text-xs text-slate-500 mt-2">Memvalidasi SSoT Live State & menyimpan transaksi atomic</p>
              </>
            )}
            {submitSuccess && (
              <>
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-4 text-emerald-500 shadow-inner">
                  <CheckCircle className="w-12 h-12 animate-in zoom-in duration-500" />
                </div>
                <h3 className="text-xl font-bold text-slate-800">Berhasil!</h3>
                <p className="text-xs text-slate-500 mt-2">Data penerimaan telah disimpan. Menyiapkan Tiket Penerimaan 58mm...</p>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
