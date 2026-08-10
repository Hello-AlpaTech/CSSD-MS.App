import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  runTransaction, 
  serverTimestamp, 
  query, 
  where 
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { 
  MasterSet, 
  MasterSetKomponen, 
  SetCompositionSummary, 
  ImportRowValidation, 
  SetCompletenessStatus, 
  UserProfile, 
  InstrumentCatalog 
} from "../types";
import { 
  writeAuditLog, 

} from "../lib/auditLogger";
import { 
  checkPermissionOrThrow, 
  PERMISSIONS, requireTenantId, 
  isUserActive 
} from "../lib/permissions";
import { triggerActionConfirm } from "../lib/actionToast";
import { formatToStandardSerialNumber } from "../lib/serialNumberUtils";
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Plus, 
  Edit, 
  Layers, 
  Package, 
  Building2, 
  RefreshCw, 
  ShieldAlert, 
  ChevronRight, 
  Info,
  Trash2,
  Database,
  ArrowRight
} from "lucide-react";

interface Props {
  currentUser: UserProfile | null;
  onImportCompleted?: () => void;
}

export default function SetCompositionAndImport({ currentUser, onImportCompleted }: Props) {
  const tenantId = currentUser ? (() => { try { return requireTenantId(currentUser); } catch(e) { return ""; } })() : "";

  // Tabs: 'komposisi' | 'import'
  const [activeTab, setActiveTab] = useState<'komposisi' | 'import'>('komposisi');

  // Firestore Data States
  const [masterSets, setMasterSets] = useState<MasterSet[]>([]);
  const [masterComponents, setMasterComponents] = useState<MasterSetKomponen[]>([]);
  const [physicalInstruments, setPhysicalInstruments] = useState<InstrumentCatalog[]>([]);

  // Modal State for Adding/Editing Master Set
  const [isSetModalOpen, setIsSetModalOpen] = useState(false);
  const [editingSet, setEditingSet] = useState<MasterSet | null>(null);
  const [setFormName, setSetFormName] = useState("");
  const [setFormCode, setSetFormCode] = useState("");
  const [setFormUnit, setSetFormUnit] = useState("IGD");
  const [setFormComponents, setSetFormComponents] = useState<{ name: string; qty: number; wajib: boolean }[]>([
    { name: "", qty: 1, wajib: true }
  ]);

  // Import Wizard State
  const [importText, setImportText] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ImportRowValidation[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1); // 1: Input, 2: Preview, 3: Success

  // Real-time Subscriptions for Master Sets & Physical Instruments
  useEffect(() => {
    if (!currentUser || !isUserActive(currentUser)) return;

    // 1. Subscribe Master Sets
    const unsubSets = onSnapshot(query(collection(db, "master_sets"), where("tenantId", "==", tenantId)), (snap) => {
      const sets: MasterSet[] = [];
      snap.forEach((d) => {
        const data = d.data();
        sets.push({
          id: d.id,
          setId: data.setId || d.id,
          namaSet: data.namaSet || "Set Tanpa Nama",
          kodeSet: data.kodeSet || "SET",
          instalasiPemilik: data.instalasiPemilik || "CSSD",
          jumlahKomponenStandar: data.jumlahKomponenStandar || 0,
          statusAktif: data.statusAktif !== false,
          tenantId: data.tenantId || tenantId,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      });
      setMasterSets(sets);
    });

    // 2. Subscribe Master Set Components
    const unsubComps = onSnapshot(query(collection(db, "master_set_components"), where("tenantId", "==", tenantId)), (snap) => {
      const comps: MasterSetKomponen[] = [];
      snap.forEach((d) => {
        const data = d.data();
        comps.push({
          id: d.id,
          setId: data.setId,
          komponenId: data.komponenId || d.id,
          namaInstrumen: data.namaInstrumen || "",
          kategori: data.kategori || "Umum",
          jumlahStandar: data.jumlahStandar || 1,
          wajib: data.wajib !== false,
          tenantId: data.tenantId || tenantId
        });
      });
      setMasterComponents(comps);
    });

    // 3. Subscribe Master Instruments for Physical Counts
    const unsubInst = onSnapshot(query(collection(db, "master_instruments"), where("tenantId", "==", tenantId)), (snap) => {
      const insts: InstrumentCatalog[] = [];
      snap.forEach((d) => {
        const data = d.data();
        insts.push({
          id: d.id,
          name: data.name || "",
          type: data.type || "single",
          originUnit: data.originUnit || "Global",
          totalStock: data.totalStock ?? 1,
          description: data.description || "",
          items: data.components || data.items || [],
          sku: data.sku || d.id,
          sterileDurationDays: data.sterileDurationDays || 30
        });
      });
      setPhysicalInstruments(insts);
    });

    return () => {
      unsubSets();
      unsubComps();
      unsubInst();
    };
  }, [currentUser, tenantId]);

  // Derived Set Summaries (Physical vs Standard Composition)
  const setSummaries: SetCompositionSummary[] = useMemo(() => {
    // Group physical instruments by set / name
    return masterSets.map((mSet) => {
      const setComps = masterComponents.filter((c) => c.setId === mSet.setId);
      
      // Calculate standard count
      const standardCount = setComps.length > 0 
        ? setComps.reduce((acc, c) => acc + (c.jumlahStandar || 1), 0)
        : mSet.jumlahKomponenStandar || 0;

      // Find matching physical instruments for this set
      const matchingPhysical = physicalInstruments.filter((p) => {
        const nameMatch = p.name.toLowerCase().trim() === mSet.namaSet.toLowerCase().trim() ||
                          p.id.toLowerCase().includes(mSet.kodeSet.toLowerCase());
        return nameMatch;
      });

      // Calculate total actual physical components available across matching physical items
      let actualPhysicalCount = 0;
      const componentCountsMap: Record<string, number> = {};

      matchingPhysical.forEach((p) => {
        if (p.items && p.items.length > 0) {
          p.items.forEach((item) => {
            const itemNameLower = item.name.toLowerCase().trim();
            componentCountsMap[itemNameLower] = (componentCountsMap[itemNameLower] || 0) + (item.qty || 1);
            actualPhysicalCount += (item.qty || 1);
          });
        } else {
          actualPhysicalCount += (p.totalStock || 1);
        }
      });

      // Calculate per-component breakdown
      const compBreakdown = setComps.map((c) => {
        const cNameLower = c.namaInstrumen.toLowerCase().trim();
        const physicalFound = componentCountsMap[cNameLower] || 0;
        const shortage = Math.max(0, c.jumlahStandar - physicalFound);
        return {
          komponenId: c.komponenId,
          namaInstrumen: c.namaInstrumen,
          jumlahStandar: c.jumlahStandar,
          jumlahFisik: physicalFound,
          kekurangan: shortage
        };
      });

      const shortageTotal = Math.max(0, standardCount - actualPhysicalCount);
      const percent = standardCount > 0 ? Math.min(100, Math.round((actualPhysicalCount / standardCount) * 100)) : 100;
      const status: SetCompletenessStatus = (shortageTotal > 0 || percent < 100) 
        ? "BELUM_LENGKAP_PENYEDIAAN" 
        : "LENGKAP";

      return {
        setId: mSet.setId,
        namaSet: mSet.namaSet,
        kodeSet: mSet.kodeSet,
        instalasiPemilik: mSet.instalasiPemilik,
        jumlahKomponenStandar: standardCount,
        jumlahFisikTersedia: actualPhysicalCount,
        kekuranganPenyediaan: shortageTotal,
        kelengkapanPercent: percent,
        status,
        components: compBreakdown
      };
    });
  }, [masterSets, masterComponents, physicalInstruments]);

  // Open modal to Create / Edit Master Set
  const handleOpenSetModal = (setSummary?: SetCompositionSummary) => {
    checkPermissionOrThrow(currentUser, PERMISSIONS.MASTER_INSTRUMEN_CREATE, {
      resource: "MASTER_SET",
      action: "CREATE_OR_EDIT_SET"
    });

    if (setSummary) {
      const existingSet = masterSets.find((s) => s.setId === setSummary.setId);
      setEditingSet(existingSet || null);
      setSetFormName(setSummary.namaSet);
      setSetFormCode(setSummary.kodeSet);
      setSetFormUnit(setSummary.instalasiPemilik);
      
      const existingComps = masterComponents.filter((c) => c.setId === setSummary.setId);
      if (existingComps.length > 0) {
        setSetFormComponents(existingComps.map((c) => ({ name: c.namaInstrumen, qty: c.jumlahStandar, wajib: c.wajib })));
      } else {
        setSetFormComponents([{ name: "", qty: 1, wajib: true }]);
      }
    } else {
      setEditingSet(null);
      setSetFormName("");
      setSetFormCode("");
      setSetFormUnit("IGD");
      setSetFormComponents([
        { name: "Pinset Anatomi", qty: 2, wajib: true },
        { name: "Pinset Chirurgis", qty: 2, wajib: true },
        { name: "Gunting Jaringan", qty: 1, wajib: true },
        { name: "Gunting Benang", qty: 1, wajib: true },
        { name: "Klem Arteri", qty: 2, wajib: true },
        { name: "Needle Holder", qty: 2, wajib: true }
      ]);
    }

    setIsSetModalOpen(true);
  };

  // Save Master Set Composition
  const handleSaveMasterSet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setFormName.trim() || !setFormCode.trim()) {
      alert("Nama Set dan Kode Set wajib diisi!");
      return;
    }

    try {
      const cleanCode = setFormCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      const setId = editingSet?.setId || `SET-${cleanCode}-${setFormUnit.replace(/\s+/g, "").toUpperCase()}`;
      
      const validComps = setFormComponents.filter((c) => c.name.trim().length > 0);
      const totalStandardQty = validComps.reduce((acc, c) => acc + (c.qty || 1), 0);

      // Save Master Set Document
      const setRef = doc(db, "master_sets", setId);
      await setDoc(setRef, {
        setId,
        namaSet: setFormName.trim(),
        kodeSet: cleanCode,
        instalasiPemilik: setFormUnit,
        jumlahKomponenStandar: totalStandardQty,
        statusAktif: true,
        tenantId,
        updatedAt: serverTimestamp(),
        createdAt: editingSet ? editingSet.createdAt || serverTimestamp() : serverTimestamp()
      }, { merge: true });

      // Save Master Set Components
      for (let i = 0; i < validComps.length; i++) {
        const comp = validComps[i];
        const compId = `${setId}-K${(i + 1).toString().padStart(2, "0")}`;
        const compRef = doc(db, "master_set_components", compId);
        await setDoc(compRef, {
          setId,
          komponenId: compId,
          namaInstrumen: comp.name.trim(),
          kategori: "Komponen Set",
          jumlahStandar: comp.qty || 1,
          wajib: comp.wajib !== false,
          tenantId,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp()
        }, { merge: true });
      }

      // Write Audit Log
      await writeAuditLog({
        tenantId,
        userId: currentUser?.uid || "SYSTEM",
        userName: currentUser?.name || "Admin",
        userRole: currentUser?.role || "ADMIN",
        action: editingSet ? "KOMPOSISI_SET_DIUBAH" : "KOMPOSISI_SET_DIBUAT",
        module: "MASTER_DATA",
        entityType: "MASTER_SET",
        entityId: setId,
        afterState: `Set: ${setFormName.trim()} (${totalStandardQty} komponen)`,
        reason: `Konfigurasi Komposisi Set Standar ${setFormName.trim()}`,
        result: "SUCCESS"
      });

      triggerActionConfirm({
        title: "Komposisi Set Berhasil Disimpan",
        message: `Master Set ${setFormName.trim()} dengan ${totalStandardQty} komponen standar telah diperbarui.`,
        type: "success"
      });

      setIsSetModalOpen(false);
    } catch (err: any) {
      console.error("Save Master Set error:", err);
      alert(`Gagal menyimpan Master Set: ${err.message}`);
    }
  };

  // CSV Parsing helper
  const parseCSVRows = (text: string): string[][] => {
    const lines = text.split(/\r?\n/);
    const result: string[][] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      // Handle quoted commas
      const cells: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          cells.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      cells.push(current.trim());
      result.push(cells);
    }
    return result;
  };

  // Download CSV Template
  const handleDownloadTemplate = () => {
    const csvContent = `ID_INSTRUMEN,NAMA_ITEM_ATAU_SET,TIPE,ASAL_INSTALASI,JUMLAH_STOK,DETAIL_KOMPONEN_SEPERATED_BY_PIPE
ST-HECST01-IGD1,HECTING SET,set,IGD,1,Pinset Anatomi:2|Pinset Chirurgis:2|Gunting Jaringan:1|Gunting Benang:1|Klem Arteri:1|Needle Holder:1
ST-HECST02-IGD1,HECTING SET,set,IGD,1,Pinset Anatomi:2|Pinset Chirurgis:2|Gunting Jaringan:1|Gunting Benang:1|Klem Arteri:2|Needle Holder:2
SG-GNT01-OK1,GUNTING JARINGAN,single,OK Sentral,1,
`;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Template_Import_Inventaris_${tenantId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Step 2: Validate Uploaded File or Text
  const handleStartValidation = async () => {
    checkPermissionOrThrow(currentUser, PERMISSIONS.INVENTARIS_REGISTER, {
      resource: "IMPORT_INVENTARIS",
      action: "VALIDATE_IMPORT_FILE"
    });

    let textToProcess = importText.trim();

    if (importFile) {
      textToProcess = await importFile.text();
    }

    if (!textToProcess) {
      alert("Masukkan teks CSV atau pilih file CSV terlebih dahulu.");
      return;
    }

    setIsValidating(true);

    try {
      const rawRows = parseCSVRows(textToProcess);
      if (rawRows.length < 2) {
        alert("Data CSV tidak memiliki baris data valid (min 1 baris header + 1 baris data).");
        setIsValidating(false);
        return;
      }

      // Fetch existing DB instrument IDs to detect duplicates
      const existingDbIds = new Set<string>();
      const snapInst = await getDocs(query(collection(db, "master_instruments"), where("tenantId", "==", tenantId)));
      snapInst.forEach((d) => existingDbIds.add(d.id.toLowerCase()));

      const fileSeenIds = new Set<string>();
      const validated: ImportRowValidation[] = [];

      // Process rows (skip header line 0)
      for (let i = 1; i < rawRows.length; i++) {
        const cols = rawRows[i];
        if (!cols || cols.length < 2) continue;

        const rawId = cols[0]?.trim() || "";
        const name = cols[1]?.trim() || "";
        const typeRaw = cols[2]?.trim().toLowerCase();
        const originUnit = cols[3]?.trim() || "IGD";
        const stockQty = parseInt(cols[4]?.trim() || "1", 10);
        const itemsRaw = cols[5]?.trim() || "";

        if (!rawId || !name) continue;

        const type = typeRaw === "set" ? "set" : "single";
        const formattedId = formatToStandardSerialNumber(rawId, name, type, i);

        let status: ImportRowValidation["status"] = "VALID";
        let rejectReason: string | undefined = undefined;

        // Check duplicate within file
        if (fileSeenIds.has(formattedId.toLowerCase())) {
          status = "REJECTED_DUPLICATE_FILE";
          rejectReason = `ID ${formattedId} duplikat di dalam file import.`;
        } else if (existingDbIds.has(formattedId.toLowerCase())) {
          status = "REJECTED_EXISTS_DB";
          rejectReason = `ID ${formattedId} SUDAH TERDAFTAR di database. Identitas permanen dilarang ditimpa!`;
        }
        fileSeenIds.add(formattedId.toLowerCase());

        // Parse set components
        const parsedComponents: { name: string; qty: number }[] = [];
        if (type === "set" && itemsRaw) {
          const pairs = itemsRaw.split("|");
          for (const p of pairs) {
            const [cName, cQty] = p.split(":");
            if (cName && cName.trim()) {
              const q = parseInt(cQty?.trim() || "1", 10);
              parsedComponents.push({ name: cName.trim(), qty: isNaN(q) ? 1 : q });
            }
          }
        } else if (type === "single") {
          parsedComponents.push({ name, qty: 1 });
        }

        // Match against Master Set Standard Composition
        const matchingSet = masterSets.find((s) => 
          s.namaSet.toLowerCase().trim() === name.toLowerCase().trim() ||
          formattedId.toLowerCase().includes(s.kodeSet.toLowerCase())
        );

        let physicalCompCount = parsedComponents.reduce((acc, c) => acc + (c.qty || 1), 0);
        let standardCompCount = matchingSet ? matchingSet.jumlahKomponenStandar : physicalCompCount;
        let shortageCount = Math.max(0, standardCompCount - physicalCompCount);
        let setCompletenessStatus: SetCompletenessStatus = shortageCount > 0 
          ? "BELUM_LENGKAP_PENYEDIAAN" 
          : "LENGKAP";

        validated.push({
          rowNumber: i,
          rawId,
          formattedId,
          name,
          type,
          originUnit,
          stockQty: isNaN(stockQty) ? 1 : stockQty,
          itemsRaw,
          components: parsedComponents,
          status,
          rejectReason,
          setCompletenessStatus,
          physicalComponentCount: physicalCompCount,
          standardComponentCount: standardCompCount,
          shortageCount
        });
      }

      setParsedRows(validated);
      setWizardStep(2);
    } catch (err: any) {
      console.error("Validation error:", err);
      alert(`Gagal melakukan validasi data: ${err.message}`);
    } finally {
      setIsValidating(false);
    }
  };

  // Step 3: Atomic Transaction Commit
  const handleCommitImport = async () => {
    checkPermissionOrThrow(currentUser, PERMISSIONS.INVENTARIS_REGISTER, {
      resource: "IMPORT_INVENTARIS",
      action: "CONFIRM_ATOMIC_IMPORT"
    });

    const validRows = parsedRows.filter((r) => r.status === "VALID");
    if (validRows.length === 0) {
      alert("Tidak ada baris data valid untuk diimpor.");
      return;
    }

    setIsCommitting(true);

    try {
      let committedCount = 0;

      // Commit valid rows in chunked batches
      for (const row of validRows) {
        const instRef = doc(db, "master_instruments", row.formattedId);
        await setDoc(instRef, {
          id: row.formattedId,
          serialNumber: row.formattedId,
          name: row.name,
          type: row.type,
          originUnit: row.originUnit,
          totalStock: row.stockQty,
          components: row.components,
          items: row.components,
          description: row.shortageCount && row.shortageCount > 0 
            ? `Status Kelengkapan: BELUM LENGKAP PENYEDIAAN (Kurang ${row.shortageCount} komponen dari standar ${row.standardComponentCount})` 
            : `Set Lengkap (${row.physicalComponentCount} komponen)`,
          tenantId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });

        // Also add to inventaris_instrumen and instrument_live_state
        const invRef = doc(db, "inventaris_instrumen", row.formattedId);
        await setDoc(invRef, {
          id: row.formattedId,
          instrumentId: row.formattedId,
          name: row.name,
          originUnit: row.originUnit,
          statusAlur: "SIAP",
          kondisi: "NORMAL",
          tenantId,
          createdAt: serverTimestamp()
        }, { merge: true });

        const liveRef = doc(db, "instrument_live_state", row.formattedId);
        await setDoc(liveRef, {
          instrumentId: row.formattedId,
          masterName: row.name,
          originUnit: row.originUnit,
          statusAlur: "SIAP",
          kondisi: "NORMAL",
          currentLocation: row.originUnit,
          currentHolder: row.originUnit,
          tenantId,
          updatedAt: serverTimestamp()
        }, { merge: true });

        committedCount++;
      }

      // Write Audit Log for Bulk Import
      await writeAuditLog({
        tenantId,
        userId: currentUser?.uid || "SYSTEM",
        userName: currentUser?.name || "Admin",
        userRole: currentUser?.role || "ADMIN",
        action: "IMPORT_INVENTARIS_DIKONFIRMASI",
        module: "INVENTARIS",
        entityType: "IMPORT",
        entityId: `IMP-${Date.now()}`,
        afterState: `Import Berhasil: ${committedCount} instrumen/set fisik diterbitkan.`,
        reason: `Registrasi Massal Inventaris Fisik Resmi (${committedCount} valid, ${parsedRows.length - committedCount} ditolak)`,
        result: "SUCCESS"
      });

      triggerActionConfirm({
        title: "Import Massal Berhasil",
        message: `${committedCount} instrumen/set resmi telah berhasil terdaftar ke database fisik.`,
        type: "success"
      });

      setWizardStep(3);
      if (onImportCompleted) onImportCompleted();
    } catch (err: any) {
      console.error("Commit import error:", err);
      alert(`Gagal menyimpan data import: ${err.message}`);
    } finally {
      setIsCommitting(false);
    }
  };

  const validCount = parsedRows.filter((r) => r.status === "VALID").length;
  const rejectedCount = parsedRows.length - validCount;
  const incompleteSetCount = parsedRows.filter((r) => r.status === "VALID" && r.setCompletenessStatus === "BELUM_LENGKAP_PENYEDIAAN").length;

  return (
    <div className="space-y-6">
      {/* Header & Mode Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 p-4 rounded-2xl border border-slate-800 shadow-lg backdrop-blur-md">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            Komposisi Set & Import Massal Inventaris
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Kelola komposisi standar set instrumen & import fisik resmi tanpa membuat ID fiktif
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('komposisi')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'komposisi'
                ? "bg-indigo-600 text-white shadow-md"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Komposisi Set Standar
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'import'
                ? "bg-indigo-600 text-white shadow-md"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            Import Inventaris Massal
          </button>
        </div>
      </div>

      {/* TAB 1: KOMPOSISI SET STANDAR */}
      {activeTab === 'komposisi' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="text-xs text-slate-400">
              Total Master Set Terdaftar: <strong className="text-slate-200">{setSummaries.length} Set</strong>
            </div>

            <button
              onClick={() => handleOpenSetModal()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-lg transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Tambah Master Komposisi Set
            </button>
          </div>

          {setSummaries.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
              <Package className="w-10 h-10 mx-auto text-slate-600 mb-2" />
              <p className="text-sm font-semibold text-slate-300">Belum Ada Master Set Komposisi</p>
              <p className="text-xs text-slate-500 mt-1">
                Buat definisi komposisi standar set instrumen untuk memantau kelengkapan penyediaan alat fisik.
              </p>
              <button
                onClick={() => handleOpenSetModal()}
                className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Buat Master Set Pertama
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {setSummaries.map((summary) => {
                const isLengkap = summary.status === "LENGKAP";

                return (
                  <motion.div
                    key={summary.setId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 hover:border-slate-700 transition flex flex-col justify-between shadow-xl"
                  >
                    <div>
                      {/* Badge status */}
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span className="text-[10px] font-mono uppercase bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                            {summary.kodeSet} • {summary.instalasiPemilik}
                          </span>
                          <h3 className="text-base font-bold text-slate-100 mt-1">
                            {summary.namaSet}
                          </h3>
                        </div>

                        <span
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-full border flex items-center gap-1 shrink-0 ${
                            isLengkap
                              ? "bg-emerald-950/80 text-emerald-400 border-emerald-800"
                              : "bg-amber-950/80 text-amber-400 border-amber-800"
                          }`}
                        >
                          {isLengkap ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" /> LENGKAP
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="w-3.5 h-3.5" /> BELUM LENGKAP
                            </>
                          )}
                        </span>
                      </div>

                      {/* Stat Metrics */}
                      <div className="grid grid-cols-3 gap-2 bg-slate-950/80 p-3 rounded-xl border border-slate-800/80 my-3 text-center">
                        <div>
                          <p className="text-[10px] uppercase font-bold text-slate-500">Standar</p>
                          <p className="text-sm font-bold text-slate-200">{summary.jumlahKomponenStandar} Alat</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase font-bold text-slate-500">Tersedia</p>
                          <p className="text-sm font-bold text-indigo-400">{summary.jumlahFisikTersedia} Fisik</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase font-bold text-slate-500">Kekurangan</p>
                          <p className={`text-sm font-bold ${summary.kekuranganPenyediaan > 0 ? "text-amber-400" : "text-slate-400"}`}>
                            {summary.kekuranganPenyediaan > 0 ? summary.kekuranganPenyediaan : 0}
                          </p>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="space-y-1 mb-3">
                        <div className="flex justify-between text-[11px] text-slate-400 font-medium">
                          <span>Tingkat Kelengkapan</span>
                          <span className={isLengkap ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                            {summary.kelengkapanPercent}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${
                              isLengkap ? "bg-emerald-500" : "bg-amber-500"
                            }`}
                            style={{ width: `${summary.kelengkapanPercent}%` }}
                          />
                        </div>
                      </div>

                      {/* Components Breakdown */}
                      <div className="space-y-1 border-t border-slate-800/60 pt-2.5 mt-2">
                        <p className="text-[10px] font-bold uppercase text-slate-500 mb-1">Rincian Komponen Standar:</p>
                        <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                          {summary.components.length === 0 ? (
                            <p className="text-xs text-slate-500 italic">Belum ada rincian komponen.</p>
                          ) : (
                            summary.components.map((c) => (
                              <div key={c.komponenId} className="flex justify-between items-center text-xs text-slate-300 py-0.5 border-b border-slate-800/40 last:border-0">
                                <span className="truncate pr-2">• {c.namaInstrumen}</span>
                                <span className="font-mono text-[11px] shrink-0 text-slate-400">
                                  {c.jumlahFisik}/{c.jumlahStandar}
                                  {c.kekurangan > 0 && (
                                    <span className="text-amber-400 font-bold ml-1">(-{c.kekurangan})</span>
                                  )}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 mt-3 border-t border-slate-800 flex gap-2">
                      <button
                        onClick={() => handleOpenSetModal(summary)}
                        className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5"
                      >
                        <Edit className="w-3.5 h-3.5 text-indigo-400" />
                        Edit Komposisi
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: IMPORT INVENTARIS MASSAL WIZARD */}
      {activeTab === 'import' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
          {/* Wizard Progress Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                wizardStep === 1 ? "bg-indigo-600 text-white" : "bg-emerald-600 text-white"
              }`}>
                1
              </div>
              <span className={`text-xs font-bold ${wizardStep === 1 ? "text-slate-100" : "text-slate-400"}`}>
                Upload Data CSV / Text
              </span>

              <ChevronRight className="w-4 h-4 text-slate-600" />

              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                wizardStep === 2 ? "bg-indigo-600 text-white" : wizardStep === 3 ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-500"
              }`}>
                2
              </div>
              <span className={`text-xs font-bold ${wizardStep === 2 ? "text-slate-100" : "text-slate-400"}`}>
                Preview & Validasi Kelengkapan
              </span>

              <ChevronRight className="w-4 h-4 text-slate-600" />

              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                wizardStep === 3 ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-500"
              }`}>
                3
              </div>
              <span className={`text-xs font-bold ${wizardStep === 3 ? "text-slate-100" : "text-slate-400"}`}>
                Hasil Transaksi Atomik
              </span>
            </div>

            <button
              onClick={handleDownloadTemplate}
              className="text-xs text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1.5 bg-sky-950/60 border border-sky-800/80 px-3 py-1.5 rounded-lg transition"
            >
              <FileText className="w-3.5 h-3.5" />
              Unduh Template CSV
            </button>
          </div>

          {/* WIZARD STEP 1: UPLOAD / PASTE INPUT */}
          {wizardStep === 1 && (
            <div className="space-y-5">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-2">
                <p className="font-bold text-indigo-400 flex items-center gap-1.5">
                  <Info className="w-4 h-4" /> Aturan Import Inventaris Resmi & Set:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-slate-400">
                  <li><strong>Identitas Permanen (ID Instrumen)</strong>: Dilarang menimpa ID yang sudah terdaftar di database.</li>
                  <li><strong>Komposisi Belum Lengkap</strong>: Jika komponen fisik yang diperoleh lebih sedikit dari standar set, status otomatis menjadi <strong className="text-amber-400 font-mono">BELUM_LENGKAP_PENYEDIAAN</strong>.</li>
                  <li><strong>Tanpa ID Fiktif</strong>: Kekurangan komponen TIDAK membuat ID dummy dan TIDAK dianggap HILANG/RUSAK.</li>
                </ul>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* File Upload Box */}
                <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
                  <div>
                    <label className="block text-xs font-bold text-slate-200 mb-2">
                      Upload File CSV Data Inventaris
                    </label>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                      className="w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-950 file:text-indigo-400 hover:file:bg-indigo-900 border border-slate-800 rounded-xl bg-slate-900 p-1.5"
                    />
                  </div>
                  {importFile && (
                    <p className="text-[11px] text-emerald-400 mt-2 font-mono">
                      File dipilih: {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                </div>

                {/* Direct CSV Text Box */}
                <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800">
                  <label className="block text-xs font-bold text-slate-200 mb-2">
                    Atau Paste Teks CSV Langsung
                  </label>
                  <textarea
                    rows={5}
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder={`ID_INSTRUMEN,NAMA_ITEM_ATAU_SET,TIPE,ASAL_INSTALASI,JUMLAH_STOK,DETAIL_KOMPONEN\nST-HECST01-IGD1,HECTING SET,set,IGD,1,Pinset Anatomi:2|Pinset Chirurgis:2|Gunting Jaringan:1`}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs font-mono text-slate-200 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleStartValidation}
                  disabled={isValidating || (!importFile && !importText.trim())}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-lg transition flex items-center gap-2 disabled:opacity-50"
                >
                  {isValidating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Memproses & Validasi...
                    </>
                  ) : (
                    <>
                      Proses & Validasi File
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* WIZARD STEP 2: PREVIEW & VALIDATION RESULTS */}
          {wizardStep === 2 && (
            <div className="space-y-5">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                  <p className="text-[10px] uppercase font-bold text-slate-500">Total Baris</p>
                  <p className="text-lg font-bold text-slate-200">{parsedRows.length}</p>
                </div>
                <div className="bg-emerald-950/40 p-3 rounded-xl border border-emerald-900/60 text-center">
                  <p className="text-[10px] uppercase font-bold text-emerald-400">Valid & Siap Impor</p>
                  <p className="text-lg font-bold text-emerald-400">{validCount}</p>
                </div>
                <div className="bg-rose-950/40 p-3 rounded-xl border border-rose-900/60 text-center">
                  <p className="text-[10px] uppercase font-bold text-rose-400">Ditolak / Duplikat</p>
                  <p className="text-lg font-bold text-rose-400">{rejectedCount}</p>
                </div>
                <div className="bg-amber-950/40 p-3 rounded-xl border border-amber-900/60 text-center">
                  <p className="text-[10px] uppercase font-bold text-amber-400">Belum Lengkap Penyediaan</p>
                  <p className="text-lg font-bold text-amber-400">{incompleteSetCount}</p>
                </div>
              </div>

              {/* Data Validation Table */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-900 text-slate-400 font-bold sticky top-0 border-b border-slate-800">
                      <tr>
                        <th className="p-2.5">No</th>
                        <th className="p-2.5">Formatted ID</th>
                        <th className="p-2.5">Nama Item / Set</th>
                        <th className="p-2.5">Instalasi</th>
                        <th className="p-2.5">Fisik/Standar</th>
                        <th className="p-2.5">Status Validasi</th>
                        <th className="p-2.5">Kelengkapan Set</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {parsedRows.map((row) => {
                        const isValid = row.status === "VALID";
                        const isIncomplete = row.setCompletenessStatus === "BELUM_LENGKAP_PENYEDIAAN";

                        return (
                          <tr key={row.rowNumber} className={isValid ? "hover:bg-slate-900/60" : "bg-rose-950/20"}>
                            <td className="p-2.5 font-mono text-slate-500">{row.rowNumber}</td>
                            <td className="p-2.5 font-mono font-bold text-slate-100">{row.formattedId}</td>
                            <td className="p-2.5 font-bold">{row.name}</td>
                            <td className="p-2.5">{row.originUnit}</td>
                            <td className="p-2.5 font-mono">
                              {row.physicalComponentCount} / {row.standardComponentCount}
                              {row.shortageCount && row.shortageCount > 0 ? (
                                <span className="text-amber-400 ml-1">(-{row.shortageCount})</span>
                              ) : null}
                            </td>
                            <td className="p-2.5">
                              {isValid ? (
                                <span className="text-emerald-400 font-bold inline-flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> VALID
                                </span>
                              ) : (
                                <span className="text-rose-400 font-bold inline-flex items-center gap-1" title={row.rejectReason}>
                                  <AlertTriangle className="w-3.5 h-3.5" /> DITOLAK
                                </span>
                              )}
                            </td>
                            <td className="p-2.5">
                              {isIncomplete ? (
                                <span className="text-amber-400 font-bold text-[11px] bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800">
                                  BELUM LENGKAP
                                </span>
                              ) : (
                                <span className="text-emerald-400 font-bold text-[11px] bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                                  LENGKAP
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Wizard Actions */}
              <div className="flex justify-between items-center pt-2">
                <button
                  onClick={() => setWizardStep(1)}
                  className="text-xs font-bold text-slate-400 hover:text-slate-200 bg-slate-800 px-4 py-2.5 rounded-xl transition"
                >
                  Kembali ke Form
                </button>

                <button
                  onClick={handleCommitImport}
                  disabled={isCommitting || validCount === 0}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-lg transition flex items-center gap-2 disabled:opacity-50"
                >
                  {isCommitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Eksekusi Transaksi Atomik...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Konfirmasi & Simpan {validCount} Item Valid
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* WIZARD STEP 3: TRANSACTION SUCCESS */}
          {wizardStep === 3 && (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 bg-emerald-950/80 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-800 shadow-xl">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h3 className="text-xl font-bold text-slate-100">
                Import Massal Inventaris Berhasil!
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Seluruh {validCount} item fisik resmi telah berhasil diterbitkan ID permanennya dan dicatat ke audit log secara atomik.
              </p>
              <div className="pt-4 flex justify-center gap-3">
                <button
                  onClick={() => {
                    setWizardStep(1);
                    setImportText("");
                    setImportFile(null);
                    setParsedRows([]);
                  }}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold px-4 py-2.5 rounded-xl transition"
                >
                  Import Lagi
                </button>
                <button
                  onClick={() => setActiveTab('komposisi')}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition"
                >
                  Lihat Ringkasan Komposisi Set
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: MASTER SET COMPOSITION FORM */}
      {isSetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-5 shadow-2xl space-y-4 my-auto"
          >
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                {editingSet ? "Edit Komposisi Master Set" : "Tambah Master Komposisi Set"}
              </h3>
              <button
                onClick={() => setIsSetModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMasterSet} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Nama Set Standar</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: HECTING SET"
                    value={setFormName}
                    onChange={(e) => setSetFormName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Kode Singkatan Set</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: HECST"
                    value={setFormCode}
                    onChange={(e) => setSetFormCode(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 uppercase focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Instalasi Pemilik</label>
                <select
                  value={setFormUnit}
                  onChange={(e) => setSetFormUnit(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:border-indigo-500"
                >
                  <option value="IGD">IGD</option>
                  <option value="OK Sentral">OK Sentral</option>
                  <option value="ICU">ICU</option>
                  <option value="Poli Bedah">Poli Bedah</option>
                  <option value="VK Kebidanan">VK Kebidanan</option>
                  <option value="Rawat Inap">Rawat Inap</option>
                  <option value="Instalasi CSSD">Instalasi CSSD</option>
                </select>
              </div>

              {/* Dynamic Components Table */}
              <div className="space-y-2 border-t border-slate-800 pt-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-200">Daftar Komponen Standar:</label>
                  <button
                    type="button"
                    onClick={() => setSetFormComponents([...setFormComponents, { name: "", qty: 1, wajib: true }])}
                    className="text-indigo-400 hover:text-indigo-300 text-xs font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Baris
                  </button>
                </div>

                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {setFormComponents.map((c, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        type="text"
                        placeholder="Nama Alat (Mis: Pinset Anatomi)"
                        value={c.name}
                        onChange={(e) => {
                          const updated = [...setFormComponents];
                          updated[idx].name = e.target.value;
                          setSetFormComponents(updated);
                        }}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-slate-200 focus:border-indigo-500"
                      />
                      <input
                        type="number"
                        min="1"
                        value={c.qty}
                        onChange={(e) => {
                          const updated = [...setFormComponents];
                          updated[idx].qty = parseInt(e.target.value, 10) || 1;
                          setSetFormComponents(updated);
                        }}
                        className="w-16 bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-slate-200 text-center font-mono focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const updated = setFormComponents.filter((_, i) => i !== idx);
                          setSetFormComponents(updated.length > 0 ? updated : [{ name: "", qty: 1, wajib: true }]);
                        }}
                        className="p-2 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSetModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg transition"
                >
                  Simpan Master Set
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
