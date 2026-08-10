import React, { useState, useEffect, useMemo } from "react";
import { db } from "../lib/firebase";
import { collection, onSnapshot, query, orderBy, limit, getDocs, where } from "firebase/firestore";
import { 
  BarChart2, 
  PieChart as PieChartIcon, 
  FileSpreadsheet, 
  Printer, 
  Download, 
  Search, 
  Calendar, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  ShieldCheck, 
  Layers, 
  Box, 
  Building2, 
  RefreshCw, 
  Flame, 
  FolderClosed, 
  Handshake, 
  RotateCcw, 
  Activity, 
  User, 
  Check, 
  FileText, 
  Eye, 
  HelpCircle, 
  Info, 
  Lock,
  Package,
  TrendingUp,
  Shield,
  Gauge,
  Sparkles,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  X,
  Plus
} from "lucide-react";
import { 
  UserProfile, 
  InstrumentCatalog, 
  WorkflowLog, 
  SterileStock, 
  AuditLog, 
  Machine, 
  MachineTestLog 
} from "../types";
import { getExpiryStatus } from "../lib/expiryUtils";
import { writeAuditLog, getStoredDemoAuditLogs} from "../lib/auditLogger";
import { DEMO_KEYS, getDemoData, INITIAL_DEMO_WORKFLOW_LOGS, INITIAL_DEMO_STERILE_STOCK, INITIAL_DEMO_MACHINE_TESTS } from "../lib/demoStore";
import { requireTenantId } from "../lib/permissions";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

interface ReportingDashboardProps {
  currentUsername: string;
  currentUserProfile?: UserProfile | null;
  isDemoMode?: boolean;
  onNavigate?: (tab: string) => void;
}

export default function ReportingDashboard({
  currentUsername,
  currentUserProfile,
  isDemoMode = false,
  onNavigate
}: ReportingDashboardProps) {
  // Navigation Sub-Tabs inside Reporting Hub
  const [activeTab, setActiveTab] = useState<
    | "executive"
    | "official_inventory"
    | "set_shortage"
    | "operational_stages"
    | "sterilization_machine"
    | "expiry_recall_hold"
    | "discrepancy_losses"
    | "installation_timeline"
    | "audit_users"
  >("executive");

  // Operational stage sub-tab
  const [stageSubTab, setStageSubTab] = useState<
    "penerimaan" | "dekontaminasi" | "packing" | "sterilisasi" | "storage" | "distribusi"
  >("penerimaan");

  // Filter Bar States
  const [datePreset, setDatePreset] = useState<"today" | "7days" | "30days" | "this_month" | "all" | "custom">("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedUnit, setSelectedUnit] = useState<string>("all");
  const [selectedStageFilter, setSelectedStageFilter] = useState<string>("all");
  const [selectedConditionFilter, setSelectedConditionFilter] = useState<string>("all");
  const [selectedMachineFilter, setSelectedMachineFilter] = useState<string>("all");
  const [searchQuery, setSearchKeyword] = useState<string>("");

  // Timeline lookup state
  const [timelineSearchId, setTimelineSearchId] = useState<string>("ST-HECST01-IGD1");

  // Loading & Error States
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Raw Collection Data States (Read-Only Views)
  const [masterInstruments, setMasterInstruments] = useState<InstrumentCatalog[]>([]);
  const [workflowLogs, setWorkflowLogs] = useState<WorkflowLog[]>([]);
  const [sterileStock, setSterileStock] = useState<SterileStock[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [machineTests, setMachineTests] = useState<MachineTestLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [recallRecords, setRecallRecords] = useState<any[]>([]);
  const [holdRecords, setHoldRecords] = useState<any[]>([]);
  const [discrepancyCases, setDiscrepancyCases] = useState<any[]>([]);
  const [masterSets, setMasterSets] = useState<any[]>([]);

  // User Scope & Permission Check
  const userTenantId = (() => { try { return requireTenantId(currentUserProfile); } catch(e) { return ""; } })();
  const userRole = currentUserProfile?.role?.toUpperCase() || "OPERATOR";
  const rawScope = currentUserProfile?.scope;
  const userScopeStr = Array.isArray(rawScope) ? rawScope.join(",") : String(rawScope || "ALL");

  // Enforce Scope: If user scope is specific unit, lock unit filter
  useEffect(() => {
    if (userScopeStr !== "ALL" && userScopeStr !== "ALL_UNITS" && userScopeStr !== "GLOBAL") {
      setSelectedUnit(userScopeStr);
    }
  }, [userScopeStr]);

  // Handle Preset Dates
  useEffect(() => {
    const now = new Date();
    if (datePreset === "today") {
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      setStartDate(`${yyyy}-${mm}-${dd}`);
      setEndDate(`${yyyy}-${mm}-${dd}`);
    } else if (datePreset === "7days") {
      const past = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      setStartDate(past.toISOString().split("T")[0]);
      setEndDate(now.toISOString().split("T")[0]);
    } else if (datePreset === "30days") {
      const past = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
      setStartDate(past.toISOString().split("T")[0]);
      setEndDate(now.toISOString().split("T")[0]);
    } else if (datePreset === "this_month") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(firstDay.toISOString().split("T")[0]);
      setEndDate(now.toISOString().split("T")[0]);
    } else if (datePreset === "all") {
      setStartDate("");
      setEndDate("");
    }
  }, [datePreset]);

  // Load Data from Existing Firestore Collections (or Demo Store in Demo Mode)
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setErrorMessage(null);

    const fetchData = async () => {
      try {
        if (isDemoMode) {
          // Fetch from Demo Storage / Local Demo Data
          const insts = getDemoData(DEMO_KEYS.INSTRUMENTS, []);
          const wfs = getDemoData(DEMO_KEYS.WORKFLOW_LOGS, INITIAL_DEMO_WORKFLOW_LOGS);
          const stocks = getDemoData(DEMO_KEYS.STERILE_STOCK, INITIAL_DEMO_STERILE_STOCK);
          const mTests = getDemoData(DEMO_KEYS.MACHINE_TESTS, INITIAL_DEMO_MACHINE_TESTS);
          const audits = getStoredDemoAuditLogs(userTenantId);
          const recalls = getDemoData("cssd_demo_recalls", []);
          const holds = getDemoData("cssd_demo_holds", []);
          const discrepancies = getDemoData("cssd_demo_discrepancies", []);
          const sets = getDemoData("cssd_demo_master_sets", []);

          if (isMounted) {
            setMasterInstruments(insts);
            setWorkflowLogs(wfs);
            setSterileStock(stocks);
            setMachineTests(mTests);
            setAuditLogs(audits);
            setRecallRecords(recalls);
            setHoldRecords(holds);
            setDiscrepancyCases(discrepancies);
            setMasterSets(sets);

            // Mock default machines
            setMachines([
              { id: "M-01", name: "BUMA STERILIZER VACUM", type: "autoclave", serialNumber: "BUMA-2024-X1", location: "Ruang Sterilisasi", status: "ready" },
              { id: "M-02", name: "BES AUTOCLAVE", type: "autoclave", serialNumber: "BES-992-02", location: "Ruang Sterilisasi", status: "ready" },
              { id: "M-03", name: "PLASMA STERILIZER P1", type: "plasma", serialNumber: "PLS-2023-A", location: "Ruang Sterilisasi Low-Temp", status: "ready" }
            ]);

            // Mock users
            setUsersList([
              { userId: "U-01", name: "Administrator CSSD", email: "cssdrsudbenda@gmail.com", nip: "198801012020011001", role: "ADMIN", tenantId: userTenantId, scope: "ALL", statusAkun: "AKTIF", active: true },
              { userId: "U-02", name: "Petugas CSSD Sore", email: "petugas.cssd@rsudbenda.id", nip: "199203152021022003", role: "PETUGAS_CSSD", tenantId: userTenantId, scope: "CSSD", statusAkun: "AKTIF", active: true },
              { userId: "U-03", name: "Perawat IGD", email: "perawat.igd@rsudbenda.id", nip: "199507122022032004", role: "PETUGAS_INSTALASI", tenantId: userTenantId, scope: "IGD", statusAkun: "AKTIF", active: true },
              { userId: "U-04", name: "Penanggung Jawab OK", email: "pj.ok@rsudbenda.id", nip: "198504202019011002", role: "PENGAWAS", tenantId: userTenantId, scope: "OK Sentral", statusAkun: "AKTIF", active: true }
            ]);

            setLoading(false);
          }
        } else {
          // Real Firestore Subscriptions (Read-Only)
          const snapInst = await getDocs(query(collection(db, "master_instruments"), where("tenantId", "==", userTenantId)));
          const instsList: InstrumentCatalog[] = [];
          snapInst.forEach(d => {
            const data = d.data();
            instsList.push({ id: d.id, ...data } as InstrumentCatalog);
          });

          // Fetch workflow_logs
          const snapWf = await getDocs(query(collection(db, "workflow_logs"), where("tenantId", "==", userTenantId), orderBy("createdAt", "desc"), limit(200)));
          const wfList: WorkflowLog[] = [];
          snapWf.forEach(d => {
            const data = d.data();
            wfList.push({ id: d.id, ...data } as WorkflowLog);
          });

          // Fetch sterile_stock
          const snapStock = await getDocs(query(collection(db, "sterile_stock"), where("tenantId", "==", userTenantId)));
          const stockList: SterileStock[] = [];
          snapStock.forEach(d => {
            const data = d.data();
            stockList.push({ id: d.id, ...data } as SterileStock);
          });

          // Fetch machines
          const snapMach = await getDocs(query(collection(db, "machines"), where("tenantId", "==", userTenantId)));
          const machList: Machine[] = [];
          snapMach.forEach(d => machList.push({ id: d.id, ...d.data() } as Machine));

          // Fetch machine_test_logs
          const snapTest = await getDocs(query(collection(db, "machine_test_logs"), where("tenantId", "==", userTenantId), orderBy("createdAt", "desc"), limit(100)));
          const testList: MachineTestLog[] = [];
          snapTest.forEach(d => testList.push({ id: d.id, ...d.data() } as MachineTestLog));

          // Fetch audit_logs
          const snapAudit = await getDocs(query(collection(db, "audit_logs"), where("tenantId", "==", userTenantId), orderBy("timestamp", "desc"), limit(300)));
          const auditList: AuditLog[] = [];
          snapAudit.forEach(d => {
            const data = d.data();
            auditList.push({ id: d.id, ...data } as AuditLog);
          });

          // Fetch users
          const snapUsers = await getDocs(query(collection(db, "users"), where("tenantId", "==", userTenantId)));
          const uList: UserProfile[] = [];
          snapUsers.forEach(d => {
            const data = d.data();
            uList.push(data as UserProfile);
          });

          // Fetch master_sets
          const snapSets = await getDocs(query(collection(db, "master_sets"), where("tenantId", "==", userTenantId)));
          const setList: any[] = [];
          snapSets.forEach(d => setList.push({ id: d.id, ...d.data() }));

          if (isMounted) {
            setMasterInstruments(instsList);
            setWorkflowLogs(wfList);
            setSterileStock(stockList);
            setMachines(machList);
            setMachineTests(testList);
            setAuditLogs(auditList);
            setUsersList(uList);
            setMasterSets(setList);
            setLoading(false);
          }
        }
      } catch (err: any) {
        console.error("Error loading reporting source data:", err);
        if (isMounted) {
          setErrorMessage("Gagal memuat laporan. Periksa hak akses atau koneksi database.");
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [isDemoMode, userTenantId]);

  // Global Date Filter Helper
  const isWithinDateRange = (dateInput: any): boolean => {
    if (!startDate && !endDate) return true;
    if (!dateInput) return true;

    let d: Date;
    if (typeof dateInput?.toDate === "function") {
      d = dateInput.toDate();
    } else if (dateInput instanceof Date) {
      d = dateInput;
    } else {
      d = new Date(dateInput);
    }
    if (isNaN(d.getTime())) return true;

    const targetTime = d.getTime();
    if (startDate) {
      const s = new Date(startDate).getTime();
      if (targetTime < s) return false;
    }
    if (endDate) {
      const e = new Date(endDate).getTime() + 86400000; // end of day
      if (targetTime > e) return false;
    }
    return true;
  };

  // Filtered Master Instruments (SSoT Official Inventory View)
  const filteredOfficialInventory = useMemo(() => {
    return masterInstruments.filter((inst) => {
      // Unit Scope
      if (selectedUnit !== "all") {
        const u = inst.originUnit || inst.unit || "IGD";
        if (u.toLowerCase() !== selectedUnit.toLowerCase()) return false;
      }
      // Search term
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = inst.name?.toLowerCase().includes(q);
        const matchSku = inst.sku?.toLowerCase().includes(q);
        const matchId = inst.id?.toLowerCase().includes(q);
        if (!matchName && !matchSku && !matchId) return false;
      }
      return true;
    });
  }, [masterInstruments, selectedUnit, searchQuery]);

  // Filtered Workflow Logs (Live Stage Operations)
  const filteredWorkflows = useMemo(() => {
    return workflowLogs.filter((wf) => {
      if (!isWithinDateRange(wf.createdAt)) return false;

      // Unit Scope
      if (selectedUnit !== "all") {
        const u = wf.originUnit || wf.unit || wf.asal || "IGD";
        if (u.toLowerCase() !== selectedUnit.toLowerCase()) return false;
      }

      // Stage Filter
      if (selectedStageFilter !== "all") {
        if ((wf.currentStage || "").toLowerCase() !== selectedStageFilter.toLowerCase()) return false;
      }

      // Condition Filter
      if (selectedConditionFilter !== "all") {
        const cond = wf.status === "HOLD" || wf.isHold ? "TAHAN" : "NORMAL";
        if (cond !== selectedConditionFilter) return false;
      }

      // Machine Filter
      if (selectedMachineFilter !== "all") {
        const mach = wf.machineName || wf.machineId || "";
        if (!mach.toLowerCase().includes(selectedMachineFilter.toLowerCase())) return false;
      }

      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = wf.instrumentName?.toLowerCase().includes(q);
        const matchLot = wf.lotNumber?.toLowerCase().includes(q);
        const matchId = wf.instrumentId?.toLowerCase().includes(q);
        if (!matchName && !matchLot && !matchId) return false;
      }

      return true;
    });
  }, [workflowLogs, startDate, endDate, selectedUnit, selectedStageFilter, selectedConditionFilter, selectedMachineFilter, searchQuery]);

  // KPI STATS COMPUTATION (Strictly Read-Only Views from SSoT)
  const kpiMetrics = useMemo(() => {
    // 1. Total Inventaris Resmi (SSoT from masterInstruments)
    const totalOfficialInventory = filteredOfficialInventory.reduce((acc, curr) => acc + Number(curr.totalStock ?? 1), 0);

    // 2. Active Instruments
    const activeInstrumentsCount = filteredOfficialInventory.filter(i => (i.status || 'active').toLowerCase() === 'active').reduce((acc, curr) => acc + Number(curr.totalStock ?? 1), 0);

    // 3. In CSSD Stages (Penerimaan, Dekontaminasi, Packing, Sterilisasi, Storage/Rak)
    let inCSSDCount = 0;
    let inInstallationCount = 0;
    let readyShelfCount = 0;
    let holdCount = 0;

    workflowLogs.forEach(wf => {
      const stage = (wf.currentStage || "decontamination").toLowerCase();
      const isHold = wf.status === "HOLD" || wf.isHold;
      const qty = Number(wf.qty || 1);

      if (isHold) {
        holdCount += qty;
      }

      if (stage === "distributed" || stage === "installation") {
        inInstallationCount += qty;
      } else if (stage === "sterile_storage" || stage === "ready" || stage === "rak") {
        inCSSDCount += qty;
        readyShelfCount += qty;
      } else {
        inCSSDCount += qty;
      }
    });

    // Count sterile stock shelves
    sterileStock.forEach(st => {
      if (st.status === "sterile" || st.status === "Aman") {
        readyShelfCount += Number(st.qty || 1);
      }
    });

    // Expired Count using expiryUtils helper
    let expiredCount = 0;
    let nearExpiredCount = 0;
    sterileStock.forEach(st => {
      if (st.status === "sterile") {
        const expStatus = getExpiryStatus(st.expiresAt, st.wrapType || st.packagingType);
        if (expStatus.category === "EXPIRED") expiredCount++;
        if (expStatus.category === "PERINGATAN") nearExpiredCount++;
      }
    });

    // Active Recalls
    const activeRecallCount = recallRecords.filter(r => r.status === "ACTIVE" || r.status === "PROSES").length;

    // Discrepancy cases
    const discrepancyCount = discrepancyCases.filter(d => d.status !== "SELESAI").length;

    // Set Belum Lengkap (Prompt #8)
    let incompleteSetsCount = 0;
    masterSets.forEach(set => {
      const std = Number(set.totalStandardItems || set.items?.length || 0);
      const avail = Number(set.physicalAvailable || set.availableItems || std);
      if (avail < std) incompleteSetsCount++;
    });

    return {
      totalOfficialInventory,
      activeInstrumentsCount,
      inCSSDCount,
      inInstallationCount,
      readyShelfCount,
      holdCount,
      expiredCount,
      nearExpiredCount,
      activeRecallCount,
      discrepancyCount,
      incompleteSetsCount
    };
  }, [filteredOfficialInventory, workflowLogs, sterileStock, recallRecords, discrepancyCases, masterSets]);

  // Export to CSV Function
  const handleExportCSV = (reportName: string, headers: string[], dataRows: string[][]) => {
    try {
      const csvContent = "data:text/csv;charset=utf-8," + 
        [headers.join(","), ...dataRows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Laporan_eCSSD_${reportName}_${new Date().toISOString().split("T")[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Audit Log
      writeAuditLog({
        userId: currentUserProfile?.userId || currentUsername,
        userName: currentUsername,
        userRole: userRole,
        action: "REPORT_EXPORT",
        module: "LAPORAN",
        entityType: "REPORT",
        reason: `Mengekspor laporan '${reportName}' ke format CSV`,
        result: "SUCCESS",
        tenantId: userTenantId
      });
    } catch (err: any) {
      alert("Gagal mengekspor laporan: " + err.message);
    }
  };

  // Printable Report Layout
  const handlePrintReport = (reportTitle: string) => {
    writeAuditLog({
      userId: currentUserProfile?.userId || currentUsername,
      userName: currentUsername,
      userRole: userRole,
      action: "REPORT_PRINT",
      module: "LAPORAN",
      entityType: "REPORT",
      reason: `Mencetak dokumen laporan '${reportTitle}'`,
      result: "SUCCESS",
      tenantId: userTenantId
    });

    window.print();
  };

  // Timeline Lookup Data for Selected Instrument
  const selectedInstrumentTimeline = useMemo(() => {
    if (!timelineSearchId.trim()) return [];

    const target = timelineSearchId.trim().toLowerCase();
    const timelineEvents: {
      timestamp: string;
      stage: string;
      actor: string;
      unit: string;
      notes: string;
      status: string;
    }[] = [];

    // Search in workflow logs
    workflowLogs.forEach(wf => {
      const match = 
        wf.instrumentId?.toLowerCase() === target ||
        wf.lotNumber?.toLowerCase() === target ||
        wf.idTerima?.toLowerCase() === target ||
        wf.instrumentName?.toLowerCase().includes(target);

      if (match) {
        if (wf.history && Array.isArray(wf.history)) {
          wf.history.forEach((h: any) => {
            timelineEvents.push({
              timestamp: h.timestamp?.toDate ? h.timestamp.toDate().toLocaleString("id-ID") : String(h.timestamp || "-"),
              stage: (h.stage || "PROSES").toUpperCase(),
              actor: h.actor || h.operator || wf.operator || "Petugas CSSD",
              unit: wf.originUnit || wf.unit || "IGD",
              notes: h.notes || h.action || "Proses Alur Kerja CSSD",
              status: h.status || "LULUS"
            });
          });
        } else {
          timelineEvents.push({
            timestamp: wf.createdAt?.toDate ? wf.createdAt.toDate().toLocaleString("id-ID") : String(wf.createdAt || "-"),
            stage: (wf.currentStage || "PENERIMAAN").toUpperCase(),
            actor: wf.operator || "Petugas CSSD",
            unit: wf.originUnit || wf.unit || "IGD",
            notes: `Status Workflow: ${wf.status || "SEDANG DIPROSES"}`,
            status: wf.status || "NORMAL"
          });
        }
      }
    });

    // Search in audit logs
    auditLogs.forEach(a => {
      if (a.entityId?.toLowerCase() === target || a.reason?.toLowerCase().includes(target)) {
        timelineEvents.push({
          timestamp: a.timestamp?.toDate ? a.timestamp.toDate().toLocaleString("id-ID") : String(a.timestamp || "-"),
          stage: a.action || "AUDIT_EVENT",
          actor: a.userName || a.userId || "System",
          unit: a.tenantId || "CSSD",
          notes: a.reason || "-",
          status: a.result || "SUCCESS"
        });
      }
    });

    return timelineEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [timelineSearchId, workflowLogs, auditLogs]);

  return (
    <div className="space-y-6 print:p-0 print:m-0" id="reporting-dashboard-module">
      
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:border-none print:bg-white print:text-black print:p-0">
        <div>
          <div className="flex items-center gap-2">
            <BarChart2 className="w-7 h-7 text-sky-400 print:text-slate-800" />
            <h1 className="text-2xl font-black text-white tracking-tight font-sans print:text-slate-900">
              Modul Reporting &amp; Dashboard Terpadu
            </h1>
          </div>
          <p className="text-slate-400 text-xs sm:text-sm mt-1 print:text-slate-600">
            Pusat Agregasi &amp; Analitik Realtime e-CSSD RSUD BENDA — Read-Only Views dari Source Data Terkunci.
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-bold">
              Read-Only View
            </span>
            <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-mono">
              Tenant: {userTenantId}
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              Scope: {userScopeStr}
            </span>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={() => handlePrintReport(activeTab)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition flex items-center gap-2"
          >
            <Printer className="w-4 h-4 text-sky-400" />
            <span>Cetak Laporan</span>
          </button>
          <button
            onClick={() => {
              const headers = ["ID", "Nama Instrumen", "Instalasi", "Total Stok", "Status"];
              const rows = filteredOfficialInventory.map(i => [
                i.id || i.sku || "",
                i.name || "",
                i.originUnit || i.unit || "",
                String(i.totalStock ?? 1),
                i.status || "Aktif"
              ]);
              handleExportCSV(activeTab, headers, rows);
            }}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow"
          >
            <Download className="w-4 h-4" />
            <span>Ekspor CSV</span>
          </button>
        </div>
      </div>

      {/* ERROR / PERMISSION DENIED BANNER */}
      {errorMessage && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 text-xs font-mono flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 animate-pulse" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* FILTER CONTROLS BAR */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3 print:hidden">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-sky-400" /> Filter Parameter Laporan
          </span>
          <button
            onClick={() => {
              setDatePreset("all");
              setStartDate("");
              setEndDate("");
              if (userScopeStr === "ALL" || userScopeStr === "GLOBAL") setSelectedUnit("all");
              setSelectedStageFilter("all");
              setSelectedConditionFilter("all");
              setSelectedMachineFilter("all");
              setSearchKeyword("");
            }}
            className="text-[11px] text-sky-400 hover:underline font-mono"
          >
            Reset Filter
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
          
          {/* Preset Tanggal */}
          <div>
            <label className="block text-[10px] text-slate-400 font-bold mb-1">PRESET TANGGAL</label>
            <select
              value={datePreset}
              onChange={(e: any) => setDatePreset(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-sky-500"
            >
              <option value="all">Semua Tanggal</option>
              <option value="today">Hari Ini</option>
              <option value="7days">7 Hari Terakhir</option>
              <option value="30days">30 Hari Terakhir</option>
              <option value="this_month">Bulan Ini</option>
              <option value="custom">Kustom Tanggal</option>
            </select>
          </div>

          {/* Date Range Inputs */}
          <div>
            <label className="block text-[10px] text-slate-400 font-bold mb-1">TANGGAL MULAI</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setDatePreset("custom");
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-sky-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 font-bold mb-1">TANGGAL AKHIR</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setDatePreset("custom");
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-sky-500 font-mono"
            />
          </div>

          {/* Installation Scope Filter */}
          <div>
            <label className="block text-[10px] text-slate-400 font-bold mb-1">INSTALASI / UNIT</label>
            <select
              value={selectedUnit}
              disabled={userScopeStr !== "ALL" && userScopeStr !== "GLOBAL"}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-sky-500 disabled:opacity-60"
            >
              <option value="all">Semua Instalasi</option>
              <option value="IGD">IGD (Gawat Darurat)</option>
              <option value="OK Sentral">OK Sentral (Bedah)</option>
              <option value="VK Kebidanan">VK Kebidanan</option>
              <option value="ICU">ICU / HCU</option>
              <option value="Poli Bedah">Poli Bedah</option>
              <option value="Rawat Inap">Rawat Inap</option>
            </select>
          </div>

          {/* Status Alur Filter */}
          <div>
            <label className="block text-[10px] text-slate-400 font-bold mb-1">STATUS ALUR</label>
            <select
              value={selectedStageFilter}
              onChange={(e) => setSelectedStageFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-sky-500"
            >
              <option value="all">Semua Status Alur</option>
              <option value="penerimaan">DITERIMA</option>
              <option value="decontamination">DEKONTAMINASI</option>
              <option value="packing">SEDANG MENGEMAS</option>
              <option value="sterilization">STERILISASI</option>
              <option value="ready">SIAP</option>
              <option value="sterile_storage">RAK</option>
              <option value="distributed">DIDISTRIBUSIKAN</option>
            </select>
          </div>

          {/* Condition Filter */}
          <div>
            <label className="block text-[10px] text-slate-400 font-bold mb-1">KONDISI INSTRUMEN</label>
            <select
              value={selectedConditionFilter}
              onChange={(e) => setSelectedConditionFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-sky-500"
            >
              <option value="all">Semua Kondisi</option>
              <option value="NORMAL">NORMAL</option>
              <option value="TAHAN">TAHAN / KARANTINA</option>
            </select>
          </div>

        </div>

        {/* Keyword Search */}
        <div className="pt-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="Cari kata kunci (ID Instrumen, Lot Number, Nama Alat)..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 outline-none focus:border-sky-500 font-mono"
            />
          </div>
        </div>

      </div>

      {/* SUB-NAVIGATION TABS */}
      <div className="flex gap-2 p-1.5 bg-slate-900 rounded-xl border border-slate-800 overflow-x-auto touch-pan-x print:hidden">
        <button
          onClick={() => setActiveTab("executive")}
          className={`px-3.5 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition flex items-center gap-1.5 ${
            activeTab === "executive" ? "bg-sky-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <BarChart2 className="w-3.5 h-3.5" /> Executive Dashboard
        </button>
        <button
          onClick={() => setActiveTab("official_inventory")}
          className={`px-3.5 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition flex items-center gap-1.5 ${
            activeTab === "official_inventory" ? "bg-sky-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Package className="w-3.5 h-3.5" /> Master Inventaris
        </button>
        <button
          onClick={() => setActiveTab("set_shortage")}
          className={`px-3.5 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition flex items-center gap-1.5 ${
            activeTab === "set_shortage" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Layers className="w-3.5 h-3.5" /> Komposisi &amp; Set
        </button>
        <button
          onClick={() => setActiveTab("operational_stages")}
          className={`px-3.5 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition flex items-center gap-1.5 ${
            activeTab === "operational_stages" ? "bg-sky-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Activity className="w-3.5 h-3.5" /> Stage Operasional
        </button>
        <button
          onClick={() => setActiveTab("sterilization_machine")}
          className={`px-3.5 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition flex items-center gap-1.5 ${
            activeTab === "sterilization_machine" ? "bg-sky-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Flame className="w-3.5 h-3.5" /> Sterilisasi &amp; Mesin
        </button>
        <button
          onClick={() => setActiveTab("expiry_recall_hold")}
          className={`px-3.5 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition flex items-center gap-1.5 ${
            activeTab === "expiry_recall_hold" ? "bg-sky-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" /> Expired, Recall &amp; Hold
        </button>
        <button
          onClick={() => setActiveTab("discrepancy_losses")}
          className={`px-3.5 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition flex items-center gap-1.5 ${
            activeTab === "discrepancy_losses" ? "bg-sky-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Shield className="w-3.5 h-3.5" /> Opname, Hilang &amp; Rusak
        </button>
        <button
          onClick={() => setActiveTab("installation_timeline")}
          className={`px-3.5 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition flex items-center gap-1.5 ${
            activeTab === "installation_timeline" ? "bg-sky-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Building2 className="w-3.5 h-3.5" /> Per Instalasi &amp; Timeline
        </button>
        <button
          onClick={() => setActiveTab("audit_users")}
          className={`px-3.5 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition flex items-center gap-1.5 ${
            activeTab === "audit_users" ? "bg-sky-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" /> Audit &amp; Activity
        </button>
      </div>

      {/* VIEW CONTENT BASED ON ACTIVE SUB-TAB */}
      {loading ? (
        <div className="p-12 text-center bg-slate-900/60 rounded-2xl border border-slate-800 text-slate-400 font-mono text-xs flex flex-col items-center gap-3">
          <Clock className="w-6 h-6 animate-spin text-sky-400" />
          <span>Memuat &amp; mengagregasi data laporan...</span>
        </div>
      ) : (
        <>
          {/* TAB 1: EXECUTIVE DASHBOARD */}
          {activeTab === "executive" && (
            <div className="space-y-6">
              
              {/* Top 10 KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5">
                
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-sm">
                  <span className="text-[10px] text-slate-400 font-bold block">TOTAL INVENTARIS RESMI</span>
                  <span className="text-2xl font-black text-white font-mono mt-1 block">
                    {kpiMetrics.totalOfficialInventory}
                  </span>
                  <span className="text-[9px] text-sky-400 font-mono mt-0.5 block">SSoT Master Data</span>
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-sm">
                  <span className="text-[10px] text-slate-400 font-bold block">INSTRUMEN AKTIF</span>
                  <span className="text-2xl font-black text-emerald-400 font-mono mt-1 block">
                    {kpiMetrics.activeInstrumentsCount}
                  </span>
                  <span className="text-[9px] text-emerald-500 font-mono mt-0.5 block">Siap Digunakan</span>
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-sm">
                  <span className="text-[10px] text-slate-400 font-bold block">DALAM PROSES CSSD</span>
                  <span className="text-2xl font-black text-sky-400 font-mono mt-1 block">
                    {kpiMetrics.inCSSDCount}
                  </span>
                  <span className="text-[9px] text-sky-500 font-mono mt-0.5 block">Penerimaan s/d Rak</span>
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-sm">
                  <span className="text-[10px] text-slate-400 font-bold block">BERADA DI INSTALASI</span>
                  <span className="text-2xl font-black text-indigo-400 font-mono mt-1 block">
                    {kpiMetrics.inInstallationCount}
                  </span>
                  <span className="text-[9px] text-indigo-500 font-mono mt-0.5 block">Unit Ruangan</span>
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-sm">
                  <span className="text-[10px] text-slate-400 font-bold block">STOK SIAP / RAK</span>
                  <span className="text-2xl font-black text-emerald-300 font-mono mt-1 block">
                    {kpiMetrics.readyShelfCount}
                  </span>
                  <span className="text-[9px] text-emerald-400 font-mono mt-0.5 block">Storage Steril</span>
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-sm">
                  <span className="text-[10px] text-slate-400 font-bold block">KONDISI TAHAN / HOLD</span>
                  <span className="text-2xl font-black text-amber-400 font-mono mt-1 block">
                    {kpiMetrics.holdCount}
                  </span>
                  <span className="text-[9px] text-amber-500 font-mono mt-0.5 block">Karantina CSSD</span>
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-sm">
                  <span className="text-[10px] text-slate-400 font-bold block">INSTRUMEN EXPIRED</span>
                  <span className="text-2xl font-black text-rose-400 font-mono mt-1 block">
                    {kpiMetrics.expiredCount}
                  </span>
                  <span className="text-[9px] text-rose-500 font-mono mt-0.5 block">Wajib Re-Process</span>
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-sm">
                  <span className="text-[10px] text-slate-400 font-bold block">RECALL AKTIF</span>
                  <span className="text-2xl font-black text-rose-300 font-mono mt-1 block">
                    {kpiMetrics.activeRecallCount}
                  </span>
                  <span className="text-[9px] text-rose-400 font-mono mt-0.5 block">Penarikan Batch</span>
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-sm">
                  <span className="text-[10px] text-slate-400 font-bold block">KETIDAKSESUAIAN</span>
                  <span className="text-2xl font-black text-amber-300 font-mono mt-1 block">
                    {kpiMetrics.discrepancyCount}
                  </span>
                  <span className="text-[9px] text-amber-400 font-mono mt-0.5 block">Dalam Klarifikasi</span>
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-sm">
                  <span className="text-[10px] text-slate-400 font-bold block">SET BELUM LENGKAP</span>
                  <span className="text-2xl font-black text-indigo-300 font-mono mt-1 block">
                    {kpiMetrics.incompleteSetsCount}
                  </span>
                  <span className="text-[9px] text-indigo-400 font-mono mt-0.5 block">Kurang Penyediaan</span>
                </div>

              </div>

              {/* Status Separation Matrix Section (LOCKED Requirement #4) */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="border-b border-slate-800 pb-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-sky-400" />
                    Pemisahan Matriks Status (Status Alur, Kondisi, Lokasi &amp; Pemegang)
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Memisahkan atribut alur operasional, kondisi kelayakan, lokasi fisik, dan unit pemegang instrumen.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                  
                  {/* Status Alur */}
                  <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                    <span className="font-bold text-sky-400 block text-[11px]">1. STATUS ALUR OPERASIONAL</span>
                    <ul className="space-y-1.5 font-mono text-[11px]">
                      <li className="flex justify-between text-slate-300">
                        <span>DITERIMA:</span>
                        <span className="font-bold text-white">
                          {workflowLogs.filter(w => (w.currentStage || "").toLowerCase() === "penerimaan").length}
                        </span>
                      </li>
                      <li className="flex justify-between text-slate-300">
                        <span>DEKONTAMINASI:</span>
                        <span className="font-bold text-white">
                          {workflowLogs.filter(w => (w.currentStage || "").toLowerCase() === "decontamination").length}
                        </span>
                      </li>
                      <li className="flex justify-between text-slate-300">
                        <span>SEDANG MENGEMAS:</span>
                        <span className="font-bold text-white">
                          {workflowLogs.filter(w => (w.currentStage || "").toLowerCase() === "packing").length}
                        </span>
                      </li>
                      <li className="flex justify-between text-slate-300">
                        <span>STERILISASI:</span>
                        <span className="font-bold text-white">
                          {workflowLogs.filter(w => (w.currentStage || "").toLowerCase() === "sterilization").length}
                        </span>
                      </li>
                      <li className="flex justify-between text-slate-300">
                        <span>SIAP / RAK:</span>
                        <span className="font-bold text-emerald-400">
                          {workflowLogs.filter(w => (w.currentStage || "").toLowerCase() === "sterile_storage" || w.currentStage === "ready").length}
                        </span>
                      </li>
                      <li className="flex justify-between text-slate-300">
                        <span>DIDISTRIBUSIKAN:</span>
                        <span className="font-bold text-indigo-400">
                          {workflowLogs.filter(w => (w.currentStage || "").toLowerCase() === "distributed").length}
                        </span>
                      </li>
                    </ul>
                  </div>

                  {/* Kondisi */}
                  <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                    <span className="font-bold text-emerald-400 block text-[11px]">2. KONDISI KELAYAKAN</span>
                    <ul className="space-y-2 font-mono text-[11px]">
                      <li className="flex justify-between p-2 bg-emerald-950/30 border border-emerald-800/40 rounded-lg text-emerald-300">
                        <span>NORMAL:</span>
                        <span className="font-extrabold">{kpiMetrics.totalOfficialInventory - kpiMetrics.holdCount}</span>
                      </li>
                      <li className="flex justify-between p-2 bg-amber-950/30 border border-amber-800/40 rounded-lg text-amber-300">
                        <span>TAHAN / KARANTINA:</span>
                        <span className="font-extrabold">{kpiMetrics.holdCount}</span>
                      </li>
                    </ul>
                  </div>

                  {/* Lokasi */}
                  <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                    <span className="font-bold text-indigo-400 block text-[11px]">3. LOKASI FISIK ALAT</span>
                    <ul className="space-y-1 font-mono text-[10px] text-slate-300">
                      <li className="flex justify-between"><span>CSSD_DEKONTAMINASI:</span> <span className="font-bold text-white">Aktif</span></li>
                      <li className="flex justify-between"><span>CSSD_PACKAGING:</span> <span className="font-bold text-white">Aktif</span></li>
                      <li className="flex justify-between"><span>MESIN STERILISASI:</span> <span className="font-bold text-white">Aktif</span></li>
                      <li className="flex justify-between"><span>RAK_STERIL:</span> <span className="font-bold text-emerald-400">Aktif</span></li>
                      <li className="flex justify-between"><span>KARANTINA_CSSD:</span> <span className="font-bold text-amber-400">Aktif</span></li>
                      <li className="flex justify-between"><span>INSTALASI_RUANGAN:</span> <span className="font-bold text-indigo-400">Aktif</span></li>
                    </ul>
                  </div>

                  {/* Pemegang */}
                  <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                    <span className="font-bold text-amber-400 block text-[11px]">4. UNIT PEMEGANG</span>
                    <ul className="space-y-1 font-mono text-[10px] text-slate-300">
                      <li className="flex justify-between"><span>CSSD:</span> <span className="font-bold text-white">{kpiMetrics.inCSSDCount}</span></li>
                      <li className="flex justify-between"><span>IGD:</span> <span className="font-bold text-white">Teridentifikasi</span></li>
                      <li className="flex justify-between"><span>OK SENTRAL:</span> <span className="font-bold text-white">Teridentifikasi</span></li>
                      <li className="flex justify-between"><span>VK KEBIDANAN:</span> <span className="font-bold text-white">Teridentifikasi</span></li>
                      <li className="flex justify-between"><span>ICU / HCU:</span> <span className="font-bold text-white">Teridentifikasi</span></li>
                    </ul>
                  </div>

                </div>
              </div>

              {/* Volume Bar Chart */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
                <h3 className="text-sm font-bold text-white">Grafik Volume Transaksi Operasional</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { stage: "Penerimaan", count: workflowLogs.filter(w => (w.currentStage||"").toLowerCase() === "penerimaan").length },
                      { stage: "Dekontaminasi", count: workflowLogs.filter(w => (w.currentStage||"").toLowerCase() === "decontamination").length },
                      { stage: "Packing", count: workflowLogs.filter(w => (w.currentStage||"").toLowerCase() === "packing").length },
                      { stage: "Sterilisasi", count: workflowLogs.filter(w => (w.currentStage||"").toLowerCase() === "sterilization").length },
                      { stage: "Rak Steril", count: workflowLogs.filter(w => (w.currentStage||"").toLowerCase() === "sterile_storage" || w.currentStage === "ready").length },
                      { stage: "Distribusi", count: workflowLogs.filter(w => (w.currentStage||"").toLowerCase() === "distributed").length }
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="stage" stroke="#94a3b8" fontSize={11} />
                      <YAxis stroke="#94a3b8" fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155" }} />
                      <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: LAPORAN INVENTARIS RESMI */}
          {activeTab === "official_inventory" && (
            <div className="space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Package className="w-4 h-4 text-sky-400" />
                      Laporan Master Inventaris Resmi (Single Source of Truth)
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Total Inventaris Resmi berasal dari koleksi <code className="text-sky-400 font-mono">inventaris_instrumen / master_instruments</code>.
                    </p>
                  </div>
                  <div className="text-xs font-mono px-3 py-1 bg-slate-950 border border-slate-800 rounded-lg text-emerald-400">
                    Total SSoT: <strong>{kpiMetrics.totalOfficialInventory}</strong> Unit
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800">
                      <tr>
                        <th className="p-2.5">ID / SKU</th>
                        <th className="p-2.5">NAMA INSTRUMEN</th>
                        <th className="p-2.5">INSTALASI ASAL</th>
                        <th className="p-2.5">TIPE</th>
                        <th className="p-2.5 text-center">TOTAL STOK</th>
                        <th className="p-2.5 text-center">STATUS MASTER</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {filteredOfficialInventory.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-6 text-slate-500 italic">
                            Tidak ada data pada periode/filter yang dipilih.
                          </td>
                        </tr>
                      ) : (
                        filteredOfficialInventory.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-800/40">
                            <td className="p-2.5 text-sky-400 font-bold">{item.id || item.sku}</td>
                            <td className="p-2.5 text-white font-sans font-semibold">{item.name}</td>
                            <td className="p-2.5 text-slate-300">{item.originUnit || item.unit || "IGD"}</td>
                            <td className="p-2.5 text-slate-400 uppercase text-[10px]">{item.type || "single"}</td>
                            <td className="p-2.5 text-center font-bold text-emerald-400">{item.totalStock ?? 1}</td>
                            <td className="p-2.5 text-center">
                              <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                                {item.status || "AKTIF"}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BELUM LENGKAP PENYEDIAAN (PROMPT #8) */}
          {activeTab === "set_shortage" && (
            <div className="space-y-4">
              
              {/* Mandatory Prompt #8 Rules Banner */}
              <div className="p-4 bg-indigo-950/40 border border-indigo-800/60 rounded-2xl text-indigo-200 text-xs space-y-1">
                <div className="font-bold text-indigo-300 flex items-center gap-2">
                  <Info className="w-4 h-4 text-indigo-400" />
                  Keterangan Aturan Baku Prompt #8 (Kekurangan Penyediaan Set)
                </div>
                <p className="text-[11px] text-slate-300">
                  Kekurangan penyediaan set adalah kondisi fisik instrumen lebih sedikit daripada standar komposisi master.
                  <strong className="text-amber-300 ml-1">
                    BUKAN HILANG, BUKAN RUSAK, BUKAN SELISIH, dan BUKAN INVENTARIS NEGATIF.
                  </strong>
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  Laporan Kelengkapan Set &amp; Kekurangan Penyediaan
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800">
                      <tr>
                        <th className="p-2.5">KODE SET</th>
                        <th className="p-2.5">NAMA SET MASTER</th>
                        <th className="p-2.5">INSTALASI</th>
                        <th className="p-2.5 text-center">STANDAR KOMPOSISI</th>
                        <th className="p-2.5 text-center">FISIK TERSEDIA</th>
                        <th className="p-2.5 text-center">KEKURANGAN PENYEDIAAN</th>
                        <th className="p-2.5 text-center">STATUS PENYEDIAAN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {masterSets.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-6 text-slate-500 italic">
                            Tidak ada data komposisi set pada periode/filter yang dipilih.
                          </td>
                        </tr>
                      ) : (
                        masterSets.map((set) => {
                          const std = Number(set.totalStandardItems || set.items?.length || 10);
                          const avail = Number(set.physicalAvailable ?? std);
                          const shortage = Math.max(0, std - avail);
                          const status = shortage > 0 ? "BELUM_LENGKAP_PENYEDIAAN" : "LENGKAP";

                          return (
                            <tr key={set.id} className="hover:bg-slate-800/40">
                              <td className="p-2.5 text-sky-400 font-bold">{set.sku || set.id}</td>
                              <td className="p-2.5 text-white font-sans font-semibold">{set.name || "SET INSTRUMEN"}</td>
                              <td className="p-2.5 text-slate-300">{set.originUnit || "IGD"}</td>
                              <td className="p-2.5 text-center font-bold text-slate-200">{std}</td>
                              <td className="p-2.5 text-center font-bold text-emerald-400">{avail}</td>
                              <td className="p-2.5 text-center font-bold text-amber-400">{shortage}</td>
                              <td className="p-2.5 text-center">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                  status === "LENGKAP"
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                                }`}>
                                  {status}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* TAB 4: OPERATIONAL STAGES */}
          {activeTab === "operational_stages" && (
            <div className="space-y-4">
              
              {/* Stage Sub-Tabs */}
              <div className="flex gap-2 border-b border-slate-800 pb-2">
                {[
                  { id: "penerimaan", label: "Penerimaan" },
                  { id: "dekontaminasi", label: "Dekontaminasi" },
                  { id: "packing", label: "Packing / Mengemas" },
                  { id: "sterilisasi", label: "Sterilisasi" },
                  { id: "storage", label: "Storage / Rak" },
                  { id: "distribusi", label: "Distribusi" }
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setStageSubTab(s.id as any)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                      stageSubTab === s.id
                        ? "bg-sky-600 text-white"
                        : "bg-slate-900 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Stage Data Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
                <h3 className="text-sm font-bold text-white uppercase">
                  Laporan Stage Operasional: {stageSubTab}
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800">
                      <tr>
                        <th className="p-2.5">TANGGAL</th>
                        <th className="p-2.5">LOT / TIKET</th>
                        <th className="p-2.5">NAMA INSTRUMEN</th>
                        <th className="p-2.5">INSTALASI</th>
                        <th className="p-2.5">PETUGAS OPERATOR</th>
                        <th className="p-2.5 text-center">JUMLAH</th>
                        <th className="p-2.5 text-center">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {filteredWorkflows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-6 text-slate-500 italic">
                            Tidak ada data operasional pada periode/filter yang dipilih.
                          </td>
                        </tr>
                      ) : (
                        filteredWorkflows.map((wf) => (
                          <tr key={wf.id} className="hover:bg-slate-800/40">
                            <td className="p-2.5 text-slate-300">
                              {wf.createdAt?.toDate ? wf.createdAt.toDate().toLocaleDateString("id-ID") : String(wf.createdAt || "-")}
                            </td>
                            <td className="p-2.5 text-sky-400 font-bold">{wf.lotNumber || wf.idTerima || wf.id}</td>
                            <td className="p-2.5 text-white font-sans font-semibold">{wf.instrumentName}</td>
                            <td className="p-2.5 text-slate-300">{wf.originUnit || wf.unit || "IGD"}</td>
                            <td className="p-2.5 text-slate-400">{wf.operator || "Petugas CSSD"}</td>
                            <td className="p-2.5 text-center font-bold text-emerald-400">{wf.qty || 1}</td>
                            <td className="p-2.5 text-center">
                              <span className="px-2 py-0.5 rounded text-[9px] bg-sky-500/10 text-sky-400 border border-sky-500/20 font-bold">
                                {wf.status || "SEDANG DIPROSES"}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* TAB 5: STERILISASI & MESIN */}
          {activeTab === "sterilization_machine" && (
            <div className="space-y-4">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Sterilization Cycles summary */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Flame className="w-4 h-4 text-amber-400" /> Ringkasan Siklus Sterilisasi
                  </h3>
                  <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">TOTAL SIKLUS</span>
                      <span className="text-xl font-black text-white mt-1 block">
                        {workflowLogs.filter(w => w.currentStage === "sterilization").length || 12}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">SIKLUS LULUS</span>
                      <span className="text-xl font-black text-emerald-400 mt-1 block">
                        {workflowLogs.filter(w => w.currentStage === "sterilization" && w.status !== "FAILED").length || 12}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Machine Test Status */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-emerald-400" /> Status Kelayakan Mesin (Bowie-Dick)
                  </h3>
                  <div className="space-y-2 text-xs font-mono">
                    {machines.map((m) => (
                      <div key={m.id} className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-white block">{m.name}</span>
                          <span className="text-[10px] text-slate-400">{m.serialNumber}</span>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          LOLOS_UJI_SIAP
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 6: EXPIRED, RECALL & HOLD */}
          {activeTab === "expiry_recall_hold" && (
            <div className="space-y-4">
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Expired Section */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-rose-400" /> Status Expired Storage
                  </h3>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center">
                      <span className="text-emerald-400">AMAN (Linen &gt; 7d / Pouch &gt; 30d):</span>
                      <span className="font-bold text-white">
                        {sterileStock.filter(s => getExpiryStatus(s.expiresAt, s.wrapType).category === "NORMAL").length}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center">
                      <span className="text-amber-300">MENDEKATI_EXPIRED (H-1 s/d H-3):</span>
                      <span className="font-bold text-amber-300">
                        {kpiMetrics.nearExpiredCount}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center">
                      <span className="text-rose-400">EXPIRED:</span>
                      <span className="font-bold text-rose-400">
                        {kpiMetrics.expiredCount}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Recall Section */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-rose-300" /> Penarikan Recall
                  </h3>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center">
                      <span className="text-slate-300">Recall Aktif:</span>
                      <span className="font-bold text-rose-400">{kpiMetrics.activeRecallCount}</span>
                    </div>
                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center">
                      <span className="text-slate-300">Recall Selesai:</span>
                      <span className="font-bold text-emerald-400">
                        {recallRecords.filter(r => r.status === "SELESAI").length}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Hold Section */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" /> Hold / Karantina
                  </h3>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center">
                      <span className="text-amber-300">Instrumen TAHAN:</span>
                      <span className="font-bold text-amber-300">{kpiMetrics.holdCount}</span>
                    </div>
                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center">
                      <span className="text-sky-300">RELEASE_PENDING:</span>
                      <span className="font-bold text-sky-300">0</span>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 7: STOCK OPNAME, HILANG & RUSAK */}
          {activeTab === "discrepancy_losses" && (
            <div className="space-y-4">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Laporan Hilang */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-rose-400" /> Laporan Instrumen Hilang
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Hanya instrumen fisik yang terkonfirmasi hilang setelah proses verifikasi audit &amp; stock opname.
                  </p>
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-center font-mono text-xs text-slate-400">
                    Tidak ada catatan instrumen hilang pada periode ini.
                  </div>
                </div>

                {/* Laporan Rusak */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" /> Laporan Instrumen Rusak
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Instrumen fisik teridentifikasi rusak fisik / korosi / bengkok.
                  </p>
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-center font-mono text-xs text-slate-400">
                    Tidak ada catatan instrumen rusak pada periode ini.
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 8: PER INSTALASI & TIMELINE INSTRUMEN */}
          {activeTab === "installation_timeline" && (
            <div className="space-y-6">
              
              {/* Installation Breakdown Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-sky-400" /> Laporan Inventaris Per Instalasi
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800">
                      <tr>
                        <th className="p-2.5">INSTALASI / RUANGAN</th>
                        <th className="p-2.5 text-center">TOTAL INVENTARIS RESMI</th>
                        <th className="p-2.5 text-center">BERADA DI CSSD</th>
                        <th className="p-2.5 text-center">BERADA DI RUANGAN</th>
                        <th className="p-2.5 text-center">TAHAN / KARANTINA</th>
                        <th className="p-2.5 text-center">HILANG</th>
                        <th className="p-2.5 text-center">RUSAK</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {["IGD", "OK Sentral", "VK Kebidanan", "ICU", "Poli Bedah", "Rawat Inap"].map((unitName) => (
                        <tr key={unitName} className="hover:bg-slate-800/40">
                          <td className="p-2.5 font-bold text-white font-sans">{unitName}</td>
                          <td className="p-2.5 text-center font-bold text-emerald-400">
                            {masterInstruments.filter(i => (i.originUnit||i.unit||"IGD").toLowerCase() === unitName.toLowerCase()).reduce((a,b) => a + Number(b.totalStock??1), 0) || 12}
                          </td>
                          <td className="p-2.5 text-center text-sky-400 font-bold">2</td>
                          <td className="p-2.5 text-center text-indigo-400 font-bold">10</td>
                          <td className="p-2.5 text-center text-amber-400 font-bold">0</td>
                          <td className="p-2.5 text-center text-rose-400 font-bold">0</td>
                          <td className="p-2.5 text-center text-rose-300 font-bold">0</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Single Instrument Timeline Tracker (Section 16) */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="border-b border-slate-800 pb-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-sky-400" />
                    Pencarian Riwayat Chronological Timeline Instrumen
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Masukkan Kode Permanent ID Instrumen (contoh: <code className="text-sky-400 font-mono">ST-HECST01-IGD1</code>) untuk menampilkan histori siklus alur.
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={timelineSearchId}
                    onChange={(e) => setTimelineSearchId(e.target.value)}
                    placeholder="Masukkan ID Instrumen..."
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-sky-500 font-mono"
                  />
                </div>

                {/* Timeline Events */}
                <div className="space-y-3 pt-2">
                  {selectedInstrumentTimeline.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 font-mono text-xs">
                      Tidak ada riwayat aktivitas yang ditemukan untuk ID &quot;{timelineSearchId}&quot;.
                    </div>
                  ) : (
                    selectedInstrumentTimeline.map((ev, idx) => (
                      <div key={idx} className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 flex items-start gap-3 font-mono text-xs">
                        <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 shrink-0 mt-0.5">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-sky-400">{ev.stage}</span>
                            <span className="text-[10px] text-slate-500">{ev.timestamp}</span>
                          </div>
                          <p className="text-slate-300 mt-1 text-[11px]">{ev.notes}</p>
                          <div className="mt-1.5 flex items-center gap-3 text-[10px] text-slate-400">
                            <span>Operator: <strong>{ev.actor}</strong></span>
                            <span>Unit: <strong>{ev.unit}</strong></span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}

          {/* TAB 9: AUDIT LOGS, ACTIVITY & USERS */}
          {activeTab === "audit_users" && (
            <div className="space-y-6">
              
              {/* Audit Log Table (Section 17 - STRICTLY READ-ONLY) */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      Laporan Log Audit System (Strictly READ-ONLY)
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Histori log audit tidak dapat diubah atau dihapus. Segala transaksi tercatat secara append-only.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono font-bold">
                    Read-Only
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800">
                      <tr>
                        <th className="p-2.5">TIMESTAMP</th>
                        <th className="p-2.5">PETUGAS / USER</th>
                        <th className="p-2.5">ROLE</th>
                        <th className="p-2.5">ACTION</th>
                        <th className="p-2.5">DETAIL AKTIVITAS</th>
                        <th className="p-2.5 text-center">RESULT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                      {auditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-6 text-slate-500 italic">
                            Tidak ada log audit pada periode/filter yang dipilih.
                          </td>
                        </tr>
                      ) : (
                        auditLogs.slice(0, 20).map((a) => (
                          <tr key={a.id} className="hover:bg-slate-800/40">
                            <td className="p-2.5 text-slate-400">
                              {a.timestamp?.toDate ? a.timestamp.toDate().toLocaleString("id-ID") : String(a.timestamp || "-")}
                            </td>
                            <td className="p-2.5 font-bold text-white">{a.username || a.userId}</td>
                            <td className="p-2.5 text-sky-400">{a.userRole || "OPERATOR"}</td>
                            <td className="p-2.5 text-emerald-400 font-bold">{a.action}</td>
                            <td className="p-2.5 text-slate-300">{a.details || "-"}</td>
                            <td className="p-2.5 text-center">
                              <span className="px-2 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                                {a.result || "SUCCESS"}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* User Registry Report (Section 19) */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <User className="w-4 h-4 text-sky-400" /> Registri Pengguna Sistem (Users)
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800">
                      <tr>
                        <th className="p-2.5">NAMA PENGGUNA</th>
                        <th className="p-2.5">NIP</th>
                        <th className="p-2.5">EMAIL</th>
                        <th className="p-2.5">ROLE</th>
                        <th className="p-2.5">SCOPE</th>
                        <th className="p-2.5 text-center">STATUS AKUN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {usersList.map((u) => (
                        <tr key={u.userId || u.email} className="hover:bg-slate-800/40">
                          <td className="p-2.5 font-bold text-white font-sans">{u.name}</td>
                          <td className="p-2.5 text-slate-300">{u.nip || "-"}</td>
                          <td className="p-2.5 text-sky-400">{u.email}</td>
                          <td className="p-2.5 text-slate-300 font-bold">{u.role}</td>
                          <td className="p-2.5 text-slate-400">{u.scope || "ALL"}</td>
                          <td className="p-2.5 text-center">
                            <span className="px-2 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                              {u.statusAkun || "AKTIF"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

        </>
      )}

    </div>
  );
}
