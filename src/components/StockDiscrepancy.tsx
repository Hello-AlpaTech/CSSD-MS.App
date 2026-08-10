import React, { useState, useEffect, useMemo } from "react";
import { db } from "../lib/firebase";
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  updateDoc, 
  getDoc, 
  runTransaction, 
  serverTimestamp,
  query,
  where 
} from "firebase/firestore";
import { 
  AlertTriangle, 
  Search, 
  CheckCircle2, 
  Clock, 
  HelpCircle, 
  FileText, 
  User, 
  Calendar, 
  MapPin, 
  ShieldAlert, 
  Edit3, 
  X, 
  Filter, 
  RefreshCw, 
  ArrowRight, 
  ShieldCheck, 
  Package, 
  Database,
  Building2,
  Check
} from "lucide-react";
import { InstrumentCatalog, AuditLog } from "../types";
import { requireTenantId } from "../lib/permissions";
import { 
  writeAuditLog, 
  formatAuditDate 
} from "../lib/auditLogger";
import { 
  getDemoData, 
  saveDemoData, 
  DEMO_KEYS 
} from "../lib/demoStore";
import { triggerActionConfirm } from "../lib/actionToast";

export interface LiveInstrumentState {
  instrumentId: string; // e.g. ST-HECST01-IGD1
  masterId: string; // e.g. HECST
  masterName: string;
  originUnit: string;
  sequenceNumber: number;
  statusAlur: string; // e.g. 'SIAP', 'RAK', 'DIDISTRIBUSIKAN', 'TAHAN', 'HILANG', 'RUSAK'
  kondisi: string; // 'NORMAL', 'RUSAK', 'HILANG', 'HOLD'
  currentLocation: string; // e.g. 'IGD', 'RAK-A1', 'CSSD'
  currentHolder: string; // e.g. 'IGD', 'CSSD'
  updatedAt?: any;
}

export interface DiscrepancyCase {
  id: string; // e.g. DISC-HECST-IGD
  masterId: string;
  instrumentName: string;
  originUnit: string;
  totalResmi: number; // Official registered count
  registeredUnitCount: number; // Number of generated permanent IDs
  liveStateFoundCount: number; // Number of IDs identified and valid
  discrepancyQty: number; // totalResmi - liveStateFoundCount
  status: 'SESUAI' | 'SELISIH' | 'DALAM_KLARIFIKASI' | 'SELESAI';
  detectedAt: string;
  problematicUnitIds: string[]; // List of IDs that are missing/unscanned e.g. ['ST-HECST04-IGD1']
  clarificationDetails?: {
    petugasPemeriksa: string;
    tanggalPemeriksaan: string;
    lokasiPencarian: string;
    hasilPemeriksaan: string;
    keterangan: string;
    buktiRef?: string;
    resolutionType?: 'ALAT_DITEMUKAN' | 'ALAT_SALAH_LOKASI' | 'ALAT_SEDANG_DIGUNAKAN' | 'ALAT_RUSAK' | 'ALAT_HILANG' | 'KOREKSI_INVENTARIS';
    resolvedAt?: string;
    resolvedBy?: string;
  };
  correctionHistory?: {
    oldTotal: number;
    newTotal: number;
    difference: number;
    reason: string;
    proofRef: string;
    actor: string;
    approver: string;
    timestamp: string;
  }[];
  tenantId: string;
}

interface StockDiscrepancyProps {
  currentUserProfile?: any;
  currentUsername: string;
  currentRole?: string;
  isDemoMode?: boolean;
}

export default function StockDiscrepancy({
  currentUsername,
  currentRole = "admin",
  isDemoMode = false,
  currentUserProfile = null
}: StockDiscrepancyProps) {
  // Data States
  const [instruments, setInstruments] = useState<InstrumentCatalog[]>([]);
  const [liveStates, setLiveStates] = useState<LiveInstrumentState[]>([]);
  const [discrepancyCases, setDiscrepancyCases] = useState<DiscrepancyCase[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const tenantId = currentUserProfile ? (() => { try { return requireTenantId(currentUserProfile); } catch(e) { return ""; } })() : "";

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [unitFilter, setUnitFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modals
  const [selectedCase, setSelectedCase] = useState<DiscrepancyCase | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  
  // Clarification Modal
  const [isClarifyModalOpen, setIsClarifyModalOpen] = useState<boolean>(false);
  const [clarifyForm, setClarifyForm] = useState({
    petugasPemeriksa: currentUsername,
    tanggalPemeriksaan: new Date().toISOString().slice(0, 16),
    lokasiPencarian: "",
    hasilPemeriksaan: "",
    keterangan: "",
    buktiRef: ""
  });

  // Resolution Modal (Hasil Klarifikasi)
  const [isResolveModalOpen, setIsResolveModalOpen] = useState<boolean>(false);
  const [resolveType, setResolveType] = useState<
    'ALAT_DITEMUKAN' | 'ALAT_SALAH_LOKASI' | 'ALAT_SEDANG_DIGUNAKAN' | 'ALAT_RUSAK' | 'ALAT_HILANG'
  >('ALAT_DITEMUKAN');
  const [resolveForm, setResolveForm] = useState({
    scannedUnitId: "",
    targetLocation: "",
    targetHolder: "",
    notes: ""
  });

  // Official Inventory Correction Modal (Koreksi Inventaris)
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState<boolean>(false);
  const [discrepancyIdempotencyKey, setDiscrepancyIdempotencyKey] = useState<string>("");
  const [correctionForm, setCorrectionForm] = useState({
    oldTotal: 0,
    newTotal: 0,
    reason: "",
    proofRef: "",
    approverName: "Kepala CSSD / Administrator"
  });

  // Has Permission to perform official inventory correction
  const hasCorrectionPermission = useMemo(() => {
    const roleLower = (currentRole || "").toLowerCase();
    return roleLower === "admin" || roleLower === "supervisor" || roleLower.includes("admin");
  }, [currentRole]);

  // Load Data
  useEffect(() => {
    if (isDemoMode) {
      // Demo Mode Data
      const demoInsts = getDemoData<InstrumentCatalog[]>(DEMO_KEYS.INSTRUMENTS, [
        { id: "HECST", name: "Hekter Set (Hecting Set)", sku: "ST-HECST", type: "set", originUnit: "IGD", description: "Set jahit luka IGD", sterileDurationDays: 30, totalStock: 4, items: [] },
        { id: "BEDAH_MAYOR", name: "Set Bedah Mayor", sku: "ST-BDMYR", type: "set", originUnit: "IBS/OK", description: "Set operasi bedah mayor", sterileDurationDays: 30, totalStock: 3, items: [] },
        { id: "PARTUS", name: "Set Partus Kebidanan", sku: "ST-PRTS", type: "set", originUnit: "VK/KEBIDANAN", description: "Set persalinan", sterileDurationDays: 30, totalStock: 2, items: [] }
      ]);
      setInstruments(demoInsts);

      const demoLive: LiveInstrumentState[] = [
        { instrumentId: "ST-HECST01-IGD1", masterId: "HECST", masterName: "Hekter Set", originUnit: "IGD", sequenceNumber: 1, statusAlur: "SIAP", kondisi: "NORMAL", currentLocation: "RAK-A1", currentHolder: "CSSD" },
        { instrumentId: "ST-HECST02-IGD1", masterId: "HECST", masterName: "Hekter Set", originUnit: "IGD", sequenceNumber: 2, statusAlur: "DIDISTRIBUSIKAN", kondisi: "NORMAL", currentLocation: "IGD", currentHolder: "IGD" },
        { instrumentId: "ST-HECST03-IGD1", masterId: "HECST", masterName: "Hekter Set", originUnit: "IGD", sequenceNumber: 3, statusAlur: "RAK", kondisi: "NORMAL", currentLocation: "RAK-A1", currentHolder: "CSSD" },
        // ST-HECST04-IGD1 is missing -> creates discrepancy selisih 1
        { instrumentId: "ST-BDMYR01-OK1", masterId: "BEDAH_MAYOR", masterName: "Set Bedah Mayor", originUnit: "IBS/OK", sequenceNumber: 1, statusAlur: "SIAP", kondisi: "NORMAL", currentLocation: "RAK-B2", currentHolder: "CSSD" },
        { instrumentId: "ST-BDMYR02-OK1", masterId: "BEDAH_MAYOR", masterName: "Set Bedah Mayor", originUnit: "IBS/OK", sequenceNumber: 2, statusAlur: "SIAP", kondisi: "NORMAL", currentLocation: "RAK-B2", currentHolder: "CSSD" },
        { instrumentId: "ST-BDMYR03-OK1", masterId: "BEDAH_MAYOR", masterName: "Set Bedah Mayor", originUnit: "IBS/OK", sequenceNumber: 3, statusAlur: "DIDISTRIBUSIKAN", kondisi: "NORMAL", currentLocation: "IBS/OK", currentHolder: "IBS/OK" },
        { instrumentId: "ST-PRTS01-VK1", masterId: "PARTUS", masterName: "Set Partus Kebidanan", originUnit: "VK/KEBIDANAN", sequenceNumber: 1, statusAlur: "SIAP", kondisi: "NORMAL", currentLocation: "RAK-C1", currentHolder: "CSSD" },
        { instrumentId: "ST-PRTS02-VK1", masterId: "PARTUS", masterName: "Set Partus Kebidanan", originUnit: "VK/KEBIDANAN", sequenceNumber: 2, statusAlur: "SIAP", kondisi: "NORMAL", currentLocation: "RAK-C1", currentHolder: "CSSD" }
      ];
      setLiveStates(demoLive);

      const savedCases = getDemoData<DiscrepancyCase[]>(DEMO_KEYS.DISCREPANCY_CASES, []);
      if (savedCases && savedCases.length > 0) {
        setDiscrepancyCases(savedCases);
      } else {
        // Build initial demo cases
        const initialCases: DiscrepancyCase[] = [
          {
            id: "DISC-HECST-IGD",
            masterId: "HECST",
            instrumentName: "Hekter Set (Hecting Set)",
            originUnit: "IGD",
            totalResmi: 4,
            registeredUnitCount: 4,
            liveStateFoundCount: 3,
            discrepancyQty: 1,
            status: "SELISIH",
            detectedAt: new Date(Date.now() - 86400000).toLocaleString("id-ID"),
            problematicUnitIds: ["ST-HECST04-IGD1"],
            tenantId,
          },
          {
            id: "DISC-BDMYR-OK",
            masterId: "BEDAH_MAYOR",
            instrumentName: "Set Bedah Mayor",
            originUnit: "IBS/OK",
            totalResmi: 3,
            registeredUnitCount: 3,
            liveStateFoundCount: 3,
            discrepancyQty: 0,
            status: "SESUAI",
            detectedAt: new Date().toLocaleString("id-ID"),
            problematicUnitIds: [],
            tenantId,
          }
        ];
        saveDemoData(DEMO_KEYS.DISCREPANCY_CASES, initialCases);
        setDiscrepancyCases(initialCases);
      }
      setLoading(false);
    } else {
      // Production Firestore listeners
      const tenantId = currentUserProfile?.tenantId || "RSUD-BENDA";

      const unsubInst = onSnapshot(
        query(collection(db, "master_instruments"), where("tenantId", "==", tenantId)),
        (snap) => {
          const list: InstrumentCatalog[] = [];
          snap.forEach((d) => {
            list.push({ id: d.id, ...d.data() } as InstrumentCatalog);
          });
          setInstruments(list);
        }
      );

      const unsubLive = onSnapshot(
        query(collection(db, "instrument_live_state"), where("tenantId", "==", tenantId)),
        (snap) => {
          const list: LiveInstrumentState[] = [];
          snap.forEach((d) => {
            list.push({ instrumentId: d.id, ...d.data() } as LiveInstrumentState);
          });
          setLiveStates(list);
        }
      );

      const unsubCases = onSnapshot(
        query(collection(db, "discrepancy_cases"), where("tenantId", "==", tenantId)),
        (snap) => {
          const list: DiscrepancyCase[] = [];
          snap.forEach((d) => {
            list.push({ id: d.id, ...d.data() } as DiscrepancyCase);
          });
          setDiscrepancyCases(list);
          setLoading(false);
        }
      );

      return () => {
        unsubInst();
        unsubLive();
        unsubCases();
      };
    }
  }, [isDemoMode, currentUserProfile]);

  // Compute live discrepancy comparison between Total Resmi vs Live State Found Count
  const computedCases = useMemo(() => {
    const caseMap = new Map<string, DiscrepancyCase>();
    discrepancyCases.forEach(c => caseMap.set(c.id, c));

    const result: DiscrepancyCase[] = [];

    instruments.forEach((inst) => {
      const originUnit = inst.originUnit || "IGD";
      const caseId = `DISC-${inst.id}-${originUnit.replace(/[^a-zA-Z0-9]/g, "")}`;
      const existingCase = caseMap.get(caseId);

      // Find physical units matching this master
      const matchingLive = liveStates.filter(
        (l) => l.masterId === inst.id || (l.instrumentId && l.instrumentId.includes(inst.id))
      );

      // Active found count (exclude lost/inactive if flagged)
      const foundCount = matchingLive.filter(
        (l) => l.kondisi !== "HILANG" && l.statusAlur !== "HILANG"
      ).length;

      const totalResmi = inst.totalStock || 0;
      const discrepancyQty = Math.max(0, totalResmi - foundCount);

      // Derive problematic IDs
      const problematicUnitIds: string[] = [];
      for (let i = 1; i <= totalResmi; i++) {
        const seqStr = String(i).padStart(2, "0");
        const expectedPrefix = `ST-${inst.id}${seqStr}`;
        const found = matchingLive.some(l => l.instrumentId.includes(expectedPrefix) && l.kondisi !== "HILANG");
        if (!found) {
          problematicUnitIds.push(`${expectedPrefix}-${originUnit}1`);
        }
      }

      let currentStatus: 'SESUAI' | 'SELISIH' | 'DALAM_KLARIFIKASI' | 'SELESAI' = 'SESUAI';
      if (existingCase) {
        currentStatus = existingCase.status;
      } else if (discrepancyQty > 0) {
        currentStatus = 'SELISIH';
      }

      result.push({
        id: caseId,
        masterId: inst.id,
        instrumentName: inst.name,
        originUnit: originUnit,
        totalResmi: totalResmi,
        registeredUnitCount: matchingLive.length,
        liveStateFoundCount: foundCount,
        discrepancyQty: discrepancyQty,
        status: currentStatus,
        detectedAt: existingCase?.detectedAt || new Date().toLocaleString("id-ID"),
        problematicUnitIds: existingCase?.problematicUnitIds || problematicUnitIds,
        clarificationDetails: existingCase?.clarificationDetails,
        correctionHistory: existingCase?.correctionHistory,
        tenantId,
      });
    });

    return result;
  }, [instruments, liveStates, discrepancyCases]);

  // Overall Dashboard Summary Counts
  const summaryMetrics = useMemo(() => {
    let totalResmi = 0;
    let teridentifikasi = 0;
    let selisih = 0;
    let dalamKlarifikasi = 0;
    let selesai = 0;

    computedCases.forEach((c) => {
      totalResmi += c.totalResmi;
      teridentifikasi += c.liveStateFoundCount;
      selisih += c.discrepancyQty;
      if (c.status === "DALAM_KLARIFIKASI") dalamKlarifikasi++;
      if (c.status === "SELESAI") selesai++;
    });

    return {
      totalResmi,
      teridentifikasi,
      selisih,
      dalamKlarifikasi,
      selesai,
      hasDiscrepancies: selisih > 0 || computedCases.some(c => c.status === "SELISIH")
    };
  }, [computedCases]);

  // Filtered List
  const filteredCases = useMemo(() => {
    return computedCases.filter((c) => {
      const matchSearch =
        c.instrumentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.masterId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.originUnit.toLowerCase().includes(searchQuery.toLowerCase());

      const matchUnit = unitFilter === "ALL" || c.originUnit === unitFilter;
      const matchStatus = statusFilter === "ALL" || c.status === statusFilter;

      return matchSearch && matchUnit && matchStatus;
    });
  }, [computedCases, searchQuery, unitFilter, statusFilter]);

  // Unique Unit List
  const uniqueUnits = useMemo(() => {
    const setU = new Set<string>();
    computedCases.forEach(c => setU.add(c.originUnit));
    return Array.from(setU);
  }, [computedCases]);

  // Handler: Start Clarification ("MULAI KLARIFIKASI")
  const handleStartClarification = async () => {
    if (!selectedCase) return;

    const updatedCase: DiscrepancyCase = {
      ...selectedCase,
      status: "DALAM_KLARIFIKASI",
      clarificationDetails: {
        petugasPemeriksa: clarifyForm.petugasPemeriksa,
        tanggalPemeriksaan: clarifyForm.tanggalPemeriksaan,
        lokasiPencarian: clarifyForm.lokasiPencarian || "Instalasi " + selectedCase.originUnit,
        hasilPemeriksaan: clarifyForm.hasilPemeriksaan || "Dalam proses verifikasi fisik di lapangan",
        keterangan: clarifyForm.keterangan || "Investigasi awal dimulai",
        buktiRef: clarifyForm.buktiRef || "-"
      }
    };

    if (isDemoMode) {
      const newCases = discrepancyCases.map(c => c.id === selectedCase.id ? updatedCase : c);
      if (!newCases.some(c => c.id === selectedCase.id)) newCases.push(updatedCase);
      setDiscrepancyCases(newCases);
      saveDemoData(DEMO_KEYS.DISCREPANCY_CASES, newCases);
    } else {
      await setDoc(doc(db, "discrepancy_cases", selectedCase.id), updatedCase, { merge: true });
    }

    // Write Audit Log
    await writeAuditLog({
      tenantId,
      action: "KLARIFIKASI_INVENTARIS_DIMULAI",
      module: "KETIDAKSESUAIAN_INVENTARIS",
      entityType: "INVENTARIS_INSTRUMEN",
      entityId: selectedCase.masterId,
      installationId: selectedCase.originUnit,
      userId: currentUsername,
      userName: clarifyForm.petugasPemeriksa,
      userRole: currentRole,
      beforeState: "SELISIH",
      afterState: "DALAM_KLARIFIKASI",
      reason: clarifyForm.keterangan,
      result: "SUCCESS"
    });

    triggerActionConfirm({
      title: "Klarifikasi Dimulai",
      message: `Kasus ketidaksesuaian ${selectedCase.instrumentName} diubah ke status DALAM KLARIFIKASI.`
    });

    setSelectedCase(updatedCase);
    setIsClarifyModalOpen(false);
  };

  // Handler: Resolve Clarification ("HASIL KLARIFIKASI")
  const handleResolveClarification = async () => {
    if (!selectedCase) return;

    let finalCaseStatus: 'SESUAI' | 'SELESAI' = 'SELESAI';
    let auditAction = "KLARIFIKASI_INVENTARIS_SELESAI";
    let auditReason = resolveForm.notes;

    if (resolveType === "ALAT_DITEMUKAN") {
      auditAction = "ALAT_DITEMUKAN";
      if (!resolveForm.notes) auditReason = "Alat ditemukan kembali saat verifikasi fisik.";
      finalCaseStatus = 'SESUAI';

      // Update Live State in DB if ID provided
      if (resolveForm.scannedUnitId) {
        if (!isDemoMode) {
          await setDoc(doc(db, "instrument_live_state", resolveForm.scannedUnitId), {
            instrumentId: resolveForm.scannedUnitId,
            masterId: selectedCase.masterId,
            kondisi: "NORMAL",
            statusAlur: "SIAP",
            currentLocation: selectedCase.originUnit,
            currentHolder: selectedCase.originUnit,
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
      }
    } else if (resolveType === "ALAT_SALAH_LOKASI") {
      auditAction = "KOREKSI_LOKASI_INSTRUMEN";
      if (!resolveForm.notes) auditReason = `Alat diketemukan berada di lokasi ${resolveForm.targetLocation || 'lain'}. Live state diperbaiki.`;
      finalCaseStatus = 'SESUAI';
    } else if (resolveType === "ALAT_SEDANG_DIGUNAKAN") {
      auditAction = "VERIFIKASI_ALAT_SEDANG_DIGUNAKAN";
      if (!resolveForm.notes) auditReason = "Alat diverifikasi sedang aktif digunakan di unit. Inventaris tetap.";
      finalCaseStatus = 'SESUAI';
    } else if (resolveType === "ALAT_RUSAK") {
      auditAction = "ALAT_RUSAK_DIKLARIFIKASI";
      if (!resolveForm.notes) auditReason = "Alat ditemukan dalam kondisi rusak. Dipindahkan ke status TAHAN/KARANTINA.";
      finalCaseStatus = 'SELESAI';
    } else if (resolveType === "ALAT_HILANG") {
      auditAction = "ALAT_HILANG_DIKLARIFIKASI";
      if (!resolveForm.notes) auditReason = "Alat resmi dinyatakan hilang operasional. Total resmi tidak berkurang otomatis.";
      finalCaseStatus = 'SELESAI';
    }

    const updatedCase: DiscrepancyCase = {
      ...selectedCase,
      status: finalCaseStatus,
      clarificationDetails: {
        ...(selectedCase.clarificationDetails || {
          petugasPemeriksa: currentUsername,
          tanggalPemeriksaan: new Date().toLocaleString("id-ID"),
          lokasiPencarian: selectedCase.originUnit,
          hasilPemeriksaan: auditReason,
          keterangan: resolveForm.notes
        }),
        resolutionType: resolveType,
        hasilPemeriksaan: auditReason,
        resolvedAt: new Date().toLocaleString("id-ID"),
        resolvedBy: currentUsername
      }
    };

    if (isDemoMode) {
      const newCases = discrepancyCases.map(c => c.id === selectedCase.id ? updatedCase : c);
      setDiscrepancyCases(newCases);
      saveDemoData(DEMO_KEYS.DISCREPANCY_CASES, newCases);
    } else {
      await setDoc(doc(db, "discrepancy_cases", selectedCase.id), updatedCase, { merge: true });
    }

    // Write Audit Log
    await writeAuditLog({
      tenantId,
      action: auditAction,
      module: "KETIDAKSESUAIAN_INVENTARIS",
      entityType: "INVENTARIS_INSTRUMEN",
      entityId: selectedCase.masterId,
      installationId: selectedCase.originUnit,
      userId: currentUsername,
      userName: currentUsername,
      userRole: currentRole,
      beforeState: "DALAM_KLARIFIKASI",
      afterState: finalCaseStatus,
      reason: auditReason,
      result: "SUCCESS"
    });

    triggerActionConfirm({
      title: "Hasil Klarifikasi Dicatat",
      message: `Kasus ${selectedCase.instrumentName} telah diselesaikan dengan hasil: ${resolveType}.`
    });

    setSelectedCase(updatedCase);
    setIsResolveModalOpen(false);
  };

  // Handler: Official Inventory Correction ("KOREKSI INVENTARIS")
  const handleOfficialInventoryCorrection = async () => {
    if (!selectedCase) return;

    // RULE 10: Role Permission Enforcement
    if (!hasCorrectionPermission) {
      alert("Akses Ditolak: Anda tidak memiliki wewenang (permission INVENTORY_CORRECTION) untuk melakukan koreksi inventaris resmi.");
      await writeAuditLog({
      tenantId,
        action: "KOREKSI_INVENTARIS_DITOLAK",
        module: "KETIDAKSESUAIAN_INVENTARIS",
        entityType: "INVENTARIS_INSTRUMEN",
        entityId: selectedCase.masterId,
        installationId: selectedCase.originUnit,
        userId: currentUsername,
        userName: currentUsername,
        userRole: currentRole,
        reason: "User tidak memiliki permission INVENTORY_CORRECTION",
        result: "REJECTED"
      });
      return;
    }

    if (!correctionForm.reason || correctionForm.reason.trim().length < 5) {
      alert("Alasan koreksi resmi wajib diisi secara lengkap.");
      return;
    }

    if (!correctionForm.proofRef || correctionForm.proofRef.trim().length < 3) {
      alert("Dasar / Referensi Bukti Dokumen Resmi (misal: Berita Acara Kehilangan) wajib diisi.");
      return;
    }

    const oldTotal = correctionForm.oldTotal;
    const newTotal = Number(correctionForm.newTotal);
    const diff = newTotal - oldTotal;

    const activeKey = discrepancyIdempotencyKey || `IDEMP-DISC-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    if (!discrepancyIdempotencyKey) setDiscrepancyIdempotencyKey(activeKey);

    try {
      if (isDemoMode) {
        // Update Local Demo State
        const updatedInsts = instruments.map((inst) => {
          if (inst.id === selectedCase.masterId) {
            return { ...inst, totalStock: newTotal };
          }
          return inst;
        });
        setInstruments(updatedInsts);
        saveDemoData(DEMO_KEYS.INSTRUMENTS, updatedInsts);

        const updatedCase: DiscrepancyCase = {
          ...selectedCase,
          totalResmi: newTotal,
          discrepancyQty: Math.max(0, newTotal - selectedCase.liveStateFoundCount),
          status: newTotal === selectedCase.liveStateFoundCount ? "SESUAI" : "SELESAI",
          correctionHistory: [
            ...(selectedCase.correctionHistory || []),
            {
              oldTotal,
              newTotal,
              difference: diff,
              reason: correctionForm.reason,
              proofRef: correctionForm.proofRef,
              actor: currentUsername,
              approver: correctionForm.approverName,
              timestamp: new Date().toLocaleString("id-ID")
            }
          ]
        };

        const newCases = discrepancyCases.map(c => c.id === selectedCase.id ? updatedCase : c);
        setDiscrepancyCases(newCases);
        saveDemoData(DEMO_KEYS.DISCREPANCY_CASES, newCases);

        setSelectedCase(updatedCase);
      } else {
        // Atomic Firestore Transaction (RULE 13)
        const nowISO = new Date().toISOString();
        await runTransaction(db, async (transaction) => {
          // Check transaction idempotency
          const idempotencyRef = doc(db, "transaction_idempotency", `${tenantId}:STOCK_DISCREPANCY:${activeKey}`);
          const idempSnap = await transaction.get(idempotencyRef);
          if (idempSnap.exists()) {
            return; // Already executed
          }

          // 1. READ PHASE - Read master instrument and discrepancy case refs
          const instRef = doc(db, "master_instruments", selectedCase.masterId);
          const caseRef = doc(db, "discrepancy_cases", selectedCase.id);

          const instSnap = await transaction.get(instRef);
          const caseSnap = await transaction.get(caseRef);

          if (!instSnap.exists()) {
            throw new Error("Master Instrument document not found in Firestore.");
          }

          const instData = instSnap.data();
          if (instData.tenantId && tenantId && instData.tenantId !== tenantId) {
            throw new Error("TENANT_CONTEXT_MISMATCH");
          }

          if (caseSnap.exists()) {
            const caseData = caseSnap.data();
            if (caseData.tenantId && tenantId && caseData.tenantId !== tenantId) {
              throw new Error("TENANT_CONTEXT_MISMATCH");
            }
          }

          const currentDbTotal = instSnap.data().totalStock || 0;

          // Validate old value matches DB (Concurrency protection - RULE 13)
          if (currentDbTotal !== oldTotal) {
            throw new Error(`Data telah berubah oleh pengguna lain! Angka resmi di database (${currentDbTotal}) tidak sama dengan (${oldTotal}).`);
          }

          // 2. WRITE PHASE
          transaction.set(idempotencyRef, {
            idempotencyKey: activeKey,
            caseId: selectedCase.id,
            masterId: selectedCase.masterId,
            oldTotal,
            newTotal,
            executedAt: nowISO,
            tenantId
          });

          // Update Official Inventory Count in Master
          transaction.update(instRef, { totalStock: newTotal });

          // Update Discrepancy Case Status
          transaction.set(caseRef, {
            totalResmi: newTotal,
            discrepancyQty: Math.max(0, newTotal - selectedCase.liveStateFoundCount),
            status: newTotal === selectedCase.liveStateFoundCount ? "SESUAI" : "SELESAI",
            tenantId,
            correctionHistory: [
              ...(selectedCase.correctionHistory || []),
              {
                oldTotal,
                newTotal,
                difference: diff,
                reason: correctionForm.reason,
                proofRef: correctionForm.proofRef,
                actor: currentUsername,
                approver: correctionForm.approverName,
                timestamp: nowISO
              }
            ]
          }, { merge: true });
        });
      }

      // Write Immutable Audit Log (RULE 14)
      await writeAuditLog({
      tenantId,
        action: "KOREKSI_INVENTARIS",
        module: "KETIDAKSESUAIAN_INVENTARIS",
        entityType: "INVENTARIS_INSTRUMEN",
        entityId: selectedCase.masterId,
        instrumentId: selectedCase.problematicUnitIds[0] || selectedCase.masterId,
        installationId: selectedCase.originUnit,
        userId: currentUsername,
        userName: currentUsername,
        userRole: currentRole,
        beforeState: String(oldTotal),
        afterState: String(newTotal),
        reason: `ALAT_HILANG / KOREKSI RESMI: ${correctionForm.reason} (Bukti: ${correctionForm.proofRef})`,
        result: "SUCCESS"
      });

      triggerActionConfirm({
        title: "Koreksi Inventaris Berhasil",
        message: `Total Inventaris Resmi ${selectedCase.instrumentName} diperbarui dari ${oldTotal} menjadi ${newTotal}.`
      });

      setDiscrepancyIdempotencyKey("");
      setIsCorrectionModalOpen(false);
      setIsDetailModalOpen(false);
    } catch (err: any) {
      alert(`Koreksi Gagal: ${err?.message || err}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-amber-400 font-mono text-xs font-bold uppercase tracking-widest mb-1">
              <ShieldAlert className="w-4 h-4" />
              <span>e-CSSD Stock Reconciliation</span>
            </div>
            <h1 className="text-2xl font-black text-slate-100 tracking-tight">
              Ketidaksesuaian Inventaris & Stock Opname
            </h1>
            <p className="text-slate-400 text-xs mt-1 max-w-2xl">
              Membandingkan <strong className="text-slate-200">Total Inventaris Resmi (Angka Registrasi Master)</strong> terhadap <strong className="text-slate-200">Kondisi Live State Fisik Unit</strong> secara transparan & terverifikasi.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-mono bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
              Role: <strong className="text-cyan-300 uppercase">{currentRole}</strong>
            </span>
            {hasCorrectionPermission && (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold px-2.5 py-1 rounded-md flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>INVENTORY_CORRECTION AUTHORIZED</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* WARNING BANNER IF DISCREPANCY EXISTS (RULE 19) */}
      {summaryMetrics.hasDiscrepancies && (
        <div className="bg-amber-500/10 border-2 border-amber-500/40 rounded-2xl p-4 flex items-start gap-4 shadow-lg animate-pulse">
          <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200">
            <h4 className="font-extrabold text-amber-300 text-sm uppercase tracking-wide">
              ⚠️ TERDAPAT KETIDAKSESUAIAN INVENTARIS
            </h4>
            <p className="mt-1 leading-relaxed">
              Total inventaris resmi tidak sama dengan unit instrumen yang teridentifikasi di lapangan. Lakukan klarifikasi sebelum melakukan koreksi inventaris.
            </p>
          </div>
        </div>
      )}

      {/* DASHBOARD METRICS (RULE 6) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Inventaris Resmi</span>
          <div className="text-2xl font-black text-slate-100 mt-1">{summaryMetrics.totalResmi} <span className="text-xs font-normal text-slate-400">Unit</span></div>
          <span className="text-[10px] text-slate-500 block mt-1">Master Registered Count</span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">Unit Teridentifikasi</span>
          <div className="text-2xl font-black text-emerald-400 mt-1">{summaryMetrics.teridentifikasi} <span className="text-xs font-normal text-emerald-600">Unit</span></div>
          <span className="text-[10px] text-emerald-500/70 block mt-1">Found in Live State</span>
        </div>

        <div className="bg-slate-900/90 border border-rose-500/30 bg-rose-500/5 rounded-xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">Tidak Teridentifikasi (Selisih)</span>
          <div className="text-2xl font-black text-rose-400 mt-1">{summaryMetrics.selisih} <span className="text-xs font-normal text-rose-600">Unit</span></div>
          <span className="text-[10px] text-rose-500/70 block mt-1">Memerlukan Klarifikasi</span>
        </div>

        <div className="bg-slate-900/90 border border-amber-500/30 bg-amber-500/5 rounded-xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider block">Dalam Klarifikasi</span>
          <div className="text-2xl font-black text-amber-300 mt-1">{summaryMetrics.dalamKlarifikasi} <span className="text-xs font-normal text-amber-600">Kasus</span></div>
          <span className="text-[10px] text-amber-500/70 block mt-1">Investigasi Lapangan</span>
        </div>

        <div className="bg-slate-900/90 border border-cyan-500/30 bg-cyan-500/5 rounded-xl p-4 shadow-sm col-span-2 lg:col-span-1">
          <span className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider block">Klarifikasi Selesai</span>
          <div className="text-2xl font-black text-cyan-300 mt-1">{summaryMetrics.selesai} <span className="text-xs font-normal text-cyan-600">Kasus</span></div>
          <span className="text-[10px] text-cyan-500/70 block mt-1">Verified & Resolved</span>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Cari instrumen / ID / instalasi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              className="bg-transparent text-slate-200 border-none focus:ring-0 text-xs font-bold cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900">Semua Instalasi</option>
              {uniqueUnits.map((u) => (
                <option key={u} value={u} className="bg-slate-900">{u}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-slate-200 border-none focus:ring-0 text-xs font-bold cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900">Semua Status</option>
              <option value="SELISIH" className="bg-slate-900">🔴 SELISIH</option>
              <option value="DALAM_KLARIFIKASI" className="bg-slate-900">🟡 DALAM KLARIFIKASI</option>
              <option value="SESUAI" className="bg-slate-900">🟢 SESUAI</option>
              <option value="SELESAI" className="bg-slate-900">🔵 SELESAI</option>
            </select>
          </div>
        </div>
      </div>

      {/* DISCREPANCY CASES LIST / TABLE */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-100 flex items-center gap-2">
            <Database className="w-4 h-4 text-amber-400" />
            <span>Daftar Rekonsiliasi Inventaris Master vs Fisik</span>
          </h3>
          <span className="text-xs text-slate-500 font-mono">
            {filteredCases.length} Rekord Ditampilkan
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500 text-xs font-mono">Memuat data rekonsiliasi inventaris...</div>
        ) : filteredCases.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <CheckCircle2 className="w-10 h-10 text-emerald-500/40 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-400">Tidak ada kasus selisih inventaris pada kriteria filter ini.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {filteredCases.map((c) => {
              let badgeClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
              let badgeLabel = "🟢 SESUAI";

              if (c.status === "SELISIH") {
                badgeClass = "bg-rose-500/20 text-rose-300 border-rose-500/40 font-black animate-pulse";
                badgeLabel = "🔴 SELISIH";
              } else if (c.status === "DALAM_KLARIFIKASI") {
                badgeClass = "bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold";
                badgeLabel = "🟡 DALAM KLARIFIKASI";
              } else if (c.status === "SELESAI") {
                badgeClass = "bg-sky-500/20 text-sky-300 border-sky-500/40 font-bold";
                badgeLabel = "🔵 SELESAI";
              }

              return (
                <div key={c.id} className="p-4 hover:bg-slate-800/40 transition flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-amber-400 shrink-0 font-bold font-mono text-xs">
                      {c.masterId.slice(0, 4)}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-100 text-sm">{c.instrumentName}</h4>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badgeClass}`}>
                          {badgeLabel}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-slate-400 mt-1 font-mono">
                        <span>Instalasi Pemilik: <strong className="text-slate-200">{c.originUnit}</strong></span>
                        <span>•</span>
                        <span>Total Resmi: <strong className="text-sky-300">{c.totalResmi}</strong></span>
                        <span>•</span>
                        <span>Teridentifikasi: <strong className="text-emerald-300">{c.liveStateFoundCount}</strong></span>
                        {c.discrepancyQty > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-rose-400 font-bold">Selisih: -{c.discrepancyQty}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-auto">
                    <button
                      onClick={() => {
                        setSelectedCase(c);
                        setIsDetailModalOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-amber-400" />
                      <span>Detail Kasus</span>
                    </button>

                    {c.status === "SELISIH" && (
                      <button
                        onClick={() => {
                          setSelectedCase(c);
                          setIsClarifyModalOpen(true);
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs transition shadow-md active:scale-95 cursor-pointer flex items-center gap-1"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>Mulai Klarifikasi</span>
                      </button>
                    )}

                    {c.status === "DALAM_KLARIFIKASI" && (
                      <button
                        onClick={() => {
                          setSelectedCase(c);
                          setIsResolveModalOpen(true);
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-extrabold text-xs transition shadow-md active:scale-95 cursor-pointer flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Hasil Klarifikasi</span>
                      </button>
                    )}

                    {hasCorrectionPermission && (
                      <button
                        onClick={() => {
                          setSelectedCase(c);
                          setCorrectionForm({
                            oldTotal: c.totalResmi,
                            newTotal: c.totalResmi - c.discrepancyQty,
                            reason: "",
                            proofRef: "",
                            approverName: "Kepala CSSD / Administrator"
                          });
                          setIsCorrectionModalOpen(true);
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs transition shadow-md active:scale-95 cursor-pointer flex items-center gap-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Koreksi Inventaris</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* DETAIL MODAL (RULE 7) */}
      {isDetailModalOpen && selectedCase && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 relative">
            <button
              onClick={() => setIsDetailModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-100 p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-amber-400 font-mono text-xs font-bold uppercase tracking-wider mb-2">
              <FileText className="w-4 h-4" />
              <span>Detail Rekonsiliasi Kasus Selisih</span>
            </div>

            <h2 className="text-xl font-black text-slate-100">{selectedCase.instrumentName}</h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">Master ID: {selectedCase.masterId} | Pemilik: {selectedCase.originUnit}</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4 p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-xs">
              <div>
                <span className="text-slate-500 block">Total Resmi</span>
                <span className="font-extrabold text-sky-400 text-base">{selectedCase.totalResmi}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Teridentifikasi</span>
                <span className="font-extrabold text-emerald-400 text-base">{selectedCase.liveStateFoundCount}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Jumlah Selisih</span>
                <span className="font-extrabold text-rose-400 text-base">-{selectedCase.discrepancyQty}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Status Kasus</span>
                <span className="font-extrabold text-amber-300 text-xs">{selectedCase.status}</span>
              </div>
            </div>

            {/* PROBLEMATIC UNIT IDS SECTION (RULE 7) */}
            <div className="mb-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>ID Instrumen Yang Bermasalah / Belum Teridentifikasi</span>
              </h4>
              {selectedCase.problematicUnitIds.length === 0 ? (
                <span className="text-xs text-emerald-400 font-mono">Semua Unit ID Teridentifikasi Sesuai.</span>
              ) : (
                <div className="space-y-2 mt-2">
                  {selectedCase.problematicUnitIds.map((id) => (
                    <div key={id} className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between text-xs font-mono">
                      <span className="font-bold text-amber-300">{id}</span>
                      <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded font-sans font-bold">
                        TIDAK TERIDENTIFIKASI
                      </span>
                    </div>
                  ))}
                  <p className="text-[10px] text-slate-500 italic mt-1">
                    *Sistem tidak membuat ID baru pengganti secara otomatis.
                  </p>
                </div>
              )}
            </div>

            {/* CLARIFICATION DETAILS IF ANY */}
            {selectedCase.clarificationDetails && (
              <div className="mb-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Histori / Hasil Pemeriksaan Klarifikasi</span>
                </h4>
                <div className="text-xs space-y-1.5 text-slate-300 font-mono">
                  <div>Petugas: <strong className="text-slate-100">{selectedCase.clarificationDetails.petugasPemeriksa}</strong></div>
                  <div>Tanggal: {selectedCase.clarificationDetails.tanggalPemeriksaan}</div>
                  <div>Lokasi Pencarian: {selectedCase.clarificationDetails.lokasiPencarian}</div>
                  <div>Hasil: <strong className="text-amber-300">{selectedCase.clarificationDetails.hasilPemeriksaan}</strong></div>
                  {selectedCase.clarificationDetails.keterangan && (
                    <div>Keterangan: {selectedCase.clarificationDetails.keterangan}</div>
                  )}
                </div>
              </div>
            )}

            {/* CORRECTION HISTORY IF ANY */}
            {selectedCase.correctionHistory && selectedCase.correctionHistory.length > 0 && (
              <div className="mb-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <h4 className="text-xs font-bold text-rose-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Catatan Koreksi Resmi Inventaris</span>
                </h4>
                {selectedCase.correctionHistory.map((h, i) => (
                  <div key={i} className="text-xs p-2.5 bg-slate-900 rounded-lg border border-slate-800 text-slate-300 space-y-1 mb-2 font-mono">
                    <div>Lama: {h.oldTotal} → Baru: <strong className="text-amber-300">{h.newTotal}</strong> (Selisih: {h.difference})</div>
                    <div>Alasan: {h.reason}</div>
                    <div>Bukti: {h.proofRef} | Oleh: {h.actor} (Setuju: {h.approver})</div>
                    <div className="text-[10px] text-slate-500">{h.timestamp}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between items-center pt-4 border-t border-slate-800">
              {hasCorrectionPermission && (
                <button
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    setCorrectionForm({
                      oldTotal: selectedCase.totalResmi,
                      newTotal: selectedCase.totalResmi - selectedCase.discrepancyQty,
                      reason: "",
                      proofRef: "",
                      approverName: "Kepala CSSD / Administrator"
                    });
                    setIsCorrectionModalOpen(true);
                  }}
                  className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Koreksi Inventaris Resmi</span>
                </button>
              )}

              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition ml-auto cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLARIFICATION MODAL ("MULAI KLARIFIKASI" - RULE 8) */}
      {isClarifyModalOpen && selectedCase && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative">
            <button onClick={() => setIsClarifyModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-100">
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-amber-400 font-mono text-xs font-bold uppercase tracking-wider mb-2">
              <Clock className="w-4 h-4" />
              <span>Mulai Klarifikasi Selisih</span>
            </div>

            <h3 className="text-lg font-black text-slate-100">{selectedCase.instrumentName}</h3>
            <p className="text-xs text-slate-400 mb-4">Ubah status dari SELISIH ke DALAM_KLARIFIKASI dan masukkan data petugas pencari.</p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">Petugas Pemeriksa / Logistik</label>
                <input
                  type="text"
                  value={clarifyForm.petugasPemeriksa}
                  onChange={(e) => setClarifyForm({ ...clarifyForm, petugasPemeriksa: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Lokasi Pencarian / Verifikasi</label>
                <input
                  type="text"
                  placeholder="e.g. Ruang Operasi IGD / CSSD Storage"
                  value={clarifyForm.lokasiPencarian}
                  onChange={(e) => setClarifyForm({ ...clarifyForm, lokasiPencarian: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Rencana / Hasil Pemeriksaan Awal</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Melakukan cross-check ke ruang perawatan IGD dan loket penerimaan CSSD"
                  value={clarifyForm.hasilPemeriksaan}
                  onChange={(e) => setClarifyForm({ ...clarifyForm, hasilPemeriksaan: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Keterangan Tambahan / Bukti Catatan</label>
                <input
                  type="text"
                  placeholder="Ref BA / memo pencarian"
                  value={clarifyForm.keterangan}
                  onChange={(e) => setClarifyForm({ ...clarifyForm, keterangan: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsClarifyModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
              >
                Batal
              </button>
              <button
                onClick={handleStartClarification}
                className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md"
              >
                Mulai Klarifikasi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESOLUTION MODAL ("HASIL KLARIFIKASI" - RULE 9) */}
      {isResolveModalOpen && selectedCase && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 shadow-2xl relative">
            <button onClick={() => setIsResolveModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-100">
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider mb-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Input Hasil Klarifikasi Lapangan</span>
            </div>

            <h3 className="text-lg font-black text-slate-100 mb-1">{selectedCase.instrumentName}</h3>
            <p className="text-xs text-slate-400 mb-4">Pilih opsi penanganan hasil klarifikasi sesuai fakta yang ditemukan di lapangan.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">Opsi Hasil Klarifikasi (A - E):</label>
                <div className="grid grid-cols-1 gap-2 text-xs">
                  <label className={`p-3 rounded-xl border cursor-pointer flex items-start gap-3 transition ${resolveType === 'ALAT_DITEMUKAN' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-200' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
                    <input type="radio" name="resolveType" checked={resolveType === 'ALAT_DITEMUKAN'} onChange={() => setResolveType('ALAT_DITEMUKAN')} className="mt-0.5" />
                    <div>
                      <strong className="block text-slate-100">A. ALAT DITEMUKAN</strong>
                      <span className="text-[11px] text-slate-400">Scan/validasi ID instrumen fisik. Update lokasi/live state. Status berubah menjadi SESUAI.</span>
                    </div>
                  </label>

                  <label className={`p-3 rounded-xl border cursor-pointer flex items-start gap-3 transition ${resolveType === 'ALAT_SALAH_LOKASI' ? 'bg-amber-500/10 border-amber-500/50 text-amber-200' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
                    <input type="radio" name="resolveType" checked={resolveType === 'ALAT_SALAH_LOKASI'} onChange={() => setResolveType('ALAT_SALAH_LOKASI')} className="mt-0.5" />
                    <div>
                      <strong className="block text-slate-100">B. ALAT SALAH LOKASI</strong>
                      <span className="text-[11px] text-slate-400">Alat ditemukan di ruang/instalasi lain. Perbaiki hanya live state lokasi & log audit.</span>
                    </div>
                  </label>

                  <label className={`p-3 rounded-xl border cursor-pointer flex items-start gap-3 transition ${resolveType === 'ALAT_SEDANG_DIGUNAKAN' ? 'bg-sky-500/10 border-sky-500/50 text-sky-200' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
                    <input type="radio" name="resolveType" checked={resolveType === 'ALAT_SEDANG_DIGUNAKAN'} onChange={() => setResolveType('ALAT_SEDANG_DIGUNAKAN')} className="mt-0.5" />
                    <div>
                      <strong className="block text-slate-100">C. ALAT SEDANG DIGUNAKAN</strong>
                      <span className="text-[11px] text-slate-400">Alat sedang aktif dipakai pasien/tindakan. Jangan kurangi inventaris, update live state.</span>
                    </div>
                  </label>

                  <label className={`p-3 rounded-xl border cursor-pointer flex items-start gap-3 transition ${resolveType === 'ALAT_RUSAK' ? 'bg-orange-500/10 border-orange-500/50 text-orange-200' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
                    <input type="radio" name="resolveType" checked={resolveType === 'ALAT_RUSAK'} onChange={() => setResolveType('ALAT_RUSAK')} className="mt-0.5" />
                    <div>
                      <strong className="block text-slate-100">D. ALAT RUSAK</strong>
                      <span className="text-[11px] text-slate-400">Pertahankan ID & histori. Ubah ke status TAHAN/KARANTINA. Tidak menghapus ID.</span>
                    </div>
                  </label>

                  <label className={`p-3 rounded-xl border cursor-pointer flex items-start gap-3 transition ${resolveType === 'ALAT_HILANG' ? 'bg-rose-500/10 border-rose-500/50 text-rose-200' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
                    <input type="radio" name="resolveType" checked={resolveType === 'ALAT_HILANG'} onChange={() => setResolveType('ALAT_HILANG')} className="mt-0.5" />
                    <div>
                      <strong className="block text-slate-100">E. ALAT BENAR-BENAR HILANG</strong>
                      <span className="text-[11px] text-slate-400">Set status HILANG operasional. ID tersimpan & nomor urut tidak didaur ulang. Total resmi tidak berkurang otomatis.</span>
                    </div>
                  </label>
                </div>
              </div>

              {resolveType === "ALAT_DITEMUKAN" && (
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Scan / Masukkan ID Instrumen Yang Ditemukan</label>
                  <input
                    type="text"
                    placeholder="e.g. ST-HECST04-IGD1"
                    value={resolveForm.scannedUnitId}
                    onChange={(e) => setResolveForm({ ...resolveForm, scannedUnitId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-amber-300 font-mono font-bold"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Catatan / Bukti Hasil Klarifikasi</label>
                <textarea
                  rows={2}
                  placeholder="Catatan detail verifikasi..."
                  value={resolveForm.notes}
                  onChange={(e) => setResolveForm({ ...resolveForm, notes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsResolveModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
              >
                Batal
              </button>
              <button
                onClick={handleResolveClarification}
                className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-black text-xs shadow-md"
              >
                Simpan Hasil Klarifikasi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OFFICIAL INVENTORY CORRECTION MODAL ("KOREKSI INVENTARIS" - RULE 10, 11, 13) */}
      {isCorrectionModalOpen && selectedCase && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative">
            <button onClick={() => setIsCorrectionModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-100">
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-rose-400 font-mono text-xs font-bold uppercase tracking-wider mb-2">
              <ShieldAlert className="w-4 h-4" />
              <span>Transaksi Resmi Koreksi Inventaris</span>
            </div>

            <h3 className="text-lg font-black text-slate-100">{selectedCase.instrumentName}</h3>
            <p className="text-xs text-rose-300/80 mb-4">
              Koreksi ini hanya boleh dilakukan oleh pejabat berwenang (INVENTORY_CORRECTION). Memerlukan bukti dokumen resmi & dicatat secara permanen di Audit Log.
            </p>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2 p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-500 block">Lama</span>
                  <strong className="text-slate-200 text-sm">{correctionForm.oldTotal}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Baru</span>
                  <input
                    type="number"
                    min={0}
                    value={correctionForm.newTotal}
                    onChange={(e) => setCorrectionForm({ ...correctionForm, newTotal: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-amber-300 font-bold"
                  />
                </div>
                <div>
                  <span className="text-slate-500 block">Selisih</span>
                  <strong className="text-rose-400 text-sm">{correctionForm.newTotal - correctionForm.oldTotal}</strong>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Alasan Koreksi Resmi (MANDATORY)</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Instrumen ST-HECST04-IGD1 dinyatakan hilang berdasarkan hasil investigasi dan penetapan Berita Acara"
                  value={correctionForm.reason}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, reason: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Dasar / Referensi Bukti Dokumen (MANDATORY)</label>
                <input
                  type="text"
                  placeholder="e.g. Berita Acara Kehilangan / Surat Keputusan No. BA/012/2026"
                  value={correctionForm.proofRef}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, proofRef: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Pejabat / Penyetuju Koreksi</label>
                <input
                  type="text"
                  value={correctionForm.approverName}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, approverName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsCorrectionModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
              >
                Batal
              </button>
              <button
                onClick={handleOfficialInventoryCorrection}
                className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-md"
              >
                Eksekusi Koreksi Resmi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
