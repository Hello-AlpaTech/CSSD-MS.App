import React, { useState, useEffect, useRef } from "react";
import { db } from "../lib/firebase";
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  updateDoc, 
  setDoc,
  getDocs,
  where,
  limit 
} from "firebase/firestore";
import { MachineTestLog, Machine, MachineStatus, UserProfile } from "../types";
import { 
  CheckCircle2, 
  XCircle, 
  Camera, 
  Upload, 
  Trash2, 
  Search, 
  FileText, 
  ShieldCheck, 
  AlertTriangle,
  Info,
  Calendar,
  User,
  Clock,
  Printer,
  Sparkles,
  Eye,
  RefreshCw,
  Gauge,
  Plus,
  Edit3,
  Sliders,
  Cpu,
  Check,
  Wrench,
  X
} from "lucide-react";
import { DEMO_KEYS, getDemoData, saveDemoData, INITIAL_DEMO_MACHINE_TESTS } from "../lib/demoStore";
import { triggerActionConfirm } from "../lib/actionToast";
import { writeAuditLog } from "../lib/auditLogger";
import { hasPermission, PERMISSIONS, requireTenantId } from "../lib/permissions";

interface MachineTestProps {
  currentUsername: string;
  currentRole?: string;
  currentUserProfile?: UserProfile | null;
  isDemoMode?: boolean;
}

const DEFAULT_MASTER_MACHINES_LIST: Machine[] = [
  {
    id: "mach-steam-buma",
    machineId: "mach-steam-buma",
    name: "BUMA STERILIZER VACUM",
    namaMesin: "BUMA STERILIZER VACUM",
    type: "sterilizer_steam",
    jenisMesin: "sterilizer_steam",
    method: "steam_autoclave",
    modes: ["Bowie-Dick", "Vacuum Test", "Mode Solid (134°C, 4-10 min)", "Mode Dressing (134°C, 15-20 min)", "Mode Rubber (121°C, 20-30 min)"],
    temperature: "134",
    duration: "30",
    status: "LOLOS_UJI_SIAP",
    statusMesin: "LOLOS_UJI_SIAP",
    serialNumber: "BUMA-VAC-2026",
    nomorSeri: "BUMA-VAC-2026",
    merk: "BUMA",
    model: "Autoclave Vacum 2026",
    lokasi: "Ruang Sterilisator CSSD",
    aktif: true
  },
  {
    id: "mach-steam-as25",
    machineId: "mach-steam-as25",
    name: "BES AUTOCLAVE",
    namaMesin: "BES AUTOCLAVE",
    type: "sterilizer_steam",
    jenisMesin: "sterilizer_steam",
    method: "steam_autoclave",
    modes: ["Mode 1 (121°C, 30 min)", "Mode 2 (134°C, 15 min)", "Mode 3 (121°C, 15 min)", "Mode 4 (134°C, 4 min)"],
    temperature: "134",
    duration: "15",
    status: "LOLOS_UJI_SIAP",
    statusMesin: "LOLOS_UJI_SIAP",
    serialNumber: "BES-AC-2026",
    nomorSeri: "BES-AC-2026",
    merk: "BES",
    model: "Sterilizer High Pressure",
    lokasi: "Ruang Sterilisator CSSD",
    aktif: true
  },
  {
    id: "mach-plasma-stera120",
    machineId: "mach-plasma-stera120",
    name: "PLASMA STERA 120",
    namaMesin: "PLASMA STERA 120",
    type: "sterilizer_plasma",
    jenisMesin: "sterilizer_plasma",
    method: "plasma_h2o2",
    modes: ["Test Mode / Short Cycle (30 min)", "Standard Mode / Long Cycle (45 min)", "Endoscopy Mode (48 min)"],
    temperature: "50",
    duration: "45",
    status: "LOLOS_UJI_SIAP",
    statusMesin: "LOLOS_UJI_SIAP",
    serialNumber: "STERA-120-2026",
    nomorSeri: "STERA-120-2026",
    merk: "Stera",
    model: "Stera 120 Low-Temp H2O2",
    lokasi: "Ruang Plasma CSSD",
    aktif: true
  }
];

export function normalizeMachineStatus(statusStr?: string): MachineStatus {
  if (!statusStr) return "BELUM_UJI_KELAYAKAN";
  const upper = statusStr.trim().toUpperCase();
  if (upper === "LOLOS_UJI_SIAP" || upper === "READY" || upper === "SIAP" || upper === "LULUS" || upper === "VALID") {
    return "LOLOS_UJI_SIAP";
  }
  if (upper === "PERBAIKAN" || upper === "RUSAK" || upper === "GAGAL" || upper === "INVALID") {
    return "PERBAIKAN";
  }
  if (upper === "TIDAK_AKTIF" || upper === "NONAKTIF" || upper === "NON_AKTIF") {
    return "TIDAK_AKTIF";
  }
  return "BELUM_UJI_KELAYAKAN";
}

export function getStatusBadgeUI(statusStr?: string) {
  const norm = normalizeMachineStatus(statusStr);
  switch (norm) {
    case "LOLOS_UJI_SIAP":
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>LOLOS UJI / SIAP</span>
        </span>
      );
    case "BELUM_UJI_KELAYAKAN":
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>BELUM UJI KELAYAKAN</span>
        </span>
      );
    case "PERBAIKAN":
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/30">
          <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
          <span>PERBAIKAN</span>
        </span>
      );
    case "TIDAK_AKTIF":
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-slate-800 text-slate-400 border border-slate-700">
          <span className="w-2 h-2 rounded-full bg-slate-500" />
          <span>TIDAK AKTIF</span>
        </span>
      );
  }
}

export default function MachineTest({ 
  currentUsername, 
  currentRole = 'operator',
  currentUserProfile,
  isDemoMode = false 
}: MachineTestProps) {

  const canEditMachines = hasPermission(currentUserProfile, PERMISSIONS.MESIN_EDIT) || currentRole === 'admin' || currentRole === 'supervisor';

  // Current Datetime formatting helper
  const getFormattedNow = () => {
    const d = new Date();
    const dateStr = d.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
    const timeStr = d.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit"
    });
    return `${dateStr}, ${timeStr}`;
  };

  // Form states
  const [testDateStr, setTestDateStr] = useState<string>(getFormattedNow());
  const [machineName, setMachineName] = useState<string>("BUMA STERILIZER VACUM");
  const [mode, setMode] = useState<string>("Bowie-Dick");
  const [indicatorResult, setIndicatorResult] = useState<'Valid' | 'Invalid'>("Valid");
  const [receiptImage, setReceiptImage] = useState<string>("");
  const [operatorName, setOperatorName] = useState<string>(currentUsername || "Operator CSSD");
  const [notes, setNotes] = useState<string>("");

  // UI & List states
  const [testLogs, setTestLogs] = useState<MachineTestLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedMachineFilter, setSelectedMachineFilter] = useState<string>("all");
  const [selectedImageModal, setSelectedImageModal] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // Machine Management Modal states
  const [showMachineModal, setShowMachineModal] = useState<boolean>(false);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [machineForm, setMachineForm] = useState<Partial<Machine>>({
    name: "",
    type: "sterilizer_steam",
    status: "LOLOS_UJI_SIAP",
    serialNumber: "",
    merk: "",
    model: "",
    lokasi: "Ruang Sterilisator CSSD",
    temperature: "134",
    duration: "30"
  });

  const videoRef = useRef<HTMLVideoElement>(null);

  // Load dynamic machines from master_machines
  const [machines, setMachines] = useState<Machine[]>([]);

  useEffect(() => {
    const tenantId = currentUserProfile?.tenantId || "RSUD-BENDA";
    const unsub = onSnapshot(
      query(collection(db, "master_machines"), where("tenantId", "==", tenantId)),
      (snap) => {
        const list: Machine[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as Machine);
        });
        if (list.length > 0) {
          setMachines(list);
          setMachineName(prev => {
            const exists = list.some(m => m.name === prev);
            return exists ? prev : list[0].name;
          });
        } else {
          setMachines(DEFAULT_MASTER_MACHINES_LIST);
          setMachineName(prev => {
            const exists = DEFAULT_MASTER_MACHINES_LIST.some(m => m.name === prev);
            return exists ? prev : DEFAULT_MASTER_MACHINES_LIST[0].name;
          });
        }
      }
    );
    return () => unsub();
  }, [currentUserProfile]);

  // Update operator name when prop changes
  useEffect(() => {
    if (currentUsername) {
      setOperatorName(currentUsername);
    }
  }, [currentUsername]);

  // Load test logs
  useEffect(() => {
    if (isDemoMode) {
      const loadDemoLogs = () => {
        const data = getDemoData(DEMO_KEYS.MACHINE_TESTS, INITIAL_DEMO_MACHINE_TESTS);
        setTestLogs(data as any);
        setLoading(false);
      };
      loadDemoLogs();

      const handleStoreChange = () => loadDemoLogs();
      window.addEventListener("cssd_demo_store_change", handleStoreChange);
      return () => window.removeEventListener("cssd_demo_store_change", handleStoreChange);
    } else {
      const tenantId = currentUserProfile?.tenantId || "RSUD-BENDA";
      const colRef = collection(db, "machine_test_logs");
      const q = query(
        colRef,
        where("tenantId", "==", tenantId),
        orderBy("createdAt", "desc")
      );
      
      const unsub = onSnapshot(q, (snap) => {
        const logs: MachineTestLog[] = [];
        snap.forEach((docSnap) => {
          logs.push({
            id: docSnap.id,
            ...docSnap.data()
          } as MachineTestLog);
        });
        setTestLogs(logs);
        setLoading(false);
      }, (error) => {
        console.warn("Firestore error fetching machine test logs:", error);
        setLoading(false);
      });

      return () => unsub();
    }
  }, [isDemoMode, currentUserProfile]);

  const activeSelectedMachine = machines.find(m => m.name === machineName) || machines[0];
  const isPlasmaMachine = activeSelectedMachine && (
    activeSelectedMachine.type === 'sterilizer_plasma' ||
    activeSelectedMachine.name.toLowerCase().includes('plasma') ||
    activeSelectedMachine.name.toLowerCase().includes('stera')
  );

  // Handle Manual Status Change by Admin/Supervisor
  const handleManualStatusChange = async (targetMachine: Machine, newStatus: MachineStatus) => {
    const currentNorm = normalizeMachineStatus(targetMachine.status || targetMachine.statusMesin);
    if (currentNorm === newStatus) return;

    if (!confirm(`Ubah status mesin "${targetMachine.name}" dari ${currentNorm} menjadi ${newStatus}?`)) {
      return;
    }

    try {
      const mRef = doc(db, "master_machines", targetMachine.id);
      await updateDoc(mRef, {
        status: newStatus,
        statusMesin: newStatus,
        updatedAt: serverTimestamp()
      });

      const activeTenantId = (() => {
        try {
          return requireTenantId(currentUserProfile);
        } catch (e) {
          return currentUserProfile?.tenantId || targetMachine?.tenantId || "";
        }
      })();

      await writeAuditLog({
        module: "MESIN",
        action: "STATUS_MESIN_BERUBAH",
        entityType: "MACHINE",
        entityId: targetMachine.id,
        beforeState: currentNorm,
        afterState: newStatus,
        reason: `Perubahan status mesin manual oleh ${currentUsername} (${currentRole})`,
        userName: currentUsername,
        userRole: currentRole,
        tenantId: activeTenantId,
      });

      triggerActionConfirm({
        title: "Status Mesin Diperbarui!",
        message: `Status mesin ${targetMachine.name} telah diubah menjadi ${newStatus}.`
      });
    } catch (err) {
      console.error("Gagal mengubah status mesin:", err);
      alert("Gagal mengubah status mesin di Firestore!");
    }
  };

  // Handle Photo Upload via File
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Start Camera Capture
  const startCamera = async () => {
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Gagal membuka kamera:", err);
      alert("Tidak dapat mengakses kamera perangkat. Silakan gunakan fitur Upload Foto.");
      setIsCameraActive(false);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg");
        setReceiptImage(dataUrl);
      }
      stopCamera();
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  // Generate Sample Thermal Receipt Canvas
  const generateSampleReceipt = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 420;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Thermal Paper Background
    ctx.fillStyle = "#F8FAFC";
    ctx.fillRect(0, 0, 320, 420);

    // Header & Grid
    ctx.fillStyle = "#0F172A";
    ctx.font = "bold 13px monospace";
    ctx.fillText("================================", 10, 25);
    ctx.fillText(" RSUD BENDA - UNIT STERILISASI", 10, 45);
    ctx.fillText("    STRUK UJI KELAYAKAN MESIN   ", 10, 65);
    ctx.fillText("================================", 10, 85);

    ctx.font = "11px monospace";
    ctx.fillText(`TANGGAL  : ${testDateStr}`, 15, 115);
    ctx.fillText(`MESIN    : ${machineName}`, 15, 140);
    ctx.fillText(`MODE UJI : ${mode.toUpperCase()}`, 15, 165);
    ctx.fillText(`OPERATOR : ${operatorName}`, 15, 190);

    ctx.fillText("--------------------------------", 10, 215);
    ctx.fillText(`HASIL INDIKATOR : ${indicatorResult.toUpperCase()}`, 15, 240);
    
    if (indicatorResult === "Valid") {
      ctx.fillStyle = "#166534";
      ctx.fillRect(15, 255, 290, 40);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 14px monospace";
      ctx.fillText(" [ LULUS / VALID - PASSED ] ", 25, 280);
    } else {
      ctx.fillStyle = "#991B1B";
      ctx.fillRect(15, 255, 290, 40);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 14px monospace";
      ctx.fillText(" [ GAGAL / INVALID - REJECTED ] ", 15, 280);
    }

    ctx.fillStyle = "#0F172A";
    ctx.font = "10px monospace";
    ctx.fillText("STATUS: MURNI TERVERIFIKASI AUTOMATIS", 15, 320);
    ctx.fillText("KETERANGAN : DOKUMEN MUTU CSSD", 15, 340);
    ctx.fillText("================================", 10, 370);
    ctx.fillText("       E-CSSD RSUD BENDA        ", 10, 390);

    setReceiptImage(canvas.toDataURL("image/png"));
  };

  // Submit Bowie-Dick / Vacuum Test Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testDateStr) {
      alert("Silakan masukkan Tanggal Test!");
      return;
    }

    // Check duplicate test today if passed
    const todayStr = new Date().toLocaleDateString("id-ID");
    const existingTestToday = testLogs.find(l => 
      (l.machineName === machineName || l.machineId === activeSelectedMachine?.id) &&
      (l.indicatorResult === 'Valid' || l.indicatorResult === 'LULUS') &&
      l.testDateStr?.includes(todayStr)
    );

    if (existingTestToday) {
      const confirmReTest = confirm(
        `Mesin "${machineName}" sudah memiliki hasil uji LULUS hari ini.\n\n` +
        `Apakah Anda yakin ingin menyimpan hasil pengujian ulang ini?`
      );
      if (!confirmReTest) return;
    }

    setSaving(true);
    const resultStatus: MachineStatus = indicatorResult === "Valid" ? "LOLOS_UJI_SIAP" : "PERBAIKAN";

    const newLog: Omit<MachineTestLog, "id"> = {
      tenantId: activeSelectedMachine?.tenantId || "",
      machineId: activeSelectedMachine?.id || "",
      testDateStr,
      periodeUji: new Date().toISOString().slice(0, 10),
      machineName,
      mode,
      indicatorResult,
      hasil: indicatorResult === "Valid" ? "LULUS" : "GAGAL",
      receiptImage: receiptImage || "",
      fotoBukti: receiptImage || "",
      operatorName: operatorName || currentUsername || "Operator CSSD",
      petugasNama: operatorName || currentUsername || "Operator CSSD",
      createdAt: isDemoMode ? new Date().toISOString() : serverTimestamp(),
      notes: notes || (indicatorResult === "Valid" ? "Pengujian kelayakan mesin berhasil & teruji valid." : "Indikator menolak/invalid, mesin dialihkan ke status PERBAIKAN.")
    };

    try {
      if (isDemoMode) {
        const currentLogs = getDemoData(DEMO_KEYS.MACHINE_TESTS, INITIAL_DEMO_MACHINE_TESTS);
        const created: MachineTestLog = {
          id: `test-demo-${Date.now()}`,
          ...newLog
        };
        saveDemoData(DEMO_KEYS.MACHINE_TESTS, [created, ...currentLogs]);
      } else {
        const testDocRef = await addDoc(collection(db, "machine_test_logs"), newLog);
        
        // Also write to bowie_dick_tests collection for redundant auditing
        await addDoc(collection(db, "bowie_dick_tests"), {
          ...newLog,
          testLogId: testDocRef.id,
          createdAt: serverTimestamp()
        }).catch(() => {});

        // Update machine status atomically in master_machines
        if (activeSelectedMachine?.id) {
          const mRef = doc(db, "master_machines", activeSelectedMachine.id);
          const oldStatus = normalizeMachineStatus(activeSelectedMachine.status);
          await updateDoc(mRef, {
            status: resultStatus,
            statusMesin: resultStatus,
            updatedAt: serverTimestamp()
          });

          const activeTenantId = (() => {
            try {
              return requireTenantId(currentUserProfile);
            } catch (e) {
              return currentUserProfile?.tenantId || activeSelectedMachine?.tenantId || "";
            }
          })();

          // Write Audit Log
          await writeAuditLog({
            module: "MESIN",
            action: indicatorResult === "Valid" ? "BOWIE_DICK_LULUS" : "BOWIE_DICK_GAGAL",
            entityType: "MACHINE",
            entityId: activeSelectedMachine.id,
            beforeState: oldStatus,
            afterState: resultStatus,
            reason: `Hasil Uji ${mode}: ${indicatorResult.toUpperCase()} (${notes || 'Pengujian kelayakan'})`,
            userName: currentUsername,
            userRole: currentRole,
            tenantId: activeTenantId,
          });
        }
      }

      // Reset form
      setNotes("");
      setReceiptImage("");
      setTestDateStr(getFormattedNow());
      triggerActionConfirm({
        title: "Uji Kelayakan Mesin Tersimpan!",
        message: `Hasil uji ${mode} pada mesin ${machineName} (${indicatorResult}) berhasil disimpan dan status mesin diperbarui.`
      });
    } catch (err) {
      console.error("Gagal menyimpan log uji mesin:", err);
      alert("Terjadi kesalahan saat menyimpan data. Coba lagi!");
    } finally {
      setSaving(false);
    }
  };

  // Delete Log
  const handleDeleteLog = async (id: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus data uji kelayakan ini?")) return;

    try {
      if (isDemoMode) {
        const currentLogs = getDemoData<MachineTestLog[]>(DEMO_KEYS.MACHINE_TESTS, INITIAL_DEMO_MACHINE_TESTS as MachineTestLog[]);
        const updated = currentLogs.filter(l => l.id !== id);
        saveDemoData(DEMO_KEYS.MACHINE_TESTS, updated);
      } else {
        await deleteDoc(doc(db, "machine_test_logs", id));
      }
    } catch (err) {
      console.error("Gagal menghapus log:", err);
      alert("Gagal menghapus data!");
    }
  };

  // Save Master Machine Form (Add or Edit)
  const handleSaveMachineForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!machineForm.name?.trim()) {
      alert("Nama mesin wajib diisi!");
      return;
    }

    try {
      const activeTenantId = (() => {
        try {
          return requireTenantId(currentUserProfile);
        } catch (e) {
          return currentUserProfile?.tenantId || editingMachine?.tenantId || "";
        }
      })();

      const safeId = editingMachine ? editingMachine.id : `mach-${Date.now()}`;
      const payload: Partial<Machine> = {
        id: safeId,
        machineId: safeId,
        name: machineForm.name.trim(),
        namaMesin: machineForm.name.trim(),
        type: machineForm.type || "sterilizer_steam",
        jenisMesin: machineForm.type || "sterilizer_steam",
        status: machineForm.status || "LOLOS_UJI_SIAP",
        statusMesin: machineForm.status || "LOLOS_UJI_SIAP",
        serialNumber: machineForm.serialNumber || "-",
        nomorSeri: machineForm.serialNumber || "-",
        merk: machineForm.merk || "-",
        model: machineForm.model || "-",
        lokasi: machineForm.lokasi || "Ruang Sterilisator CSSD",
        temperature: machineForm.temperature || "134",
        duration: machineForm.duration || "30",
        method: machineForm.type === 'sterilizer_plasma' ? 'plasma_h2o2' : 'steam_autoclave',
        modes: machineForm.modes || (machineForm.type === 'sterilizer_plasma' ? ["Standard Mode (45 min)"] : ["Bowie-Dick", "Vacuum Test", "Mode Standard (134°C)"]),
        tenantId: activeTenantId,
        updatedAt: serverTimestamp()
      };

      if (!editingMachine) {
        payload.createdAt = serverTimestamp();
      }

      await setDoc(doc(db, "master_machines", safeId), payload, { merge: true });

      await writeAuditLog({
        module: "MESIN",
        action: editingMachine ? "MESIN_DIUBAH" : "MESIN_DIBUAT",
        entityType: "MACHINE",
        entityId: safeId,
        afterState: payload.status,
        reason: editingMachine ? `Perubahan konfigurasi mesin ${payload.name}` : `Penambahan mesin baru ${payload.name}`,
        userName: currentUsername,
        userRole: currentRole,
        tenantId: activeTenantId,
      });

      setShowMachineModal(false);
      setEditingMachine(null);
      triggerActionConfirm({
        title: editingMachine ? "Data Mesin Diperbarui!" : "Mesin Baru Ditambahkan!",
        message: `Mesin ${payload.name} berhasil disimpan ke Master Data Mesin.`
      });
    } catch (err) {
      console.error("Gagal menyimpan master mesin:", err);
      alert("Gagal menyimpan data master mesin ke Firestore.");
    }
  };

  // Filter logs
  const filteredLogs = testLogs.filter((log) => {
    const matchesSearch = 
      log.machineName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.mode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.operatorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.testDateStr.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesMachine = selectedMachineFilter === "all" || log.machineName === selectedMachineFilter;

    return matchesSearch && matchesMachine;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-900/40 via-slate-900 to-slate-950 p-6 rounded-2xl border border-emerald-500/20 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400 shrink-0 shadow-inner">
            <Gauge className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-extrabold uppercase px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                Manajemen Mesin &amp; Uji Kelayakan
              </span>
              {isDemoMode && <span className="text-[10px] bg-amber-500/20 text-amber-300 font-extrabold px-2 py-0.5 rounded-full">MODUS DEMO</span>}
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-1">
              Uji Kelayakan Mesin (Bowie-Dick &amp; Vacuum Test)
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Pendataan uji kualitas penetrasi uap &amp; kelayakan mesin harian. Validasi status sebelum sterilisasi.
            </p>
          </div>
        </div>

        {canEditMachines && (
          <button
            onClick={() => {
              setEditingMachine(null);
              setMachineForm({
                name: "",
                type: "sterilizer_steam",
                status: "LOLOS_UJI_SIAP",
                serialNumber: "",
                merk: "",
                model: "",
                lokasi: "Ruang Sterilisator CSSD",
                temperature: "134",
                duration: "30"
              });
              setShowMachineModal(true);
            }}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-2 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>+ Tambah Mesin Baru</span>
          </button>
        )}
      </div>

      {/* SECTION 1: MASTER MACHINES STATUS CARDS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <span>Status Kelayakan Master Mesin ({machines.length})</span>
          </h2>
          <span className="text-[10px] text-slate-400">
            Hanya mesin berstatus <strong className="text-emerald-400">LOLOS UJI / SIAP</strong> yang dapat digunakan.
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {machines.map((mach) => {
            const isPlasma = mach.type === 'sterilizer_plasma' || mach.name.toLowerCase().includes('plasma') || mach.name.toLowerCase().includes('stera');
            const normStatus = normalizeMachineStatus(mach.status || mach.statusMesin);

            return (
              <div 
                key={mach.id} 
                className={`p-5 rounded-2xl border shadow-lg transition space-y-3 relative overflow-hidden ${
                  normStatus === 'LOLOS_UJI_SIAP'
                    ? 'bg-slate-900/90 border-emerald-500/30'
                    : normStatus === 'PERBAIKAN'
                    ? 'bg-slate-900/90 border-rose-500/40'
                    : 'bg-slate-900/90 border-amber-500/30'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-black text-white">{mach.name}</h3>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      No. Seri: <span className="text-slate-200">{mach.serialNumber || mach.nomorSeri || '-'}</span>
                    </p>
                  </div>
                  {getStatusBadgeUI(normStatus)}
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-950/60 p-2.5 rounded-xl font-mono text-slate-300">
                  <div>
                    <span className="text-slate-500 block text-[9px] uppercase">Tipe Mesin</span>
                    <span className="font-bold text-sky-400">
                      {isPlasma ? 'Plasma (H2O2)' : mach.type === 'washer' ? 'Washer Disinfector' : 'Steam Autoclave'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px] uppercase">Lokasi</span>
                    <span className="font-bold text-slate-200 truncate block">{mach.lokasi || 'CSSD'}</span>
                  </div>
                </div>

                {isPlasma && (
                  <div className="bg-sky-500/10 border border-sky-500/20 p-2 rounded-lg text-[10px] text-sky-300 font-medium flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>Dikecualikan dari Bowie-Dick Test (Gas H2O2 Suhu Rendah).</span>
                  </div>
                )}

                {canEditMachines && (
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2 text-xs">
                    <span className="text-[10px] text-slate-400 font-mono">Ubah Status Manual:</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleManualStatusChange(mach, "LOLOS_UJI_SIAP")}
                        title="Set Status LOLOS UJI / SIAP"
                        className={`p-1.5 rounded text-[10px] font-bold transition ${
                          normStatus === "LOLOS_UJI_SIAP" 
                            ? "bg-emerald-600 text-white" 
                            : "bg-slate-800 hover:bg-emerald-950 text-slate-300 hover:text-emerald-300"
                        }`}
                      >
                        SIAP
                      </button>
                      <button
                        type="button"
                        onClick={() => handleManualStatusChange(mach, "BELUM_UJI_KELAYAKAN")}
                        title="Set Status BELUM UJI KELAYAKAN"
                        className={`p-1.5 rounded text-[10px] font-bold transition ${
                          normStatus === "BELUM_UJI_KELAYAKAN" 
                            ? "bg-amber-600 text-white" 
                            : "bg-slate-800 hover:bg-amber-950 text-slate-300 hover:text-amber-300"
                        }`}
                      >
                        BELUM UJI
                      </button>
                      <button
                        type="button"
                        onClick={() => handleManualStatusChange(mach, "PERBAIKAN")}
                        title="Set Status PERBAIKAN"
                        className={`p-1.5 rounded text-[10px] font-bold transition ${
                          normStatus === "PERBAIKAN" 
                            ? "bg-rose-600 text-white" 
                            : "bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300"
                        }`}
                      >
                        PERBAIKAN
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: FORM INPUT BOWIE-DICK & VACUUM TEST */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 sm:p-6 shadow-xl space-y-5 backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-extrabold text-white uppercase tracking-wider">
              Formulir Pendataan Uji Kelayakan Mesin
            </h2>
          </div>
          <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
            Isi setiap parameter uji sebelum menjalankan siklus alat harian.
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            
            {/* 1. Tanggal Test */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>1. Tanggal &amp; Waktu Test</span>
                <span className="text-[10px] text-emerald-400 font-mono font-normal">Format: DD/MM/YYYY, HH.mm</span>
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={testDateStr}
                  onChange={(e) => setTestDateStr(e.target.value)}
                  placeholder="28/07/2026, 08.00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-24 py-2.5 text-xs text-slate-100 font-semibold focus:border-emerald-500 focus:outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => setTestDateStr(getFormattedNow())}
                  className="absolute right-2 top-2 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10px] font-bold transition flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3 text-emerald-400" />
                  <span>Sekarang</span>
                </button>
              </div>
            </div>

            {/* 2. Nama Mesin (Dropdown) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                2. Nama Mesin Sterilisator
              </label>
              <select
                value={machineName}
                onChange={(e) => setMachineName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 font-bold focus:border-emerald-500 focus:outline-none cursor-pointer"
                required
              >
                {machines.map((m) => (
                  <option key={m.id} value={m.name} className="bg-slate-900 font-bold">
                    {m.name} ({normalizeMachineStatus(m.status)})
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Mode Dropdown */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                3. Mode Pengujian
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 font-bold focus:border-emerald-500 focus:outline-none cursor-pointer"
                required
              >
                <option value="Bowie-Dick" className="bg-slate-900">Bowie-Dick (Penetrasi Uap &amp; Kertas Indikator)</option>
                <option value="Vacuum Test" className="bg-slate-900">Vacuum Test (Uji Kebocoran Ruang Vakum)</option>
              </select>
            </div>

            {/* Notice for Plasma Machine if selected */}
            {isPlasmaMachine && (
              <div className="lg:col-span-3 bg-sky-500/10 border border-sky-500/30 p-3 rounded-xl text-sky-200 text-xs flex items-center gap-3">
                <Info className="w-5 h-5 text-sky-400 shrink-0" />
                <div>
                  <strong className="block font-bold">Catatan Pengujian Mesin Plasma:</strong>
                  <span>Plasma Sterilizer Stera 120 menggunakan gas H2O2 suhu rendah dan tidak memerlukan Bowie-Dick Test. Pengujian dilakukan via Uji Fungsi / Self Diagnostic.</span>
                </div>
              </div>
            )}

            {/* 4. Hasil Indikator */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                4. Hasil Indikator Kelayakan
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIndicatorResult("Valid")}
                  className={`p-2.5 rounded-xl border text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer ${
                    indicatorResult === "Valid"
                      ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-950/50"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Valid / LULUS (Hijau)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIndicatorResult("Invalid")}
                  className={`p-2.5 rounded-xl border text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer ${
                    indicatorResult === "Invalid"
                      ? "bg-rose-500/20 border-rose-500 text-rose-300 shadow-md shadow-rose-950/50"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  <XCircle className="w-4 h-4 text-rose-400" />
                  <span>Invalid / GAGAL (Merah)</span>
                </button>
              </div>
            </div>

            {/* 5. Nama Operator */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                5. Nama Operator
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  placeholder="Nama Operator CSSD"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 p-2.5 text-xs text-slate-100 font-semibold focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>
            </div>

            {/* Catatan Tambahan */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                Catatan / Keterangan Uji (Opsional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Contoh: Perubahan warna kertas Bowie-Dick rata &amp; homogen"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* 6. Bukti Struk (Foto Capture / Upload) */}
          <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="block text-xs font-bold text-slate-200 uppercase tracking-wider">
                  6. Bukti Struk / Foto Hasil Uji
                </span>
                <span className="text-[11px] text-slate-400">
                  Ambil foto fisik kertas tes Bowie-Dick / Struk printer mesin sterilisasi.
                </span>
              </div>

              <button
                type="button"
                onClick={generateSampleReceipt}
                className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-bold transition flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Gunakan Struk Sample (Auto)</span>
              </button>
            </div>

            {/* Camera Viewfinder */}
            {isCameraActive && (
              <div className="relative bg-black rounded-xl overflow-hidden border border-slate-700 max-w-md mx-auto">
                <video ref={videoRef} autoPlay playsInline className="w-full h-56 object-cover" />
                <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={capturePhoto}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-extrabold shadow-lg flex items-center gap-2 cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Jepret Foto</span>
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Tutup Kamera
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {!isCameraActive && (
                <button
                  type="button"
                  onClick={startCamera}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-2 border border-slate-700 cursor-pointer"
                >
                  <Camera className="w-4 h-4 text-emerald-400" />
                  <span>Ambil Foto Kamera</span>
                </button>
              )}

              <label className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-2 border border-slate-700 cursor-pointer">
                <Upload className="w-4 h-4 text-sky-400" />
                <span>Upload File Gambar</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              {receiptImage && (
                <div className="flex items-center gap-3 bg-slate-900 p-2 rounded-xl border border-slate-800">
                  <img
                    src={receiptImage}
                    alt="Bukti Struk"
                    className="w-12 h-12 object-cover rounded-lg border border-slate-700 cursor-pointer"
                    onClick={() => setSelectedImageModal(receiptImage)}
                  />
                  <div>
                    <span className="text-xs font-bold text-emerald-400 block">Foto/Struk Terlampir</span>
                    <button
                      type="button"
                      onClick={() => setReceiptImage("")}
                      className="text-[10px] text-rose-400 hover:underline font-semibold cursor-pointer"
                    >
                      Hapus Foto
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-emerald-950/50 transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>{saving ? "Menyimpan Data..." : "Simpan Log Uji Kelayakan"}</span>
            </button>
          </div>
        </form>
      </div>

      {/* SECTION 3: LOG HISTORY */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 sm:p-6 shadow-xl space-y-4 backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div>
            <h2 className="text-base font-extrabold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-400" />
              <span>Riwayat &amp; Log Uji Kelayakan Mesin</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Daftar seluruh dokumen hasil pengujian Bowie-Dick &amp; Vacuum Test yang telah diinput.
            </p>
          </div>

          {/* Filter Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[180px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari mesin, operator, tanggal..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <select
              value={selectedMachineFilter}
              onChange={(e) => setSelectedMachineFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-xl px-3 py-1.5 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="all">Semua Mesin</option>
              {machines.map((m) => (
                <option key={m.id} value={m.name}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table View */}
        {loading ? (
          <div className="py-12 text-center text-slate-500 text-xs">Memuat data log uji kelayakan...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs space-y-2">
            <Info className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="font-semibold text-slate-400">Belum Ada Record Uji Kelayakan Mesin</p>
            <p className="text-[11px] text-slate-500">Gunakan formulir di atas untuk menginput hasil tes Bowie-Dick atau Vacuum Test.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800/80">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="p-3">Tanggal &amp; Waktu Test</th>
                  <th className="p-3">Nama Mesin</th>
                  <th className="p-3">Mode Pengujian</th>
                  <th className="p-3">Hasil Indikator</th>
                  <th className="p-3">Bukti Struk</th>
                  <th className="p-3">Operator</th>
                  <th className="p-3">Catatan</th>
                  <th className="p-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/50">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-3 font-mono font-bold text-slate-200 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>{log.testDateStr}</span>
                      </div>
                    </td>

                    <td className="p-3 font-bold text-white whitespace-nowrap">
                      {log.machineName}
                    </td>

                    <td className="p-3 font-semibold text-sky-300 whitespace-nowrap">
                      <span className="bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded font-mono text-[11px]">
                        {log.mode}
                      </span>
                    </td>

                    <td className="p-3 whitespace-nowrap">
                      {log.indicatorResult === "Valid" || log.hasil === "LULUS" ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-full text-[11px] font-black">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Valid / LULUS</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2.5 py-1 rounded-full text-[11px] font-black">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Invalid / GAGAL</span>
                        </span>
                      )}
                    </td>

                    <td className="p-3 whitespace-nowrap">
                      {log.receiptImage || log.fotoBukti ? (
                        <button
                          onClick={() => setSelectedImageModal(log.receiptImage || log.fotoBukti || null)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-lg text-[11px] font-bold transition inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Lihat Struk</span>
                        </button>
                      ) : (
                        <span className="text-slate-500 text-[11px] italic">Tanpa Struk</span>
                      )}
                    </td>

                    <td className="p-3 font-semibold text-slate-300 whitespace-nowrap">
                      {log.operatorName || log.petugasNama}
                    </td>

                    <td className="p-3 text-slate-400 text-[11px] max-w-xs truncate">
                      {log.notes || log.catatan || "-"}
                    </td>

                    <td className="p-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleDeleteLog(log.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                        title="Hapus Record Log"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: MASTER MACHINE ADD / EDIT */}
      {showMachineModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-400" />
                <span>{editingMachine ? "Edit Master Mesin" : "Tambah Master Mesin Baru"}</span>
              </h3>
              <button
                onClick={() => setShowMachineModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMachineForm} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Nama Mesin</label>
                <input
                  type="text"
                  placeholder="Contoh: BUMA STERILIZER VACUM 02"
                  value={machineForm.name || ""}
                  onChange={(e) => setMachineForm({ ...machineForm, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-bold focus:border-emerald-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Jenis Mesin</label>
                  <select
                    value={machineForm.type || "sterilizer_steam"}
                    onChange={(e) => setMachineForm({ ...machineForm, type: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-bold focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="sterilizer_steam">Steam Autoclave</option>
                    <option value="sterilizer_plasma">Plasma (H2O2)</option>
                    <option value="washer">Washer Disinfector</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Status Kelayakan</label>
                  <select
                    value={machineForm.status || "LOLOS_UJI_SIAP"}
                    onChange={(e) => setMachineForm({ ...machineForm, status: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-bold focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="LOLOS_UJI_SIAP">LOLOS UJI / SIAP</option>
                    <option value="BELUM_UJI_KELAYAKAN">BELUM UJI KELAYAKAN</option>
                    <option value="PERBAIKAN">PERBAIKAN</option>
                    <option value="TIDAK_AKTIF">TIDAK AKTIF</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Nomor Seri</label>
                  <input
                    type="text"
                    placeholder="Contoh: BUMA-VAC-2026-02"
                    value={machineForm.serialNumber || ""}
                    onChange={(e) => setMachineForm({ ...machineForm, serialNumber: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Lokasi Mesin</label>
                  <input
                    type="text"
                    placeholder="Contoh: Ruang Sterilisator CSSD"
                    value={machineForm.lokasi || ""}
                    onChange={(e) => setMachineForm({ ...machineForm, lokasi: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowMachineModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl shadow cursor-pointer"
                >
                  Simpan Mesin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Preview Image */}
      {selectedImageModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-lg w-full space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>Bukti Physical Struk / Foto Indikator Uji</span>
              </h3>
              <button
                onClick={() => setSelectedImageModal(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-center min-h-[250px]">
              <img
                src={selectedImageModal}
                alt="Physical Receipt"
                className="max-h-[380px] w-auto object-contain rounded-lg border border-slate-800 shadow"
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setSelectedImageModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
