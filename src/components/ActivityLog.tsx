import React, { useState, useEffect, useMemo } from "react";
import { db } from "../lib/firebase";
import { collection, onSnapshot, query, orderBy, limit, where } from "firebase/firestore";
import { 
  Activity, 
  Search, 
  Filter, 
  Calendar, 
  User, 
  Download, 
  Shield, 
  FileText, 
  Layers, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ArrowRight, 
  ChevronRight, 
  ChevronDown, 
  Copy, 
  ExternalLink, 
  Plus, 
  Tag, 
  Building2, 
  Printer, 
  RotateCcw, 
  FileSpreadsheet, 
  Eye, 
  History, 
  Package, 
  Flame, 
  Droplets, 
  Lock, 
  ShieldAlert, 
  Edit3,
  Check,
  Info,
  X,
  HelpCircle,
  Truck
} from "lucide-react";
import { AuditLog, AuditActionResult, UserProfile } from "../types";
import { requireTenantId } from "../lib/permissions";
import { 
  getStoredDemoAuditLogs, 
  saveDemoAuditLogs, 
  writeAuditLog, 
  formatAuditDate, 

} from "../lib/auditLogger";

interface ActivityLogProps {
  currentUsername: string;
  isDemoMode?: boolean;
  defaultFilter?: string;
  initialInstrumentSearch?: string;
  currentUserProfile?: UserProfile | null;
}

export default function ActivityLog({ 
  currentUsername, 
  isDemoMode = false, 
  defaultFilter = "all",
  initialInstrumentSearch = "",
  currentUserProfile = null
}: ActivityLogProps) {
  let resolvedTenantId = "";
  try {
    resolvedTenantId = requireTenantId(currentUserProfile);
  } catch (e) {
    resolvedTenantId = "";
  }
  // Sub-Navigation Tabs
  const [activeSubTab, setActiveSubTab] = useState<
    "audit_main" | "instrument_trace" | "transaction_history" | "user_activity" | "inventory_history" | "security_logs"
  >("audit_main");

  // Main Audit Log state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters state
  const [searchQuery, setSearchQuery] = useState<string>(initialInstrumentSearch);
  const [timeRange, setTimeRange] = useState<string>("all"); // 'all', 'today', '7days', '30days'
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [installationFilter, setInstallationFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [resultFilter, setResultFilter] = useState<string>("all");

  // Selected Instrument for Traceability View
  const [selectedTraceInstrumentId, setSelectedTraceInstrumentId] = useState<string>(
    initialInstrumentSearch || "ST-HECST01-IGD1"
  );

  // Modals state
  const [selectedAuditDetail, setSelectedAuditDetail] = useState<AuditLog | null>(null);
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState<boolean>(false);
  const [targetCorrectionLog, setTargetCorrectionLog] = useState<AuditLog | null>(null);
  const [correctionReason, setCorrectionReason] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Auto toast message timer
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Fetch or subscribe to Audit Logs
  useEffect(() => {
    setLoading(true);

    if (isDemoMode) {
      const demoLogs = getStoredDemoAuditLogs(resolvedTenantId);
      setAuditLogs(demoLogs);
      setLoading(false);

      // Listen to demo store changes
      const handleDemoChange = () => {
        setAuditLogs(getStoredDemoAuditLogs(resolvedTenantId));
      };
      window.addEventListener("cssd_demo_store_change", handleDemoChange);
      return () => window.removeEventListener("cssd_demo_store_change", handleDemoChange);
    } else {
      // Real Firestore subscription
      const q = query(
        collection(db, "audit_logs"),
        where("tenantId", "==", resolvedTenantId),
        orderBy("timestamp", "desc"),
        limit(200)
      );

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const list: AuditLog[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            list.push({
              id: data.id || docSnap.id,
              timestamp: data.timestamp,
              timestampStr: formatAuditDate(data.timestamp),
              tenantId: data.tenantId || resolvedTenantId,
              installationId: data.installationId || "CSSD",
              userId: data.userId || "USR-000",
              userName: data.userName || "Operator",
              userRole: data.userRole || "PETUGAS_CSSD",
              action: data.action || "LOG",
              module: data.module || "SYSTEM",
              entityType: data.entityType || "SYSTEM",
              entityId: data.entityId || "",
              instrumentId: data.instrumentId || "",
              transactionId: data.transactionId || "",
              ticketId: data.ticketId || "",
              beforeState: data.beforeState || "-",
              afterState: data.afterState || "-",
              beforeLocation: data.beforeLocation || "-",
              afterLocation: data.afterLocation || "-",
              reason: data.reason || "-",
              referenceId: data.referenceId || "",
              result: data.result || "SUCCESS",
              deviceInfo: data.deviceInfo || "Web App"
            });
          });

          // Combine with initial demo seed if empty for fallback rich testing
          if (list.length === 0) {
            const demoLogs = getStoredDemoAuditLogs(resolvedTenantId);
            setAuditLogs(demoLogs);
          } else {
            setAuditLogs(list);
          }
          setLoading(false);
        },
        (err) => {
          console.warn("Firestore audit logs listener warning, using local audit store:", err);
          setAuditLogs(getStoredDemoAuditLogs(resolvedTenantId));
          setLoading(false);
        }
      );

      return () => unsubscribe();
    }
  }, [isDemoMode]);

  // Handle initial filter prop
  useEffect(() => {
    if (defaultFilter && defaultFilter !== "all") {
      if (defaultFilter === "rejected") {
        setResultFilter("REJECTED");
      } else if (defaultFilter === "correction") {
        setActionFilter("CORRECTION");
      } else {
        setModuleFilter(defaultFilter.toUpperCase());
      }
    }
  }, [defaultFilter]);

  // Filtering Logic
  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      // 1. Time Range Filter
      if (timeRange !== "all") {
        const logTime = new Date(log.timestamp?.toDate ? log.timestamp.toDate() : log.timestamp || 0).getTime();
        const now = Date.now();
        if (timeRange === "today" && now - logTime > 86400000) return false;
        if (timeRange === "7days" && now - logTime > 7 * 86400000) return false;
        if (timeRange === "30days" && now - logTime > 30 * 86400000) return false;
      }

      // 2. Tenant Filter
      if (tenantFilter !== "all" && log.tenantId !== tenantFilter) {
        return false;
      }

      // 3. Installation Filter
      if (installationFilter !== "all" && log.installationId !== installationFilter) {
        return false;
      }

      // 4. Role Filter
      if (roleFilter !== "all" && log.userRole !== roleFilter) {
        return false;
      }

      // 5. Action Filter
      if (actionFilter !== "all" && log.action !== actionFilter) {
        return false;
      }

      // 6. Module Filter
      if (moduleFilter !== "all" && log.module !== moduleFilter) {
        return false;
      }

      // 7. Result Filter
      if (resultFilter !== "all" && log.result !== resultFilter) {
        return false;
      }

      // 8. Search Query (Optimized for ID Instrumen, User, Action, Ticket ID)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const instId = (log.instrumentId || "").toLowerCase();
        const logId = (log.id || "").toLowerCase();
        const user = (log.userName || "").toLowerCase();
        const action = (log.action || "").toLowerCase();
        const ticket = (log.ticketId || "").toLowerCase();
        const trans = (log.transactionId || "").toLowerCase();
        const reason = (log.reason || "").toLowerCase();

        return (
          instId.includes(q) ||
          logId.includes(q) ||
          user.includes(q) ||
          action.includes(q) ||
          ticket.includes(q) ||
          trans.includes(q) ||
          reason.includes(q)
        );
      }

      return true;
    });
  }, [
    auditLogs,
    timeRange,
    tenantFilter,
    installationFilter,
    roleFilter,
    actionFilter,
    moduleFilter,
    resultFilter,
    searchQuery
  ]);

  // Derived Statistics for Audit Header Summary
  const stats = useMemo(() => {
    let success = 0;
    let rejected = 0;
    let failed = 0;
    let corrections = 0;

    auditLogs.forEach((l) => {
      if (l.result === "SUCCESS") success++;
      if (l.result === "REJECTED") rejected++;
      if (l.result === "FAILED") failed++;
      if (l.action === "CORRECTION") corrections++;
    });

    return {
      total: auditLogs.length,
      success,
      rejected,
      failed,
      corrections
    };
  }, [auditLogs]);

  // User Activity Summary for User Tab
  const userSummary = useMemo(() => {
    const map: Record<string, { name: string; role: string; count: number; rejectedCount: number; lastActive: string }> = {};

    auditLogs.forEach((log) => {
      const key = log.userId || log.userName;
      if (!map[key]) {
        map[key] = {
          name: log.userName || "Operator",
          role: log.userRole || "PETUGAS_CSSD",
          count: 0,
          rejectedCount: 0,
          lastActive: log.timestampStr || "-"
        };
      }
      map[key].count++;
      if (log.result === "REJECTED") {
        map[key].rejectedCount++;
      }
    });

    return Object.values(map);
  }, [auditLogs]);

  // Copy helper
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    showToast(`${label} disalin: ${text}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Submit Admin Correction Log (Append-Only!)
  const handleCreateCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCorrectionLog || !correctionReason.trim()) return;

    const correctionEntry = await writeAuditLog({
      tenantId: targetCorrectionLog.tenantId,
      installationId: targetCorrectionLog.installationId,
      userId: "USR-ADMIN-01",
      userName: currentUsername || "Administrator",
      userRole: "ADMIN",
      action: "CORRECTION",
      module: targetCorrectionLog.module,
      entityType: "AUDIT",
      entityId: targetCorrectionLog.id,
      instrumentId: targetCorrectionLog.instrumentId,
      transactionId: `TX-CORR-${Date.now().toString().slice(-4)}`,
      ticketId: targetCorrectionLog.ticketId,
      beforeState: targetCorrectionLog.afterState,
      afterState: `${targetCorrectionLog.afterState} (Dikoreksi)`,
      beforeLocation: targetCorrectionLog.afterLocation,
      afterLocation: targetCorrectionLog.afterLocation,
      reason: `KOREKSI DATA LOG #${targetCorrectionLog.id}: ${correctionReason}`,
      referenceId: targetCorrectionLog.id,
      result: "SUCCESS",
      deviceInfo: "Admin Console / Correction Tool"
    });

    showToast(`Log Koreksi #${correctionEntry.id} berhasil dicatat (Append-Only).`);
    setIsCorrectionModalOpen(false);
    setTargetCorrectionLog(null);
    setCorrectionReason("");
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredAuditLogs.length === 0) {
      showToast("Tidak ada data log untuk diexport!");
      return;
    }

    const headers = [
      "ID Log",
      "Waktu",
      "Tenant",
      "Instalasi",
      "User",
      "Role",
      "Aksi",
      "Modul",
      "ID Instrumen",
      "State Sebelum",
      "State Sesudah",
      "Lokasi Sebelum",
      "Lokasi Sesudah",
      "Hasil",
      "Alasan/Catatan"
    ];

    const rows = filteredAuditLogs.map((l) => [
      `"${l.id}"`,
      `"${l.timestampStr || ""}"`,
      `"${l.tenantId}"`,
      `"${l.installationId || "-"}"`,
      `"${l.userName}"`,
      `"${l.userRole}"`,
      `"${l.action}"`,
      `"${l.module}"`,
      `"${l.instrumentId || "-"}"`,
      `"${l.beforeState || "-"}"`,
      `"${l.afterState || "-"}"`,
      `"${l.beforeLocation || "-"}"`,
      `"${l.afterLocation || "-"}"`,
      `"${l.result}"`,
      `"${(l.reason || "-").replace(/"/g, '""')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Audit_Log_eCSSD_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast("Audit Log berhasil diexport ke CSV!");
  };

  // Result Badge Color
  const getResultBadge = (result: AuditActionResult) => {
    switch (result) {
      case "SUCCESS":
        return "bg-emerald-950/80 border-emerald-700 text-emerald-300";
      case "WARNING":
        return "bg-amber-950/80 border-amber-700 text-amber-300";
      case "REJECTED":
        return "bg-rose-950/80 border-rose-700 text-rose-300 font-black animate-pulse";
      case "FAILED":
        return "bg-red-950/80 border-red-700 text-red-300 font-bold";
      case "CANCELLED":
        return "bg-slate-800 border-slate-700 text-slate-400";
      default:
        return "bg-slate-800 text-slate-300 border-slate-700";
    }
  };

  return (
    <div className="space-y-6 text-slate-100">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-sky-600 text-white px-4 py-3 rounded-2xl shadow-2xl border border-sky-400 flex items-center gap-3 animate-bounce">
          <Info className="w-5 h-5 text-amber-300" />
          <span className="text-xs font-bold">{toastMessage}</span>
        </div>
      )}

      {/* HEADER PAGE */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none">
          <ShieldAlert className="w-64 h-64 text-sky-400" />
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-sky-600/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
                  <span>AUDIT LOG & LOG AKTIVITAS e-CSSD</span>
                  <span className="text-[10px] bg-rose-950 border border-rose-800 text-rose-300 px-2 py-0.5 rounded-full uppercase tracking-wider font-mono font-bold">
                    LOCKED APPEND-ONLY
                  </span>
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Jejak rekam permanen seluruh transaksi, perubahan status, penolakan scan, dan riwayat alat medis.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold transition shadow-md cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Export CSV / Excel</span>
            </button>

            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold transition shadow-md cursor-pointer"
            >
              <Printer className="w-4 h-4 text-sky-400" />
              <span>Cetak Cetak Thermal / PDF</span>
            </button>
          </div>
        </div>

        {/* STATS METRICS CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5 pt-4 border-t border-slate-800/80">
          <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">TOTAL LOG</span>
            <span className="text-lg font-black font-mono text-sky-400">{stats.total}</span>
          </div>
          <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">BERHASIL (PASS)</span>
            <span className="text-lg font-black font-mono text-emerald-400">{stats.success}</span>
          </div>
          <div 
            onClick={() => setResultFilter("REJECTED")}
            className="bg-slate-950/80 border border-rose-900/50 p-3 rounded-xl cursor-pointer hover:border-rose-600 transition"
          >
            <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider block flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> SCAN DITOLAK
            </span>
            <span className="text-lg font-black font-mono text-rose-400">{stats.rejected}</span>
          </div>
          <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">GAGAL (FAILED)</span>
            <span className="text-lg font-black font-mono text-red-400">{stats.failed}</span>
          </div>
          <div 
            onClick={() => setActionFilter("CORRECTION")}
            className="bg-slate-950/80 border border-purple-900/50 p-3 rounded-xl cursor-pointer hover:border-purple-600 transition"
          >
            <span className="text-[10px] text-purple-300 font-bold uppercase tracking-wider block">LOG KOREKSI</span>
            <span className="text-lg font-black font-mono text-purple-400">{stats.corrections}</span>
          </div>
        </div>
      </div>

      {/* SUB-NAVIGATION TABS */}
      <div className="flex items-center gap-2 border-b border-slate-800 overflow-x-auto pb-1 scrollbar-thin">
        <button
          onClick={() => setActiveSubTab("audit_main")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
            activeSubTab === "audit_main"
              ? "bg-sky-600 text-white shadow-lg border border-sky-500"
              : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>📋 Audit Log Utama ({filteredAuditLogs.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab("instrument_trace")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
            activeSubTab === "instrument_trace"
              ? "bg-sky-600 text-white shadow-lg border border-sky-500"
              : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
          }`}
        >
          <Search className="w-4 h-4 text-amber-300" />
          <span>🔍 Histori Lifecycle Instrumen</span>
        </button>

        <button
          onClick={() => setActiveSubTab("transaction_history")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
            activeSubTab === "transaction_history"
              ? "bg-sky-600 text-white shadow-lg border border-sky-500"
              : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
          }`}
        >
          <RotateCcw className="w-4 h-4 text-cyan-300" />
          <span>🔄 Transaksi Operasional</span>
        </button>

        <button
          onClick={() => setActiveSubTab("user_activity")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
            activeSubTab === "user_activity"
              ? "bg-sky-600 text-white shadow-lg border border-sky-500"
              : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
          }`}
        >
          <User className="w-4 h-4 text-emerald-300" />
          <span>👤 Ringkasan Petugas</span>
        </button>

        <button
          onClick={() => setActiveSubTab("inventory_history")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
            activeSubTab === "inventory_history"
              ? "bg-sky-600 text-white shadow-lg border border-sky-500"
              : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
          }`}
        >
          <Package className="w-4 h-4 text-purple-300" />
          <span>📦 Adjust Stok & Opname</span>
        </button>

        <button
          onClick={() => setActiveSubTab("security_logs")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
            activeSubTab === "security_logs"
              ? "bg-sky-600 text-white shadow-lg border border-sky-500"
              : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
          }`}
        >
          <Shield className="w-4 h-4 text-rose-300" />
          <span>🛡️ Keamanan & Sesi</span>
        </button>
      </div>

      {/* SUB-TAB 1: AUDIT LOG UTAMA */}
      {activeSubTab === "audit_main" && (
        <div className="space-y-4">
          {/* SEARCH & FILTER CONTROLS BAR */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3">
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
              {/* Specialized ID Instrumen & Keyword Search */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-sky-400" />
                <input
                  type="text"
                  placeholder="Cari ID Instrumen (contoh: ST-HECST01-IGD1), Petugas, Tiket, atau No. Transaksi..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-10 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Time Range Filter */}
              <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 p-1 rounded-xl">
                <Calendar className="w-3.5 h-3.5 text-slate-400 ml-2" />
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                  className="bg-transparent border-0 text-xs font-bold text-slate-200 focus:ring-0 cursor-pointer pr-4"
                >
                  <option value="all" className="bg-slate-900">Semua Waktu</option>
                  <option value="today" className="bg-slate-900">Hari Ini</option>
                  <option value="7days" className="bg-slate-900">7 Hari Terakhir</option>
                  <option value="30days" className="bg-slate-900">30 Hari Terakhir</option>
                </select>
              </div>
            </div>

            {/* SECONDARY FILTER DROPDOWNS */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-2 border-t border-slate-800/60 text-xs">
              {/* Tenant */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Tenant ID:</label>
                <select
                  value={tenantFilter}
                  onChange={(e) => setTenantFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1 px-2 text-slate-200 text-xs font-mono"
                >
                  <option value="all">Semua Tenant</option>
                  {resolvedTenantId && <option value={resolvedTenantId}>{resolvedTenantId}</option>}
                </select>
              </div>

              {/* Instalasi */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Instalasi / Unit:</label>
                <select
                  value={installationFilter}
                  onChange={(e) => setInstallationFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1 px-2 text-slate-200 text-xs"
                >
                  <option value="all">Semua Unit</option>
                  <option value="CSSD">CSSD</option>
                  <option value="IGD">IGD</option>
                  <option value="IBS">IBS / OK</option>
                  <option value="ICU">ICU</option>
                  <option value="POLI-GIGI">Poli Gigi</option>
                </select>
              </div>

              {/* Modul */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Modul Proses:</label>
                <select
                  value={moduleFilter}
                  onChange={(e) => setModuleFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1 px-2 text-slate-200 text-xs"
                >
                  <option value="all">Semua Modul</option>
                  <option value="PENERIMAAN">PENERIMAAN</option>
                  <option value="DEKONTAMINASI">DEKONTAMINASI</option>
                  <option value="PACKING">PACKING</option>
                  <option value="STERILISASI">STERILISASI</option>
                  <option value="RAK">RAK STERIL</option>
                  <option value="DISTRIBUSI">DISTRIBUSI</option>
                  <option value="INVENTORY">INVENTARIS</option>
                  <option value="MASTER">MASTER DATA</option>
                </select>
              </div>

              {/* Action */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Aksi Spasifik:</label>
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1 px-2 text-slate-200 text-xs"
                >
                  <option value="all">Semua Aksi</option>
                  <option value="CONFIRM_RECEIVING">CONFIRM_RECEIVING</option>
                  <option value="SCAN_REJECTED">SCAN_REJECTED</option>
                  <option value="COMPLETE_DECONTAMINATION">DECONTAM_COMPLETE</option>
                  <option value="PACKING_PASS">PACKING_PASS</option>
                  <option value="STERILIZATION_PASS">STERILIZATION_PASS</option>
                  <option value="MOVE_TO_RACK">MOVE_TO_RACK</option>
                  <option value="DISTRIBUTE">DISTRIBUTE</option>
                  <option value="CORRECTION">CORRECTION</option>
                  <option value="MASTER_INSTRUMENT_CREATED">MASTER_CREATED</option>
                </select>
              </div>

              {/* Role */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Peran User:</label>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1 px-2 text-slate-200 text-xs"
                >
                  <option value="all">Semua Role</option>
                  <option value="PETUGAS_CSSD">PETUGAS_CSSD</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="PETUGAS_INSTALASI">PETUGAS_INSTALASI</option>
                </select>
              </div>

              {/* Hasil */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Hasil (Result):</label>
                <select
                  value={resultFilter}
                  onChange={(e) => setResultFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1 px-2 text-slate-200 text-xs font-bold"
                >
                  <option value="all">Semua Hasil</option>
                  <option value="SUCCESS">SUCCESS 🟢</option>
                  <option value="REJECTED">REJECTED 🔴</option>
                  <option value="WARNING">WARNING 🟡</option>
                  <option value="FAILED">FAILED 🔴</option>
                </select>
              </div>
            </div>
          </div>

          {/* MAIN AUDIT TABLE */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs">
              <span className="font-mono text-slate-400">
                Menampilkan <strong className="text-sky-400">{filteredAuditLogs.length}</strong> dari {auditLogs.length} rekaman audit
              </span>
              <span className="text-[10px] text-amber-300 font-mono">
                🔒 Data bersifat Imutabel & Append-Only
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider font-mono border-b border-slate-800">
                    <th className="py-3 px-4">Waktu (Date/Time)</th>
                    <th className="py-3 px-4">Petugas & Role</th>
                    <th className="py-3 px-4">Aksi & Modul</th>
                    <th className="py-3 px-4">ID Instrumen</th>
                    <th className="py-3 px-4">Perubahan State / Lokasi</th>
                    <th className="py-3 px-4">Hasil</th>
                    <th className="py-3 px-4 text-right">Opsi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-sky-400 mb-2" />
                        <span>Memuat log audit dari Firestore...</span>
                      </td>
                    </tr>
                  ) : filteredAuditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        <Activity className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                        <p className="font-bold">Tidak ada log audit yang cocok dengan filter.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredAuditLogs.map((log) => {
                      const isRejected = log.result === "REJECTED";
                      const isCorrection = log.action === "CORRECTION";

                      return (
                        <tr 
                          key={log.id} 
                          className={`hover:bg-slate-800/40 transition group ${
                            isRejected ? "bg-rose-950/20" : isCorrection ? "bg-purple-950/20" : ""
                          }`}
                        >
                          {/* Waktu */}
                          <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-300">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3 h-3 text-sky-400" />
                              <span>{log.timestampStr || formatAuditDate(log.timestamp)}</span>
                            </div>
                            <span className="text-[9px] text-slate-500 block">{log.id}</span>
                          </td>

                          {/* Petugas */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="font-bold text-slate-200 block text-xs">{log.userName}</span>
                            <span className="text-[10px] font-mono text-cyan-300 uppercase">{log.userRole}</span>
                          </td>

                          {/* Aksi & Modul */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider font-mono ${
                                isCorrection ? "bg-purple-900 border border-purple-600 text-purple-200" :
                                isRejected ? "bg-rose-900 border border-rose-600 text-rose-200" :
                                "bg-slate-800 border border-slate-700 text-sky-300"
                              }`}>
                                {log.action}
                              </span>
                              <span className="text-[10px] text-slate-400 uppercase font-mono">
                                [{log.module}]
                              </span>
                            </div>
                            {log.reason && log.reason !== "-" && (
                              <p className="text-[11px] text-slate-400 mt-1 line-clamp-1 max-w-xs">
                                {log.reason}
                              </p>
                            )}
                          </td>

                          {/* ID Instrumen */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            {log.instrumentId ? (
                              <button
                                onClick={() => {
                                  setSelectedTraceInstrumentId(log.instrumentId!);
                                  setActiveSubTab("instrument_trace");
                                }}
                                className="px-2.5 py-1 rounded-lg bg-sky-950 border border-sky-800 text-sky-300 font-mono text-xs font-bold hover:bg-sky-900 transition flex items-center gap-1 cursor-pointer"
                                title="Klik untuk melacak histori penuh alat ini"
                              >
                                <Tag className="w-3 h-3 text-amber-300" />
                                <span>{log.instrumentId}</span>
                              </button>
                            ) : (
                              <span className="text-slate-600 font-mono text-xs">-</span>
                            )}
                          </td>

                          {/* State & Location Diff */}
                          <td className="py-3 px-4 text-xs">
                            <div className="flex items-center gap-1 text-[11px] text-slate-300">
                              <span className="text-slate-400">{log.beforeState || "-"}</span>
                              <ArrowRight className="w-3 h-3 text-sky-400 shrink-0" />
                              <span className="font-bold text-emerald-300">{log.afterState || "-"}</span>
                            </div>
                            {(log.beforeLocation || log.afterLocation) && (
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                📍 {log.beforeLocation || "-"} → {log.afterLocation || "-"}
                              </div>
                            )}
                          </td>

                          {/* Hasil */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border font-mono ${getResultBadge(log.result)}`}>
                              {log.result}
                            </span>
                          </td>

                          {/* Option Buttons */}
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setSelectedAuditDetail(log)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 transition cursor-pointer"
                                title="Lihat Detail Log Lengkap"
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                              {/* Admin Correction Trigger */}
                              <button
                                onClick={() => {
                                  setTargetCorrectionLog(log);
                                  setIsCorrectionModalOpen(true);
                                }}
                                className="p-1.5 rounded-lg bg-purple-950/80 hover:bg-purple-900 border border-purple-800 text-purple-300 transition cursor-pointer"
                                title="Catat Koreksi Data untuk Log Ini"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                            </div>
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

      {/* SUB-TAB 2: HISTORI LIFECYCLE INSTRUMEN (TRACEABILITY) */}
      {activeSubTab === "instrument_trace" && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row items-center gap-3">
            <span className="text-xs font-bold text-slate-300 whitespace-nowrap">
              Masukkan / Pilih ID Instrumen Medis:
            </span>
            <div className="relative flex-1 w-full">
              <Tag className="w-4 h-4 absolute left-3 top-2.5 text-amber-300" />
              <input
                type="text"
                placeholder="Contoh: ST-HECST01-IGD1"
                value={selectedTraceInstrumentId}
                onChange={(e) => setSelectedTraceInstrumentId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white font-mono font-bold focus:border-amber-400 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedTraceInstrumentId("ST-HECST01-IGD1")}
                className="px-3 py-1.5 rounded-xl bg-slate-800 text-xs font-mono text-amber-300 border border-slate-700 hover:bg-slate-700 transition"
              >
                Sample: ST-HECST01-IGD1
              </button>
            </div>
          </div>

          {/* Lifecycle Timeline Visualizer */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Jejak Siklus Fisik Instrumen</span>
                  <span className="font-mono text-amber-300 bg-amber-950 border border-amber-800 px-2.5 py-0.5 rounded-lg text-xs">
                    {selectedTraceInstrumentId || "Semua"}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Menampilkan urutan kronologis sejak registrasi master, penerimaan, dekontaminasi, sterilisasi, hingga penyerahan.
                </p>
              </div>
            </div>

            {(() => {
              const instrumentLogs = auditLogs.filter(
                (l) => (l.instrumentId || "").toLowerCase() === selectedTraceInstrumentId.toLowerCase().trim()
              );

              if (instrumentLogs.length === 0) {
                return (
                  <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
                    <History className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                    <h4 className="text-sm font-bold text-slate-300">Belum Ada Rekaman Audit</h4>
                    <p className="text-xs text-slate-500 mt-1">
                      ID Instrumen "<span className="font-mono text-amber-300">{selectedTraceInstrumentId}</span>" tidak ditemukan pada log audit.
                    </p>
                  </div>
                );
              }

              return (
                <div className="relative pl-6 border-l-2 border-sky-500/40 space-y-6 my-2">
                  {instrumentLogs.map((log, index) => (
                    <div key={log.id} className="relative group">
                      {/* Timeline Dot */}
                      <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-slate-900 border-2 border-sky-400 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                      </div>

                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2 hover:border-sky-500/60 transition">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-sky-300">#{log.id}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-slate-800 text-sky-300 border border-slate-700 font-mono">
                              {log.action}
                            </span>
                            <span className="text-xs font-bold text-slate-200">[{log.module}]</span>
                          </div>
                          <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            {log.timestampStr || formatAuditDate(log.timestamp)}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-xs border-t border-slate-800/60">
                          <div>
                            <span className="text-[10px] text-slate-400 block">Status Perubahan:</span>
                            <span className="font-bold text-emerald-300">
                              {log.beforeState} → {log.afterState}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Lokasi Alur:</span>
                            <span className="font-mono text-slate-300">
                              {log.beforeLocation} → {log.afterLocation}
                            </span>
                          </div>
                        </div>

                        <div className="text-xs text-slate-400 pt-1 flex items-center justify-between">
                          <span>Oleh: <strong className="text-slate-200">{log.userName}</strong> ({log.userRole})</span>
                          {log.ticketId && log.ticketId !== "-" && (
                            <span className="font-mono text-amber-300">Tiket: {log.ticketId}</span>
                          )}
                        </div>

                        {log.reason && log.reason !== "-" && (
                          <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg text-xs text-slate-300 italic">
                            "{log.reason}"
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: TRANSAKSI OPERASIONAL */}
      {activeSubTab === "transaction_history" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-cyan-400" />
            <span>Histori Transaksi Penerimaan, Process & Distribusi</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {["PENERIMAAN", "STERILISASI", "DISTRIBUSI"].map((mod) => {
              const count = auditLogs.filter((l) => l.module === mod).length;
              return (
                <div key={mod} className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
                  <span className="text-xs font-bold text-slate-400 uppercase">{mod}</span>
                  <div className="text-2xl font-black font-mono text-sky-400 mt-1">{count} Transaction Log</div>
                  <button
                    onClick={() => {
                      setModuleFilter(mod);
                      setActiveSubTab("audit_main");
                    }}
                    className="mt-3 text-xs text-sky-300 hover:underline flex items-center gap-1 font-bold"
                  >
                    <span>Lihat di Audit Log</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: RINGKASAN PETUGAS */}
      {activeSubTab === "user_activity" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <User className="w-4 h-4 text-emerald-400" />
            <span>Rekap Aktivitas & Transaksi Per Petugas</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {userSummary.map((u, idx) => (
              <div key={idx} className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-sm text-white block">{u.name}</span>
                    <span className="text-[10px] font-mono text-cyan-300 uppercase">{u.role}</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-sky-950 border border-sky-800 text-sky-300 font-mono font-bold text-xs">
                    {u.count} Aktivitas
                  </span>
                </div>

                <div className="text-xs text-slate-400 pt-2 border-t border-slate-800 flex justify-between">
                  <span>Aktivitas Terakhir:</span>
                  <span className="font-mono text-slate-300">{u.lastActive}</span>
                </div>

                {u.rejectedCount > 0 && (
                  <div className="text-xs text-rose-400 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{u.rejectedCount} Scan Ditolak Tercatat</span>
                  </div>
                )}

                <button
                  onClick={() => {
                    setSearchQuery(u.name);
                    setActiveSubTab("audit_main");
                  }}
                  className="w-full mt-2 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs text-sky-300 font-bold border border-slate-800 transition"
                >
                  Filter Audit Log Petugas Ini
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 5: ADJUST STOK & OPNAME */}
      {activeSubTab === "inventory_history" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Package className="w-4 h-4 text-purple-400" />
            <span>Audit Trail Penyesuaian Inventaris & Discrepancy Opname</span>
          </h3>

          <p className="text-xs text-slate-400">
            Seluruh perubahan angka stok wajib melalui transaksi audit log dan persetujuan Admin tanpa edit angka mentah.
          </p>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs space-y-3">
            <div className="flex justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-slate-200">Kassa Steril 10x10cm (BMHP)</span>
              <span className="font-mono text-emerald-400">Stock Opname: Verified</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-slate-400">
              <div>Sebelum: <strong className="text-slate-200">120 Box</strong></div>
              <div>Sesudah: <strong className="text-slate-200">118 Box</strong></div>
              <div>Discrepancy: <strong className="text-rose-400">-2 Box (Rusak Kemasan)</strong></div>
              <div>Disetujui Oleh: <strong className="text-sky-300">Administrator</strong></div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 6: LOG KEAMANAN */}
      {activeSubTab === "security_logs" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-rose-400" />
            <span>Audit Keamanan Sesi & Hak Akses User</span>
          </h3>

          <div className="space-y-2">
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <div>
                  <span className="font-bold text-slate-200 block">Sesi Selesai (Logout Normal)</span>
                  <span className="text-[10px] text-slate-500 font-mono">cssdrsudbenda@gmail.com • IP: 180.252.xx.xx</span>
                </div>
              </div>
              <span className="font-mono text-slate-400 text-[11px]">03/08/2026 16:50:00</span>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL AUDIT LOG MODAL */}
      {selectedAuditDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 my-auto relative text-slate-100">
            <div className="flex justify-between items-start border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-mono font-bold text-sky-400 bg-sky-950 border border-sky-800 px-2 py-0.5 rounded uppercase">
                  #{selectedAuditDetail.id}
                </span>
                <h3 className="text-base font-bold text-white mt-1">
                  Detail Rekaman Audit
                </h3>
              </div>
              <button
                onClick={() => setSelectedAuditDetail(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
                <span className="text-[10px] text-slate-400 block">Waktu Selesai:</span>
                <span className="font-mono font-bold text-slate-200">
                  {selectedAuditDetail.timestampStr || formatAuditDate(selectedAuditDetail.timestamp)}
                </span>
              </div>

              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
                <span className="text-[10px] text-slate-400 block">Tenant & Instalasi:</span>
                <span className="font-bold text-sky-300">
                  {selectedAuditDetail.tenantId} ({selectedAuditDetail.installationId || "CSSD"})
                </span>
              </div>

              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
                <span className="text-[10px] text-slate-400 block">Petugas Pelaksana:</span>
                <span className="font-bold text-slate-200">{selectedAuditDetail.userName}</span>
                <span className="text-[10px] font-mono text-cyan-300 block uppercase">
                  Role: {selectedAuditDetail.userRole}
                </span>
              </div>

              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
                <span className="text-[10px] text-slate-400 block">Modul & Aksi:</span>
                <span className="font-bold text-emerald-300">{selectedAuditDetail.action}</span>
                <span className="text-[10px] font-mono text-slate-400 block uppercase">
                  [{selectedAuditDetail.module}]
                </span>
              </div>
            </div>

            {/* State & Location Comparison Box */}
            <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-2 text-xs">
              <span className="font-bold text-sky-400 block">Perubahan Status & Lokasi Fisik:</span>
              <div className="grid grid-cols-2 gap-2 border-t border-slate-800/80 pt-2">
                <div>
                  <span className="text-[10px] text-slate-500 block">Kondisi Awal (Before):</span>
                  <span className="font-bold text-slate-300">{selectedAuditDetail.beforeState || "-"}</span>
                  <div className="text-[10px] text-slate-500 font-mono">📍 {selectedAuditDetail.beforeLocation || "-"}</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Kondisi Akhir (After):</span>
                  <span className="font-bold text-emerald-400">{selectedAuditDetail.afterState || "-"}</span>
                  <div className="text-[10px] text-slate-500 font-mono">📍 {selectedAuditDetail.afterLocation || "-"}</div>
                </div>
              </div>
            </div>

            {/* Identitas Alat & Tiket */}
            <div className="grid grid-cols-3 gap-2 text-xs font-mono">
              <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-lg">
                <span className="text-[9px] text-slate-500 block">ID INSTRUMEN:</span>
                <span className="font-bold text-amber-300">{selectedAuditDetail.instrumentId || "-"}</span>
              </div>
              <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-lg">
                <span className="text-[9px] text-slate-500 block">NO. TRANSAKSI:</span>
                <span className="font-bold text-sky-300">{selectedAuditDetail.transactionId || "-"}</span>
              </div>
              <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-lg">
                <span className="text-[9px] text-slate-500 block">NO. TIKET (58MM):</span>
                <span className="font-bold text-emerald-300">{selectedAuditDetail.ticketId || "-"}</span>
              </div>
            </div>

            {/* Alasan / Catatan */}
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl text-xs space-y-1">
              <span className="text-[10px] text-slate-400 font-bold block">Catatan / Keterangan Penolakan:</span>
              <p className="text-slate-200 leading-relaxed italic">
                "{selectedAuditDetail.reason || "Tidak ada catatan khusus."}"
              </p>
            </div>

            {selectedAuditDetail.referenceId && (
              <div className="bg-purple-950/60 border border-purple-800 p-3 rounded-xl text-xs text-purple-200">
                <span className="font-bold block">Merujuk ke Ref Log ID:</span>
                <span className="font-mono text-purple-300">#{selectedAuditDetail.referenceId}</span>
              </div>
            )}

            <div className="text-[10px] text-slate-500 font-mono pt-1">
              Perangkat/Printer: {selectedAuditDetail.deviceInfo || "VSC MP-58 C ESC/POS"}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-800">
              <button
                onClick={() => handleCopy(JSON.stringify(selectedAuditDetail, null, 2), "Detail Audit JSON")}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Salin Data JSON</span>
              </button>

              <button
                onClick={() => setSelectedAuditDetail(null)}
                className="px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN CORRECTION MODAL */}
      {isCorrectionModalOpen && targetCorrectionLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <form onSubmit={handleCreateCorrection} className="bg-slate-900 border border-purple-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 text-slate-100">
            <div className="flex justify-between items-start border-b border-purple-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-purple-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">Catat Log Koreksi Data (Append-Only)</h3>
                  <span className="text-[10px] text-purple-300 font-mono block">Target Log ID: #{targetCorrectionLog.id}</span>
                </div>
              </div>
              <button type="button" onClick={() => setIsCorrectionModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-purple-950/40 border border-purple-900/60 p-3 rounded-xl text-xs space-y-1">
              <p className="text-purple-200">
                ⚠️ <strong>Aturan Imutabilitas:</strong> Log lama <strong className="underline">TIDAK DIBATALKAN ATAU DIHAPUS</strong>.
                Sistem akan membuat rekaman transaksi log baru berpola <span className="font-mono font-bold">CORRECTION</span> yang mereferensikan Log #{targetCorrectionLog.id}.
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">
                Alasan Koreksi Transaksi / Data:
              </label>
              <textarea
                required
                rows={3}
                placeholder="Jelaskan alasan dan rincian koreksi data secara akurat..."
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:border-purple-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsCorrectionModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Simpan Log Koreksi</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
