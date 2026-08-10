import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Wand2, 
  Camera, 
  X, 
  Plus, 
  Trash2, 
  Save, 
  Layers, 
  Package, 
  Building2, 
  QrCode, 
  AlertCircle,
  AlertTriangle,
  FileText,
  CheckCircle2,
  ChevronRight
} from "lucide-react";
import { collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, limit, runTransaction, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { triggerActionConfirm } from "../lib/actionToast";
import InlineScanner from "./InlineScanner";
import { SERIAL_NUMBER_REGEX, generate5CharAbbr, formatToStandardSerialNumber, getKodeInstalasi } from "../lib/serialNumberUtils";
import { UserProfile } from "../types";

export interface InventoryComponent {
  name: string;
  qty: number;
  notes?: string;
}

export interface InventoryItemHeader {
  id: string; // Serial Number e.g. ST-HECTG-001
  serialNumber: string;
  name: string; // Nama Item (Master Grup)
  type: "set" | "single";
  originUnit: string; // Instalasi pemilik
  totalStock: number;
  description?: string;
  components: InventoryComponent[]; // Detail rincian komponen
  items?: InventoryComponent[]; // Dual key for backwards compatibility
  createdAt?: string;
  updatedAt?: string;
}

interface InventoryRegistrationFormProps {
  isOpen?: boolean;
  onClose?: () => void;
  onSuccess?: (item: InventoryItemHeader) => void;
  initialData?: Partial<InventoryItemHeader> | null;
  isEditing?: boolean;
  isDemoMode?: boolean;
  currentUserProfile?: UserProfile | null;
}

const DEFAULT_UNITS = [
  "OK Sentral",
  "IGD",
  "ICU",
  "Poli Bedah",
  "Rawat Inap",
  "VK Kebidanan",
  "Poli Rawat Jalan",
  "Laboratorium",
  "Radiologi",
  "Instalasi CSSD"
];

export default function InventoryRegistrationForm({
  isOpen = true,
  onClose,
  onSuccess,
  initialData,
  isEditing = false,
  isDemoMode = false,
  currentUserProfile = null
}: InventoryRegistrationFormProps) {
  const tenantId = currentUserProfile?.tenantId || "RSUD-BENDA";
  const [serialNumber, setSerialNumber] = useState<string>(initialData?.serialNumber || initialData?.id || "");
  const [itemName, setItemName] = useState<string>(initialData?.name || "");
  const [type, setType] = useState<"set" | "single">(initialData?.type || "set");
  const [originUnit, setOriginUnit] = useState<string>(initialData?.originUnit || "");
  const [totalStock, setTotalStock] = useState<number>(initialData?.totalStock ?? 1);
  const [description, setDescription] = useState<string>(initialData?.description || "");
  
  // Form Detail State (Header-Detail Components)
  const [components, setComponents] = useState<InventoryComponent[]>(
    initialData?.components && initialData.components.length > 0 
      ? initialData.components 
      : initialData?.items && initialData.items.length > 0
      ? initialData.items
      : [{ name: "", qty: 1 }]
  );

  // Helper States
  const [unitsList, setUnitsList] = useState<string[]>(DEFAULT_UNITS);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [serialError, setSerialError] = useState<string | null>(null);
  const [previewIds, setPreviewIds] = useState<string[]>([]);

  // Compute Preview IDs whenever form inputs change
  useEffect(() => {
    if (isEditing) {
      setPreviewIds([serialNumber]);
      return;
    }

    if (!itemName.trim() || !originUnit) {
      setPreviewIds([]);
      return;
    }

    // Do NOT generate fake IDs offline
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setPreviewIds([]);
      return;
    }

    const typePrefix = type === "set" ? "ST" : "SG";
    const nameAbbr = generate5CharAbbr(itemName);
    const instCode = getKodeInstalasi(originUnit);
    const qty = Math.max(1, totalStock || 1);
    const sequenceKey = `${typePrefix}-${nameAbbr}`;

    let isMounted = true;
    const fetchPreviewSeqs = async () => {
      try {
        const counterRef = doc(db, "sequences", sequenceKey);
        const counterSnap = await getDoc(counterRef);
        let lastSeq = 0;
        if (counterSnap.exists()) {
          lastSeq = counterSnap.data().lastSeq || 0;
        } else {
          // Check existing docs in master_instruments
          const snapInst = await getDocs(query(collection(db, "master_instruments"), where("tenantId", "==", tenantId), limit(100)));
          snapInst.forEach(d => {
            const idStr = d.id;
            if (idStr && idStr.startsWith(`${typePrefix}-${nameAbbr}`)) {
              const match = idStr.match(/\d{2,3}/);
              if (match) {
                const seq = parseInt(match[0], 10);
                if (!isNaN(seq) && seq > lastSeq) lastSeq = seq;
              }
            }
          });
        }

        const generated: string[] = [];
        for (let i = 1; i <= qty; i++) {
          const nextSeq = (lastSeq + i).toString().padStart(2, "0");
          generated.push(`${typePrefix}-${nameAbbr}${nextSeq}-${instCode}`);
        }

        if (isMounted) {
          setPreviewIds(generated);
          if (generated.length > 0 && !serialNumber) {
            setSerialNumber(generated[0]);
          }
        }
      } catch (err) {
        // Clear preview if offline/error
        if (isMounted) setPreviewIds([]);
      }
    };

    fetchPreviewSeqs();
    return () => { isMounted = false; };
  }, [itemName, type, originUnit, totalStock, isEditing, serialNumber]);

  // Load Master Ruangan (units) from Firestore 'master_units'
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "master_units"), where("tenantId", "==", tenantId)), (snap) => {
      const fetched: string[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (data && data.name) {
          fetched.push(data.name);
        } else if (d.id) {
          fetched.push(d.id);
        }
      });
      if (fetched.length > 0) {
        const merged = Array.from(new Set([...fetched, ...DEFAULT_UNITS])).sort();
        setUnitsList(merged);
      } else {
        setUnitsList(DEFAULT_UNITS);
      }
    }, (err) => {
      console.warn("Using default hospital units list.", err);
    });

    return () => unsub();
  }, []);

  // Update effect when type changes
  useEffect(() => {
    if (type === "single" && components.length === 0) {
      setComponents([{ name: itemName || "Instrumen Satuan", qty: 1 }]);
    }
  }, [type]);

  // Validate Serial Number Format: [ST/SG]-[5 Abbr]-[3 Digit]
  const validateSerialNumberFormat = (sn: string): boolean => {
    if (!sn) {
      setSerialError("Serial Number wajib diisi.");
      return false;
    }
    const trimmed = sn.trim().toUpperCase();
    if (!SERIAL_NUMBER_REGEX.test(trimmed)) {
      setSerialError("Format Serial Number harus: ST/SG-[5 Karakter]-[3 Digit Angka], Contoh: ST-HECTG-001");
      return false;
    }
    setSerialError(null);
    return true;
  };

  // Save offline draft without permanent ID
  const handleSaveDraftOffline = () => {
    if (!itemName.trim() || !originUnit) {
      setErrorMessage("Nama Item dan Asal Instalasi wajib diisi untuk menyimpan draf offline.");
      return;
    }

    const draftData = {
      id: `DRAFT_${Date.now()}`,
      status: "DRAFT — BELUM TERDAFTAR",
      itemName: itemName.trim(),
      type,
      originUnit,
      totalStock: Math.max(1, totalStock || 1),
      description: description.trim(),
      components: components.filter(c => c.name.trim().length > 0),
      createdAt: new Date().toISOString()
    };

    try {
      const existingDraftsJson = localStorage.getItem("cssd_offline_registration_drafts");
      const existingDrafts = existingDraftsJson ? JSON.parse(existingDraftsJson) : [];
      existingDrafts.push(draftData);
      localStorage.setItem("cssd_offline_registration_drafts", JSON.stringify(existingDrafts));

      triggerActionConfirm({
        title: "Draf Offline Berhasil Disimpan",
        message: `Draf '${itemName}' disimpan dengan status DRAFT — BELUM TERDAFTAR. Silakan sambungkan ke internet untuk alokasi ID permanen.`
      });

      if (onClose) onClose();
    } catch (err) {
      setErrorMessage("Gagal menyimpan draf offline ke penyimpanan lokal.");
    }
  };

  // Generate Serial Number automatically
  const generateSerialNumber = async (overrideName?: string, overrideType?: "set" | "single", overrideUnit?: string) => {
    const nameToUse = overrideName ?? itemName;
    const typeToUse = overrideType ?? type;
    const unitToUse = overrideUnit ?? originUnit;

    if (!nameToUse.trim()) {
      setErrorMessage("Silakan isi 'Nama Item (Master Grup)' terlebih dahulu untuk generate Serial Number.");
      return;
    }

    // Check offline status
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setErrorMessage(
        "Tidak dapat mendaftarkan instrumen baru saat offline. Pembuatan ID Instrumen membutuhkan koneksi ke server untuk menjamin nomor ID unik dan permanen. Silakan sambungkan perangkat ke internet lalu coba kembali."
      );
      return;
    }

    setErrorMessage(null);
    const typePrefix = typeToUse === "set" ? "ST" : "SG";
    const nameAbbr = generate5CharAbbr(nameToUse);
    const instCode = getKodeInstalasi(unitToUse);
    const sequenceKey = `${typePrefix}-${nameAbbr}`;

    try {
      // Look up sequence counter doc
      const counterRef = doc(db, "sequences", sequenceKey);
      const counterSnap = await getDoc(counterRef);
      let lastSeq = 0;
      if (counterSnap.exists()) {
        lastSeq = counterSnap.data().lastSeq || 0;
      } else {
        // Fallback: search existing master instruments to calculate sequential index
        const snapInst = await getDocs(query(collection(db, "master_instruments"), where("tenantId", "==", tenantId), limit(100)));

        snapInst.forEach(d => {
          const idStr = d.id;
          if (idStr && idStr.startsWith(`${typePrefix}-${nameAbbr}`)) {
            const match = idStr.match(/\d{2,3}/);
            if (match) {
              const seq = parseInt(match[0], 10);
              if (!isNaN(seq) && seq > lastSeq) lastSeq = seq;
            }
          }
        });
      }

      const nextSeq = (lastSeq + 1).toString().padStart(2, "0");
      const generated = `${typePrefix}-${nameAbbr}${nextSeq}-${instCode}`;
      
      setSerialNumber(generated);
      setSerialError(null);
    } catch (err) {
      setErrorMessage(
        "Tidak dapat mendaftarkan instrumen baru saat offline. Pembuatan ID Instrumen membutuhkan koneksi ke server untuk menjamin nomor ID unik dan permanen. Silakan sambungkan perangkat ke internet lalu coba kembali."
      );
    }
  };

  // Dynamic Component Handlers
  const handleAddComponent = () => {
    setComponents(prev => [...prev, { name: "", qty: 1 }]);
  };

  const handleRemoveComponent = (index: number) => {
    if (components.length <= 1 && type === "set") {
      setErrorMessage("Tipe Set minimal harus memiliki 1 rincian komponen.");
      return;
    }
    setErrorMessage(null);
    setComponents(prev => prev.filter((_, i) => i !== index));
  };

  const handleComponentChange = (index: number, field: "name" | "qty", value: any) => {
    setComponents(prev => {
      const updated = [...prev];
      if (field === "qty") {
        updated[index].qty = Math.max(1, parseInt(value) || 1);
      } else {
        updated[index].name = value;
      }
      return updated;
    });
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Offline check for new registration
    if (!isEditing && typeof navigator !== "undefined" && !navigator.onLine) {
      setErrorMessage(
        "Tidak dapat mendaftarkan instrumen baru saat offline.\n\nPembuatan ID Instrumen membutuhkan koneksi ke server untuk menjamin nomor ID unik dan permanen.\n\nSilakan sambungkan perangkat ke internet lalu coba kembali."
      );
      return;
    }

    // Validations
    if (!itemName.trim()) {
      setErrorMessage("Nama Item (Master Grup) wajib diisi!");
      return;
    }

    if (isEditing && !serialNumber.trim()) {
      setErrorMessage("Serial Number (QR Code ID) wajib diisi!");
      return;
    }

    if (isEditing && !validateSerialNumberFormat(serialNumber.trim())) {
      return;
    }

    if (!originUnit) {
      setErrorMessage("Silakan pilih Asal Instalasi!");
      return;
    }

    // Filter non-empty components
    const validComponents = components.filter(c => c.name.trim().length > 0);
    if (type === "set" && validComponents.length === 0) {
      setErrorMessage("Harap masukkan setidaknya 1 rincian nama komponen instrumen!");
      return;
    }

    const finalComponents = validComponents.length > 0 
      ? validComponents 
      : [{ name: itemName, qty: 1 }];

    setIsSubmitting(true);

    try {
      const quantityToCreate = Math.max(1, totalStock);
      let generatedIds: string[] = [];

      if (!isEditing) {
        // Run atomic counter allocation transaction to reserve N sequences!
        await runTransaction(db, async (transaction) => {
          const typePrefix = type === "set" ? "ST" : "SG";
          const nameAbbr = generate5CharAbbr(itemName);
          const instCode = getKodeInstalasi(originUnit);
          const sequenceKey = `${typePrefix}-${nameAbbr}`;
          const counterRef = doc(db, "sequences", sequenceKey);

          const counterSnap = await transaction.get(counterRef);
          let lastSeq = 0;
          if (counterSnap.exists()) {
            lastSeq = counterSnap.data().lastSeq || 0;
          }
          
          for (let i = 1; i <= quantityToCreate; i++) {
            const nextSeq = lastSeq + i;
            const seqStr = nextSeq.toString().padStart(2, "0");
            generatedIds.push(`${typePrefix}-${nameAbbr}${seqStr}-${instCode}`);
          }
          
          // Reserve the next seq
          transaction.set(counterRef, { lastSeq: lastSeq + quantityToCreate }, { merge: true });
        });
      } else {
        generatedIds = [serialNumber.trim()];
      }

      for (const finalId of generatedIds) {
        const inventoryData: InventoryItemHeader = {
          id: finalId,
          serialNumber: finalId,
          name: itemName.trim(),
          type: type,
          originUnit: originUnit,
          totalStock: 1, // Each master is exactly 1 physical item
          description: description.trim(),
          components: finalComponents,
          items: finalComponents, // compatibility
          createdAt: initialData?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        // 1. Create Master Instrument (LOCKED RULES)
        await setDoc(doc(db, "master_instruments", finalId), {
          ...inventoryData,
          tenantId,
          qrCode: finalId,
          status: "ACTIVE",
          createdBy: "Admin"
        }, { merge: true });

        // 2. Create Live State
        if (!isEditing) {
          await setDoc(doc(db, "instrument_live_state", finalId), {
            instrumentId: finalId,
            tenantId,
            currentState: "READY",
            currentLocation: originUnit,
            currentHolder: originUnit,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }

        // 3. Sync to collection 'instruments' for backwards compatibility
        await setDoc(doc(db, "instruments", finalId), {
          id: finalId,
          tenantId,
          name: inventoryData.name,
          type: inventoryData.type,
          originUnit: inventoryData.originUnit,
          totalStock: 1, // MUST BE 1 physically
          description: inventoryData.description,
          items: inventoryData.components,
          sku: `SKU-${inventoryData.type.toUpperCase()}-${finalId}`
        }, { merge: true });

        // Audit Log
        if (!isEditing) {
          await setDoc(doc(collection(db, "audit_logs")), {
            action: "CREATE_MASTER_INSTRUMENT",
            tenantId,
            instrumentId: finalId,
            details: `Registered new master instrument ${finalId}`,
            timestamp: new Date().toISOString()
          });
        }
      }

      // 4. Update Inventory Recap (Instrument Inventory)
      const inventoryRecapId = `${originUnit}_${itemName.trim()}`.replace(/[\/\s\\]+/g, "_");
      
      const invRef = doc(db, "instrument_inventory", inventoryRecapId);
      const invSnap = await getDoc(invRef);
      let currentTotal = 0;
      if (invSnap.exists()) {
        currentTotal = invSnap.data().totalInventory || 0;
      }
      
      if (!isEditing) {
        await setDoc(invRef, {
          id: inventoryRecapId,
          tenantId,
          name: itemName.trim(),
          originUnit: originUnit,
          totalInventory: currentTotal + quantityToCreate,
          type: type,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      triggerActionConfirm({ title: `Berhasil mendaftarkan ${quantityToCreate} master instrumen untuk ${itemName}` });
      if (onSuccess) onSuccess({ id: generatedIds[0], serialNumber: generatedIds[0], name: itemName, type, originUnit, totalStock: 1, components: finalComponents });
    } catch (error: any) {
      console.error("Error saving inventory:", error);
      if (error?.code === "unavailable" || error?.message?.includes("offline") || (typeof navigator !== "undefined" && !navigator.onLine)) {
        setErrorMessage(
          "Tidak dapat mendaftarkan instrumen baru saat offline. Pembuatan ID Instrumen membutuhkan koneksi ke server untuk menjamin nomor ID unik dan permanen. Silakan sambungkan perangkat ke internet lalu coba kembali."
        );
      } else {
        setErrorMessage(error.message || "Terjadi kesalahan saat menyimpan data inventaris.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 sm:p-4 overflow-y-auto">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl max-h-[92vh] flex flex-col my-auto relative text-slate-100"
      >
        {/* Header Modal */}
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                {isEditing ? "Edit Inventaris Instrumen" : "Registrasi Instrumen Baru"}
              </h3>
              <p className="text-xs text-slate-400">
                Master Data Header-Detail (Set & Single)
              </p>
            </div>
          </div>
          {onClose && (
            <button 
              type="button" 
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 space-y-4">
          <div className="flex-1 overflow-y-auto pr-1 space-y-4">
            
            {/* Error Banner */}
            {errorMessage && (
              <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-xl flex items-start gap-2.5 text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">{errorMessage}</div>
              </div>
            )}

            {/* Row 1: Nama Item & Tipe */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nama Item (Master Grup) <span className="text-rose-400">*</span>
                </label>
                <input 
                  type="text" 
                  required 
                  value={itemName} 
                  onChange={e => setItemName(e.target.value)}
                  onBlur={() => {
                    if (!serialNumber && itemName) {
                      generateSerialNumber(itemName, type);
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition" 
                  placeholder="Contoh: Set Hecting Dasar / Pinset Sirurgis" 
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Tipe Instrumen <span className="text-rose-400">*</span>
                </label>
                <select 
                  value={type} 
                  onChange={e => {
                    const newType = e.target.value as "set" | "single";
                    setType(newType);
                    if (!serialNumber && itemName) {
                      generateSerialNumber(itemName, newType);
                    }
                  }} 
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                >
                  <option value="set">Set (Kumpulan)</option>
                  <option value="single">Single (Satuan)</option>
                </select>
              </div>
            </div>

            {/* Row 2: Serial Number (QR Code ID) */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5 text-sky-400" />
                  Serial Number / QR Code ID <span className="text-rose-400">*</span>
                </label>
                <span className="text-[10px] text-slate-500 font-mono">
                  Format: [ST/SG]-[5 Abbr]-[000]
                </span>
              </div>

              <div className="relative flex items-center">
                <input 
                  type="text" 
                  required 
                  disabled={isEditing} 
                  value={serialNumber} 
                  onChange={e => {
                    const uppercaseVal = e.target.value.toUpperCase();
                    setSerialNumber(uppercaseVal);
                    validateSerialNumberFormat(uppercaseVal);
                  }} 
                  className={`w-full bg-slate-950 border ${
                    serialError ? "border-rose-500 text-rose-300" : "border-slate-800 text-sky-300"
                  } rounded-xl p-2.5 pr-24 font-mono text-sm focus:outline-none focus:border-sky-500 disabled:opacity-60 transition`} 
                  placeholder="Contoh: ST-HECTG-001" 
                />

                {!isEditing && (
                  <div className="absolute right-1.5 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => generateSerialNumber()}
                      className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition cursor-pointer flex items-center gap-1 text-[11px]"
                      title="Auto Generate Serial Number"
                    >
                      <Wand2 className="w-4 h-4" />
                      <span className="hidden sm:inline">Auto</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsScanning(!isScanning)}
                      className={`p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-sky-400 transition cursor-pointer ${
                        isScanning ? "text-sky-400 bg-sky-950/60" : ""
                      }`}
                      title="Scan Barcode / QR Code"
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {serialError && (
                <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  {serialError}
                </p>
              )}
            </div>

            {/* Scanner Container */}
            {isScanning && !isEditing && (
              <div className="border border-slate-800 rounded-xl overflow-hidden h-48 bg-black relative shadow-inner">
                <InlineScanner 
                  isScanning={isScanning} 
                  onScan={(text) => {
                    setSerialNumber(text.toUpperCase());
                    validateSerialNumberFormat(text.toUpperCase());
                    setIsScanning(false);
                  }} 
                />
                <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center bg-slate-950/80 px-3 py-1.5 rounded-lg text-[11px] text-slate-300 font-mono z-20 backdrop-blur">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Arahkan kamera ke Barcode / QR Code
                  </span>
                  <button 
                    type="button" 
                    onClick={() => setIsScanning(false)} 
                    className="text-rose-400 hover:text-rose-300 font-bold"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}

            {/* Row 3: Asal Instalasi & Jumlah Stok */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-amber-400" />
                  Asal Instalasi (Pemilik) <span className="text-rose-400">*</span>
                </label>
                <select 
                  required 
                  value={originUnit} 
                  onChange={e => setOriginUnit(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition"
                >
                  <option value="">-- Pilih Asal Instalasi --</option>
                  {unitsList.map((unitName, idx) => (
                    <option key={idx} value={unitName}>
                      {unitName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  Jumlah Stok Total
                </label>
                <div className="flex items-center">
                  <button
                    type="button"
                    className="w-10 h-[42px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-l-xl border border-r-0 border-slate-800 font-bold text-lg transition"
                    onClick={() => setTotalStock(Math.max(0, totalStock - 1))}
                  >
                    -
                  </button>
                  <input 
                    type="number" 
                    required 
                    value={isNaN(totalStock) ? "" : totalStock} 
                    onChange={e => setTotalStock(parseInt(e.target.value) || 0)} 
                    className="w-full h-[42px] bg-slate-950 border-y border-slate-800 text-sm text-slate-200 text-center outline-none focus:border-indigo-500 font-mono font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                  />
                  <button
                    type="button"
                    className="w-10 h-[42px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-r-xl border border-l-0 border-slate-800 font-bold text-lg transition"
                    onClick={() => setTotalStock(totalStock + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Row 4: Deskripsi Catatan */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Keterangan / Deskripsi
              </label>
              <input 
                type="text" 
                value={description} 
                onChange={e => setDescription(e.target.value)} 
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition" 
                placeholder="Catatan tambahan (misal: Bahan Stainless Steel Grade 316L)" 
              />
            </div>

            {/* Header-Detail Component Table / List */}
            <div className="border border-slate-800 rounded-2xl p-4 bg-slate-950/70 space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    Rincian Komponen Detail {type === "set" ? "(Komponen Set)" : "(Item Satuan)"}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {type === "set" 
                      ? "Daftar nama dan kuantitas instrumen di dalam set ini" 
                      : "Instrumen tunggal tanpa kumpulan komponen"}
                  </p>
                </div>
                <span className="text-xs font-mono px-2.5 py-1 bg-indigo-950/60 border border-indigo-800/60 text-indigo-300 rounded-lg font-bold">
                  {components.length} Jenis Item
                </span>
              </div>

              {/* Dynamic Table List */}
              <div className="max-h-52 overflow-y-auto space-y-2 pr-1 p-1 bg-slate-900/80 rounded-xl border border-slate-800">
                {components.map((comp, index) => (
                  <div key={index} className="flex gap-2 items-center bg-slate-950 p-2 rounded-xl border border-slate-800/80 group hover:border-slate-700 transition">
                    <span className="w-6 text-center text-xs text-slate-500 font-mono font-bold shrink-0">
                      #{index + 1}
                    </span>

                    <input 
                      type="text" 
                      required
                      placeholder={type === "set" ? "Nama Komponen (mis: Needle Holder 14cm)" : "Nama Instrumen Satuan"} 
                      value={comp.name} 
                      onChange={e => handleComponentChange(index, "name", e.target.value)} 
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition" 
                    />

                    <div className="flex items-center shrink-0">
                      <button
                        type="button"
                        className="w-7 h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-l-lg border border-r-0 border-slate-700 text-xs font-bold transition"
                        onClick={() => handleComponentChange(index, "qty", comp.qty - 1)}
                      >
                        -
                      </button>
                      <input 
                        type="number" 
                        required
                        placeholder="Qty" 
                        value={comp.qty} 
                        onChange={e => handleComponentChange(index, "qty", e.target.value)} 
                        className="w-12 h-8 bg-slate-900 border-y border-slate-700 text-center text-xs text-slate-200 font-mono font-bold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                      />
                      <button
                        type="button"
                        className="w-7 h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-r-lg border border-l-0 border-slate-700 text-xs font-bold transition"
                        onClick={() => handleComponentChange(index, "qty", comp.qty + 1)}
                      >
                        +
                      </button>
                    </div>

                    {type === "set" && (
                      <button 
                        type="button" 
                        onClick={() => handleRemoveComponent(index)} 
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition shrink-0 cursor-pointer"
                        title="Hapus Rincian Komponen"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Table Footer Actions */}
              <div className="flex justify-between items-center pt-2 border-t border-slate-800">
                {type === "set" ? (
                  <button 
                    type="button" 
                    onClick={handleAddComponent}
                    className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1.5 bg-sky-950/50 hover:bg-sky-950 border border-sky-800/60 px-3 py-1.5 rounded-xl transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> Tambah Rincian Komponen
                  </button>
                ) : (
                  <span className="text-[11px] text-slate-500 italic">Tipe Single / Instrumen Satuan</span>
                )}

                <div className="text-xs text-slate-300 font-medium">
                  Total Komponen: <span className="font-bold font-mono text-emerald-400">
                    {components.reduce((sum, item) => sum + (item.qty || 0), 0)} pcs
                  </span>
                </div>
              </div>

            </div>

            {/* Preview ID Instrumen yang Akan Dibuat (Rule #12 LOCKED) */}
            {!isEditing && previewIds.length > 0 && (
              <div className="bg-sky-950/50 border border-sky-800/80 rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-sky-300 flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-amber-300" />
                    Preview ID Instrumen Yang Akan Dibuat ({previewIds.length} Unit Fisik):
                  </span>
                  <span className="text-[10px] text-sky-400 font-mono font-bold">Atomic Sequence</span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
                  {previewIds.map((pid, idx) => (
                    <span key={idx} className="px-2.5 py-1 rounded-lg bg-slate-900 border border-sky-700 text-sky-300 font-mono text-xs font-bold shadow-sm">
                      {pid}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Offline Mode Warning */}
            {typeof navigator !== "undefined" && !navigator.onLine && !isEditing && (
              <div className="p-3 bg-amber-950/40 border border-amber-800/80 rounded-xl text-amber-300 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  Mode Offline Terdeteksi
                </div>
                <p className="text-[11px] text-amber-300/90 leading-relaxed">
                  Perangkat sedang offline. Pembuatan ID Instrumen permanen ditolak demi menjamin uniqueness ID secara atomik. Anda dapat menyimpan sebagai <strong>DRAF — BELUM TERDAFTAR</strong>.
                </p>
              </div>
            )}

          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800 shrink-0">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-xs font-semibold transition cursor-pointer"
              >
                Batal
              </button>
            )}

            {typeof navigator !== "undefined" && !navigator.onLine && !isEditing ? (
              <button
                type="button"
                onClick={handleSaveDraftOffline}
                className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-lg shadow-amber-950/50 flex items-center gap-2 transition cursor-pointer"
              >
                <Save className="w-4 h-4" />
                Simpan Draf Offline
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white text-xs font-bold shadow-lg shadow-indigo-950/50 flex items-center gap-2 disabled:opacity-50 transition cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {isSubmitting ? "Menyimpan Data..." : isEditing ? "Simpan Perubahan" : "Simpan Ke Inventory"}
              </button>
            )}
          </div>
        </form>
      </motion.div>
    </div>
  );
}
