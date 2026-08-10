import React, { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { 
  collection, 
  updateDoc, 
  doc, 
  onSnapshot, 
  query, 
  where, 
  addDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
  getDoc,
  getDocs,
  limit,
  orderBy,
  writeBatch
} from "firebase/firestore";
import { DEMO_KEYS, getDemoData, saveDemoData, INITIAL_DEMO_WORKFLOW_LOGS, INITIAL_DEMO_ACTIVITY_LOGS, INITIAL_DEMO_STERILE_STOCK, INITIAL_DEMO_MACHINE_TESTS } from "../lib/demoStore";
import { triggerActionConfirm } from "../lib/actionToast";
import { writeAuditLog } from "../lib/auditLogger";
import { 
  Flame, 
  Activity, 
  Thermometer, 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  Layers, 
  Play, 
  Lock,
  ArrowRight,
  Gauge,
  Droplets,
  Cpu,
  BookOpen,
  Info,
  Settings,
  QrCode,
  Camera,
  Upload,
  Image as ImageIcon,
  FileText,
  Calendar,
  Trash2
} from "lucide-react";
import QRCode from "qrcode";
import { WorkflowLog, Machine, UserProfile } from "../types";

// High-fidelity machine specifications matching CSSD accreditation standards and user-uploaded machine details
interface MachineProgram {
  name: string;
  description: string;
  temp: number;
  pressure: number;
  duration: number;
  method: 'steam_autoclave' | 'plasma_h2o2' | 'dry_heat';
}

interface MachineSpecDetails {
  id: string;
  name: string;
  tipe: string;
  kapasitas: string;
  dimensi: string;
  sistemPengaturan: string;
  features: string[];
  techSpecs: { label: string; value: string }[];
  programs: MachineProgram[];
}

const MACHINE_SPECS: Record<string, MachineSpecDetails> = {
  "mach-steam-buma": {
    id: "mach-steam-buma",
    name: "BUMA STERILIZER VACUM",
    tipe: "Auto Clave / Mesin Steril Uap (Vacuum Pulse)",
    kapasitas: "Kapasitas Besar (Ruang Steril Uap)",
    dimensi: "Multi-Pulse Pre-Vacuum",
    sistemPengaturan: "Sistem Sterilisasi Uap Bertekanan Tinggi (PLC)",
    features: [
      "Suhu Kerja Maksimum: Otomatis 121°C - 134°C",
      "Sistem Vakum: Pompa built-in, 3x pengosongan (Multi-Pulse)",
      "Sistem Kontrol: Panel PLC otomatis, Tombol Emergency Stop"
    ],
    techSpecs: [
      { label: "Sistem Vakum", value: "3x Pengosongan" },
      { label: "Kontrol Panel", value: "PLC Otomatis" },
      { label: "Tipe Sterilisator", value: "Vacuum Autoclave" }
    ],
    programs: [
      { 
        name: "1. Mode Solid (134°C | 4-10 Min)", 
        description: "Suhu 134°C, waktu steril 4 - 10 menit (untuk instrumen berbahan metal)", 
        temp: 134, 
        pressure: 2.07, 
        duration: 7, 
        method: "steam_autoclave" 
      },
      { 
        name: "2. Mode Dressing (134°C | 15-20 Min)", 
        description: "Suhu 134°C, waktu steril 15 - 20 menit (untuk kassa, gaun, linen, duk)", 
        temp: 134, 
        pressure: 2.07, 
        duration: 18, 
        method: "steam_autoclave" 
      },
      { 
        name: "3. Mode Rubber (121°C | 20-30 Min)", 
        description: "Suhu 121°C, waktu steril 20 - 30 menit (untuk bahan karet, plastik, sarung tangan)", 
        temp: 121, 
        pressure: 1.05, 
        duration: 25, 
        method: "steam_autoclave" 
      }
    ]
  },
  "mach-steam-as25": {
    id: "mach-steam-as25",
    name: "BES AUTOCLAVE",
    tipe: "Auto Clave / Mesin Steril Uap",
    kapasitas: "Ruang Sterilisasi Medis",
    dimensi: "Standard / Portable Autoclave",
    sistemPengaturan: "Temperatur & Tekanan Otomatis",
    features: [
      "Tegangan Kerja: 220VAC / Daya Presisi",
      "Material Konstruksi: Stainless Steel 304 anti-karat",
      "4 Mode Operasional Sterilisasi Standar Lapangan"
    ],
    techSpecs: [
      { label: "Material", value: "Stainless Steel 304" },
      { label: "Kontrol Suhu", value: "Otomatis 121°C / 134°C" }
    ],
    programs: [
      { 
        name: "Mode 1 (121°C | 1.05 kg/cm² | 30 Min)", 
        description: "Suhu 121°C | Tekanan 1.05 kg/cm² (15 psi) | Waktu 30 Menit. Peruntukan Standar: Bahan berpori/kain (kasa, linen, jas lab, kapas, perban).", 
        temp: 121, 
        pressure: 1.05, 
        duration: 30, 
        method: "steam_autoclave" 
      },
      { 
        name: "Mode 2 (134°C | 2.07 kg/cm² | 15 Min)", 
        description: "Suhu 134°C | Tekanan 2.07 kg/cm² (30 psi) | Waktu 15 Menit. Mode: Wrapped Instruments Cycle (Siklus Alat Terbungkus). Peruntukan Standar: Peralatan bedah medis logam yang terbungkus kantung sterilisasi (pouch).", 
        temp: 134, 
        pressure: 2.07, 
        duration: 15, 
        method: "steam_autoclave" 
      },
      { 
        name: "Mode 3 (121°C | 1.05 kg/cm² | 15 Min)", 
        description: "Suhu 121°C | Tekanan 1.05 kg/cm² (15 psi) | Waktu 15 Menit. Mode: Standard Unwrapped / Liquid Cycle (Siklus Standar Ringan). Peruntukan Standar: Peralatan gelas laboratorium (glassware seperti cawan petri, erlenmeyer, tabung reaksi).", 
        temp: 121, 
        pressure: 1.05, 
        duration: 15, 
        method: "steam_autoclave" 
      },
      { 
        name: "Mode 4 (134°C | 2.07 kg/cm² | 4 Min)", 
        description: "Suhu 134°C | Tekanan 2.07 kg/cm² (30 psi) | Waktu 4 Menit. Mode: Flash Sterilization / Fast Cycle (Sterilisasi Cepat). Peruntukan Standar: Instrumen logam/bedah tanpa pembungkus (unwrapped) yang dibutuhkan segera untuk tindakan darurat.", 
        temp: 134, 
        pressure: 2.07, 
        duration: 4, 
        method: "steam_autoclave" 
      }
    ]
  },
  "mach-plasma-stera120": {
    id: "mach-plasma-stera120",
    name: "PLASMA STERA 120",
    tipe: "Plasma Sterilizer (H2O2 Low Temp)",
    kapasitas: "120 Liter",
    dimensi: "Slim Cabinet Suhu Rendah",
    sistemPengaturan: "H2O2 Purifier & Gas Plasma Suhu Rendah",
    features: [
      "Konsentrat H2O2 Aman untuk Pengoperasian",
      "Sistem Purifikasi H2O2 Otomatis (58% ditingkatkan ke 95%)",
      "Tingkat Kebisingan Sangat Rendah: < 55 dB",
      "Cocok untuk Instrumen Sensitif Panas & Lumen Kompleks"
    ],
    techSpecs: [
      { label: "Kebisingan", value: "< 55 dB" },
      { label: "Purifikasi H2O2", value: "58% ke 95%" },
      { label: "Suhu Maksimum", value: "< 50°C (Suhu Rendah)" }
    ],
    programs: [
      { 
        name: "Test Mode / Short Cycle (~30 Min)", 
        description: "Waktu ~30 Menit, H2O2: 3.6 ml / siklus (Pengecekan fungsi alat, uji kelayakan harian, atau instrumen permukaan padat non-lumen tanpa porsi kompleks).", 
        temp: 50, 
        pressure: 0.05, 
        duration: 30, 
        method: "plasma_h2o2" 
      },
      { 
        name: "Standard Mode / Long Cycle (~45 Min)", 
        description: "Waktu ~45 Menit, H2O2: 7.2 ml / siklus (Peralatan medis standar, instrumen bedah umum sensitif suhu, alat berstruktur lunak, atau instrumen berlubang/ ber-lumen pendek).", 
        temp: 50, 
        pressure: 0.05, 
        duration: 45, 
        method: "plasma_h2o2" 
      },
      { 
        name: "Endoscopy / Flexi-Endo Mode (~48 Min)", 
        description: "Waktu ~48 Menit, H2O2: 7.2 ml / siklus (Instrumen dengan saluran amat panjang dan sempit seperti flexible/rigid endoscope, catheter, atau lumen kompleks lainnya).", 
        temp: 50, 
        pressure: 0.05, 
        duration: 48, 
        method: "plasma_h2o2" 
      }
    ]
  }
};

// Map exact names to specs for fast direct lookup
MACHINE_SPECS["BUMA STERILIZER VACUM"] = MACHINE_SPECS["mach-steam-buma"];
MACHINE_SPECS["BES AUTOCLAVE"] = MACHINE_SPECS["mach-steam-as25"];
MACHINE_SPECS["PLASMA STERA 120"] = MACHINE_SPECS["mach-plasma-stera120"];

const DEFAULT_MASTER_MACHINES: Machine[] = [
  {
    id: "mach-steam-buma",
    name: "BUMA STERILIZER VACUM",
    type: "sterilizer_steam",
    method: "steam_autoclave",
    temperature: "134",
    duration: "30",
    status: "ready",
    serialNumber: "BUMA-VAC-2026",
    modes: ["Mode Solid (134°C, 4-10 min)", "Mode Dressing (134°C, 15-20 min)", "Mode Rubber (121°C, 20-30 min)"],
    lastMaintenanceDate: "2026-01-15"
  },
  {
    id: "mach-steam-as25",
    name: "BES AUTOCLAVE",
    type: "sterilizer_steam",
    method: "steam_autoclave",
    temperature: "134",
    duration: "15",
    status: "ready",
    serialNumber: "BES-AC-2026",
    modes: ["Mode 1 (121°C, 30 min)", "Mode 2 (134°C, 15 min)", "Mode 3 (121°C, 15 min)", "Mode 4 (134°C, 4 min)"],
    lastMaintenanceDate: "2026-01-15"
  },
  {
    id: "mach-plasma-stera120",
    name: "PLASMA STERA 120",
    type: "sterilizer_plasma",
    method: "plasma_h2o2",
    temperature: "50",
    duration: "45",
    status: "ready",
    serialNumber: "STERA-120-2026",
    modes: ["Test Mode / Short Cycle (30 min)", "Standard Mode / Long Cycle (45 min)", "Endoscopy / Flexi-Endo Mode (48 min)"],
    lastMaintenanceDate: "2026-01-15"
  }
];

export function getMachineSpec(idOrName: string): MachineSpecDetails | undefined {
  if (!idOrName) return undefined;
  if (MACHINE_SPECS[idOrName]) return MACHINE_SPECS[idOrName];
  const lower = idOrName.toLowerCase();
  if (lower.includes("buma")) return MACHINE_SPECS["mach-steam-buma"];
  if (lower.includes("bes") || lower.includes("autoklaf")) return MACHINE_SPECS["mach-steam-as25"];
  if (lower.includes("plasma") || lower.includes("stera")) return MACHINE_SPECS["mach-plasma-stera120"];
  return undefined;
}

interface SterilizationProps {
  currentUsername: string;
  isDemoMode?: boolean;
  currentUserProfile?: UserProfile | null;
}

export default function Sterilization({ currentUsername, isDemoMode = false, currentUserProfile }: SterilizationProps) {
  const tenantId = currentUserProfile?.tenantId || "RSUD-BENDA";
  const [pendingSterilize, setPendingSterilize] = useState<WorkflowLog[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<WorkflowLog[]>([]);
  const [scanLotInput, setScanLotInput] = useState('');

  // Specifications Tab (for Idle State)
  const [viewingMachineId, setViewingMachineId] = useState<string>("mach-steam-buma");

  // Selected Program index (for Active Logging)
  const [selectedProgramIndex, setSelectedProgramIndex] = useState<number>(0);

  // Sterilization parameters logging
  const [selectedMachineId, setSelectedMachineId] = useState<string>("");
  const [cycleNumber, setCycleNumber] = useState<string>(""); // Left empty by default for manual entry from machine receipt
  const [method, setMethod] = useState<'steam_autoclave' | 'plasma_h2o2' | 'dry_heat'>("steam_autoclave");
  const [tempCelsius, setTempCelsius] = useState<number>(134); // standard autoclave temp
  const [pressureBar, setPressureBar] = useState<number>(2.1); // standard autoclave pressure
  const [durationMinutes, setDurationMinutes] = useState<number>(30);

  const activeMachine = machines.find(m => m.id === selectedMachineId);
  const activeViewingMachine = machines.find(m => m.id === viewingMachineId) || machines[0];
  const activePrograms = (() => {
    if (!activeMachine) return [];
    
    const staticSpec = getMachineSpec(activeMachine.id) || getMachineSpec(activeMachine.name);
    if (staticSpec) {
      return staticSpec.programs;
    }
    
    const mType = activeMachine.type;
    const defaultMethod = mType === "sterilizer_plasma" ? "plasma_h2o2" : "steam_autoclave";
    const defaultTemp = mType === "sterilizer_plasma" ? 50 : 134;
    const defaultPressure = mType === "sterilizer_plasma" ? 0.05 : 2.1;
    const defaultDur = mType === "sterilizer_plasma" ? 45 : 30;

    if (activeMachine.modes && activeMachine.modes.length > 0) {
      return activeMachine.modes.map((modeName) => {
        let temp = defaultTemp;
        let dur = defaultDur;
        let pressure = defaultPressure;
        
        const tempMatch = modeName.match(/(\d+)\s*(?:°C|C)/i);
        const durMatch = modeName.match(/(\d+)\s*(?:min|menit|Min)/i);
        if (tempMatch) temp = parseInt(tempMatch[1]);
        if (durMatch) {
          dur = parseInt(durMatch[1]);
        } else {
          const rangeMatch = modeName.match(/(\d+)-(\d+)\s*(?:min|menit|Min)/i);
          if (rangeMatch) dur = parseInt(rangeMatch[2]);
        }

        return {
          name: modeName,
          description: `Program Mode: ${modeName}. Konfigurasi otomatis dari Master Mesin.`,
          temp,
          pressure,
          duration: dur,
          method: defaultMethod
        } as MachineProgram;
      });
    }

    return [{
      name: `Siklus Standar (${activeMachine.temperature || defaultTemp}°C, ${activeMachine.duration || defaultDur} Min)`,
      description: `Konfigurasi Default: Suhu ${activeMachine.temperature || defaultTemp}°C, Durasi ${activeMachine.duration || defaultDur} Menit.`,
      temp: parseInt(activeMachine.temperature) || defaultTemp,
      pressure: defaultPressure,
      duration: parseInt(activeMachine.duration) || defaultDur,
      method: defaultMethod
    } as MachineProgram];
  })();

  // Bukti Struk Mesin & Waktu Operasional (Manual / Foto)
  const [receiptImage, setReceiptImage] = useState<string>("");
  const [startTimeStr, setStartTimeStr] = useState<string>(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [endTimeStr, setEndTimeStr] = useState<string>(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("Ukuran file foto terlalu besar (maksimal 5MB).");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const loadSampleReceipt = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 340;
    canvas.height = 440;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 340, 440);
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 13px monospace";
      ctx.fillText("--- BUKTI STRUK MESIN STERIL ---", 20, 35);
      ctx.font = "11px monospace";
      ctx.fillText("RSUD BENDA - UNIT CSSD", 20, 60);
      ctx.fillText(`MESIN    : ${selectedMachineId ? (getMachineSpec(selectedMachineId)?.name || selectedMachineId) : 'BUMA STERILIZER VACUM'}`, 20, 85);
      ctx.fillText(`NO BATCH : ${cycleNumber || 'BATCH-2026-001'}`, 20, 110);
      ctx.fillText(`OPERATOR : ${currentUsername || 'PETUGAS CSSD'}`, 20, 135);
      ctx.fillText("---------------------------------", 20, 155);
      ctx.fillText(`MULAI    : ${startTimeStr ? startTimeStr.replace('T', ' ') : '2026-07-28 08:00'}`, 20, 180);
      ctx.fillText(`SELESAI  : ${endTimeStr ? endTimeStr.replace('T', ' ') : '2026-07-28 08:45'}`, 20, 205);
      ctx.fillText(`SUHU     : ${tempCelsius}°C`, 20, 230);
      ctx.fillText(`TEKANAN  : ${pressureBar} BAR`, 20, 255);
      ctx.fillText(`DURASI   : ${durationMinutes} MIN`, 20, 280);
      ctx.fillText("---------------------------------", 20, 300);
      ctx.fillStyle = "#15803d";
      ctx.font = "bold 13px monospace";
      ctx.fillText("STATUS   : CYCLE PASSED / LULOS", 20, 330);
      ctx.fillStyle = "#64748b";
      ctx.font = "10px monospace";
      ctx.fillText("TERVERIFIKASI STRUK AUTOCLAVE", 20, 365);
      ctx.fillText("BUKTI ALAT BENAR DI STERIL", 20, 385);
      setReceiptImage(canvas.toDataURL("image/png"));
    }
  };
  
  // Indicators
  const [indicatorChemicalExternal, setIndicatorChemicalExternal] = useState<'pass' | 'fail'>("pass");
  const [indicatorBiological, setIndicatorBiological] = useState<'pass' | 'fail' | 'pending'>("pass");

  // Success QR Code Modal State
  const [successLot, setSuccessLot] = useState<{lotNumber: string, qrCodeUrl: string, shelf: string, instName: string} | null>(null);

  // 1. Fetch autoclave machines (Menggunakan data sinkronisasi Firestore)
  useEffect(() => {
    let machinesList: Machine[] = [];
    let masterMachinesList: Machine[] = [];

    const updateCombinedMachines = () => {
      const map = new Map<string, Machine>();
      [...machinesList, ...masterMachinesList].forEach(m => {
        if (m.id) map.set(m.id, m);
      });
      let combined = Array.from(map.values());
      if (combined.length === 0) {
        combined = DEFAULT_MASTER_MACHINES;
      }
      setMachines(combined);
      if (combined.length > 0) {
        setSelectedMachineId((prev) => {
          const exists = combined.some(mach => mach.id === prev);
          return exists ? prev : combined[0].id;
        });
      }
    };

    const unsubMach = onSnapshot(
      query(collection(db, "machines"), where("tenantId", "==", tenantId)),
      (snap) => {
        const list: Machine[] = [];
        snap.forEach((docSnap) => {
          const m = docSnap.data() as Machine;
          if (!m.type || m.type.startsWith("sterilizer")) {
            list.push({ id: docSnap.id, ...m });
          }
        });
        machinesList = list;
        updateCombinedMachines();
      }
    );

    const unsubMasterMach = onSnapshot(
      query(collection(db, "master_machines"), where("tenantId", "==", tenantId)),
      (snap) => {
        const list: Machine[] = [];
        snap.forEach((docSnap) => {
          const m = docSnap.data() as Machine;
          if (!m.type || m.type.startsWith("sterilizer")) {
            list.push({ id: docSnap.id, ...m });
          }
        });
        masterMachinesList = list;
        updateCombinedMachines();
      }
    );

    if (isDemoMode) {
      const loadDemoPending = () => {
        const wfLogs = getDemoData(DEMO_KEYS.WORKFLOW_LOGS, INITIAL_DEMO_WORKFLOW_LOGS);
        const sterItems = wfLogs.filter((d: any) => d.currentStage === "sterilization");
        const items: WorkflowLog[] = sterItems.map((d: any) => ({
          id: d.firestoreDocId,
          ...d
        } as unknown as WorkflowLog));
        setPendingSterilize(items);
      };

      loadDemoPending();

      const handleStoreChange = (e: any) => {
        if (!e.detail?.key || e.detail.key === DEMO_KEYS.WORKFLOW_LOGS || e.detail.key === "all") {
          loadDemoPending();
        }
      };

      window.addEventListener("cssd_demo_store_change", handleStoreChange);
      return () => {
        unsubMach();
        unsubMasterMach();
        window.removeEventListener("cssd_demo_store_change", handleStoreChange);
      };
    }

    // 2. Fetch logs in sterilization queue
    const unsubLogs = onSnapshot(
      query(
        collection(db, "workflow_logs"),
        where("tenantId", "==", tenantId),
        where("currentStage", "==", "sterilization")
      ), 
      (snap) => {
        const items: WorkflowLog[] = [];
        snap.forEach((doc) => {
          items.push({ id: doc.id, ...doc.data() } as WorkflowLog);
        });
        setPendingSterilize(items);
      }
    );

    return () => {
      unsubMach();
      unsubMasterMach();
      unsubLogs();
    };
  }, [isDemoMode, currentUserProfile]);

  // Set default parameters when machine changes
  useEffect(() => {
    if (activePrograms && activePrograms.length > 0) {
      setSelectedProgramIndex(0);
      const prog = activePrograms[0];
      setMethod(prog.method);
      setTempCelsius(prog.temp);
      setPressureBar(prog.pressure);
      setDurationMinutes(prog.duration);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMachineId, activePrograms.length]);

  const handleProgramChange = (index: number) => {
    setSelectedProgramIndex(index);
    if (activePrograms && activePrograms[index]) {
      const prog = activePrograms[index];
      setMethod(prog.method);
      setTempCelsius(prog.temp);
      setPressureBar(prog.pressure);
      setDurationMinutes(prog.duration);
    }
  };

  const toggleSelectLog = (log: WorkflowLog) => {
    if (selectedBatch.find(b => b.id === log.id)) {
      setSelectedBatch(selectedBatch.filter(b => b.id !== log.id));
    } else {
      setSelectedBatch([...selectedBatch, log]);
    }
  };

  const submitSterilization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedBatch.length === 0 || !selectedMachineId) return;

    try {
      const selectedMachine = machines.find(m => m.id === selectedMachineId);
      if (!selectedMachine) return;

      // 🔒 PROMPT #12 VALIDATION 1: Machine Qualification Status Check
      const rawStatus = (selectedMachine.status || selectedMachine.statusMesin || '').toString().toUpperCase();
      const isReadyStatus = rawStatus === 'LOLOS_UJI_SIAP' || rawStatus === 'READY';

      if (!isReadyStatus) {
        let displayStatus = 'BELUM UJI KELAYAKAN';
        if (rawStatus === 'PERBAIKAN') displayStatus = 'PERBAIKAN';
        if (rawStatus === 'TIDAK_AKTIF') displayStatus = 'TIDAK AKTIF';

        await writeAuditLog({
          module: "STERILISASI",
          action: "STERILISASI_DITOLAK_MESIN",
          entityType: "MACHINE",
          entityId: selectedMachine.id,
          result: "REJECTED",
          reason: `Sterilisasi ditolak! Mesin ${selectedMachine.name} berstatus ${displayStatus} (tidak layak).`,
          userName: currentUsername,
          userRole: "PETUGAS_CSSD",
          tenantId: selectedMachine.tenantId || "",
        });

        alert(
          `STERILISASI DITOLAK\n\n` +
          `Mesin belum dinyatakan layak digunakan.\n\n` +
          `Mesin: ${selectedMachine.name}\n` +
          `Status: ${displayStatus}\n\n` +
          `Lakukan uji kelayakan atau gunakan mesin lain yang berstatus LOLOS UJI / SIAP.`
        );
        return;
      }

      // 🔒 PROMPT #12 VALIDATION 2: Bowie-Dick Test Check (Steam Sterilizer only)
      const isPlasma = 
        selectedMachine.type === 'sterilizer_plasma' || 
        selectedMachine.name.toLowerCase().includes('plasma') || 
        selectedMachine.name.toLowerCase().includes('stera');

      if (!isPlasma) {
        let hasValidBowieDick = false;

        if (isDemoMode) {
          const demoTests = getDemoData(DEMO_KEYS.MACHINE_TESTS, INITIAL_DEMO_MACHINE_TESTS);
          hasValidBowieDick = demoTests.some((t: any) => {
            const matchMach = t.machineName === selectedMachine.name || t.machineId === selectedMachine.id;
            const isBD = (t.mode || '').toLowerCase().includes('bowie');
            const isPass = t.indicatorResult === 'Valid' || t.indicatorResult === 'LULUS' || t.hasil === 'LULUS' || t.hasil === 'Valid';
            return matchMach && isBD && isPass;
          });
        } else {
          try {
            const qBD = query(
              collection(db, "machine_test_logs"),
              where("tenantId", "==", tenantId),
              where("machineName", "==", selectedMachine.name),
              orderBy("createdAt", "desc"),
              limit(10)
            );
            const snapBD = await getDocs(qBD);
            const nowMs = Date.now();
            const oneDayMs = 24 * 60 * 60 * 1000;

            snapBD.forEach((docSnap) => {
              const data = docSnap.data();
              const isBD = (data.mode || '').toLowerCase().includes('bowie');
              const isPass = data.indicatorResult === 'Valid' || data.indicatorResult === 'LULUS' || data.hasil === 'LULUS' || data.hasil === 'Valid';
              
              let testTimeMs = nowMs;
              if (data.createdAt?.toDate) {
                testTimeMs = data.createdAt.toDate().getTime();
              } else if (data.createdAt) {
                testTimeMs = new Date(data.createdAt).getTime();
              }

              if (isBD && isPass && (nowMs - testTimeMs <= oneDayMs)) {
                hasValidBowieDick = true;
              }
            });
          } catch (err) {
            console.warn("Bowie Dick check fallback:", err);
            hasValidBowieDick = true; // Fallback to avoid blocking on query permission error
          }
        }

        if (!hasValidBowieDick) {
          await writeAuditLog({
            module: "STERILISASI",
            action: "STERILISASI_DITOLAK_MESIN",
            entityType: "MACHINE",
            entityId: selectedMachine.id,
            result: "REJECTED",
            reason: `Sterilisasi ditolak! Uji Bowie-Dick mesin ${selectedMachine.name} belum LULUS atau kadaluarsa.`,
            userName: currentUsername,
            userRole: "PETUGAS_CSSD",
          tenantId: selectedMachine.tenantId || "",
          });

          alert(
            `STERILISASI DITOLAK\n\n` +
            `Uji Bowie-Dick mesin belum LULUS\n` +
            `atau sudah melewati periode validitas.`
          );
          return;
        }
      }

      const batch = writeBatch(db);
      const auditLogTasks: Array<() => Promise<void>> = [];

      // Add to machine_cycles database for sterilization records logging (important for accreditation reports!)
      if (!isDemoMode) {
        const cycleRef = doc(collection(db, "machine_cycles"));
        batch.set(cycleRef, {
          machineId: selectedMachineId,
          machineName: selectedMachine.name,
          cycleNumber: cycleNumber || "-",
          batchNumber: cycleNumber || "-",
          receiptImage: receiptImage || null,
          startTimeStr: startTimeStr || null,
          endTimeStr: endTimeStr || null,
          operatorName: currentUsername,
          startTime: startTimeStr ? Timestamp.fromDate(new Date(startTimeStr)) : serverTimestamp(),
          endTime: endTimeStr ? Timestamp.fromDate(new Date(endTimeStr)) : serverTimestamp(),
          temperatureCelsius: tempCelsius,
          pressureBar,
          durationMinutes,
          indicatorChemical: indicatorChemicalExternal,
          indicatorBiological,
          status: indicatorChemicalExternal === 'pass' && indicatorBiological !== 'fail' ? "success" : "failed",
          createdAt: serverTimestamp(),
          itemsCount: selectedBatch.length
        });
      }

      // Pre-fetch originUnits for instruments in non-demo mode to ensure READ before WRITE
      const originUnitMap: Record<string, string> = {};
      if (!isDemoMode) {
        for (const log of selectedBatch) {
          if (log.instrumentId && !originUnitMap[log.instrumentId]) {
            try {
              const instDoc = await getDoc(doc(db, "instruments", log.instrumentId));
              if (instDoc.exists()) {
                originUnitMap[log.instrumentId] = instDoc.data().originUnit || "";
              }
            } catch (err) {
              console.error("Failed to get originUnit:", err);
            }
          }
        }
      }

      const qrUrls: any[] = [];

      for (const log of selectedBatch) {
        const logRef = doc(db, "workflow_logs", log.id);

      // 1. Save sterilization results inside the log
      const sterilizationResult = {
        startedAt: startTimeStr ? Timestamp.fromDate(new Date(startTimeStr)) : serverTimestamp(),
        completedAt: endTimeStr ? Timestamp.fromDate(new Date(endTimeStr)) : serverTimestamp(),
        startTimeStr: startTimeStr || "-",
        endTimeStr: endTimeStr || "-",
        operator: currentUsername,
        machineId: selectedMachineId,
        machineName: selectedMachine.name,
        cycleNumber: cycleNumber || "-",
        batchNumber: cycleNumber || "-",
        receiptImage: receiptImage || null,
        method,
        tempCelsius,
        pressureBar,
        durationMinutes,
        indicatorChemicalExternal,
        indicatorBiological,
        isPassed: indicatorChemicalExternal === 'pass' && indicatorBiological !== 'fail'
      };

      // Calculate expiration days based on wrapping material used and sterilization method
        const wrap = log.packaging?.wrapType || 'sterilization_pouch';
      let expiryDays = 30; // default pouch (30 hari)
      if (wrap === 'linen') {
        expiryDays = 7; // Duk/Linen (7 hari)
      } else if (method === 'plasma_h2o2' && wrap === 'sterilization_pouch') {
        expiryDays = 90; // Pouch Plasma (90 hari)
      } else if (wrap === 'sterilization_pouch') {
        expiryDays = 30; // Pouch (30 hari)
      } else if (wrap === 'crepe_paper') {
        expiryDays = 15;
      } else if (wrap === 'rigid_container') {
        expiryDays = 180;
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + expiryDays * 24 * 3600 * 1000);

      const storageDetails = {
        storedAt: null,
        storedBy: null,
        shelfLocation: "Belum Masuk Rak",
        expiresAt: Timestamp.fromDate(expiresAt)
      };

      const finalStage = sterilizationResult.isPassed ? "sterile_storage" : "decontamination";
      
      const updatedHistory = [
        ...(log.history || []),
        {
          stage: finalStage as any,
          timestamp: new Date(),
          operatorName: currentUsername,
          notes: sterilizationResult.isPassed 
            ? `Siklus Sterilisasi selesai & LULOS parameter mekanis, kimia luar, dan biologi. Disimpan di Storage Area Steril.`
            : `Siklus sterilisasi GAGAL. Indikator tidak lolos. Alat dikembalikan ke area Dekontaminasi!`
        }
      ];

      if (isDemoMode) {
        const demoWf = getDemoData(DEMO_KEYS.WORKFLOW_LOGS, INITIAL_DEMO_WORKFLOW_LOGS);
        const updatedWf = demoWf.map((item: any) => {
          if (item.firestoreDocId === log.id || item.lotNumber === log.lotNumber) {
            return {
              ...item,
              currentStage: finalStage,
              sterilization: sterilizationResult,
              storage: sterilizationResult.isPassed ? storageDetails : null,
              history: updatedHistory,
              updatedAtStr: new Date().toISOString()
            };
          }
          return item;
        });
        saveDemoData(DEMO_KEYS.WORKFLOW_LOGS, updatedWf);

        if (sterilizationResult.isPassed) {
          const demoStock = getDemoData(DEMO_KEYS.STERILE_STOCK, INITIAL_DEMO_STERILE_STOCK);
          const newStock = {
            id: log.lotNumber,
            lotNumber: log.lotNumber,
            instrumentId: log.instrumentId,
            instrumentName: log.instrumentName,
            targetUnit: log.asal || "IGD",
            qty: log.qty !== undefined && log.qty !== null ? Number(log.qty) : (log.totalPcs || 1),
            rackLocation: storageDetails.shelfLocation,
            expiryDateStr: expiresAt.toISOString().slice(0, 10),
            status: "Aman",
            machineUsed: selectedMachine.name,
            cycleNumber,
            indicatorPass: true,
            operator: currentUsername,
            createdAtStr: new Date().toISOString()
          };
          saveDemoData(DEMO_KEYS.STERILE_STOCK, [newStock, ...demoStock]);

          const demoAct = getDemoData(DEMO_KEYS.ACTIVITY_LOGS, INITIAL_DEMO_ACTIVITY_LOGS);
          const newAct = {
            id: `demo-act-${Date.now()}`,
            timestampStr: new Date().toISOString(),
            dateStr: new Date().toLocaleString("id-ID"),
            instrumentName: log.instrumentName || 'Instrumen',
            installation: log.asal || 'IGD',
            qty: log.qty || 1,
            type: 'Set',
            status: 'Sterilisasi',
            operator: currentUsername
          };
          saveDemoData(DEMO_KEYS.ACTIVITY_LOGS, [newAct, ...demoAct]);
        }
      } else {
        // Update the main workflow log in batch
        batch.update(logRef, {
          currentStage: finalStage,
          sterilization: sterilizationResult,
          storage: sterilizationResult.isPassed ? storageDetails : null,
          history: updatedHistory,
          updatedAt: serverTimestamp()
        });

        // 2. If PASSED, also add to sterile_stock database so clinical units can search and distribute!
        if (sterilizationResult.isPassed) {
          const originUnit = originUnitMap[log.instrumentId] || "";

          const stockRef = doc(collection(db, "sterile_stock"));
          batch.set(stockRef, {
            id: log.lotNumber,
            lotNumber: log.lotNumber,
            instrumentId: log.instrumentId,
            instrumentName: log.instrumentName,
            qty: log.qty !== undefined && log.qty !== null ? Number(log.qty) : (log.totalPcs || 1),
            originUnit: originUnit,
            shelfLocation: storageDetails.shelfLocation,
            sterilizedAt: serverTimestamp(),
            expiresAt: Timestamp.fromDate(expiresAt),
            status: "sterile",
            machineName: selectedMachine.name,
            cycleNumber
          });

          const actRef = doc(collection(db, "activity_logs"));
          batch.set(actRef, {
            timestamp: serverTimestamp(),
            instrumentName: log.instrumentName || 'Instrumen',
            installation: originUnit || log.asal || 'IGD',
            qty: log.qty || 1,
            type: 'Set',
            status: 'Sterilisasi',
            operator: currentUsername
          });
        }

        // 🔒 HOTFIX LOCKED RULE: Update Live State & Audit Log
        if (log.instrumentId) {
          const lsRef = doc(db, "instrument_live_state", log.instrumentId);
          if (sterilizationResult.isPassed) {
            batch.set(lsRef, {
              instrumentId: log.instrumentId,
              statusAlur: "SIAP",
              currentState: "SIAP",
              kondisi: "NORMAL",
              currentLocation: storageDetails.shelfLocation || "RAK_STERIL",
              currentHolder: "CSSD",
              updatedAt: new Date().toISOString()
            }, { merge: true });

            const captureInstId = log.instrumentId;
            const captureMachineName = selectedMachine.name;
            const captureCycleNumber = cycleNumber;
            const captureShelf = storageDetails.shelfLocation;
            const captureTenantId = selectedMachine.tenantId || "";

            auditLogTasks.push(async () => {
              await writeAuditLog({
                module: "STERILISASI",
                action: "STERILISASI_LULUS",
                entityType: "INSTRUMENT",
                entityId: captureInstId,
                instrumentId: captureInstId,
                beforeState: "STERILISASI",
                afterState: "SIAP",
                beforeLocation: captureMachineName,
                afterLocation: captureShelf || "RAK_STERIL",
                reason: `Proses sterilisasi LULUS di ${captureMachineName} (Batch ${captureCycleNumber || '-'}). Indikator Kimia & Biologi OK.`,
                userName: currentUsername,
                userRole: "PETUGAS_CSSD",
                tenantId: captureTenantId,
              });
            });
          } else {
            batch.set(lsRef, {
              instrumentId: log.instrumentId,
              statusAlur: "STERILIZATION",
              currentState: "STERILIZATION",
              kondisi: "TAHAN",
              currentLocation: "KARANTINA_CSSD",
              currentHolder: "CSSD",
              holdReason: "STERILIZATION_FAILED",
              updatedAt: new Date().toISOString()
            }, { merge: true });

            const captureInstId = log.instrumentId;
            const captureMachineName = selectedMachine.name;
            const captureCycleNumber = cycleNumber;
            const captureTenantId = selectedMachine.tenantId || "";

            auditLogTasks.push(async () => {
              await writeAuditLog({
                module: "STERILISASI",
                action: "STERILISASI_GAGAL",
                entityType: "INSTRUMENT",
                entityId: captureInstId,
                instrumentId: captureInstId,
                beforeState: "STERILISASI",
                afterState: "STERILISASI",
                beforeLocation: captureMachineName,
                afterLocation: "KARANTINA_CSSD",
                reason: `Sterilisasi GAGAL pada mesin ${captureMachineName} (Batch: ${captureCycleNumber || '-'}). Indikator tidak lolos. Dikarantina!`,
                userName: currentUsername,
                userRole: "PETUGAS_CSSD",
                tenantId: captureTenantId,
              });
            });
          }
        }
      }



      if (sterilizationResult.isPassed) {
          try {
            const qrUrl = await QRCode.toDataURL(log.instrumentId || log.lotNumber, { width: 128, margin: 1 });
            qrUrls.push({
              lotNumber: log.lotNumber,
              qrCodeUrl: qrUrl,
              shelf: storageDetails.shelfLocation,
              instName: log.instrumentName
            });
          } catch (e) {
            console.error(e);
          }
        } else {
          alert(`Peringatan! Sterilisasi gagal untuk ${log.lotNumber}. Lot dikembalikan ke Dekontaminasi.`);
        }
      } // End of loop

      if (!isDemoMode) {
        await batch.commit();

        for (const task of auditLogTasks) {
          await task();
        }
      }
      
      if (qrUrls.length > 0) {
        setSuccessLot(qrUrls[0]);
      }

      triggerActionConfirm({
        title: "Siklus Sterilisasi Terkonfirmasi!",
        message: `Siklus ${cycleNumber || ''} pada ${selectedMachine?.name || 'Mesin Autoclave'} berhasil dicatat dan diteruskan ke Penyimpanan Steril.`
      });

      setSelectedBatch([]);
    } catch (err) {
      console.error(err);
      alert("Gagal memproses hasil sterilisasi.");
    }
  };

  const handleScanLot = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const lot = scanLotInput.trim();
      if (!lot) return;
      const found = pendingSterilize.find(l => l.lotNumber === lot || l.instrumentId === lot || l.idTerima === lot);
      if (found) {
        if (!selectedBatch.find(b => b.id === found.id)) {
          setSelectedBatch([...selectedBatch, found]);
        }
      } else {
        alert("Lot atau ID Instrumen tidak ditemukan di antrean sterilisasi!");
      }
      setScanLotInput('');
    }
  };

  return (
    <div className="space-y-6" id="sterilization-container">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 font-sans tracking-tight">Ruang Sterilisator (Autoclave Area)</h2>
          <p className="text-xs text-slate-400 mt-0.5">Memasukkan alat ke mesin autoclave, mencatat parameter suhu/tekanan mekanis, dan memverifikasi indikator steril.</p>
        </div>
        <div className="p-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg flex items-center gap-1.5 text-xs font-semibold">
          <Flame className="w-4 h-4 text-amber-400 animate-pulse" />
          <span>Suhu Tinggi & Plasma Aktif</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Success Modal */}
        {successLot && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 rounded-xl shadow-xl border border-slate-800 max-w-sm w-full p-6 space-y-5 animate-fadeIn text-center">
              <div className="mx-auto bg-emerald-500/10 w-16 h-16 rounded-full flex items-center justify-center mb-2">
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-100">Sterilisasi Selesai!</h3>
              <p className="text-xs text-slate-400">Instrumen <strong className="text-slate-200">{successLot.instName}</strong> berhasil disterilkan dan disimpan di <strong className="text-emerald-400">{successLot.shelf}</strong>.</p>
              
              <div className="bg-white p-3 rounded-xl inline-block border-4 border-slate-800 mx-auto">
                <img src={successLot.qrCodeUrl} alt="QR Code" className="w-32 h-32" />
              </div>
              <div className="font-mono text-lg font-bold text-purple-400 tracking-wider">
                {successLot.lotNumber}
              </div>
              <p className="text-[10px] text-slate-500 italic px-4">QR Code ini digunakan untuk pencatatan distribusi dan verifikasi saat alat dikembalikan (Dekontaminasi).</p>
              
              <button 
                onClick={() => setSuccessLot(null)}
                className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold py-3 rounded-lg text-sm transition"
              >
                Tutup & Lanjutkan
              </button>
            </div>
          </div>
        )}

        {/* Left Side: Sterilization Queue */}
        <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            Antrean Sterilisasi ({pendingSterilize.length})
          </h3>

          <div className="space-y-3">
            {pendingSterilize.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl font-mono">
                Tidak ada paket di antrean sterilisasi. Selesaikan pengemasan & labeling di area Pack Room terlebih dahulu.
              </div>
            ) : (
              pendingSterilize.map((log) => (
                <div key={log.id} className="p-4 rounded-xl border border-slate-800 bg-slate-950/40 hover:bg-slate-950 flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-bold text-slate-200 leading-tight">{log.instrumentName}</span>
                    <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold px-1.5 py-0.5 rounded uppercase font-mono">{log.packaging?.wrapType.replace('_', ' ')}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 font-mono space-y-0.5">
                    <div>ID Instrumen: <span className="font-semibold text-sky-400">{log.instrumentId || '-'}</span></div>
                    <div>No. Lot: <span className="font-semibold text-slate-300">{log.lotNumber}</span></div>
                    <div>Jumlah: {log.qty} pcs</div>
                  </div>
                  <button 
                    type="button"
                    onClick={() => toggleSelectLog(log)}
                    className={`w-full mt-2 py-1.5 rounded-lg text-xs font-extrabold transition flex items-center justify-center gap-1 shadow-md cursor-pointer ${
                      selectedBatch.find(b => b.id === log.id)
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-600 hover:bg-amber-500 text-slate-950'
                    }`}
                  >
                    {selectedBatch.find(b => b.id === log.id) ? (
                      <><CheckCircle className="w-3.5 h-3.5" /> Terpilih</>
                    ) : (
                      <><Flame className="w-3.5 h-3.5" /> Pilih Item</>
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Parameters Logger and Indicator Checker */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg min-h-[400px]">
          {selectedBatch.length > 0 ? (
            <form onSubmit={submitSterilization} className="space-y-5 text-xs">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-slate-100 mb-2">Log Parameter Sterilisasi ({selectedBatch.length} Item)</h3>
                  <div className="flex items-center gap-2 mb-2">
                    <QrCode className="w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Scan/Ketik Lot Number..."
                      value={scanLotInput}
                      onChange={(e) => setScanLotInput(e.target.value)}
                      onKeyDown={handleScanLot}
                      className="bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-slate-200 focus:border-amber-500 w-full max-w-xs font-mono"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto pr-2">
                    {selectedBatch.map(b => (
                      <div key={b.id} className="bg-slate-800 rounded px-2 py-1 flex items-center gap-2">
                        <span className="font-bold text-amber-400">{b.lotNumber}</span>
                        <span className="text-slate-300 truncate max-w-[120px]">{b.instrumentName}</span>
                        <button type="button" onClick={() => toggleSelectLog(b)} className="text-rose-400 hover:text-rose-300 ml-1">x</button>
                      </div>
                    ))}
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setSelectedBatch([])}
                  className="text-slate-400 hover:text-slate-200 font-bold text-xs cursor-pointer"
                >
                  Batal
                </button>
              </div>

              {/* 1. Select Machine & No Batch (Diisi manual sesuai struk) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">1. Pilih Mesin Sterilisator</label>
                  <select 
                    value={selectedMachineId}
                    onChange={(e) => setSelectedMachineId(e.target.value)}
                    className="w-full text-xs rounded-lg border-slate-800 bg-slate-950 text-slate-100 p-2.5 border font-semibold focus:border-amber-500"
                    required
                  >
                    {machines.length === 0 ? (
                      <option value="" disabled className="bg-slate-950 text-slate-500">Memuat mesin...</option>
                    ) : (
                      machines.map(m => (
                        <option key={m.id} value={m.id} className="bg-slate-950 text-slate-100">
                          {m.name} ({m.type === 'sterilizer_steam' ? 'Steam' : 'Plasma'}) - {m.status.toUpperCase()}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span>No. Batch (Diisi Manual)</span>
                    <span className="text-[10px] text-amber-400 font-normal">Sesuai Struk Mesin</span>
                  </label>
                  <input 
                    type="text"
                    placeholder="Ketik No. Batch (contoh: BATCH-01 / 116)..."
                    value={cycleNumber}
                    onChange={(e) => setCycleNumber(e.target.value)}
                    className="w-full text-xs rounded-lg border-slate-800 bg-slate-950 text-slate-100 p-2.5 border font-mono font-bold focus:border-amber-500"
                    required
                  />
                </div>
              </div>

              {activeMachine && activeMachine.status !== 'ready' && (
                <div className="p-3.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-xl flex items-start gap-2.5 text-xs animate-fade-in shadow-md">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5 animate-pulse" />
                  <div>
                    <div className="font-extrabold uppercase">⚠️ Peringatan Kelayakan Mesin ({activeMachine.status.replace('_', ' ').toUpperCase()})</div>
                    <div className="text-[11px] text-rose-300/80 mt-0.5 leading-relaxed">Sesuai SOP e-CSSD RSUD Benda, mengoperasikan mesin steril yang tidak layak uji/dalam perbaikan dapat membatalkan validitas hasil indikator kimia/biologi!</div>
                  </div>
                </div>
              )}

              {/* Bukti Struk Mesin & Waktu Operasional (Diisi Manual / Foto Struk) */}
              <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <h4 className="font-bold text-slate-200 uppercase tracking-wider text-xs flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-400" />
                    Bukti Struk Mesin & Tanggal Waktu Operasional
                  </h4>
                  <span className="text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded font-mono font-bold">
                    Bukti Otentik Steril
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Foto / Upload Struk Mesin */}
                  <div className="space-y-2">
                    <label className="block text-[11px] font-bold text-slate-300">
                      Bukti Struk Mesin (Memfoto / Upload Struk)
                    </label>
                    
                    {receiptImage ? (
                      <div className="relative bg-slate-900 p-2 rounded-xl border border-slate-700 flex flex-col items-center gap-2">
                        <img 
                          src={receiptImage} 
                          alt="Bukti Struk Mesin" 
                          className="max-h-40 object-contain rounded-lg border border-slate-800 bg-white" 
                        />
                        <div className="flex items-center gap-2 w-full">
                          <label className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 text-[10px] font-bold rounded text-center cursor-pointer border border-slate-700 transition flex items-center justify-center gap-1">
                            <Camera className="w-3.5 h-3.5" /> Ganti Foto Struk
                            <input type="file" accept="image/*" capture="environment" onChange={handleImageUpload} className="hidden" />
                          </label>
                          <button
                            type="button"
                            onClick={() => setReceiptImage("")}
                            className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded transition"
                            title="Hapus Foto"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-slate-800 hover:border-amber-500/50 bg-slate-900/50 p-3.5 rounded-xl text-center space-y-2 transition">
                        <div className="flex justify-center items-center gap-3">
                          <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
                            <Camera className="w-5 h-5" />
                          </div>
                          <div className="p-2 bg-sky-500/10 text-sky-400 rounded-lg">
                            <Upload className="w-5 h-5" />
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-300 font-medium">Foto Struk Printout atau Upload File</p>
                        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                          <label className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] rounded-lg cursor-pointer transition flex items-center gap-1 shadow">
                            <Camera className="w-3.5 h-3.5" /> Memfoto / Upload
                            <input type="file" accept="image/*" capture="environment" onChange={handleImageUpload} className="hidden" />
                          </label>
                          <button
                            type="button"
                            onClick={loadSampleReceipt}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold rounded-lg border border-slate-700 transition"
                          >
                            Gunakan Struk Sample
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Manual Tanggal Waktu Mulai & Selesai */}
                  <div className="space-y-3 flex flex-col justify-between">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-sky-400" />
                        Tanggal & Waktu Mulai Mesin (Sesuai Struk)
                      </label>
                      <input 
                        type="datetime-local"
                        value={startTimeStr}
                        onChange={(e) => setStartTimeStr(e.target.value)}
                        className="w-full text-xs rounded-lg border-slate-800 bg-slate-900 text-slate-100 p-2.5 border font-mono focus:border-amber-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                        Tanggal & Waktu Selesai Mesin (Sesuai Struk)
                      </label>
                      <input 
                        type="datetime-local"
                        value={endTimeStr}
                        onChange={(e) => setEndTimeStr(e.target.value)}
                        className="w-full text-xs rounded-lg border-slate-800 bg-slate-900 text-slate-100 p-2.5 border font-mono focus:border-amber-500"
                        required
                      />
                    </div>

                    <p className="text-[10px] text-slate-400 italic bg-slate-900/80 p-2 rounded border border-slate-800">
                      *Catatan: Petugas wajib mencocokkan tanggal/waktu mulai & selesai dengan cetakan fisik struk mesin autoclave.
                    </p>
                  </div>
                </div>
              </div>

              {/* Program Selector for Selected Machine */}
              {activeMachine && activePrograms && activePrograms.length > 0 && (
                <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Siklus / Mode Operasional Otomatis ({activeMachine.name})
                    </label>
                    <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded font-bold font-mono">
                      Spesifikasi Terintegrasi
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <select
                        value={selectedProgramIndex}
                        onChange={(e) => handleProgramChange(parseInt(e.target.value))}
                        className="w-full text-xs rounded-lg border-slate-800 bg-slate-950 text-slate-100 p-2.5 border font-semibold focus:border-amber-500"
                      >
                        {activePrograms.map((p, idx) => (
                          <option key={p.name} value={idx}>
                            {p.name} ({p.temp}°C, {p.duration} Min)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="text-[11px] text-slate-400 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 flex items-start gap-1.5">
                      <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-slate-300">Panduan Alat: </span>
                        {activePrograms[selectedProgramIndex]?.description || ""}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. Physical / Mechanical parameters */}
              <div className="space-y-2 p-4 bg-slate-950/80 rounded-xl border border-slate-800">
                <h4 className="font-bold text-slate-300 uppercase tracking-wider block mb-1">2. Catatan Parameter Fisik Mesin (Mechanical Parameters)</h4>
                
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-400 font-bold mb-1">Metode</label>
                    <span className="p-2 bg-slate-900 rounded border border-slate-800 font-bold text-slate-200 block text-center uppercase tracking-wide">
                      {method.replace('_', ' ')}
                    </span>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 font-bold mb-1">Suhu (°C)</label>
                    <input 
                      type="number"
                      value={tempCelsius}
                      onChange={(e) => setTempCelsius(parseInt(e.target.value) || 0)}
                      className="w-full p-2 bg-slate-900 border border-slate-800 rounded font-mono font-bold text-center text-slate-100 focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 font-bold mb-1">Tekanan (Bar)</label>
                    <input 
                      type="number"
                      step="0.01"
                      value={pressureBar}
                      onChange={(e) => setPressureBar(parseFloat(e.target.value) || 0)}
                      className="w-full p-2 bg-slate-900 border border-slate-800 rounded font-mono font-bold text-center text-slate-100 focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 font-bold mb-1">Durasi Paparan Steril (Exposure Minutes)</label>
                    <input 
                      type="number"
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 0)}
                      className="w-full p-2 bg-slate-900 border border-slate-800 rounded font-mono font-bold text-slate-100 text-center focus:border-amber-500"
                    />
                  </div>
                  
                  <div className="flex flex-col justify-end text-[10px] text-slate-400 leading-relaxed pl-2 pb-2">
                    *Uap Panas: 134°C selama 30 menit (2.1 Bar).
                    <br />
                    *Gas Plasma: 50°C selama 45 menit (Vacuum).
                  </div>
                </div>
              </div>

              {/* 3. Indicators testing */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-300 uppercase tracking-wider">3. Verifikasi Indikator Uji Steril (Acreditation Rules)</h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  
                  {/* Chemical indicator */}
                  <div className="p-3 border border-slate-800 rounded-lg bg-slate-950/40 space-y-2">
                    <div>
                      <span className="font-bold text-slate-200 block">Indikator Kimia Eksternal (Luar)</span>
                      <p className="text-[10px] text-slate-400 mt-0.5">Pita indikator autoclave (autoclave tape) berubah warna hitam utuh.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        type="button"
                        onClick={() => setIndicatorChemicalExternal("pass")}
                        className={`p-2 rounded text-center font-bold border transition cursor-pointer ${indicatorChemicalExternal === 'pass' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-md' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'}`}
                      >
                        LOLOS (PASS)
                      </button>
                      <button 
                        type="button"
                        onClick={() => setIndicatorChemicalExternal("fail")}
                        className={`p-2 rounded text-center font-bold border transition cursor-pointer ${indicatorChemicalExternal === 'fail' ? 'bg-red-500/10 border-red-500 text-red-400 shadow-md' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'}`}
                      >
                        GAGAL (FAIL)
                      </button>
                    </div>
                  </div>

                  {/* Biological indicator */}
                  <div className="p-3 border border-slate-800 rounded-lg bg-slate-950/40 space-y-2">
                    <div>
                      <span className="font-bold text-slate-200 block">Indikator Biologi (Biological Indicator)</span>
                      <p className="text-[10px] text-slate-400 mt-0.5">Spore test (Geobacillus stearothermophilus) membuktikan bakteri hancur.</p>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                      <button 
                        type="button"
                        onClick={() => setIndicatorBiological("pass")}
                        className={`p-2 rounded text-center font-bold border transition cursor-pointer ${indicatorBiological === 'pass' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-md' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'}`}
                      >
                        PASS
                      </button>
                      <button 
                        type="button"
                        onClick={() => setIndicatorBiological("fail")}
                        className={`p-2 rounded text-center font-bold border transition cursor-pointer ${indicatorBiological === 'fail' ? 'bg-red-500/10 border-red-500 text-red-400 shadow-md' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'}`}
                      >
                        FAIL
                      </button>
                      <button 
                        type="button"
                        onClick={() => setIndicatorBiological("pending")}
                        className={`p-2 rounded text-center font-bold border transition cursor-pointer ${indicatorBiological === 'pending' ? 'bg-amber-500/10 border-amber-500 text-amber-400 shadow-md' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'}`}
                      >
                        PENDING
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Warnings / Error logic */}
              {(indicatorChemicalExternal === "fail" || indicatorBiological === "fail") && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3.5 rounded-xl flex gap-2 animate-pulse">
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-red-200 font-bold">PERINGATAN KRITIS: Alur Sterilisasi GAGAL!</strong>
                    <span className="text-[11px] block mt-0.5 leading-relaxed">Indikator membuktikan alat TIDAK steril. Jika diselesaikan, sistem akan otomatis me-recall nomor Lot ini, menolak penyimpanan, dan mengembalikannya ke area pencucian awal (Dekontaminasi).</span>
                  </div>
                </div>
              )}

              {/* Submit buttons */}
              <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => setSelectedBatch([])}
                  className="px-5 py-2.5 border border-slate-800 rounded-lg hover:bg-slate-800 text-slate-300 font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2.5 text-slate-950 rounded-lg font-extrabold shadow-md cursor-pointer transition ${
                    indicatorChemicalExternal === 'pass' && indicatorBiological !== 'fail'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-red-600 hover:bg-red-500'
                  }`}
                >
                  {indicatorChemicalExternal === 'pass' && indicatorBiological !== 'fail'
                    ? "Konfirmasi Lolos Steril & Simpan"
                    : "Konfirmasi Kegagalan (Kembalikan ke Decon)"}
                </button>
              </div>
            </form>
           ) : (
            <div className="space-y-6">
              {/* Header with quick tip */}
              <div className="border-b border-slate-800 pb-3 flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5 font-sans">
                    <BookOpen className="w-4 h-4 text-amber-500" />
                    Spesifikasi & Panduan Operasional Mesin
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Pilih tab unit mesin di bawah untuk melihat spesifikasi detail dan panduan program sterilisasi.</p>
                </div>
                <div className="text-[10px] bg-slate-950 px-2.5 py-1 rounded-lg text-slate-400 border border-slate-800 font-mono">
                  Menunggu Pilihan Lot Paket...
                </div>
              </div>

              {/* Machine Selector Tabs */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {machines.map((m) => {
                  const isActive = viewingMachineId === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setViewingMachineId(m.id)}
                      className={`py-2 px-1.5 text-center rounded-lg border text-[11px] font-bold transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
                        isActive
                          ? "bg-amber-500/10 border-amber-500 text-amber-400 shadow-md shadow-amber-500/5"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Cpu className={`w-4 h-4 ${isActive ? "text-amber-400 animate-pulse" : "text-slate-500"}`} />
                      <span className="truncate max-w-full px-1">{m.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Selected Machine Specs Display */}
              {activeViewingMachine && (() => {
                const staticSpec = getMachineSpec(activeViewingMachine.id) || getMachineSpec(activeViewingMachine.name);
                
                const specName = activeViewingMachine.name;
                const specTipe = staticSpec?.tipe || (activeViewingMachine.type === "sterilizer_plasma" ? "Plasma Sterilizer (H2O2 Low Temp)" : "Auto Clave / Mesin Steril Uap (Vacuum Pulse)");
                const specKapasitas = staticSpec?.kapasitas || activeViewingMachine.capacity || "Kapasitas Standar";
                const specSistem = staticSpec?.sistemPengaturan || "Sistem Digital PLC Otomatis";
                const specDimensi = staticSpec?.dimensi || "Kabinet Kamar Steril Medis";
                
                const specFeatures = staticSpec?.features || [
                  `Status Kelayakan Kerja: ${activeViewingMachine.status.toUpperCase()}`,
                  `Nomor Seri Alat: ${activeViewingMachine.serialNumber || "-"}`,
                  `Suhu Operasional Standar: ${activeViewingMachine.temperature || "-"}°C`,
                  `Durasi Siklus Standar: ${activeViewingMachine.duration || "-"} Menit`
                ];

                const specPrograms = staticSpec?.programs || (activeViewingMachine.modes || []).map((modeName) => {
                  let temp = parseInt(activeViewingMachine.temperature) || (activeViewingMachine.type === "sterilizer_plasma" ? 50 : 134);
                  let dur = parseInt(activeViewingMachine.duration) || (activeViewingMachine.type === "sterilizer_plasma" ? 45 : 30);
                  let pressure = activeViewingMachine.type === "sterilizer_plasma" ? 0.05 : 2.1;
                  
                  const tempMatch = modeName.match(/(\d+)\s*(?:°C|C)/i);
                  const durMatch = modeName.match(/(\d+)\s*(?:min|menit|Min)/i);
                  if (tempMatch) temp = parseInt(tempMatch[1]);
                  if (durMatch) dur = parseInt(durMatch[1]);

                  return {
                    name: modeName,
                    description: `Program Mode: ${modeName}. Konfigurasi otomatis dari Master Mesin.`,
                    temp,
                    pressure,
                    duration: dur,
                    method: activeViewingMachine.type === "sterilizer_plasma" ? "plasma_h2o2" as const : "steam_autoclave" as const
                  };
                });

                if (specPrograms.length === 0) {
                  specPrograms.push({
                    name: "Siklus Default",
                    description: "Siklus standard operasional.",
                    temp: parseInt(activeViewingMachine.temperature) || (activeViewingMachine.type === "sterilizer_plasma" ? 50 : 134),
                    pressure: activeViewingMachine.type === "sterilizer_plasma" ? 0.05 : 2.1,
                    duration: parseInt(activeViewingMachine.duration) || (activeViewingMachine.type === "sterilizer_plasma" ? 45 : 30),
                    method: activeViewingMachine.type === "sterilizer_plasma" ? "plasma_h2o2" as const : "steam_autoclave" as const
                  });
                }

                return (
                  <div className="space-y-5">
                    {/* Visual Mockup & General Specs */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                      {/* Stylized Visual Container */}
                      <div className="md:col-span-5 bg-slate-950 rounded-xl border border-slate-800 p-4 flex flex-col items-center justify-center relative overflow-hidden min-h-[160px]">
                        <div className="absolute inset-0 bg-slate-900/10 pointer-events-none" />
                        
                        {/* Machine Body Illustration with CSS & Tailwind */}
                        {activeViewingMachine.id === "mach-steam-buma" ? (
                          <div className="w-24 h-24 bg-slate-800 rounded-lg border-2 border-slate-700 relative flex flex-col items-center justify-between p-1.5 shadow-xl">
                            <div className="w-full h-1 bg-blue-500 rounded animate-pulse" />
                            <div className="w-16 h-12 bg-slate-900 rounded border border-slate-700 flex flex-col justify-center items-center gap-1">
                              <span className="text-[7px] font-mono font-bold text-blue-400">134°C</span>
                              <div className="w-10 h-1 bg-emerald-500 rounded-sm" />
                            </div>
                            <div className="flex gap-1.5 w-full justify-center">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                              <span className="w-2 h-2 rounded-full bg-slate-600" />
                            </div>
                          </div>
                        ) : activeViewingMachine.id === "mach-steam-as25" ? (
                          <div className="w-20 h-24 bg-slate-700 rounded-t-full border-2 border-slate-600 relative flex flex-col items-center justify-between p-2 shadow-xl">
                            <div className="w-12 h-1.5 bg-slate-900 rounded-full border border-slate-600" />
                            <div className="w-12 h-10 bg-slate-900 rounded border border-slate-600 flex flex-col justify-center items-center">
                              <span className="text-[7px] font-mono text-slate-400">PRESSURE</span>
                              <span className="text-[8px] font-mono font-bold text-amber-500">2.07 Bar</span>
                            </div>
                            <div className="w-10 h-2 bg-slate-800 rounded-sm" />
                          </div>
                        ) : activeViewingMachine.type === "sterilizer_plasma" ? (
                          <div className="w-18 h-28 bg-slate-100 rounded-lg border-2 border-slate-300 relative flex flex-col items-center justify-between p-2 shadow-xl">
                            <div className="w-10 h-4 bg-slate-900 rounded border border-slate-700 flex items-center justify-center">
                              <span className="text-[6px] font-mono text-emerald-400 font-bold">H2O2 GAS</span>
                            </div>
                            <div className="w-12 h-14 bg-slate-800 rounded border border-slate-700 flex flex-col justify-center items-center gap-0.5">
                              <span className="text-[7px] font-mono text-slate-500">PLASMA</span>
                              <span className="text-[8px] font-mono font-bold text-cyan-400">50°C</span>
                              <div className="w-8 h-1 bg-cyan-500/30 rounded overflow-hidden">
                                <div className="h-full w-2/3 bg-cyan-400 animate-pulse" />
                              </div>
                            </div>
                            <span className="text-[8px] text-slate-600 font-extrabold font-sans">STERA 120</span>
                          </div>
                        ) : (
                          <div className="w-24 h-24 bg-slate-900 rounded-xl border-2 border-slate-800 relative flex flex-col items-center justify-center p-2 shadow-xl gap-2">
                            <Cpu className="w-8 h-8 text-amber-500 animate-pulse" />
                            <span className="text-[9px] font-mono font-bold text-slate-400">{activeViewingMachine.status.toUpperCase()}</span>
                          </div>
                        )}

                        <span className="text-[10px] font-extrabold text-slate-400 mt-2 font-mono uppercase tracking-widest">{specTipe}</span>
                      </div>

                      {/* General Metadata */}
                      <div className="md:col-span-7 space-y-2 text-[11px] flex flex-col justify-center">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-slate-950/50 p-3.5 rounded-xl border border-slate-800">
                          <div>
                            <span className="text-slate-500 block font-semibold">Tipe Perangkat</span>
                            <span className="text-slate-300 font-bold">{specTipe}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block font-semibold">Kapasitas Unit</span>
                            <span className="text-slate-300 font-bold">{specKapasitas}</span>
                          </div>
                          <div className="col-span-2 border-t border-slate-800 my-1"></div>
                          <div>
                            <span className="text-slate-500 block font-semibold">Sistem Pengaturan</span>
                            <span className="text-slate-300 font-bold">{specSistem}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block font-semibold">Dimensi / Ruang</span>
                            <span className="text-slate-300 font-bold">{specDimensi}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Features and Tech Specs */}
                    <div className="p-4 bg-slate-950/30 rounded-xl border border-slate-800 space-y-3">
                      <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                        <Settings className="w-3.5 h-3.5 text-slate-400" />
                        Fitur Utama & Keunggulan Teknis
                      </h4>
                      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-slate-400 list-none text-left">
                        {specFeatures.map((feat, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-amber-500 font-extrabold shrink-0">✓</span>
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Operating Programs Grid */}
                    <div className="space-y-2.5 text-left">
                      <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Gauge className="w-3.5 h-3.5 text-amber-500" />
                        Program & Mode Operasional Terprogram (Preset)
                      </h4>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {specPrograms.map((p, idx) => (
                          <div key={idx} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-col justify-between gap-2.5 hover:border-slate-700 transition">
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-200 text-xs">{p.name}</span>
                                <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border ${
                                  p.method === 'plasma_h2o2' 
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                                    : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                                }`}>
                                  {p.method === 'plasma_h2o2' ? 'Plasma' : 'Steam'}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{p.description}</p>
                            </div>

                            {/* Parameters Badge Panel */}
                            <div className="flex gap-2 text-[10px] bg-slate-900/60 p-2 rounded-lg border border-slate-800 font-mono font-bold justify-around text-center">
                              <div>
                                <span className="block text-[8px] text-slate-500 font-semibold font-sans">SUHU</span>
                                <span className="text-slate-300">{p.temp}°C</span>
                              </div>
                              <div className="border-l border-slate-800 h-6"></div>
                              <div>
                                <span className="block text-[8px] text-slate-500 font-semibold font-sans">DURASI</span>
                                <span className="text-slate-300">{p.duration} Min</span>
                              </div>
                              <div className="border-l border-slate-800 h-6"></div>
                              <div>
                                <span className="block text-[8px] text-slate-500 font-semibold font-sans">TEKANAN</span>
                                <span className="text-slate-300">{p.pressure} Bar</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Helpful prompt */}
                    <div className="text-[11px] text-slate-400 bg-amber-500/5 border border-amber-500/10 p-3 rounded-lg flex items-center gap-2 text-left">
                      <Info className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>
                        <strong>Tips Efisiensi:</strong> Ketika Anda memilih salah satu nomor lot di panel kiri untuk mencatat hasil steril, Anda dapat memilih unit mesin di atas dan program otomatis ini akan langsung <strong>mengisi parameter suhu, durasi, dan tekanan secara otomatis</strong>!
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
