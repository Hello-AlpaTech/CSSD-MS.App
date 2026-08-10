import InstrumentHistoryModal from "./InstrumentHistoryModal";
import InventoryRegistrationForm from "./InventoryRegistrationForm";
import SetCompositionAndImport from "./SetCompositionAndImport";
import React, { useState, useEffect } from "react";
import { collection, onSnapshot, doc, setDoc, updateDoc, addDoc, serverTimestamp, query, orderBy, deleteDoc, getDoc, runTransaction, where } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../lib/firebase";
import { InstrumentCatalog, BMHPCatalog, BMHPLog, Machine, Unit, UserProfile } from "../types";
import { motion } from "motion/react";
import { Package, Plus, QrCode, History, Search, Image as ImageIcon, Trash2, AlertTriangle, List, ArrowDownUp, Upload, Download, Edit, Eye, FileText, Printer, ChevronDown, ChevronRight, Camera, X, Wand2, RefreshCw, Layers } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import InlineScanner from "./InlineScanner";
import { triggerActionConfirm } from "../lib/actionToast";
import { formatToStandardSerialNumber, generate5CharAbbr, getKodeInstalasi } from "../lib/serialNumberUtils";
import { migrateUploadedInstruments } from "../lib/instrumentMigrator";

interface Props {
  currentUsername: string;
  currentUserProfile?: UserProfile | null;
  initialTab?: 'instruments' | 'bmhp' | 'linen' | 'rooms' | 'machines' | 'set_composition';
  mode?: 'master' | 'bmhp' | 'linen' | 'inventory';
}

export default function Inventory({ currentUsername, currentUserProfile, initialTab = 'instruments', mode = 'master' }: Props) {
  const tenantId = currentUserProfile?.tenantId || "RSUD-BENDA";
  const [activeTab, setActiveTab] = useState<'instruments' | 'bmhp' | 'linen' | 'rooms' | 'machines' | 'set_composition'>(initialTab);
  const [bmhpCategory, setBmhpCategory] = useState<'sterile' | 'non_sterile'>('sterile');

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  
  // Data
  const [instruments, setInstruments] = useState<InstrumentCatalog[]>([]);
  const [bmhpList, setBmhpList] = useState<BMHPCatalog[]>([]);
  const [linenList, setLinenList] = useState<BMHPCatalog[]>([]);
  
  
  const [units, setUnits] = useState<Unit[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [unitForm, setUnitForm] = useState<Partial<Unit>>({ id: "", name: "" });

  const [isMachineModalOpen, setIsMachineModalOpen] = useState(false);
  const [machineForm, setMachineForm] = useState<Partial<Machine>>({ 
    id: "", name: "", type: "sterilizer_steam", status: "belum_uji", serialNumber: "", method: "", modes: [], temperature: "", duration: ""
  });

  // Image Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  
  // Batch selection state for deletion
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Delete Confirmation Modal state
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    ids: string[];
    collectionName: string;
    itemNames: string[];
  }>({
    isOpen: false,
    ids: [],
    collectionName: '',
    itemNames: [],
  });
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit states for other forms
  const [isEditingBmhp, setIsEditingBmhp] = useState(false);
  const [isEditingUnit, setIsEditingUnit] = useState(false);
  const [isEditingMachine, setIsEditingMachine] = useState(false);

  // Search
  const [searchTerm, setSearchTerm] = useState("");

  // Group Expansion States
  const [expandedUnits, setExpandedUnits] = useState<Record<string, boolean>>({});
  const [expandedNames, setExpandedNames] = useState<Record<string, boolean>>({});

  // Modals
  const [isInstModalOpen, setIsInstModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historySelectedInst, setHistorySelectedInst] = useState<InstrumentCatalog | null>(null);

  const handleViewHistory = (inst: InstrumentCatalog) => {
    setHistorySelectedInst(inst);
    setIsHistoryModalOpen(true);
  };
  const [isEditingInst, setIsEditingInst] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  
  const [isBmhpModalOpen, setIsBmhpModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [selectedQr, setSelectedQr] = useState<string | null>(null);

  // Form State Instrument
  const [instForm, setInstForm] = useState<Partial<InstrumentCatalog>>({
    id: "", name: "", sku: "", type: "single", originUnit: "", description: "", sterileDurationDays: 30, totalStock: 0, items: []
  });
  const [isScanningInstId, setIsScanningInstId] = useState(false);

  useEffect(() => {
    if (!isInstModalOpen) {
      setIsScanningInstId(false);
    }
  }, [isInstModalOpen]);

  // Form State BMHP
  const [bmhpForm, setBmhpForm] = useState<Partial<BMHPCatalog>>({
    id: "", name: "", category: "non_sterile", stockQty: 0, minStockAlert: 10, unit: "pcs", expirationDate: ""
  });

  // Form stock adjustment
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<BMHPCatalog | null>(null);
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustType, setAdjustType] = useState<'in' | 'out'>('in');
  const [adjustNotes, setAdjustNotes] = useState("");
  const [adjustExpDate, setAdjustExpDate] = useState("");

  // Detail Modal State
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<BMHPCatalog | null>(null);
  const [detailLogs, setDetailLogs] = useState<BMHPLog[]>([]);

  // Offline Drafts State
  const [offlineDrafts, setOfflineDrafts] = useState<any[]>([]);
  const [isSyncingDrafts, setIsSyncingDrafts] = useState(false);

  const checkOfflineDrafts = () => {
    try {
      const saved = localStorage.getItem("cssd_offline_registration_drafts");
      if (saved) {
        setOfflineDrafts(JSON.parse(saved));
      } else {
        setOfflineDrafts([]);
      }
    } catch {
      setOfflineDrafts([]);
    }
  };

  useEffect(() => {
    checkOfflineDrafts();
    window.addEventListener("online", checkOfflineDrafts);
    window.addEventListener("storage", checkOfflineDrafts);
    return () => {
      window.removeEventListener("online", checkOfflineDrafts);
      window.removeEventListener("storage", checkOfflineDrafts);
    };
  }, []);

  const handleSyncOfflineDrafts = async () => {
    if (!offlineDrafts || offlineDrafts.length === 0) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      alert("Tidak dapat menyinkronkan draf saat offline. Harap pastikan koneksi internet tersedia.");
      return;
    }

    setIsSyncingDrafts(true);
    let syncedCount = 0;
    const remainingDrafts: any[] = [];

    for (const draft of offlineDrafts) {
      try {
        const qtyToCreate = draft.totalStock || 1;
        const generatedIds: string[] = [];
        const typePrefix = draft.type === "set" ? "ST" : "SG";
        const nameAbbr = generate5CharAbbr(draft.itemName);
        const instCode = getKodeInstalasi(draft.originUnit);

        await runTransaction(db, async (transaction) => {
          const sequenceKey = `${typePrefix}-${nameAbbr}`;
          const counterRef = doc(db, "sequences", sequenceKey);
          const counterSnap = await transaction.get(counterRef);
          let lastSeq = 0;
          if (counterSnap.exists()) {
            lastSeq = counterSnap.data().lastSeq || 0;
          }

          for (let i = 1; i <= qtyToCreate; i++) {
            const nextSeq = lastSeq + i;
            const seqStr = nextSeq.toString().padStart(2, "0");
            generatedIds.push(`${typePrefix}-${nameAbbr}${seqStr}-${instCode}`);
          }

          transaction.set(counterRef, { lastSeq: lastSeq + qtyToCreate }, { merge: true });
        });

        for (const finalId of generatedIds) {
          const masterData = {
            id: finalId,
            serialNumber: finalId,
            name: draft.itemName,
            type: draft.type,
            originUnit: draft.originUnit,
            totalStock: 1,
            description: draft.description || "",
            components: draft.components || [{ name: draft.itemName, qty: 1 }],
            items: draft.components || [{ name: draft.itemName, qty: 1 }],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            qrCode: finalId,
            status: "ACTIVE",
            createdBy: "Admin (Draft Sync)"
          };

          await setDoc(doc(db, "master_instruments", finalId), masterData, { merge: true });
          await setDoc(doc(db, "instrument_live_state", finalId), {
            instrumentId: finalId,
            currentState: "READY",
            currentLocation: draft.originUnit,
            currentHolder: draft.originUnit,
            updatedAt: new Date().toISOString()
          }, { merge: true });

          await setDoc(doc(db, "instruments", finalId), {
            id: finalId,
            name: draft.itemName,
            type: draft.type,
            originUnit: draft.originUnit,
            totalStock: 1,
            items: draft.components || [{ name: draft.itemName, qty: 1 }],
            sku: `SKU-${draft.type.toUpperCase()}-${finalId}`
          }, { merge: true });
        }

        syncedCount++;
      } catch (err) {
        console.error("Gagal menyinkronkan draf:", draft, err);
        remainingDrafts.push(draft);
      }
    }

    localStorage.setItem("cssd_offline_registration_drafts", JSON.stringify(remainingDrafts));
    setOfflineDrafts(remainingDrafts);
    setIsSyncingDrafts(false);

    if (syncedCount > 0) {
      triggerActionConfirm({
        title: "Sinkronisasi Draf Berhasil",
        message: `${syncedCount} draf offline berhasil disinkronkan dan diterbitkan ID Instrumen permanen secara atomik.`,
        type: "success"
      });
    }
  };

  useEffect(() => {
    migrateUploadedInstruments();

    const unsubMasterInst = onSnapshot(
      query(collection(db, "master_instruments"), where("tenantId", "==", tenantId)),
      (snapMaster) => {
        onSnapshot(
          query(collection(db, "instruments"), where("tenantId", "==", tenantId)),
          (snapInst) => {
            onSnapshot(
              query(collection(db, "inventory"), where("tenantId", "==", tenantId)),
              (snapInv) => {
                const map = new Map<string, InstrumentCatalog>();
                snapMaster.forEach((docSnap) => {
                  const data = docSnap.data();
                  map.set(docSnap.id, { 
                    id: docSnap.id, 
                    name: data.name,
                    type: data.type,
                    originUnit: data.originUnit,
                    totalStock: data.totalStock ?? 1,
                    description: data.description || "",
                    items: data.components || data.items || [],
                    sku: data.sku || data.serialNumber || docSnap.id,
                    ...data
                  } as InstrumentCatalog);
                });
                snapInst.forEach((doc) => {
                  if (!map.has(doc.id)) {
                    const data = doc.data();
                    map.set(doc.id, { id: doc.id, ...data } as InstrumentCatalog);
                  }
                });
                snapInv.forEach((doc) => {
                  if (!map.has(doc.id)) {
                    const data = doc.data();
                    map.set(doc.id, { 
                      id: doc.id, 
                      name: data.name,
                      type: data.type,
                      originUnit: data.originUnit,
                      totalStock: data.totalStock ?? 1,
                      description: data.description || "",
                      items: data.components || data.items || [],
                      sku: data.serialNumber || doc.id,
                      ...data
                    } as InstrumentCatalog);
                  }
                });
                setInstruments(Array.from(map.values()));
              }
            );
          }
        );
      }
    );

    const unsubBmhp = onSnapshot(
      query(collection(db, "bmhp_catalog"), where("tenantId", "==", tenantId)),
      (snap) => {
        const list: BMHPCatalog[] = [];
        snap.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as BMHPCatalog);
        });
        setBmhpList(list);
      }
    );

    const unsubLinen = onSnapshot(
      query(collection(db, "linen_catalog"), where("tenantId", "==", tenantId)),
      (snap) => {
        const list: BMHPCatalog[] = [];
        snap.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as BMHPCatalog);
        });
        setLinenList(list);
      }
    );

    const unsubUnits = onSnapshot(
      query(collection(db, "master_units"), where("tenantId", "==", tenantId)),
      (snap) => {
        const list: Unit[] = [];
        snap.forEach(doc => list.push({ id: doc.id, ...doc.data() } as Unit));
        setUnits(list);
      }
    );

    const unsubMachines = onSnapshot(
      query(collection(db, "master_machines"), where("tenantId", "==", tenantId)),
      (snap) => {
        const list: Machine[] = [];
        snap.forEach(doc => list.push({ id: doc.id, ...doc.data() } as Machine));
        setMachines(list);
      }
    );

    return () => { unsubMasterInst(); unsubBmhp(); unsubLinen(); unsubUnits(); unsubMachines(); };
  }, [currentUserProfile]);

  // Selection and Deletion Helpers
  const toggleSelectAll = (currentItems: { id: string }[]) => {
    const currentItemIds = currentItems.map(i => i.id);
    const allSelected = currentItemIds.length > 0 && currentItemIds.every(id => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !currentItemIds.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...currentItemIds])));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const openDeleteModal = (ids: string[], itemNames: string[]) => {
    let coll = 'instruments';
    if (activeTab === 'bmhp') coll = 'bmhp_catalog';
    else if (activeTab === 'linen') coll = 'linen_catalog';
    else if (activeTab === 'rooms') coll = 'master_units';
    else if (activeTab === 'machines') coll = 'master_machines';

    setDeleteModal({
      isOpen: true,
      ids,
      collectionName: coll,
      itemNames,
    });
  };

  const handleExecuteDelete = async () => {
    if (deleteModal.ids.length === 0) return;
    setIsDeleting(true);
    try {
      for (const id of deleteModal.ids) {
        await deleteDoc(doc(db, deleteModal.collectionName, id));
      }
      setSelectedIds(prev => prev.filter(id => !deleteModal.ids.includes(id)));
      setDeleteModal({ isOpen: false, ids: [], collectionName: '', itemNames: [] });
    } catch (err) {
      console.error(err);
      alert("Gagal menghapus data. Silakan coba lagi.");
    } finally {
      setIsDeleting(false);
    }
  };

  const generateInstrumentId = () => {
    if (!instForm.name) {
      alert("Silakan isi 'Nama Item (Master Grup)' terlebih dahulu untuk generate ID.");
      return;
    }
    const typePrefix = instForm.type === 'set' ? 'ST' : 'SG';
    const nameAbbr = generate5CharAbbr(instForm.name);
    const prefix = `${typePrefix}-${nameAbbr}-`;
    
    let maxSeq = 0;
    instruments.forEach(inst => {
      if (inst.id.startsWith(prefix)) {
        const parts = inst.id.split('-');
        if (parts.length === 3) {
          const seq = parseInt(parts[2], 10);
          if (!isNaN(seq) && seq > maxSeq) {
            maxSeq = seq;
          }
        }
      }
    });
    
    const nextSeq = (maxSeq + 1).toString().padStart(3, '0');
    setInstForm(prev => ({ ...prev, id: `${prefix}${nextSeq}` }));
  };

  const handleSaveInstrument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instForm.id) return alert("ID Alat harus diisi!");
    
    const formattedId = formatToStandardSerialNumber(instForm.id, instForm.name || "", instForm.type || "single");
    const updatedForm = { ...instForm, id: formattedId, serialNumber: formattedId, sku: `SKU-${formattedId}` };
    
    // Check duplication
    const docRef = doc(db, "instruments", formattedId);
    const docSnap = await getDoc(docRef);
    if (!isEditingInst && docSnap.exists()) {
      return alert("Gagal: ID Instrumen sudah digunakan (duplikat).");
    }

    try {
      await setDoc(docRef, updatedForm);

      // Automatically sync stock with unit_stock for the selected originUnit
      if (updatedForm.originUnit) {
        const targetUnit = updatedForm.originUnit;
        const stockQty = updatedForm.totalStock ?? 1;
        const safeDocId = `${targetUnit.replace(/[\/\s\\]+/g, "_")}_${formattedId}`;
        
        const stockDocRef = doc(db, "unit_stock", safeDocId);
        await setDoc(stockDocRef, {
          unit: targetUnit,
          instrumentId: formattedId,
          instrumentName: updatedForm.name,
          qty: stockQty,
          type: updatedForm.type || 'single',
          sterilizedAt: new Date().toISOString(),
          expiresAtStr: new Date(Date.now() + (updatedForm.sterileDurationDays || 30) * 86400000).toISOString(),
          wrapType: 'pouch_steril',
          lotNumber: `LOT-${formattedId}`
        }, { merge: true });
      }

      setIsInstModalOpen(false);
      triggerActionConfirm({
        title: "Instrumen Berhasil Disimpan!",
        message: `Instrumen ${instForm.name} (${instForm.id}) berhasil didaftarkan ke inventaris.`
      });
      setInstForm({ id: "", name: "", sku: "", type: "single", originUnit: "", description: "", sterileDurationDays: 30, totalStock: 0, items: [] });
      setIsEditingInst(false);
    } catch (err) {
      console.error(err);
      alert("Gagal menyimpan instrumen.");
    }
  };

  const handleExportCSV = () => {
    if (!instruments || instruments.length === 0) {
      alert("Tidak ada data instrumen untuk diexport.");
      return;
    }

    const headers = ["ID Instrumen", "Nama Item", "Tipe", "Asal Instalasi", "Jumlah Stok", "Detail Item (Khusus Tipe Set)"];
    
    const rows = instruments.map(inst => {
      const itemsList = (inst.items || (inst as any).components || []);
      const itemsFormatted = itemsList.map((it: any) => `${it.name}:${it.qty}`).join("|");
      
      const escape = (val: any) => {
        const str = val === undefined || val === null ? "" : String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      return [
        escape(inst.id),
        escape(inst.name),
        escape(inst.type),
        escape(inst.originUnit || "Global"),
        escape(inst.totalStock ?? 1),
        escape(itemsFormatted)
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Master_Inventaris_Instrumen_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    triggerActionConfirm({
      title: "Export CSV Berhasil!",
      message: `${instruments.length} data instrumen berhasil diexport.`,
      type: "success"
    });
  };

  const downloadCSVTemplate = () => {
    const csvContent = [
      "ID Instrumen,Nama Item,Tipe,Asal Instalasi,Jumlah Stok,Detail Item (Khusus Tipe Set)",
      "ST-HECTG-001,Set Hecting Dasar,set,IGD,5,Pinset Sirurgis:1|Pinset Anatomis:1|Nald Voeder:1",
      "SG-GUNTG-001,Gunting Perban,single,OK Sentral,10,"
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Template_Import_Master_Inventaris.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

    const parseCSV = (text: string): string[][] => {
    let str = text.replace(/^\ufeff/, '');
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      const nextChar = str[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          currentField += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          currentField += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          currentRow.push(currentField);
          currentField = '';
        } else if (char === '\r') {
          if (nextChar === '\n') i++;
          currentRow.push(currentField);
          rows.push(currentRow);
          currentRow = [];
          currentField = '';
        } else if (char === '\n') {
          currentRow.push(currentField);
          rows.push(currentRow);
          currentRow = [];
          currentField = '';
        } else {
          currentField += char;
        }
      }
    }

    if (currentField || currentRow.length > 0) {
      currentRow.push(currentField);
      rows.push(currentRow);
    }

    return rows.filter(r => r.some(cell => cell.trim() !== ''));
  };

  const handleImportCSV = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return alert("Pilih file CSV terlebih dahulu.");
    
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const rows = parseCSV(text);

        if (rows.length < 2) {
          alert("File CSV kosong atau tidak memiliki baris data.");
          setIsImporting(false);
          return;
        }

        let successCount = 0;
        let updatedCount = 0;

        // Skip header row
        for (let i = 1; i < rows.length; i++) {
          const cols = rows[i];
          if (!cols || cols.length < 2) continue;

          const rawId = cols[0]?.trim();
          const name = cols[1]?.trim();
          const typeRaw = cols[2]?.trim().toLowerCase();
          const originUnit = cols[3]?.trim();
          const stock = parseInt(cols[4]?.trim() || "1", 10);
          const itemsRaw = cols[5]?.trim();

          if (!rawId || !name) continue;

          const type = typeRaw === 'set' ? 'set' : 'single';
          // Format ID strictly to ST/SG-[5 Karakter]-[3 Digit Angka]
          const cleanId = formatToStandardSerialNumber(rawId, name, type, i);

          let items: { name: string; qty: number }[] = [];
          if (type === 'set' && itemsRaw) {
            const itemPairs = itemsRaw.split('|');
            for (const pair of itemPairs) {
              const [itemName, itemQty] = pair.split(':');
              const trimmedName = itemName ? itemName.trim() : "";
              if (trimmedName) {
                const qtyVal = parseInt(itemQty?.trim() || "1", 10);
                items.push({ name: trimmedName, qty: isNaN(qtyVal) ? 1 : qtyVal });
              }
            }
          } else {
            items = [{ name: name, qty: 1 }];
          }

          const docRef = doc(db, "instruments", cleanId);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            await setDoc(docRef, {
              id: cleanId,
              serialNumber: cleanId,
              name,
              type,
              originUnit: originUnit || "Global",
              totalStock: isNaN(stock) ? 1 : stock,
              items
            }, { merge: true });
            updatedCount++;
          } else {
            await setDoc(docRef, {
              id: cleanId,
              serialNumber: cleanId,
              name,
              type,
              originUnit: originUnit || "Global",
              totalStock: isNaN(stock) ? 1 : stock,
              items
            });
            successCount++;
          }

          if (originUnit) {
            const safeUnitDocId = `${originUnit.replace(/[\/\s\\]+/g, "_")}_${cleanId}`;
            const stockDocRef = doc(db, "unit_stock", safeUnitDocId);
            await setDoc(stockDocRef, {
              unit: originUnit,
              instrumentId: cleanId,
              instrumentName: name,
              qty: isNaN(stock) ? 1 : stock,
              type: type,
              sterilizedAt: new Date().toISOString(),
              wrapType: 'pouch_steril',
              lotNumber: `LOT-${cleanId}`
            }, { merge: true });
          }
        }

        setIsImportModalOpen(false);
        setImportFile(null);
        triggerActionConfirm({
          title: "Import CSV Selesai!",
          message: `Berhasil menyimpan ${successCount} data baru dan memperbarui ${updatedCount} data.`,
          type: "success"
        });
      } catch (err: any) {
        console.error("Gagal impor CSV:", err);
        alert("Gagal memproses file CSV: " + (err?.message || "Format file tidak valid."));
      } finally {
        setIsImporting(false);
      }
    };
    reader.onerror = () => {
      alert("Gagal membaca file CSV.");
      setIsImporting(false);
    };
    reader.readAsText(importFile);
  };

  const handleSaveBmhp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bmhpForm.id) return alert("ID harus diisi!");
    if (bmhpForm.id.includes("/")) return alert("ID tidak boleh mengandung garis miring (/)");
    
    setIsUploading(true);
    let imageUrl = bmhpForm.imageUrl || "";

    try {
      if (imageFile) {
        // Convert to base64
        imageUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = error => reject(error);
          reader.readAsDataURL(imageFile);
        });
      }

      let finalBatches = bmhpForm.batches || [];
      const sumOfBatches = finalBatches.reduce((acc, b) => acc + (b.qty || 0), 0);
      
      if (!isEditingBmhp) {
        // New item: create an initial batch based on starting stock and expiration date
        finalBatches = [{
          id: `BATCH-INIT-${Date.now()}`,
          qty: bmhpForm.stockQty || 0,
          expirationDate: typeof bmhpForm.expirationDate === 'string' ? bmhpForm.expirationDate : "",
          receivedAt: new Date().toISOString()
        }];
      } else {
        // Editing: if no batches exist, create a fallback matching current stockQty
        if (!finalBatches || finalBatches.length === 0) {
          finalBatches = [{
            id: `BATCH-INIT-${Date.now()}`,
            qty: bmhpForm.stockQty || 0,
            expirationDate: typeof bmhpForm.expirationDate === 'string' ? bmhpForm.expirationDate : "",
            receivedAt: new Date().toISOString()
          }];
        } else if (sumOfBatches !== bmhpForm.stockQty) {
          // If total quantity is manually updated during editing, sync batches (adjust or add/remove)
          const diff = (bmhpForm.stockQty || 0) - sumOfBatches;
          if (diff > 0) {
            finalBatches.push({
              id: `BATCH-ADJ-${Date.now()}`,
              qty: diff,
              expirationDate: typeof bmhpForm.expirationDate === 'string' ? bmhpForm.expirationDate : "",
              receivedAt: new Date().toISOString()
            });
          } else if (diff < 0) {
            let toDeduct = Math.abs(diff);
            const sorted = [...finalBatches].sort((a, b) => {
              if (a.expirationDate && b.expirationDate) {
                return a.expirationDate.localeCompare(b.expirationDate);
              }
              if (a.expirationDate) return -1;
              if (b.expirationDate) return 1;
              return a.receivedAt.localeCompare(b.receivedAt);
            });
            
            for (let i = 0; i < sorted.length && toDeduct > 0; i++) {
              if (sorted[i].qty <= toDeduct) {
                toDeduct -= sorted[i].qty;
                sorted[i].qty = 0;
              } else {
                sorted[i].qty -= toDeduct;
                toDeduct = 0;
              }
            }
            finalBatches = sorted.filter(b => b.qty > 0);
          }
        }
      }

      const collName = activeTab === 'linen' ? 'linen_catalog' : 'bmhp_catalog';
      await setDoc(doc(db, collName, bmhpForm.id), { 
        ...bmhpForm, 
        imageUrl,
        batches: finalBatches
      });
      setIsBmhpModalOpen(false);
      setBmhpForm({ id: "", name: "", category: "non_sterile", stockQty: 0, minStockAlert: 10, unit: "pcs", expirationDate: "" });
      setImageFile(null);
    } catch (err) {
      console.error(err);
      alert("Gagal menyimpan BMHP. Pastikan Storage rules mengizinkan upload (jika ini error Storage).");
    } finally {
      setIsUploading(false);
    }
  };

  
  const handleSaveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitForm.name) return alert("Nama ruangan harus diisi!");
    const safeId = (unitForm.id || unitForm.name).replace(/\//g, "-").replace(/\s+/g, "_").toUpperCase();
    try {
      await setDoc(doc(db, "master_units", safeId), { ...unitForm, id: safeId });
      setIsUnitModalOpen(false);
      setUnitForm({ id: "", name: "" });
    } catch (err) {
      console.error(err);
      alert("Gagal menyimpan ruangan: " + (err.message || err));
    }
  };

  const handleSaveMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!machineForm.name) return alert("Nama mesin harus diisi!");
    const safeMachineId = (machineForm.id || machineForm.name).replace(/\//g, "-").replace(/\s+/g, "_").toUpperCase();
    try {
      await setDoc(doc(db, "master_machines", safeMachineId), { ...machineForm, id: safeMachineId });
      setIsMachineModalOpen(false);
      setMachineForm({ id: "", name: "", type: "sterilizer_steam", status: "belum_uji", serialNumber: "", method: "", modes: [], temperature: "", duration: "" });
    } catch (err) {
      console.error(err);
      alert("Gagal menyimpan mesin: " + (err.message || err));
    }
  };

  
  const openDetailModal = async (bmhp: BMHPCatalog) => {
    setDetailTarget(bmhp);
    setIsDetailModalOpen(true);
    // Fetch logs
    const logCollName = activeTab === 'linen' ? 'linen_logs' : 'bmhp_logs';
    const q = query(collection(db, logCollName), where("tenantId", "==", tenantId), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const logs: BMHPLog[] = [];
      snap.forEach(doc => {
        const data = doc.data() as BMHPLog;
        if (data.bmhpId === bmhp.id) {
          logs.push({ ...data, id: doc.id });
        }
      });
      setDetailLogs(logs);
    });
    // the unsub will be lost if we don't store it, but for a simple modal it's okay, or we could handle it better.
    // actually, let's just use getDocs to avoid memory leak if they open close many times.
    import("firebase/firestore").then(({ getDocs }) => {
        getDocs(q).then((snap) => {
             const logs: BMHPLog[] = [];
             snap.forEach(doc => {
               const data = doc.data() as BMHPLog;
               if (data.bmhpId === bmhp.id) {
                 logs.push({ ...data, id: doc.id });
               }
             });
             setDetailLogs(logs);
        });
    });
  };

  
  const exportBmhpPdf = () => {
    const doc = new jsPDF();
    doc.text(`Laporan Stok BMHP Terkini`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Waktu Cetak: ${new Date().toLocaleString('id-ID')}`, 14, 22);
    
    const tableColumn = ["ID", "Nama BMHP", "Kategori", "Stock", "Unit", "Min. Stok", "Tgl Exp", "Status Stok"];
    const tableRows = [];
    
    // Create a copy of bmhpList to avoid mutation, though not necessary here
    const sortedBmhp = [...bmhpList].sort((a, b) => a.name.localeCompare(b.name));

    sortedBmhp.forEach(bmhp => {
      const isLowStock = bmhp.stockQty <= bmhp.minStockAlert;
      const rowData = [
        bmhp.id,
        bmhp.name,
        bmhp.category === 'sterile' ? 'Steril' : 'Non-Steril',
        bmhp.stockQty,
        bmhp.unit,
        bmhp.minStockAlert,
        bmhp.expirationDate || '-',
        isLowStock ? 'RESTOCK' : 'Aman'
      ];
      tableRows.push(rowData);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 28,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [14, 165, 233] }
    });

    doc.save(`Laporan_Stok_BMHP_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportPdf = () => {

    if (!detailTarget) return;
    const doc = new jsPDF();
    doc.text(`Kartu Stok BMHP: ${detailTarget.name}`, 14, 15);
    doc.setFontSize(10);
    doc.text(`ID: ${detailTarget.id}`, 14, 22);
    
    const tableColumn = ["Timestime", "Nama BMHP", "IN", "OUT", "Status Stok", "Keterangan", "Tgl Exp", "Petugas"];
    const tableRows: any[] = [];
    
    // sort logs ascending for correct historical view
    const sortedLogs = [...detailLogs].sort((a, b) => {
       const tA = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
       const tB = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
       return tA - tB;
    });

    sortedLogs.forEach(log => {
      const logDate = log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString('id-ID') : '-';
      const logData = [
        logDate,
        log.bmhpName,
        log.type === 'in' ? log.qty : '-',
        log.type === 'out' ? log.qty : '-',
        log.currentStock ?? '-',
        log.notes || '-',
        log.expDate || '-',
        log.operator
      ];
      tableRows.push(logData);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 28,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [14, 165, 233] }
    });

    doc.save(`Kartu_Stok_${detailTarget.name.replace(/\s+/g, '_')}.pdf`);
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget) return;

    const newStock = adjustType === 'in' ? adjustTarget.stockQty + adjustQty : adjustTarget.stockQty - adjustQty;
    if (newStock < 0) return alert("Stok tidak mencukupi!");

    try {
      const currentBatches = adjustTarget.batches || [];
      let updatedBatches = [...currentBatches];
      const sumOfBatches = currentBatches.reduce((acc, b) => acc + (b.qty || 0), 0);

      // If the sum of existing batches does not match current stock, backfill a batch for consistency
      if (sumOfBatches !== adjustTarget.stockQty && adjustTarget.stockQty > 0) {
        updatedBatches = [{
          id: `BATCH-INIT-${Date.now()}`,
          qty: adjustTarget.stockQty,
          expirationDate: typeof adjustTarget.expirationDate === 'string' ? adjustTarget.expirationDate : "",
          receivedAt: new Date(Date.now() - 86400000).toISOString() // 1 day ago as fallback
        }, ...currentBatches];
      }

      let fifoNotes = adjustNotes;
      let nextNearestExpDate = typeof adjustTarget.expirationDate === 'string' ? adjustTarget.expirationDate : "";

      if (adjustType === 'in') {
        // Barang Masuk: Tambah batch baru
        const newBatch = {
          id: `BATCH-IN-${Date.now()}`,
          qty: adjustQty,
          expirationDate: adjustExpDate || "",
          receivedAt: new Date().toISOString()
        };
        updatedBatches.push(newBatch);

        // Update nearest expiration date from all expiring batches
        const expiringBatches = updatedBatches.filter(b => b.expirationDate);
        if (expiringBatches.length > 0) {
          const sortedExp = expiringBatches.sort((a, b) => a.expirationDate.localeCompare(b.expirationDate));
          nextNearestExpDate = sortedExp[0].expirationDate;
        }
      } else {
        // Barang Keluar: Deduct using FIFO (FEFO - First Expired First Out priority, then FIFO)
        const sortedBatches = [...updatedBatches].sort((a, b) => {
          if (a.expirationDate && b.expirationDate) {
            return a.expirationDate.localeCompare(b.expirationDate);
          }
          if (a.expirationDate) return -1;
          if (b.expirationDate) return 1;
          return a.receivedAt.localeCompare(b.receivedAt);
        });

        let remainingToDeduct = adjustQty;
        const deductedFrom: { batchId: string; qty: number; expDate: string }[] = [];

        for (let i = 0; i < sortedBatches.length && remainingToDeduct > 0; i++) {
          const batch = sortedBatches[i];
          if (batch.qty > 0) {
            const deducted = Math.min(batch.qty, remainingToDeduct);
            batch.qty -= deducted;
            remainingToDeduct -= deducted;
            deductedFrom.push({
              batchId: batch.id,
              qty: deducted,
              expDate: batch.expirationDate
            });
          }
        }

        updatedBatches = sortedBatches.filter(b => b.qty > 0);

        // Update nearest expiration date from remaining batches
        const expiringBatches = updatedBatches.filter(b => b.expirationDate);
        if (expiringBatches.length > 0) {
          const sortedExp = expiringBatches.sort((a, b) => a.expirationDate.localeCompare(b.expirationDate));
          nextNearestExpDate = sortedExp[0].expirationDate;
        } else {
          nextNearestExpDate = "";
        }

        // Generate descriptive FIFO details in the logs
        if (deductedFrom.length > 0) {
          const batchDetails = deductedFrom.map(d => `${d.qty} ${adjustTarget.unit} dari ${d.batchId}${d.expDate ? ` (Exp: ${d.expDate})` : ""}`).join(", ");
          fifoNotes = `${adjustNotes ? adjustNotes + " | " : ""}[FIFO] Mengambil: ${batchDetails}`;
        }
      }

      const updateData: any = {
        stockQty: newStock,
        lastRestockedAt: serverTimestamp(),
        batches: updatedBatches,
        expirationDate: nextNearestExpDate
      };

      const collName = activeTab === 'linen' ? 'linen_catalog' : 'bmhp_catalog';
      await updateDoc(doc(db, collName, adjustTarget.id), updateData);

      const logCollName = activeTab === 'linen' ? 'linen_logs' : 'bmhp_logs';
      await addDoc(collection(db, logCollName), {
        bmhpId: adjustTarget.id,
        bmhpName: adjustTarget.name,
        type: adjustType,
        qty: adjustQty,
        operator: currentUsername,
        timestamp: serverTimestamp(),
        currentStock: newStock,
        notes: fifoNotes,
        expDate: adjustType === 'in' ? adjustExpDate : (nextNearestExpDate || '')
      });

      setIsAdjustModalOpen(false);
      setAdjustQty(0);
      setAdjustNotes("");
      setAdjustExpDate("");
    } catch (err) {
      console.error(err);
      alert("Gagal memperbarui stok.");
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Package className="w-6 h-6 text-sky-400" />
            Inventaris & Master Data
          </h2>
          <p className="text-sm text-slate-400 mt-1">Kelola data master instrumen (Single/Set) dan stok BMHP.</p>
        </div>
      </div>

      {/* Tabs */}
      {mode === 'master' && (
        <div className="flex gap-2 p-1 bg-slate-900 rounded-lg max-w-2xl overflow-x-auto">
          <button
            onClick={() => { setActiveTab('instruments'); setSelectedIds([]); }}
            className={`px-4 py-2 text-xs font-bold rounded-md whitespace-nowrap transition ${activeTab === 'instruments' ? 'bg-slate-800 text-sky-400 shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Master Inventaris Instrumen
          </button>
          <button
            onClick={() => { setActiveTab('set_composition'); setSelectedIds([]); }}
            className={`px-4 py-2 text-xs font-bold rounded-md whitespace-nowrap transition flex items-center gap-1.5 ${activeTab === 'set_composition' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Layers className="w-3.5 h-3.5" />
            Komposisi Set & Import
          </button>
          <button
            onClick={() => { setActiveTab('rooms'); setSelectedIds([]); }}
            className={`px-4 py-2 text-xs font-bold rounded-md whitespace-nowrap transition ${activeTab === 'rooms' ? 'bg-slate-800 text-sky-400 shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Master Ruangan
          </button>
          <button
            onClick={() => { setActiveTab('machines'); setSelectedIds([]); }}
            className={`px-4 py-2 text-xs font-bold rounded-md whitespace-nowrap transition ${activeTab === 'machines' ? 'bg-slate-800 text-sky-400 shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Master Mesin
          </button>
        </div>
      )}
      {mode === 'inventory' && (
        <div className="flex gap-2 p-1 bg-slate-900 rounded-lg max-w-lg overflow-x-auto">
          <button
            onClick={() => { setActiveTab('inventory_instruments'); setSelectedIds([]); }}
            className={`px-4 py-2 text-xs font-bold rounded-md whitespace-nowrap transition ${activeTab === 'inventory_instruments' ? 'bg-slate-800 text-sky-400 shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Inventaris Instrumen
          </button>
          <button
            onClick={() => { setActiveTab('bmhp'); setSelectedIds([]); }}
            className={`px-4 py-2 text-xs font-bold rounded-md whitespace-nowrap transition ${activeTab === 'bmhp' ? 'bg-slate-800 text-sky-400 shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Stock BMHP
          </button>
          <button
            onClick={() => { setActiveTab('linen'); setSelectedIds([]); }}
            className={`px-4 py-2 text-xs font-bold rounded-md whitespace-nowrap transition ${activeTab === 'linen' ? 'bg-slate-800 text-sky-400 shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Stock Linen
          </button>
        </div>
      )}

      {/* Banner Draf Offline Pending */}
      {offlineDrafts.length > 0 && activeTab === 'instruments' && (
        <div className="bg-amber-950/60 border border-amber-800/80 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-200">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <span className="font-bold text-amber-100">Terdapat {offlineDrafts.length} Draf Registrasi Offline</span>
              <p className="text-[11px] text-amber-300/80">
                Draf ini dibuat saat offline (tanpa ID permanen). Sambungkan ke internet dan klik sinkronkan untuk mengalokasikan ID Instrumen permanen secara atomik.
              </p>
            </div>
          </div>
          <button
            onClick={handleSyncOfflineDrafts}
            disabled={isSyncingDrafts || (typeof navigator !== "undefined" && !navigator.onLine)}
            className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition disabled:opacity-50 cursor-pointer shadow-md shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncingDrafts ? 'animate-spin' : ''}`} />
            <span>{isSyncingDrafts ? 'Proses Sync...' : 'Sinkronkan & Terbitkan ID'}</span>
          </button>
        </div>
      )}

      {/* Search & Actions Bar */}
      <div className="flex flex-wrap gap-3 justify-between items-center bg-slate-900/50 p-3 rounded-lg border border-slate-800/60">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Cari berdasarkan nama atau ID..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 focus:border-sky-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <button
              onClick={() => {
                let currentItemNames: string[] = [];
                if (activeTab === 'instruments') {
                  currentItemNames = instruments.filter(i => selectedIds.includes(i.id)).map(i => `${i.name} (${i.id})`);
                } else if (activeTab === 'bmhp') {
                  currentItemNames = bmhpList.filter(b => selectedIds.includes(b.id)).map(b => `${b.name} (${b.id})`);
                } else if (activeTab === 'linen') {
                  currentItemNames = linenList.filter(b => selectedIds.includes(b.id)).map(b => `${b.name} (${b.id})`);
                } else if (activeTab === 'rooms') {
                  currentItemNames = units.filter(u => selectedIds.includes(u.id)).map(u => `${u.name} (${u.id})`);
                } else if (activeTab === 'machines') {
                  currentItemNames = machines.filter(m => selectedIds.includes(m.id)).map(m => `${m.name} (${m.id})`);
                }
                openDeleteModal(selectedIds, currentItemNames);
              }}
              className="bg-rose-600 hover:bg-rose-500 text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-lg animate-pulse"
            >
              <Trash2 className="w-4 h-4" />
              <span>Hapus Terpilih ({selectedIds.length})</span>
            </button>
          )}

          {activeTab === 'instruments' && (
            <>
              <button
                onClick={handleExportCSV}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-md"
                title="Export seluruh daftar instrumen ke file CSV"
              >
                <Download className="w-4 h-4" />
                <span>Export CSV</span>
              </button>
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Import CSV</span>
              </button>
            </>
          )}

          <button
            onClick={() => {
              if (activeTab === 'instruments') {
                setInstForm({ id: '', name: '', sku: '', type: 'single', originUnit: '', description: '', sterileDurationDays: 30, totalStock: 0, items: [] });
                setIsEditingInst(false);
                setIsInstModalOpen(true);
              } else if (activeTab === 'rooms') {
                setUnitForm({ id: '', name: '' });
                setIsEditingUnit(false);
                setIsUnitModalOpen(true);
              } else if (activeTab === 'machines') {
                setMachineForm({ id: '', name: '', type: 'sterilizer_steam', status: 'idle', serialNumber: '', modes: [] });
                setIsEditingMachine(false);
                setIsMachineModalOpen(true);
              } else {
                setBmhpForm({ id: '', name: '', category: bmhpCategory, stockQty: 0, minStockAlert: 10, unit: 'pcs' });
                setIsEditingBmhp(false);
                setIsBmhpModalOpen(true);
              }
            }}
            className="bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah {activeTab === 'instruments' ? 'Inventaris' : activeTab === 'rooms' ? 'Ruangan' : activeTab === 'machines' ? 'Mesin' : activeTab === 'linen' ? 'Linen' : 'BMHP'}</span>
          </button>
        </div>
      </div>

      {/* Set Composition & Import View */}
      {activeTab === 'set_composition' && (
        <SetCompositionAndImport currentUser={currentUserProfile || null} />
      )}

      {/* Main Table */}
      {activeTab !== 'set_composition' && (
        <div className="bg-slate-900/80 rounded-xl border border-slate-800/80 overflow-x-auto overflow-y-hidden touch-pan-x overscroll-x-contain pb-2">
        <div className="text-[10px] text-sky-400 mb-2 italic sm:hidden flex items-center gap-1 font-mono px-3 pt-3">
          <span>← Geser tabel ke kiri/kanan untuk melihat semua kolom →</span>
        </div>
        {activeTab === 'instruments' && (() => {
          const filtered = instruments.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()) || i.id.toLowerCase().includes(searchTerm.toLowerCase()));
          return (
            <div className="w-full text-sm text-slate-300">
              {filtered.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">Belum ada data master instrumen.</div>
              ) : (
                <div className="overflow-x-auto min-w-[800px] pb-4">
                  <table className="w-full text-left whitespace-nowrap">
                    <thead>
                      <tr className="bg-slate-900/80 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                        <th className="p-4 font-semibold w-12 text-center">
                          <input 
                            type="checkbox"
                            className="rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-sky-500"
                            checked={selectedIds.length === filtered.length && filtered.length > 0}
                            onChange={(e) => setSelectedIds(e.target.checked ? filtered.map(i => i.id) : [])}
                          />
                        </th>
                        <th className="p-4 font-semibold">ID Instrumen</th>
                        <th className="p-4 font-semibold">QR Code</th>
                        <th className="p-4 font-semibold">Nama Item</th>
                        <th className="p-4 font-semibold">Jenis</th>
                        <th className="p-4 font-semibold">Instalasi Pemilik</th>
                        <th className="p-4 font-semibold">Status Master</th>
                        <th className="p-4 font-semibold text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {filtered.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="p-4 text-center">
                            <input 
                              type="checkbox"
                              className="rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-sky-500"
                              checked={selectedIds.includes(item.id)}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedIds([...selectedIds, item.id]);
                                else setSelectedIds(selectedIds.filter(id => id !== item.id));
                              }}
                            />
                          </td>
                          <td className="p-4 font-mono text-sky-400 font-bold text-xs">{item.id}</td>
                          <td className="p-4">
                            <div className="bg-white p-1 rounded inline-block">
                              <QRCodeSVG value={item.id} size={32} />
                            </div>
                          </td>
                          <td className="p-4 font-medium text-slate-200">{item.name}</td>
                          <td className="p-4 capitalize">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.type === 'set' ? 'bg-indigo-950/50 text-indigo-400 border border-indigo-900/50' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                              {item.type}
                            </span>
                          </td>
                          <td className="p-4 text-emerald-400 font-medium text-xs">{item.originUnit || '-'}</td>
                          <td className="p-4">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/50 text-emerald-400 border border-emerald-900/50">
                              {(item as any).status || 'ACTIVE'}
                            </span>
                          </td>
                          <td className="p-4 text-right space-x-2">
                            <button
                              onClick={() => {
                                setInstForm({ ...item });
                                setIsEditingInst(true);
                                setIsInstModalOpen(true);
                              }}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition"
                              title="Edit Master"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleViewHistory(item)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition"
                              title="Riwayat Alat"
                            >
                              <History className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}

        {activeTab === 'inventory_instruments' && (() => {
          const filtered = instruments.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()) || i.id.toLowerCase().includes(searchTerm.toLowerCase()));
          
          // Group by Origin Unit -> Name
          const groupedData = filtered.reduce((acc, inst) => {
            const unit = inst.originUnit || 'Belum Ditentukan';
            if (!acc[unit]) acc[unit] = {};
            if (!acc[unit][inst.name]) acc[unit][inst.name] = [];
            acc[unit][inst.name].push(inst);
            return acc;
          }, {} as Record<string, Record<string, InstrumentCatalog[]>>);

          // Dashboard stats
          const totalInventaris = filtered.length;
          const aktif = filtered.filter(i => (i as any).status !== 'LOST' && (i as any).status !== 'INACTIVE').length;
          const diCSSD = Math.floor(aktif * 0.4); // Mock for preview
          const diRak = Math.floor(aktif * 0.3);
          const diInstalasi = aktif - diCSSD - diRak;
          const karantina = 0;
          const lost = filtered.filter(i => (i as any).status === 'LOST').length;

          return (
            <div className="w-full space-y-6">
              {/* Dashboard */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-center">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Inventaris</span>
                  <span className="text-2xl font-bold text-sky-400">{totalInventaris}</span>
                </div>
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-center">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Aktif</span>
                  <span className="text-2xl font-bold text-emerald-400">{aktif}</span>
                </div>
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-center">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Di Instalasi</span>
                  <span className="text-2xl font-bold text-indigo-400">{diInstalasi}</span>
                </div>
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-center">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Di CSSD</span>
                  <span className="text-2xl font-bold text-amber-400">{diCSSD}</span>
                </div>
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-center">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Karantina</span>
                  <span className="text-2xl font-bold text-rose-400">{karantina}</span>
                </div>
              </div>

              {Object.keys(groupedData).length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">Belum ada data inventaris.</div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(groupedData).map(([unit, namesGroup]) => {
                    const isUnitExpanded = expandedUnits[unit] ?? true;
                    const unitTotalItems = Object.values(namesGroup).flat().length;

                    return (
                      <div key={unit} className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
                        <div 
                          className="flex items-center justify-between px-4 py-3 bg-slate-800/40 cursor-pointer hover:bg-slate-800/60 transition-colors"
                          onClick={() => setExpandedUnits(prev => ({ ...prev, [unit]: !isUnitExpanded }))}
                        >
                          <div className="flex items-center gap-2">
                            {isUnitExpanded ? <ChevronDown className="w-4 h-4 text-indigo-400" /> : <ChevronRight className="w-4 h-4 text-indigo-400" />}
                            <span className="font-bold text-indigo-400 text-sm">INVENTARIS {unit.toUpperCase()}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-400">Total:</span>
                            <span className="text-sm font-bold text-slate-200">{unitTotalItems} Alat</span>
                          </div>
                        </div>

                        {isUnitExpanded && (
                          <div className="divide-y divide-slate-800/50">
                            {Object.entries(namesGroup).map(([name, items]) => {
                              const nameKey = `${unit}_${name}`;
                              const isNameExpanded = expandedNames[nameKey] ?? false;

                              return (
                                <div key={nameKey} className="pl-4">
                                  <div 
                                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-800/30 transition-colors"
                                    onClick={() => setExpandedNames(prev => ({ ...prev, [nameKey]: !isNameExpanded }))}
                                  >
                                    <div className="flex items-center gap-2">
                                      {isNameExpanded ? <ChevronDown className="w-4 h-4 text-emerald-400" /> : <ChevronRight className="w-4 h-4 text-emerald-400" />}
                                      <span className="font-semibold text-emerald-400 text-sm">{name}</span>
                                    </div>
                                    <span className="text-xs font-mono bg-slate-800 text-slate-300 px-2 py-1 rounded-md">{items.length} Item</span>
                                  </div>

                                  {isNameExpanded && (
                                    <div className="overflow-x-auto pb-4">
                                      <table className="w-full text-left text-[11px] mt-2">
                                        <thead>
                                          <tr className="text-slate-500 uppercase tracking-wider border-b border-slate-800 bg-slate-950/50">
                                            <th className="p-3 font-medium">ID Instrumen</th>
                                            <th className="p-3 font-medium">Tipe</th>
                                            <th className="p-3 font-medium">Status / Kondisi</th>
                                            <th className="p-3 font-medium">Lokasi Terkini</th>
                                            <th className="p-3 font-medium text-right">Aksi</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/30 bg-slate-900/20">
                                          {items.map(item => (
                                            <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                                              <td className="p-3 font-mono font-bold text-sky-400">{item.id}</td>
                                              <td className="p-3 text-slate-300 capitalize">{item.type}</td>
                                              <td className="p-3">
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/50 text-emerald-400 border border-emerald-900/50">
                                                  {(item as any).status || 'Ready'}
                                                </span>
                                              </td>
                                              <td className="p-3 text-slate-400">
                                                {(item as any).location || 'Rak A01'}
                                              </td>
                                              <td className="p-3 text-right">
                                                <button 
                                                  onClick={() => handleViewHistory(item)}
                                                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition"
                                                >
                                                  <History className="w-3.5 h-3.5" />
                                                </button>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
        
        {(activeTab === 'bmhp' || activeTab === 'linen') && (() => {
          const targetList = activeTab === 'linen' ? linenList : bmhpList;
          const filtered = targetList
            .filter(b => b.category === bmhpCategory)
            .filter(b => b.name.toLowerCase().includes(searchTerm.toLowerCase()));
          const labelPrefix = activeTab === 'linen' ? 'Linen' : 'BMHP';
          return (
            <div>
              <div className="flex gap-4 px-4 pt-3 border-b border-slate-800">
                <button
                  onClick={() => setBmhpCategory('sterile')}
                  className={`pb-2 text-sm font-bold border-b-2 transition ${bmhpCategory === 'sterile' ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                >
                  {labelPrefix} Steril
                </button>
                <button
                  onClick={() => setBmhpCategory('non_sterile')}
                  className={`pb-2 text-sm font-bold border-b-2 transition ${bmhpCategory === 'non_sterile' ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                >
                  {labelPrefix} Non-Steril
                </button>
              </div>
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/50 text-xs uppercase text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every(b => selectedIds.includes(b.id))}
                      onChange={() => toggleSelectAll(filtered)}
                      className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3">Item {labelPrefix}</th>
                  <th className="px-4 py-3">Status Stok</th>
                  <th className="px-4 py-3">Tgl Exp</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.map(bmhp => {
                  const isLowStock = bmhp.stockQty <= bmhp.minStockAlert;
                  return (
                    <tr key={bmhp.id} className={`hover:bg-slate-800/30 ${selectedIds.includes(bmhp.id) ? 'bg-sky-950/20' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(bmhp.id)}
                          onChange={() => toggleSelectRow(bmhp.id)}
                          className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-700">
                            {bmhp.imageUrl ? (
                              <img src={bmhp.imageUrl} alt={bmhp.name} className="w-full h-full object-cover" />
                            ) : (
                              <ImageIcon className="w-5 h-5 text-slate-500" />
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-200">{bmhp.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">ID: {bmhp.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div>
                            <div className={`font-bold ${isLowStock ? 'text-rose-500' : 'text-slate-200'}`}>
                              {bmhp.stockQty} {bmhp.unit}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">Min. Stok: {bmhp.minStockAlert}</div>
                          </div>
                          {isLowStock && (
                            <div className="flex items-center gap-1 bg-rose-500/10 text-rose-400 px-2 py-1 rounded text-[10px] font-bold border border-rose-500/20">
                              <AlertTriangle className="w-3 h-3" /> RESTOCK
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {bmhp.expirationDate || '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => openDetailModal(bmhp)}
                            className="bg-slate-800 hover:bg-slate-700 text-xs px-2 py-1.5 rounded text-sky-300 font-bold transition inline-flex items-center gap-1"
                            title="Detail & History"
                          >
                            <FileText className="w-3 h-3" /> Detail
                          </button>
                          <button 
                            onClick={() => { setAdjustTarget(bmhp); setIsAdjustModalOpen(true); }}
                            className="bg-slate-800 hover:bg-slate-700 text-xs px-3 py-1.5 rounded text-slate-300 font-bold transition inline-flex items-center gap-1"
                          >
                            <ArrowDownUp className="w-3 h-3" /> In/Out
                          </button>
                          <button 
                            onClick={() => { setBmhpForm(bmhp); setIsEditingBmhp(true); setIsBmhpModalOpen(true); }} 
                            className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-indigo-400 p-1.5 rounded transition"
                            title="Edit BMHP"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => openDeleteModal([bmhp.id], [`${bmhp.name} (${bmhp.id})`])} 
                            className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 p-1.5 rounded transition"
                            title="Hapus BMHP"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500 text-xs">Belum ada data BMHP di kategori ini.</td></tr>
                )}
              </tbody>
            </table>
            </div>
          );
        })()}

        {activeTab === 'rooms' && (() => {
          const filtered = units.filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.id.toLowerCase().includes(searchTerm.toLowerCase()));
          return (
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/50 text-xs uppercase text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every(u => selectedIds.includes(u.id))}
                      onChange={() => toggleSelectAll(filtered)}
                      className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3">ID Ruangan</th>
                  <th className="px-4 py-3">Nama Instalasi/Ruangan</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.map(unit => (
                  <tr key={unit.id} className={`hover:bg-slate-800/30 ${selectedIds.includes(unit.id) ? 'bg-sky-950/20' : ''}`}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(unit.id)}
                        onChange={() => toggleSelectRow(unit.id)}
                        className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-sky-400">{unit.id}</td>
                    <td className="px-4 py-3 font-semibold text-slate-200">{unit.name}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button onClick={() => { setUnitForm(unit); setIsEditingUnit(true); setIsUnitModalOpen(true); }} className="text-slate-400 hover:text-indigo-400 p-1" title="Edit Ruangan">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => openDeleteModal([unit.id], [`${unit.name} (${unit.id})`])} className="text-slate-400 hover:text-rose-400 p-1" title="Hapus Ruangan">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500 text-xs">Belum ada data Ruangan.</td></tr>
                )}
              </tbody>
            </table>
          );
        })()}

        {activeTab === 'machines' && (() => {
          const filtered = machines.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()) || m.id.toLowerCase().includes(searchTerm.toLowerCase()));
          return (
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/50 text-xs uppercase text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every(m => selectedIds.includes(m.id))}
                      onChange={() => toggleSelectAll(filtered)}
                      className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3">ID Mesin</th>
                  <th className="px-4 py-3">Nama Mesin</th>
                  <th className="px-4 py-3">Metode / Tipe</th>
                  <th className="px-4 py-3">Program Mode</th>
                  <th className="px-4 py-3">Suhu / Waktu</th>
                  <th className="px-4 py-3">S/N</th>
                  <th className="px-4 py-3 text-center">Status Kelayakan</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.map(machine => {
                  const getStatusBadge = (status: string) => {
                    switch (status) {
                      case 'ready':
                        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">🟢 Lolos Test / Ready</span>;
                      case 'belum_uji':
                        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/20">🟡 Belum Uji Kelayakan</span>;
                      case 'perbaikan':
                        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse">🔴 Perbaikan</span>;
                      case 'tidak_aktif':
                      default:
                        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-slate-500/10 text-slate-400 border border-slate-500/20">⚪ Tidak Aktif</span>;
                    }
                  };

                  return (
                    <tr key={machine.id} className={`hover:bg-slate-800/30 ${selectedIds.includes(machine.id) ? 'bg-sky-950/20' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(machine.id)}
                          onChange={() => toggleSelectRow(machine.id)}
                          className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-sky-400">{machine.id}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-200">{machine.name}</div>
                        <div className="text-[10px] text-slate-500">Merek / Seri Mesin</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300">{machine.method || machine.type.replace('_', ' ')}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300 font-mono max-w-[150px] truncate" title={(machine.modes || []).join(', ')}>
                        {(machine.modes || []).join(', ') || '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300 font-mono">
                        {machine.temperature || '-'} / {machine.duration || '-'}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">{machine.serialNumber || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        {getStatusBadge(machine.status)}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button onClick={() => { setMachineForm(machine); setIsEditingMachine(true); setIsMachineModalOpen(true); }} className="text-slate-400 hover:text-indigo-400 p-1" title="Edit Mesin">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => openDeleteModal([machine.id], [`${machine.name} (${machine.id})`])} className="text-slate-400 hover:text-rose-400 p-1" title="Hapus Mesin">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-xs">Belum ada data Mesin.</td></tr>
                )}
              </tbody>
            </table>
          );
        })()}

      </div>
      )}

      {/* MODAL: Import CSV */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-5 shadow-2xl flex flex-col my-auto">
            <div className="flex justify-between items-center mb-3 pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-slate-100">Import Master Inventaris (CSV)</h3>
              <button 
                type="button" 
                onClick={() => setIsImportModalOpen(false)} 
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleImportCSV} className="flex-1 flex flex-col min-h-0">
              <div className="space-y-4 mb-4">
                <button
                  type="button"
                  onClick={downloadCSVTemplate}
                  className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-sky-400 p-2.5 rounded-lg border border-slate-700 transition font-medium text-xs"
                >
                  <FileText className="w-4 h-4" />
                  Unduh Template CSV (Lembar Master)
                </button>

                <div className="text-xs text-slate-400 bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <p className="font-bold text-slate-300 mb-1">Panduan Pengisian CSV:</p>
                  <ul className="list-decimal pl-4 space-y-1">
                    <li><strong>ID:</strong> Unik (Mis: ST-HECTG-001)</li>
                    <li><strong>Nama Item:</strong> Nama instrumen atau nama set</li>
                    <li><strong>Tipe:</strong> Isi dengan <code className="bg-slate-800 px-1 rounded text-slate-300">set</code> atau <code className="bg-slate-800 px-1 rounded text-slate-300">single</code></li>
                    <li><strong>Asal Instalasi:</strong> Nama unit (Mis: IGD, OK Sentral)</li>
                    <li><strong>Jumlah Stock:</strong> Angka jumlah stok alat</li>
                    <li><strong>Detail Item:</strong> Kosongkan jika tipe <code className="bg-slate-800 px-1 rounded text-slate-300">single</code>.<br/>Jika <code className="bg-slate-800 px-1 rounded text-slate-300">set</code>, formatnya <code className="bg-slate-800 px-1 rounded text-slate-300">Nama:Qty|Nama:Qty</code> (Contoh: <code className="bg-slate-800 px-1 rounded text-slate-300">Pinset:1|Gunting:2</code>)</li>
                  </ul>
                  <p className="mt-2 text-rose-400 italic">*Pastikan tidak menghapus baris pertama (Header) pada template saat mengimpor.</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Pilih File CSV</label>
                  <input 
                    type="file" 
                    accept=".csv"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:border-sky-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-sky-950 file:text-sky-400 hover:file:bg-sky-900" 
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-3 mt-3 border-t border-slate-800 shrink-0">
                <button 
                  type="button" 
                  onClick={() => setIsImportModalOpen(false)} 
                  className="px-4 py-2.5 text-xs font-bold text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800 transition"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  disabled={!importFile || isImporting}
                  className="px-4 py-2.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Upload className="w-4 h-4" />
                  {isImporting ? 'Mengimpor...' : 'Mulai Import'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* MODAL: Riwayat Log Workflow Instrumen */}
      <InstrumentHistoryModal 
        isOpen={isHistoryModalOpen}
        onClose={() => {
          setIsHistoryModalOpen(false);
          setHistorySelectedInst(null);
        }}
        instrument={historySelectedInst}
      />

      {/* MODAL: Registrasi Instrumen Header-Detail */}
      {isInstModalOpen && (
        <InventoryRegistrationForm 
          isOpen={isInstModalOpen}
          onClose={() => {
            setIsInstModalOpen(false);
            setIsEditingInst(false);
            setInstForm({ id: "", name: "", sku: "", type: "single", originUnit: "", description: "", sterileDurationDays: 30, totalStock: 0, items: [] });
          }}
          isEditing={isEditingInst}
          initialData={instForm}
          currentUserProfile={currentUserProfile}
          onSuccess={() => {
            setIsInstModalOpen(false);
            setIsEditingInst(false);
            setInstForm({ id: "", name: "", sku: "", type: "single", originUnit: "", description: "", sterileDurationDays: 30, totalStock: 0, items: [] });
          }}
        />
      )}

      {/* MODAL: Tambah/Edit BMHP / Linen */}
      {isBmhpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 mb-4">{isEditingBmhp ? `Edit Data ${activeTab === 'linen' ? 'Linen' : 'BMHP'}` : `Data ${activeTab === 'linen' ? 'Linen' : 'BMHP'} Baru`}</h3>
            <form onSubmit={handleSaveBmhp} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">ID Item</label>
                  <input type="text" required readOnly={isEditingBmhp} value={bmhpForm.id} onChange={e => setBmhpForm({...bmhpForm, id: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:border-sky-500 read-only:opacity-60" placeholder="Mis: BM-001" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Nama Item</label>
                  <input type="text" required value={bmhpForm.name} onChange={e => setBmhpForm({...bmhpForm, name: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:border-sky-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Kategori</label>
                  <select value={bmhpForm.category} onChange={e => setBmhpForm({...bmhpForm, category: e.target.value as any})} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:border-sky-500">
                    <option value="sterile">Steril</option>
                    <option value="non_sterile">Non-Steril</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Satuan</label>
                  <input type="text" required value={bmhpForm.unit} onChange={e => setBmhpForm({...bmhpForm, unit: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:border-sky-500" placeholder="Mis: Box, Roll, Pcs" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Stok Awal</label>
                  <div className="flex items-center">
                    <button
                      type="button"
                      className="w-10 h-[38px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-l border border-r-0 border-slate-800 font-bold text-lg"
                      onClick={() => setBmhpForm({...bmhpForm, stockQty: Math.max(0, (bmhpForm.stockQty ?? 0) - 1)})}
                    >
                      -
                    </button>
                    <input 
                      type="number" 
                      required 
                      value={isNaN(bmhpForm.stockQty ?? NaN) ? "" : bmhpForm.stockQty} 
                      onChange={e => setBmhpForm({...bmhpForm, stockQty: parseInt(e.target.value) || 0})} 
                      className="w-full h-[38px] bg-slate-950 border-y border-slate-800 text-sm text-slate-200 text-center outline-none focus:border-sky-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                    />
                    <button
                      type="button"
                      className="w-10 h-[38px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-r border border-l-0 border-slate-800 font-bold text-lg"
                      onClick={() => setBmhpForm({...bmhpForm, stockQty: (bmhpForm.stockQty ?? 0) + 1})}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Alert Stok Minimum</label>
                  <div className="flex items-center">
                    <button
                      type="button"
                      className="w-10 h-[38px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-l border border-r-0 border-slate-800 font-bold text-lg"
                      onClick={() => setBmhpForm({...bmhpForm, minStockAlert: Math.max(0, (bmhpForm.minStockAlert ?? 0) - 1)})}
                    >
                      -
                    </button>
                    <input 
                      type="number" 
                      required 
                      value={isNaN(bmhpForm.minStockAlert ?? NaN) ? "" : bmhpForm.minStockAlert} 
                      onChange={e => setBmhpForm({...bmhpForm, minStockAlert: parseInt(e.target.value) || 0})} 
                      className="w-full h-[38px] bg-slate-950 border-y border-slate-800 text-sm text-slate-200 text-center outline-none focus:border-sky-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                    />
                    <button
                      type="button"
                      className="w-10 h-[38px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-r border border-l-0 border-slate-800 font-bold text-lg"
                      onClick={() => setBmhpForm({...bmhpForm, minStockAlert: (bmhpForm.minStockAlert ?? 0) + 1})}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Tgl Kadaluarsa (Opsional)</label>
                  <input type="date" value={typeof bmhpForm.expirationDate === 'string' ? bmhpForm.expirationDate : ''} onChange={e => setBmhpForm({...bmhpForm, expirationDate: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:border-sky-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Gambar Produk</label>
                  <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded p-1.5">
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={(e) => setImageFile(e.target.files ? e.target.files[0] : null)}
                      className="w-full text-xs text-slate-400 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-[10px] file:font-bold file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700" 
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <button type="button" onClick={() => setIsBmhpModalOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200" disabled={isUploading}>Batal</button>
                <button type="submit" className="bg-sky-600 hover:bg-sky-500 px-4 py-2 rounded text-xs font-bold text-white shadow-lg flex items-center gap-2" disabled={isUploading}>
                  {isUploading && <Upload className="w-3 h-3 animate-bounce" />}
                  {isUploading ? 'Menyimpan...' : `Simpan ${activeTab === 'linen' ? 'Linen' : 'BMHP'}`}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      
      {/* MODAL: Tambah/Edit Ruangan */}
      {isUnitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-slate-900 border border-slate-700 rounded-xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 mb-4">{isEditingUnit ? 'Edit Data Ruangan' : 'Registrasi Ruangan Baru'}</h3>
            <form onSubmit={handleSaveUnit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">ID Ruangan (Opsional)</label>
                <input type="text" readOnly={isEditingUnit} value={unitForm.id} onChange={e => setUnitForm({...unitForm, id: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:border-sky-500 read-only:opacity-60" placeholder="Mis: OK-01" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Nama Ruangan / Instalasi</label>
                <input type="text" required value={unitForm.name} onChange={e => setUnitForm({...unitForm, name: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:border-sky-500" placeholder="Mis: IBS/OK" />
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <button type="button" onClick={() => setIsUnitModalOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200">Batal</button>
                <button type="submit" className="bg-sky-600 hover:bg-sky-500 px-4 py-2 rounded text-xs font-bold text-white shadow-lg">Simpan</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* MODAL: Tambah/Edit Mesin */}
      {isMachineModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 mb-4">{isEditingMachine ? 'Edit Data Mesin' : 'Registrasi Mesin Baru'}</h3>
            <form onSubmit={handleSaveMachine} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">ID Mesin (Opsional)</label>
                  <input type="text" readOnly={isEditingMachine} value={machineForm.id} onChange={e => setMachineForm({...machineForm, id: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:border-sky-500 read-only:opacity-60" placeholder="Mis: M-01" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Nama / Merek Mesin</label>
                  <input type="text" required value={machineForm.name} onChange={e => setMachineForm({...machineForm, name: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:border-sky-500" placeholder="Mis: BUMA STERILIZER VACUM" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Tipe Mesin</label>
                  <select value={machineForm.type} onChange={e => setMachineForm({...machineForm, type: e.target.value as any})} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:border-sky-500">
                    <option value="sterilizer_steam">Steam Autoclave</option>
                    <option value="sterilizer_plasma">Plasma (H2O2)</option>
                    <option value="washer">Washer / Decontaminator</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Metode Sterilisasi / Proses</label>
                  <input type="text" required value={machineForm.method || ""} onChange={e => setMachineForm({...machineForm, method: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:border-sky-500" placeholder="Mis: Steam Autoclave High Temp" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Program Mode (Pisahkan dengan koma)</label>
                  <input type="text" required value={(machineForm.modes || []).join(', ')} onChange={e => setMachineForm({...machineForm, modes: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:border-sky-500" placeholder="Mis: Bowie-Dick, Vacuum Test, Mode 134C, Mode 121C" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Suhu Pengoperasian</label>
                  <input type="text" required value={machineForm.temperature || ""} onChange={e => setMachineForm({...machineForm, temperature: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:border-sky-500" placeholder="Mis: 121°C - 134°C" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Waktu Siklus (Durasi)</label>
                  <input type="text" required value={machineForm.duration || ""} onChange={e => setMachineForm({...machineForm, duration: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:border-sky-500" placeholder="Mis: 45 Menit" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Serial Number</label>
                  <input type="text" value={machineForm.serialNumber || ""} onChange={e => setMachineForm({...machineForm, serialNumber: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:border-sky-500" placeholder="S/N: 2026XAS01" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Status Kelayakan Mesin</label>
                  <select value={machineForm.status} onChange={e => setMachineForm({...machineForm, status: e.target.value as any})} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:border-sky-500">
                    <option value="ready">🟢 Lolos Test / Ready</option>
                    <option value="belum_uji">🟡 Belum Uji Kelayakan</option>
                    <option value="perbaikan">🔴 Perbaikan</option>
                    <option value="tidak_aktif">⚪ Tidak Aktif</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 justify-end mt-6 pt-3 border-t border-slate-800">
                <button type="button" onClick={() => setIsMachineModalOpen(false)} className="px-4 py-2.5 text-xs font-bold text-slate-400 hover:text-slate-200 transition">Batal</button>
                <button type="submit" className="bg-sky-600 hover:bg-sky-500 px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-lg transition">Simpan Mesin</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* MODAL: Adjust Stock */}
      {isAdjustModalOpen && adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-slate-900 border border-slate-700 rounded-xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 mb-1">Stok In / Out</h3>
            <p className="text-xs text-slate-400 mb-4">{adjustTarget.name} (Stok Saat Ini: {adjustTarget.stockQty})</p>
            
            <form onSubmit={handleAdjustStock} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Tipe Transaksi</label>
                <select value={adjustType} onChange={e => setAdjustType(e.target.value as 'in'|'out')} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:border-sky-500">
                  <option value="in">Barang Masuk (Restock)</option>
                  <option value="out">Barang Keluar (Dipakai)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Jumlah</label>
                <div className="flex items-center">
                  <button
                    type="button"
                    className="w-10 h-[38px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-l border border-r-0 border-slate-800 font-bold text-lg"
                    onClick={() => setAdjustQty(Math.max(1, adjustQty - 1))}
                  >
                    -
                  </button>
                  <input 
                    type="number" 
                    min={1} 
                    required 
                    value={isNaN(adjustQty) || adjustQty === 0 ? "" : adjustQty} 
                    onChange={e => setAdjustQty(parseInt(e.target.value) || 0)} 
                    className="w-full h-[38px] bg-slate-950 border-y border-slate-800 text-sm text-slate-200 text-center outline-none focus:border-sky-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                  />
                  <button
                    type="button"
                    className="w-10 h-[38px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-r border border-l-0 border-slate-800 font-bold text-lg"
                    onClick={() => setAdjustQty(adjustQty + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Keterangan</label>
                <input type="text" value={adjustNotes} onChange={e => setAdjustNotes(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:border-sky-500" placeholder="Misal: Permintaan instalasi kebidanan, diambil oleh bidan Ajes" />
              </div>
              {adjustType === 'in' && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Tgl Kadaluarsa (Opsional)</label>
                  <input type="date" value={adjustExpDate} onChange={e => setAdjustExpDate(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:border-sky-500" />
                </div>
              )}
              <div className="flex gap-3 justify-end mt-4">
                <button type="button" onClick={() => setIsAdjustModalOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200">Batal</button>
                <button type="submit" className="bg-sky-600 hover:bg-sky-500 px-4 py-2 rounded text-xs font-bold text-white">Simpan Stok</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* MODAL: Generate QR */}
      {isQrModalOpen && selectedQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={() => setIsQrModalOpen(false)}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-xl p-8 shadow-2xl flex flex-col items-center" onClick={e => e.stopPropagation()}>
            <QRCodeSVG value={selectedQr} size={200} level="H" includeMargin={true} />
            <div className="mt-4 text-center">
              <div className="text-xs text-slate-500 font-bold uppercase tracking-widest">ID ALAT</div>
              <div className="text-xl font-bold text-slate-900 font-mono mt-1">{selectedQr}</div>
            </div>
            <button onClick={() => window.print()} className="mt-6 bg-slate-900 text-white w-full py-2 rounded-lg text-xs font-bold hover:bg-slate-800">
              Cetak QR Code
            </button>
          </motion.div>
        </div>
      )}

      {/* MODAL: Konfirmasi Hapus Data / Delete Confirmation Modal */}
      {/* MODAL: Detail Log BMHP */}
      {isDetailModalOpen && detailTarget && (() => {
        const targetList = activeTab === 'linen' ? linenList : bmhpList;
        const liveDetailTarget = targetList.find(b => b.id === detailTarget.id) || detailTarget;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-slate-900 border border-slate-700 rounded-xl max-w-4xl w-full p-6 shadow-2xl flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                    <Package className="w-5 h-5 text-sky-400" />
                    Detail Kartu Stok: {liveDetailTarget.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">ID: {liveDetailTarget.id} | Stok Saat Ini: <span className="font-bold text-sky-400">{liveDetailTarget.stockQty} {liveDetailTarget.unit}</span></p>
                </div>
                <div className="flex gap-2">
                  <button onClick={exportPdf} className="bg-sky-600 hover:bg-sky-500 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-2 transition">
                    <Printer className="w-4 h-4" /> Export PDF A4
                  </button>
                  <button onClick={() => setIsDetailModalOpen(false)} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded text-xs font-bold transition">Tutup</button>
                </div>
              </div>

              {/* FIFO Batches Panel */}
              <div className="mb-4 bg-slate-950 p-4 rounded-lg border border-slate-800">
                <h4 className="text-xs font-bold text-sky-400 mb-2.5 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Sistem Batch FIFO Aktif ({liveDetailTarget.batches?.length || 0})
                </h4>
                
                {!liveDetailTarget.batches || liveDetailTarget.batches.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Tidak ada detail batch FIFO aktif. Seluruh stok dinilai dalam satu batch utama.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-40 overflow-y-auto pr-1">
                    {liveDetailTarget.batches.map((batch, index) => {
                      let statusLabel = "Aman";
                      let statusColor = "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20";
                      if (batch.expirationDate) {
                        const expDate = new Date(batch.expirationDate);
                        const today = new Date();
                        const timeDiff = expDate.getTime() - today.getTime();
                        const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
                        
                        if (daysDiff < 0) {
                          statusLabel = "KADALUARSA";
                          statusColor = "bg-rose-500/15 text-rose-400 border border-rose-500/20 animate-pulse";
                        } else if (daysDiff <= 30) {
                          statusLabel = `Hampir Exp (${daysDiff} hari)`;
                          statusColor = "bg-amber-500/15 text-amber-400 border border-amber-500/20";
                        }
                      }

                      return (
                        <div key={batch.id} className={`p-2.5 rounded border flex flex-col justify-between text-xs transition-all ${index === 0 ? 'bg-sky-950/40 border-sky-500/30 ring-1 ring-sky-500/20' : 'bg-slate-900 border-slate-800'}`}>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="font-mono text-slate-400 truncate text-[10px] flex items-center gap-1" title={batch.id}>
                              {index === 0 && <span className="bg-sky-500 text-white text-[8px] font-bold px-1 rounded">FIFO NEXT</span>}
                              {batch.id}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${statusColor}`}>
                              {statusLabel}
                            </span>
                          </div>
                          <div className="flex justify-between items-baseline text-slate-300">
                            <div>
                              <span className="text-slate-500 text-[10px] block">Jumlah Stok:</span>
                              <span className="text-sm font-extrabold text-slate-200">{batch.qty} {liveDetailTarget.unit}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-slate-500 text-[10px] block">Tgl Kadaluarsa:</span>
                              <span className="font-mono font-semibold text-[11px] text-slate-400">{batch.expirationDate || "Tidak ada"}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto bg-slate-950 rounded-lg border border-slate-800 relative">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-900 text-xs uppercase text-slate-400 border-b border-slate-800 sticky top-0">
                    <tr>
                      <th className="px-4 py-3">Timestime</th>
                      <th className="px-4 py-3">Nama BMHP</th>
                      <th className="px-4 py-3 text-center text-emerald-400">IN</th>
                      <th className="px-4 py-3 text-center text-rose-400">OUT</th>
                      <th className="px-4 py-3 text-center text-sky-400">Status Stok</th>
                      <th className="px-4 py-3">Keterangan</th>
                      <th className="px-4 py-3">Tgl Exp</th>
                      <th className="px-4 py-3">Nama Petugas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {detailLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-2 text-xs">{log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString('id-ID') : '-'}</td>
                        <td className="px-4 py-2 text-xs font-semibold">{log.bmhpName}</td>
                        <td className="px-4 py-2 text-xs text-center font-bold text-emerald-400">{log.type === 'in' ? '+' + log.qty : '-'}</td>
                        <td className="px-4 py-2 text-xs text-center font-bold text-rose-400">{log.type === 'out' ? '-' + log.qty : '-'}</td>
                        <td className="px-4 py-2 text-xs text-center font-bold text-sky-400">{log.currentStock ?? '-'}</td>
                        <td className="px-4 py-2 text-xs text-slate-400 max-w-[150px] truncate" title={log.notes}>{log.notes || '-'}</td>
                        <td className="px-4 py-2 text-xs text-slate-400">{log.expDate || '-'}</td>
                        <td className="px-4 py-2 text-xs text-slate-400">{log.operator}</td>
                      </tr>
                    ))}
                    {detailLogs.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500 text-xs">Belum ada history transaksi.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>
        );
      })()}

      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4" onClick={() => !isDeleting && setDeleteModal(prev => ({ ...prev, isOpen: false }))}>
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }} 
            className="bg-slate-900 border border-rose-500/30 rounded-xl max-w-md w-full p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-rose-500 mb-3">
              <div className="p-2.5 bg-rose-500/10 rounded-full border border-rose-500/20">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Konfirmasi Hapus Data</h3>
                <p className="text-xs text-slate-400">Tindakan ini tidak dapat dibatalkan!</p>
              </div>
            </div>

            <p className="text-sm text-slate-300 mt-2 mb-3">
              Apakah Anda yakin ingin menghapus <strong className="text-rose-400 font-semibold">{deleteModal.ids.length} item</strong> berikut?
            </p>

            <div className="max-h-36 overflow-y-auto bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-400 space-y-1 mb-5">
              {deleteModal.itemNames.map((name, idx) => (
                <div key={idx} className="flex items-center gap-2 font-mono text-slate-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                  <span>{name}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200 transition"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleExecuteDelete}
                className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 shadow-lg"
              >
                {isDeleting ? "Menghapus..." : `Hapus ${deleteModal.ids.length} Item`}
              </button>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
}
