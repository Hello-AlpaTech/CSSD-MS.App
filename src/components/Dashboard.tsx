import React, { useState, useEffect } from "react";
import { jsPDF } from "jspdf";
import { db } from "../lib/firebase";
import { collection, onSnapshot, query, orderBy, limit, getDocs, where } from "firebase/firestore";
import { 
  LayoutDashboard, 
  Package, 
  Flame, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Thermometer, 
  Droplets,
  ClipboardList, 
  TrendingUp,
  Activity,
  User,
  ArrowRight,
  Search,
  QrCode,
  Box,
  Building2,
  Layers,
  RefreshCw,
  MapPin,
  Sparkles,
  X,
  Warehouse,
  Grid,
  ShieldCheck,
  Gauge,
  CheckCircle2,
  XCircle,
  Eye
} from "lucide-react";
import { WorkflowLog, SterileStock, DistributionRecord, EnvironmentalLog, Machine, MachineTestLog, UserProfile } from "../types";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ScannerComponent from "./ScannerComponent";
import 'jspdf-autotable';
import { motion } from "motion/react";
import { DEMO_KEYS, getDemoData, INITIAL_DEMO_WORKFLOW_LOGS, INITIAL_DEMO_STERILE_STOCK, INITIAL_DEMO_MACHINE_TESTS } from "../lib/demoStore";

interface StockTrackingResult {
  instrumentId: string;
  instrumentName: string;
  type: string;
  matchedQuery: string;
  totalOverallStock: number;
  originUnitStock: {
    totalQty: number;
    breakdown: { unit: string; qty: number }[];
  };
  onProcessCSSD: {
    totalQty: number;
    items: {
      idTerima: string;
      lotNumber?: string;
      unit: string;
      stage: string;
      status: string;
      qty: number;
      penyerah?: string;
    }[];
  };
  sterileStorage: {
    totalQty: number;
    items: {
      lotNumber: string;
      shelfLocation: string;
      unit: string;
      qty: number;
      expiresAtStr?: string;
    }[];
  };
}

interface DashboardProps {
  onNavigate: (tab: string) => void;
  currentRole: string;
  currentUserProfile?: UserProfile | null;
  isDemoMode?: boolean;
}

export default function Dashboard({ onNavigate, currentRole, currentUserProfile = null, isDemoMode = false }: DashboardProps) {
  const tenantId = currentUserProfile?.tenantId || "RSUD-BENDA";
  const [sterileCount, setSterileCount] = useState<number>(0);
  const [stockBreakdown, setStockBreakdown] = useState<{unit: string, qty: number}[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string>('all');
  const [totalDistributions, setTotalDistributions] = useState<number>(0);
  const [activeAlerts, setActiveAlerts] = useState<any[]>([]);
  const [runningCycles, setRunningCycles] = useState<number>(0);
  const [recentWorkflows, setRecentWorkflows] = useState<WorkflowLog[]>([]);
  const [latestEnvLog, setLatestEnvLog] = useState<EnvironmentalLog | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [latestMachineTests, setLatestMachineTests] = useState<Record<string, MachineTestLog>>({});
  const [selectedDashboardReceipt, setSelectedDashboardReceipt] = useState<string | null>(null);
  
  const formatEnvTimestamp = (ts: any) => {
    if (!ts) return "Belum ada data";
    let d: Date;
    if (typeof ts?.toDate === "function") {
      d = ts.toDate();
    } else if (ts instanceof Date) {
      d = ts;
    } else if (typeof ts === "number" || typeof ts === "string") {
      d = new Date(ts);
    } else {
      d = new Date();
    }
    if (isNaN(d.getTime())) return "Belum ada data";

    const dateStr = d.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
    const timeStr = d.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit"
    });
    return `${dateStr}, ${timeStr} WIB`;
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [trackingResult, setTrackingResult] = useState<StockTrackingResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    const wfCol = collection(db, "workflow_logs");
    const unsub = onSnapshot(query(wfCol, where("tenantId", "==", tenantId), orderBy("createdAt", "desc")), (snap) => {
        const dailyMap = new Map<string, number>();
        snap.forEach(doc => {
            const data = doc.data() as WorkflowLog;
            if (data.createdAt) {
                const date = data.createdAt.toDate().toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
                dailyMap.set(date, (dailyMap.get(date) || 0) + 1);
            }
        });
        const formatted = Array.from(dailyMap.entries()).map(([date, count]) => ({ date, count })).reverse().slice(-7);
        setChartData(formatted);
    });
    return () => unsub();
  }, [tenantId]);

  useEffect(() => {
    if (isDemoMode) {
      const loadDemoDashboard = () => {
        const demoStock = getDemoData(DEMO_KEYS.STERILE_STOCK, INITIAL_DEMO_STERILE_STOCK);
        let count = 0;
        const breakdownMap = new Map<string, number>();
        demoStock.forEach((item: any) => {
          if (item.status === "sterile" || item.status === "Aman") {
            const q = Number(item.qty || 1);
            count += q;
            const unit = item.targetUnit || "IGD";
            breakdownMap.set(unit, (breakdownMap.get(unit) || 0) + q);
          }
        });
        setSterileCount(count);
        setStockBreakdown(Array.from(breakdownMap.entries()).map(([unit, qty]) => ({ unit, qty })).sort((a,b) => b.qty - a.qty));

        const demoWf = getDemoData(DEMO_KEYS.WORKFLOW_LOGS, INITIAL_DEMO_WORKFLOW_LOGS);
        const mappedWf: WorkflowLog[] = demoWf.slice(0, 10).map((d: any) => ({
          id: d.firestoreDocId,
          ...d
        } as WorkflowLog));
        setRecentWorkflows(mappedWf);
        setTotalDistributions(3);
        setRunningCycles(1);

        const demoTests = getDemoData(DEMO_KEYS.MACHINE_TESTS, INITIAL_DEMO_MACHINE_TESTS);
        const testMap: Record<string, MachineTestLog> = {};
        demoTests.forEach((t: any) => {
          if (t.machineName && !testMap[t.machineName]) {
            testMap[t.machineName] = t as MachineTestLog;
          }
        });
        setLatestMachineTests(testMap);
      };

      loadDemoDashboard();

      const handleStoreChange = (e: any) => {
        loadDemoDashboard();
      };

      window.addEventListener("cssd_demo_store_change", handleStoreChange);
      return () => window.removeEventListener("cssd_demo_store_change", handleStoreChange);
    }

    // 1. Listen to Sterile Stock count
    const stockCol = collection(db, "sterile_stock");
    const unsubStock = onSnapshot(query(stockCol, where("tenantId", "==", tenantId)), (snap) => {
      let count = 0;
      const breakdownMap = new Map<string, number>();
      
      snap.forEach((doc) => {
        const item = doc.data() as SterileStock;
        if (item.status === "sterile") {
          count += item.qty;
          const unit = item.originUnit || "Tanpa Instalasi";
          breakdownMap.set(unit, (breakdownMap.get(unit) || 0) + item.qty);
        }
      });
      
      const breakdownArray = Array.from(breakdownMap.entries()).map(([unit, qty]) => ({ unit, qty })).sort((a,b) => b.qty - a.qty);
      setStockBreakdown(breakdownArray);
      setSterileCount(count);
    });

    // 2. Listen to Clinical Requests (acting as Distribution Logs)
    const reqCol = collection(db, "distribution_logs");
    const unsubReq = onSnapshot(query(reqCol, where("tenantId", "==", tenantId)), (snap) => {
      let count = 0;
      snap.forEach((doc) => {
        const req = doc.data() as DistributionRecord;
        if (req.status === "fulfilled") {
          count++;
        }
      });
      setTotalDistributions(count);
    });

    // 3. Listen to active machines (running cycles)
    const machCol = collection(db, "machines");
    const unsubMach = onSnapshot(query(machCol, where("tenantId", "==", tenantId)), (snap) => {
      let active = 0;
      const machList: Machine[] = [];
      snap.forEach((doc) => {
        const m = { id: doc.id, ...doc.data() } as Machine;
        machList.push(m);
        if (m.status === "ready") {
          active++;
        }
      });
      setMachines(machList);
      setRunningCycles(active);
    });

    // 4. Listen to recent workflows
    const wfCol = collection(db, "workflow_logs");
    const unsubWf = onSnapshot(query(wfCol, where("tenantId", "==", tenantId), orderBy("updatedAt", "desc"), limit(4)), (snap) => {
      const logs: WorkflowLog[] = [];
      snap.forEach((doc) => {
        logs.push({ id: doc.id, ...doc.data() } as WorkflowLog);
      });
      setRecentWorkflows(logs);
    });

    // 5. Listen to latest Environmental Logs (storage area steril)
    const envCol = collection(db, "environmental_logs");
    const unsubEnv = onSnapshot(query(envCol, where("tenantId", "==", tenantId), orderBy("timestamp", "desc"), limit(1)), (snap) => {
      if (!snap.empty) {
        setLatestEnvLog(snap.docs[0].data() as EnvironmentalLog);
      }
    });

    // 6. Listen to Machine Test Logs
    const testCol = collection(db, "machine_test_logs");
    const unsubTest = onSnapshot(query(testCol, where("tenantId", "==", tenantId), orderBy("createdAt", "desc")), (snap) => {
      const testMap: Record<string, MachineTestLog> = {};
      snap.forEach((doc) => {
        const data = { id: doc.id, ...doc.data() } as MachineTestLog;
        if (data.machineName && !testMap[data.machineName]) {
          testMap[data.machineName] = data;
        }
      });
      setLatestMachineTests(testMap);
    });

    return () => {
      unsubStock();
      unsubReq();
      unsubMach();
      unsubWf();
      unsubEnv();
      unsubTest();
    };
  }, [isDemoMode, tenantId]);

  const handleScanSuccess = (decodedText: string) => {
    setSearchQuery(decodedText);
    setIsScannerOpen(false);
    executeTrackingSearch(decodedText);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    executeTrackingSearch(searchQuery.trim());
  };

  const executeTrackingSearch = async (queryStr: string) => {
    const term = queryStr.trim();
    if (!term) return;

    setIsSearching(true);
    setTrackingResult(null);

    try {
      let instrumentsList: any[] = [];
      let unitStockList: any[] = [];
      let workflowLogsList: any[] = [];
      let sterileStockList: any[] = [];

      if (isDemoMode) {
        instrumentsList = getDemoData(DEMO_KEYS.INSTRUMENTS, []);
        unitStockList = getDemoData(DEMO_KEYS.UNIT_STOCK, []);
        workflowLogsList = getDemoData(DEMO_KEYS.WORKFLOW_LOGS, INITIAL_DEMO_WORKFLOW_LOGS);
        sterileStockList = getDemoData(DEMO_KEYS.STERILE_STOCK, INITIAL_DEMO_STERILE_STOCK);
      } else {
        const [snapInst, snapUnit, snapWf, snapSterile] = await Promise.all([
          getDocs(collection(db, "instruments")),
          getDocs(collection(db, "unit_stock")),
          getDocs(collection(db, "workflow_logs")),
          getDocs(collection(db, "sterile_stock"))
        ]);

        snapInst.forEach(d => instrumentsList.push({ id: d.id, ...d.data() }));
        snapUnit.forEach(d => unitStockList.push({ id: d.id, ...d.data() }));
        snapWf.forEach(d => workflowLogsList.push({ id: d.id, ...d.data() }));
        snapSterile.forEach(d => sterileStockList.push({ id: d.id, ...d.data() }));
      }

      const lowerTerm = term.toLowerCase();

      // 1. Identify matching instrument
      let matchedInst = instrumentsList.find(i => 
        (i.id && i.id.toLowerCase() === lowerTerm) ||
        (i.sku && i.sku.toLowerCase() === lowerTerm) ||
        (i.name && i.name.toLowerCase().includes(lowerTerm))
      );

      let targetInstId = matchedInst?.id || matchedInst?.sku || "";
      let targetInstName = matchedInst?.name || "";
      let targetType = matchedInst?.type || "single";

      if (!matchedInst) {
        // Check workflow logs
        const wfMatch = workflowLogsList.find(w => 
          w.lotNumber === term ||
          w.idTerima === term ||
          w.instrumentId === term ||
          (w.instrumentName && w.instrumentName.toLowerCase().includes(lowerTerm))
        );

        if (wfMatch) {
          targetInstId = wfMatch.instrumentId || wfMatch.lotNumber || term;
          targetInstName = wfMatch.instrumentName || wfMatch.name || "Instrumen CSSD";
          targetType = wfMatch.type || "single";
        } else {
          // Check sterile stock
          const stMatch = sterileStockList.find(s => 
            s.lotNumber === term ||
            s.instrumentId === term ||
            (s.instrumentName && s.instrumentName.toLowerCase().includes(lowerTerm))
          );

          if (stMatch) {
            targetInstId = stMatch.instrumentId || stMatch.lotNumber || term;
            targetInstName = stMatch.instrumentName || "Instrumen CSSD";
            targetType = stMatch.type || "single";
          } else {
            // Check unit stock
            const uMatch = unitStockList.find(u => 
              u.instrumentId === term ||
              (u.instrumentName && u.instrumentName.toLowerCase().includes(lowerTerm))
            );

            if (uMatch) {
              targetInstId = uMatch.instrumentId || term;
              targetInstName = uMatch.instrumentName || uMatch.name || "Instrumen CSSD";
              targetType = uMatch.type || "single";
            }
          }
        }
      }

      if (!targetInstName && !targetInstId) {
        alert(`Data instrumen dengan Lot / Kode QR / ID "${term}" tidak ditemukan.`);
        setIsSearching(false);
        return;
      }

      // A. Compute Stok Di Unit Asal
      const originMap = new Map<string, number>();
      let totalOrigin = 0;

      unitStockList.forEach((item: any) => {
        const match = 
          (targetInstId && item.instrumentId === targetInstId) ||
          (targetInstName && item.instrumentName && item.instrumentName.toLowerCase() === targetInstName.toLowerCase());

        if (match) {
          const u = item.unit || "IGD";
          const q = Number(item.qty || 0);
          originMap.set(u, (originMap.get(u) || 0) + q);
          totalOrigin += q;
        }
      });

      // Fallback if no unit stock recorded yet
      if (totalOrigin === 0 && matchedInst) {
        const u = matchedInst.originUnit || "IGD";
        const q = Number(matchedInst.totalStock ?? 1);
        if (q > 0) {
          originMap.set(u, q);
          totalOrigin = q;
        }
      }

      const originBreakdown = Array.from(originMap.entries()).map(([unit, qty]) => ({ unit, qty }));

      // B. Compute Stok On-Proses CSSD
      const onProcessItems: any[] = [];
      let totalOnProcess = 0;

      workflowLogsList.forEach((wf: any) => {
        if (wf.currentStage === 'distributed' || wf.currentStage === 'recalled') return;

        const isWfMatch = 
          wf.lotNumber === term ||
          wf.idTerima === term ||
          (targetInstId && wf.instrumentId === targetInstId) ||
          (targetInstName && wf.instrumentName && wf.instrumentName.toLowerCase() === targetInstName.toLowerCase());

        if (isWfMatch) {
          const unit = wf.decontamination?.sourceUnit || wf.asal || "IGD";
          const stage = wf.currentStage || "decontamination";
          const status = wf.status || "Sedang Diproses";

          if (wf.items && Array.isArray(wf.items) && wf.items.length > 0) {
            wf.items.forEach((sub: any) => {
              const subMatch = 
                !targetInstId || 
                sub.instrumentId === targetInstId || 
                (sub.name && sub.name.toLowerCase() === targetInstName.toLowerCase());

              if (subMatch) {
                const q = Number(sub.receivedQty || sub.qty || 1);
                totalOnProcess += q;
                onProcessItems.push({
                  idTerima: wf.idTerima || wf.id,
                  lotNumber: wf.lotNumber,
                  unit,
                  stage,
                  status,
                  qty: q,
                  penyerah: wf.penyerah || "-"
                });
              }
            });
          } else {
            const q = Number(wf.qty || 1);
            totalOnProcess += q;
            onProcessItems.push({
              idTerima: wf.idTerima || wf.id,
              lotNumber: wf.lotNumber,
              unit,
              stage,
              status,
              qty: q,
              penyerah: wf.penyerah || "-"
            });
          }
        }
      });

      // C. Compute Stok Di Storage Steril (Rak & Grid)
      const sterileItems: any[] = [];
      let totalSterileStorage = 0;

      sterileStockList.forEach((st: any) => {
        const match = 
          st.lotNumber === term ||
          (targetInstId && st.instrumentId === targetInstId) ||
          (targetInstName && st.instrumentName && st.instrumentName.toLowerCase() === targetInstName.toLowerCase());

        if (match && (st.status === 'sterile' || st.status === 'Aman')) {
          const q = Number(st.qty || 1);
          totalSterileStorage += q;
          const location = st.shelfLocation || st.gridLocation || st.rack || "Rak Storage Steril A - Grid 01";
          const unit = st.targetUnit || st.originUnit || "CSSD";

          sterileItems.push({
            lotNumber: st.lotNumber || st.id || "-",
            shelfLocation: location,
            unit,
            qty: q,
            expiresAtStr: st.expiresAtStr || (st.expiresAt?.toDate ? st.expiresAt.toDate().toLocaleDateString("id-ID") : "-")
          });
        }
      });

      const totalOverall = totalOrigin + totalOnProcess + totalSterileStorage;

      setTrackingResult({
        instrumentId: targetInstId || "INST-001",
        instrumentName: targetInstName || "Instrumen Medis",
        type: targetType,
        matchedQuery: term,
        totalOverallStock: totalOverall,
        originUnitStock: {
          totalQty: totalOrigin,
          breakdown: originBreakdown
        },
        onProcessCSSD: {
          totalQty: totalOnProcess,
          items: onProcessItems
        },
        sterileStorage: {
          totalQty: totalSterileStorage,
          items: sterileItems
        }
      });

    } catch (err: any) {
      alert("Gagal melacak instrumen: " + err.message);
    } finally {
      setIsSearching(false);
    }
  };

  // Compute Active Alerts
  useEffect(() => {
    const alerts: any[] = [];

    // Environmental temperature / humidity alerts
    if (latestEnvLog) {
      if (latestEnvLog.temperatureCelsius < 18 || latestEnvLog.temperatureCelsius > 22) {
        alerts.push({
          id: "alert-temp",
          type: "danger",
          title: "Suhu Storage Area Steril Melebihi Batas Aman",
          description: `Suhu terdeteksi ${latestEnvLog.temperatureCelsius}°C (Batas aman: 18°C - 22°C). Risiko pertumbuhan spora bakteri!`,
          timestamp: latestEnvLog.timestamp
        });
      }
      if (latestEnvLog.humidityPercent < 35 || latestEnvLog.humidityPercent > 60) {
        alerts.push({
          id: "alert-humidity",
          type: "warning",
          title: "Kelembaban Storage Area Steril Tidak Sesuai Standar",
          description: `Kelembaban terdeteksi ${latestEnvLog.humidityPercent}% (Batas aman: 35% - 60%). Risiko pembasahan kemasan sterilisasi!`,
          timestamp: latestEnvLog.timestamp
        });
      }
    }

    // Checking sterile expiration
    const checkExpirations = async () => {
      const stockCol = collection(db, "sterile_stock");
      const snap = await getDocs(stockCol);
      const now = new Date();
      let expiredCount = 0;
      let nearExpiredCount = 0;

      snap.forEach((d) => {
        const item = d.data() as SterileStock;
        if (item.status === "sterile") {
          const expDate = item.expiresAt.toDate();
          const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
          
          if (diffDays <= 0) {
            expiredCount++;
          } else if (diffDays <= 3) {
            nearExpiredCount++;
          }
        }
      });

      if (expiredCount > 0) {
        alerts.push({
          id: "alert-expired",
          type: "danger",
          title: `${expiredCount} Set Steril Kedaluwarsa`,
          description: "Terdapat instrumen steril yang melampaui tanggal kedaluwarsa. Lakukan penarikan (Recall) segera!",
          timestamp: null
        });
      }
      if (nearExpiredCount > 0) {
        alerts.push({
          id: "alert-near-expired",
          type: "warning",
          title: `${nearExpiredCount} Set Mendekati Kedaluwarsa`,
          description: "Beberapa set instrumen akan kedaluwarsa dalam < 3 hari. Prioritaskan penggunaan set ini.",
          timestamp: null
        });
      }

      setActiveAlerts(alerts);
    };

    checkExpirations();
  }, [latestEnvLog]);


  const [reportRecipient, setReportRecipient] = useState<string>("Pak Ferry");
  const [reportShiftOfficers, setReportShiftOfficers] = useState<string>("");
  const [reportKendala, setReportKendala] = useState<string>("-");
  const [copiedReport, setCopiedReport] = useState<boolean>(false);

  const generateReport = async (
    customRecipient = reportRecipient,
    customShift = reportShiftOfficers,
    customKendala = reportKendala
  ) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let logs: any[] = [];
      if (isDemoMode) {
        logs = getDemoData(DEMO_KEYS.WORKFLOW_LOGS, INITIAL_DEMO_WORKFLOW_LOGS);
      } else {
        try {
          const wfSnap = await getDocs(collection(db, "workflow_logs"));
          wfSnap.forEach(d => {
            logs.push({ id: d.id, ...d.data() });
          });
        } catch (err) {
          console.warn("Firestore error fetching workflow_logs for report:", err);
          logs = getDemoData(DEMO_KEYS.WORKFLOW_LOGS, INITIAL_DEMO_WORKFLOW_LOGS);
        }
      }

      let penerimaan = 0;
      let disteril = 0;
      let distribusi = 0;

      // Group details by originUnit
      const detailsByUnit: Record<string, {name: string, qty: number}[]> = {};

      logs.forEach(log => {
        let hasActivityToday = false;
        
        const createdDate = log.createdAt?.toDate ? log.createdAt.toDate() : (log.createdAt ? new Date(log.createdAt) : null);
        if (createdDate && createdDate >= today) {
          penerimaan += log.qty || 0;
          hasActivityToday = true;
        }

        if (log.history) {
          log.history.forEach((h: any) => {
            const hDate = h.timestamp?.toDate ? h.timestamp.toDate() : new Date(h.timestamp);
            if (hDate >= today) {
              hasActivityToday = true;
              if (h.stage === 'sterilization') disteril += log.qty || 0;
              if (h.stage === 'distributed') distribusi += log.qty || 0;
            }
          });
        }

        if (hasActivityToday) {
          const unit = log.originUnit || log.unit || log.asal || "OK";
          if (!detailsByUnit[unit]) detailsByUnit[unit] = [];
          
          const existing = detailsByUnit[unit].find(i => i.name === log.instrumentName);
          if (existing) {
            existing.qty += log.qty || 0;
          } else {
            detailsByUnit[unit].push({
              name: log.instrumentName,
              qty: log.qty || 0
            });
          }
        }
      });

      const days = ["minggu", "senin", "selasa", "rabu", "kamis", "jumat", "sabtu"];
      const months = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
      ];

      const dayName = days[today.getDay()];
      const dateFormatted = `${today.getDate()} ${months[today.getMonth()]} ${today.getFullYear()}`;

      let text = `Selamat malam ${customRecipient}\n\n`;
      text += `Laporan hari : ${dayName}\n`;
      text += `Tanggal : ${dateFormatted}\n\n`;
      text += `Shiff sore : ${customShift}\n\n`;
      text += `1. Kendala : ${customKendala}\n\n`;
      text += `2. Penerimaan : ${penerimaan}\n\n`;
      text += `3. Penyelesaian : ${distribusi}\n\n`;
      text += `4. Jumlah Steril : ${disteril}\n\n`;

      if (Object.keys(detailsByUnit).length > 0) {
        for (const [unit, items] of Object.entries(detailsByUnit)) {
          text += `${unit}\n`;
          items.forEach(item => {
            text += `- ${item.name} : ${item.qty}\n`;
          });
          text += `\n`;
        }
      }

      text += `Terima kasih. 🙏`;
      
      setReportText(text);
      setReportModalOpen(true);
    } catch (e: any) {
      console.error(e);
      alert("Gagal membuat laporan: " + e.message);
    }
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Laporan Harian CSSD", 14, 20);
    doc.setFontSize(10);
    const splitText = doc.splitTextToSize(reportText, 180);
    doc.text(splitText, 14, 30);
    doc.save(`Laporan_CSSD_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const sendWhatsApp = () => {
    const encoded = encodeURIComponent(reportText);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  return (
    <div className="space-y-6" id="dashboard-container">
      {/* Welcome Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-sm border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold font-sans tracking-tight">CSSD Management System (CSSD-MS)</h1>
          <p className="text-slate-400 mt-1 text-sm">
            RSUD BENDA, Kota Tangerang — Pusat Dekontaminasi, Sterilisasi, dan Distribusi Aman Kompartemen Medis.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Sistem Online
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Sinkronisasi Offline Aktif
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-mono bg-slate-800 text-slate-300">
              Peran: {currentRole === 'supervisor' ? 'Kepala CSSD (Supervisor)' : 'Operator CSSD'}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={generateReport}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-medium transition duration-150 flex items-center gap-2 mr-2"
          >
            Laporan Harian
            <ClipboardList className="w-4 h-4" />
          </button>
          <button 
            onClick={() => onNavigate('decontamination')}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition duration-150 flex items-center gap-2"
          >
            Mulai Alur Sterilisasi
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Monitoring Suhu & Kelembaban (Top Horizontal Compact Bar) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 sm:p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 shrink-0 border border-sky-500/20">
            <Thermometer className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-100 text-xs sm:text-sm">Monitoring Suhu & Kelembaban Storage Area Steril</h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>📅 <strong>Tanggal:</strong> {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
              <span>🕒 <strong>Terakhir Diperbarui:</strong> {latestEnvLog ? formatEnvTimestamp(latestEnvLog.timestamp) : "Hari ini, " + new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB"}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 border-slate-800/80 pt-2 md:pt-0 shrink-0">
          {/* Suhu Box */}
          <div className={`px-3 py-1.5 rounded-lg border flex items-center gap-2.5 ${
            !latestEnvLog || (latestEnvLog.temperatureCelsius >= 18 && latestEnvLog.temperatureCelsius <= 22)
            ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
            : 'bg-rose-950/30 border-rose-800/50 text-rose-300'
          }`}>
            <Thermometer className="w-4 h-4 text-slate-400" />
            <div>
              <span className="text-[10px] text-slate-400 block font-medium leading-none">Suhu Ruangan</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-sm sm:text-base font-extrabold font-mono tracking-tight text-white">
                  {latestEnvLog ? `${latestEnvLog.temperatureCelsius}°C` : "21.0°C"}
                </span>
                <span className="text-[9px] text-slate-400 font-sans">(18-22°C)</span>
              </div>
            </div>
          </div>

          {/* Kelembaban Box */}
          <div className={`px-3 py-1.5 rounded-lg border flex items-center gap-2.5 ${
            !latestEnvLog || (latestEnvLog.humidityPercent >= 35 && latestEnvLog.humidityPercent <= 60)
            ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
            : 'bg-amber-950/30 border-amber-800/50 text-amber-300'
          }`}>
            <Droplets className="w-4 h-4 text-slate-400" />
            <div>
              <span className="text-[10px] text-slate-400 block font-medium leading-none">Kelembaban (RH)</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-sm sm:text-base font-extrabold font-mono tracking-tight text-white">
                  {latestEnvLog ? `${latestEnvLog.humidityPercent}%` : "45.0%"}
                </span>
                <span className="text-[9px] text-slate-400 font-sans">(35-60%)</span>
              </div>
            </div>
          </div>

          <button 
            onClick={() => onNavigate('storage')} 
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs font-semibold rounded-lg border border-slate-700 transition flex items-center gap-1 shrink-0"
            title="Lihat Log Lengkap"
          >
            Log <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Widget Uji Kelayakan Mesin (Di Bawah Monitoring Suhu) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3" id="machine-test-dashboard-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg shrink-0">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-xs sm:text-sm flex items-center gap-2">
                <span>Uji Kelayakan Mesin Suhu Tinggi (Bowie-Dick &amp; Vacuum Test)</span>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded font-mono font-bold">
                  Harian
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Data hasil pengujian kelayakan penetrasi uap &amp; vakum harian terbaru (BUMA STERILIZER VACUM &amp; BES AUTOCLAVE).
              </p>
            </div>
          </div>

          <button 
            onClick={() => onNavigate('machine_test')} 
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 self-start sm:self-auto shrink-0 shadow cursor-pointer"
          >
            <span>Buka Menu Uji</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {["BUMA STERILIZER VACUM", "BES AUTOCLAVE"].map((mName) => {
            const test = latestMachineTests[mName];
            return (
              <div key={mName} className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 flex flex-col justify-between gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-black text-white block">{mName}</span>
                    <span className="text-[10px] text-sky-400 font-mono font-semibold block mt-0.5">
                      {test ? `Mode: ${test.mode}` : "Autoclave Suhu Tinggi"}
                    </span>
                  </div>

                  {test ? (
                    test.indicatorResult === 'Valid' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Valid (Lulus)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        <XCircle className="w-3.5 h-3.5" /> Invalid (Gagal)
                      </span>
                    )
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Belum Ada Data Uji
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-900 font-mono">
                  <div>
                    <span className="text-slate-500 block text-[9px]">TANGGAL TEST:</span>
                    <span className="text-slate-200 font-bold">{test?.testDateStr || "Belum Diuji Hari Ini"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px]">OPERATOR:</span>
                    <span className="text-slate-300 font-semibold">{test?.operatorName || "-"}</span>
                  </div>
                  {test?.receiptImage && (
                    <button
                      onClick={() => setSelectedDashboardReceipt(test.receiptImage || null)}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-[10px] font-bold transition border border-slate-700 flex items-center gap-1"
                      title="Lihat Struk Mesin"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Struk</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Search / Scan Bar */}
      <form onSubmit={handleSearch} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex gap-2 items-center shadow-md" id="search-scan-bar">
        <button type="button" onClick={() => setIsScannerOpen(true)} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg"><QrCode className="w-5 h-5 text-sky-400" /></button>
        <input 
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Scan atau Masukkan Lot Number..."
          className="flex-1 bg-transparent border-none text-white text-sm outline-none placeholder:text-slate-600 font-mono"
          id="search-input-field"
        />
        <button 
          type="submit"
          disabled={isSearching}
          className="bg-sky-600 hover:bg-sky-500 text-white p-2 rounded-lg transition"
          id="search-submit-button"
        >
          {isSearching ? <Clock className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </button>
      </form>

      {isScannerOpen && (
        <ScannerComponent onScan={handleScanSuccess} onClose={() => setIsScannerOpen(false)} />
      )}

      {/* Primary KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div 
          whileHover={{ y: -2 }}
          onClick={() => onNavigate("storage")}
          className="bg-slate-900 p-5 rounded-xl border border-slate-800/80 shadow-md flex items-center gap-4 cursor-pointer"
        >
          <div className="p-3 rounded-lg bg-sky-500/10 text-sky-400">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-400 block">Total Stok Steril</span>
            <span className="text-2xl font-bold text-slate-100 tracking-tight font-mono">
              {sterileCount} <span className="text-xs text-slate-500 font-sans">pack</span>
            </span>
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ y: -2 }}
          onClick={() => onNavigate("distribution")}
          className="bg-slate-900 p-5 rounded-xl border border-slate-800/80 shadow-md flex items-center gap-4 cursor-pointer"
        >
          <div className="p-3 rounded-lg bg-indigo-500/10 text-indigo-400">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-400 block">Total Distribusi Alat</span>
            <span className="text-2xl font-bold text-slate-100 tracking-tight font-mono">{totalDistributions} <span className="text-xs text-slate-500 font-sans">unit</span></span>
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ y: -2 }}
          onClick={() => onNavigate("sterilization")}
          className="bg-slate-900 p-5 rounded-xl border border-slate-800/80 shadow-md flex items-center gap-4 cursor-pointer"
        >
          <div className="p-3 rounded-lg bg-amber-500/10 text-amber-400">
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-400 block">Siklus Sterilisator Aktif</span>
            <span className="text-2xl font-bold text-slate-100 tracking-tight font-mono">{runningCycles} <span className="text-xs text-slate-500 font-sans">mesin</span></span>
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ y: -2 }}
          className="bg-slate-900 p-5 rounded-xl border border-slate-800/80 shadow-md flex items-center gap-4"
        >
          <div className="p-3 rounded-lg bg-rose-500/10 text-rose-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-400 block">Peringatan Kritis</span>
            <span className="text-2xl font-bold text-slate-100 tracking-tight font-mono">{activeAlerts.length} <span className="text-xs text-slate-500 font-sans">alert</span></span>
          </div>
        </motion.div>
      </div>

      <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md my-6">
        <h3 className="text-sm font-bold text-slate-200 mb-6">Volume Sterilisasi 7 Hari Terakhir</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155' }} />
              <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Interactive Storage Monitoring & Machine Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col: Alerts and Environmental Monitoring */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Alerts Box */}
          {activeAlerts.length > 0 && (
            <div className="bg-rose-950/20 border border-rose-900/40 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-rose-400 font-semibold text-sm">
                <AlertTriangle className="w-5 h-5 text-rose-500 animate-pulse" />
                <span>Peringatan Sistem Terdeteksi</span>
              </div>
              <div className="space-y-3 mt-2">
                {activeAlerts.map((alert) => (
                  <div key={alert.id} className="flex gap-3 bg-slate-950/80 p-3 rounded-lg border border-rose-950/50 shadow-sm">
                    <span className={`w-1.5 rounded-full ${alert.type === 'danger' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-slate-200">{alert.title}</h4>
                      <p className="text-xs text-slate-400 mt-0.5">{alert.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Workflow Pipeline Recent Activities */}
          <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-100 mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-400" />
              Aktivitas Terakhir Alur Sterilisasi (Traceability Log)
            </h3>
            
            <div className="space-y-4">
              {recentWorkflows.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs font-mono">
                  Belum ada aktivitas sterilisasi yang tercatat hari ini.
                </div>
              ) : (
                recentWorkflows.map((log) => (
                  <div key={log.id} className="flex gap-4 items-start bg-slate-950/40 hover:bg-slate-900/60 p-3 rounded-lg border border-slate-800/40 transition duration-150">
                    <div className="mt-1">
                      {log.currentStage === "sterile_storage" && <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[10px] font-bold block text-center">STORED</span>}
                      {log.currentStage === "decontamination" && <span className="px-2 py-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono text-[10px] font-bold block text-center">DIRTY</span>}
                      {log.currentStage === "washing" && <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono text-[10px] font-bold block text-center">WASH</span>}
                      {log.currentStage === "packaging" && <span className="px-2 py-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono text-[10px] font-bold block text-center">PACK</span>}
                      {log.currentStage === "sterilization" && <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono text-[10px] font-bold block text-center">STERIL</span>}
                      {log.currentStage === "distributed" && <span className="px-2 py-1 rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono text-[10px] font-bold block text-center">DIST</span>}
                      {log.currentStage === "recalled" && <span className="px-2 py-1 rounded bg-rose-600 text-white font-mono text-[10px] font-bold block text-center">RECALL</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <h4 className="text-sm font-semibold text-slate-100 truncate">{log.instrumentName}</h4>
                        <span className="text-[10px] text-slate-500 whitespace-nowrap font-mono">
                          {log.updatedAt?.toDate().toLocaleTimeString("id-ID")}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        No. Lot: <span className="font-mono font-semibold text-slate-300">{log.lotNumber}</span> • Jumlah: {log.qty} set
                      </p>
                      {log.history && log.history.length > 0 && (
                        <p className="text-xs text-slate-400 mt-1 italic border-l-2 border-slate-700 pl-2">
                          "{log.history[log.history.length - 1].notes || 'Memasuki tahap ' + log.currentStage}"
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Col: Machine Status Panel */}
        <div className="space-y-6">
          <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-100 mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              Status Mesin CSSD
            </h3>
            
            <div className="space-y-4">
              {machines.map((m) => (
                <div key={m.id} className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-200 truncate max-w-[180px]">{m.name}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      m.status === 'idle' ? 'bg-slate-800 text-slate-400 border border-slate-700' :
                      m.status === 'running' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse' :
                      'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}>
                      {m.status === 'idle' ? 'STANDBY' : m.status === 'running' ? 'SEDANG JALAN' : 'MAINTENANCE'}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                    <span>SN: <span>{m.serialNumber}</span></span>
                    <span>Tipe: {
                      m.type === 'washer' ? 'Pencuci' : 
                      m.type === 'sterilizer_steam' ? 'Suhu Tinggi (Autoclave)' : 'Suhu Rendah (Plasma)'
                    }</span>
                  </div>
                  
                  {m.status === 'running' && (
                    <div className="mt-1 space-y-1">
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: '65%' }}></div>
                      </div>
                      <span className="text-[9px] text-amber-400 block text-right font-medium font-mono">Memproses siklus sterilisasi... (65% selesai)</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            <div className="mt-4 text-center">
              <button 
                onClick={() => onNavigate('admin')}
                className="text-xs font-semibold text-slate-400 hover:text-sky-400 transition"
              >
                Atur & Monitor Kalibrasi Mesin →
              </button>
            </div>
          </div>

          {/* Quick Help for PPI & Accreditation */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-sky-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">Audit Log & Traceability (Append-Only)</h4>
              </div>
              <button
                onClick={() => onNavigate('activity_log')}
                className="text-[11px] font-bold text-sky-400 hover:underline flex items-center gap-1"
              >
                Lihat Log <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Seluruh transaksi penerimaan, dekontaminasi, sterilisasi, penolakan scan, dan penyerahan dicatat secara imutabel di koleksi <code className="text-sky-300 font-mono">audit_logs</code> untuk kepatuhan audit KARS/JCI.
            </p>
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400 font-mono">
              <span>Status Audit Trail: <strong className="text-emerald-400">Locked / Imutabel</strong></span>
              <span className="text-amber-300">RSUD BENDA</span>
            </div>
          </div>

          {/* Quick Help for PPI & Accreditation */}
          <div className="bg-sky-950/20 text-sky-100 rounded-xl p-5 shadow-md border border-sky-900/30 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400">Pilar Keamanan Akreditasi (JCI / KARS)</h4>
            <p className="text-xs text-sky-200/90 leading-relaxed">
              Sistem ini mengimplementasikan <strong>Double-Check Traceability</strong>. Setiap alat steril harus dapat ditelusuri kembali ke batch pencucian, nomor autoclave, siklus sterilisasi, serta indikator biologi/kimia yang lolos uji demi menjamin keselamatan pasien dari risiko HAIs.
            </p>
            <div className="border-t border-sky-900/50 pt-2 flex items-center justify-between text-[11px] text-sky-300 font-mono">
              <span>Mencegah SSI (Surgical Site Infection)</span>
              <span className="font-bold">100% Traceable</span>
            </div>
          </div>
        </div>
      </div>

      {/* Search Tracking Result Modal */}
      {trackingResult && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 z-50 overflow-y-auto">
          <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 max-w-3xl w-full p-5 sm:p-6 space-y-5 animate-fadeIn my-auto max-h-[92vh] flex flex-col" id="search-result-modal">
            
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-xl">
                  <Search className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-extrabold text-white">{trackingResult.instrumentName}</h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-sky-300 border border-slate-700 uppercase">
                      {trackingResult.type === 'set' ? 'SET INSTRUMEN' : 'TUNGGAL / SINGLE'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">
                    ID / Kode: <span className="text-slate-200 font-bold">{trackingResult.instrumentId}</span> | QR / Lot Search: <span className="text-sky-300 font-bold">"{trackingResult.matchedQuery}"</span>
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setTrackingResult(null)} 
                className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800 hover:bg-slate-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Total Overall Badge Bar */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span className="text-xs font-semibold text-slate-300">Total Akumulasi Stok Terdeteksi di Seluruh Lokasi:</span>
              </div>
              <div className="flex items-center gap-2 font-mono">
                <span className="px-3 py-1 bg-sky-500/20 text-sky-300 border border-sky-500/40 font-extrabold text-sm rounded-lg">
                  {trackingResult.totalOverallStock} Set/Pcs
                </span>
              </div>
            </div>

            {/* 3 Main Location Breakdown Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 overflow-y-auto pr-1 flex-1">
              
              {/* 1. POSISI STOK DI UNIT ASAL */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-sky-400" /> 1. Stok Unit Asal
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-xs font-extrabold bg-sky-500/10 text-sky-300 border border-sky-500/20 font-mono">
                      {trackingResult.originUnitStock.totalQty} Set/Pcs
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400">Ketersediaan di unit pelayanan medis:</p>

                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {trackingResult.originUnitStock.breakdown.length > 0 ? (
                      trackingResult.originUnitStock.breakdown.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs p-2 bg-slate-900 rounded-lg border border-slate-800/80">
                          <span className="font-semibold text-slate-200">{item.unit}</span>
                          <span className="font-mono font-bold text-sky-300">{item.qty} Pcs</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500 italic p-2 bg-slate-900 rounded-lg">Tidak ada stok di unit asal.</p>
                    )}
                  </div>
                </div>

                <button 
                  onClick={() => { setTrackingResult(null); onNavigate('origin_stock'); }}
                  className="w-full py-1.5 bg-slate-900 hover:bg-slate-800 text-sky-400 text-[11px] font-semibold rounded-lg border border-slate-800 transition flex items-center justify-center gap-1 shrink-0"
                >
                  Buka Stok Unit Asal <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 2. POSISI ON-PROSES CSSD */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                      <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" /> 2. On-Proses CSSD
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-xs font-extrabold bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">
                      {trackingResult.onProcessCSSD.totalQty} Set/Pcs
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400">Status alur proses sterilisasi saat ini:</p>

                  <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                    {trackingResult.onProcessCSSD.items.length > 0 ? (
                      trackingResult.onProcessCSSD.items.map((item, idx) => (
                        <div key={idx} className="p-2 bg-slate-900 rounded-lg border border-slate-800/80 space-y-1 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="font-mono font-bold text-slate-200 text-[11px]">{item.idTerima || item.lotNumber}</span>
                            <span className="font-mono font-bold text-amber-300">{item.qty} Pcs</span>
                          </div>
                          <div className="flex items-center justify-between pt-0.5">
                            <span className="text-[10px] text-slate-400">Unit: {item.unit}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                              {item.stage === 'decontamination' ? '1. Dekontaminasi' :
                               item.stage === 'packaging' ? '2. Pengemasan' :
                               item.stage === 'sterilization' ? '3. Sterilisasi' : 'Penerimaan'}
                            </span>
                          </div>
                          {item.status && <p className="text-[10px] text-slate-400 italic">Status: {item.status}</p>}
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500 italic p-2 bg-slate-900 rounded-lg">Tidak ada alat sedang diproses di CSSD.</p>
                    )}
                  </div>
                </div>

                <button 
                  onClick={() => { setTrackingResult(null); onNavigate('process'); }}
                  className="w-full py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-400 text-[11px] font-semibold rounded-lg border border-slate-800 transition flex items-center justify-center gap-1 shrink-0"
                >
                  Buka On-Proses CSSD <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 3. POSISI STORAGE AREA STERIL (RAK / GRID) */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <Warehouse className="w-4 h-4 text-emerald-400" /> 3. Storage Steril (Rak/Grid)
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-xs font-extrabold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono">
                      {trackingResult.sterileStorage.totalQty} Set/Pcs
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400">Posisi penyimpanan rak & grid steril:</p>

                  <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                    {trackingResult.sterileStorage.items.length > 0 ? (
                      trackingResult.sterileStorage.items.map((item, idx) => (
                        <div key={idx} className="p-2 bg-slate-900 rounded-lg border border-slate-800/80 space-y-1 text-xs">
                          <div className="flex items-center gap-1 text-emerald-300 font-bold">
                            <MapPin className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                            <span className="truncate">{item.shelfLocation}</span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                            <span>Lot: {item.lotNumber}</span>
                            <span className="font-bold text-emerald-400">{item.qty} Pcs</span>
                          </div>
                          {item.expiresAtStr && (
                            <p className="text-[10px] text-slate-400">Exp: {item.expiresAtStr}</p>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500 italic p-2 bg-slate-900 rounded-lg">Tidak ada stok tersimpan di Storage Area Steril.</p>
                    )}
                  </div>
                </div>

                <button 
                  onClick={() => { setTrackingResult(null); onNavigate('storage'); }}
                  className="w-full py-1.5 bg-slate-900 hover:bg-slate-800 text-emerald-400 text-[11px] font-semibold rounded-lg border border-slate-800 transition flex items-center justify-center gap-1 shrink-0"
                >
                  Buka Storage Area <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

            </div>

            {/* Footer Close */}
            <div className="pt-2 border-t border-slate-800 flex justify-end shrink-0">
              <button 
                onClick={() => setTrackingResult(null)} 
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition"
              >
                Tutup Hasil Pelacakan
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Report Modal */}
      {reportModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 max-w-xl w-full p-5 space-y-4 flex flex-col max-h-[92vh]">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-sky-400" /> Laporan Harian CSSD (Format Revisi)
              </h3>
              <button 
                onClick={() => setReportModalOpen(false)} 
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Custom Inputs Panel */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">Atasan / Penerima:</label>
                <input 
                  type="text" 
                  value={reportRecipient} 
                  onChange={(e) => {
                    setReportRecipient(e.target.value);
                    generateReport(e.target.value, reportShiftOfficers, reportKendala);
                  }}
                  placeholder="Pak Ferry"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-semibold focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">Petugas Shift:</label>
                <input 
                  type="text" 
                  value={reportShiftOfficers} 
                  onChange={(e) => {
                    setReportShiftOfficers(e.target.value);
                    generateReport(reportRecipient, e.target.value, reportKendala);
                  }}
                  placeholder="Ketik nama petugas shift..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-semibold focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">Kendala:</label>
                <input 
                  type="text" 
                  value={reportKendala} 
                  onChange={(e) => {
                    setReportKendala(e.target.value);
                    generateReport(reportRecipient, reportShiftOfficers, e.target.value);
                  }}
                  placeholder="-"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-semibold focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
            
            {/* Editable Textarea */}
            <div className="flex-1 flex flex-col space-y-1">
              <div className="flex justify-between items-center text-[10px] text-slate-400 px-1">
                <span>Format Teks Laporan (Dapat diedit langsung sebelum dikirim):</span>
                {copiedReport && <span className="text-emerald-400 font-bold">✓ Teks Berhasil Disalin!</span>}
              </div>
              <textarea 
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                rows={12}
                className="w-full bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-xs text-slate-200 focus:outline-none focus:border-sky-500 resize-none leading-relaxed"
              />
            </div>

            {/* Modal Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-800">
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(reportText);
                  setCopiedReport(true);
                  setTimeout(() => setCopiedReport(false), 2000);
                }} 
                className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl transition text-xs flex items-center justify-center gap-1.5 border border-slate-700"
              >
                <span>Salin Teks</span>
              </button>

              <button 
                onClick={sendWhatsApp} 
                className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition text-xs flex items-center justify-center gap-1.5 shadow"
              >
                <span>Kirim via WhatsApp</span>
              </button>

              <button 
                onClick={downloadPDF} 
                className="px-3 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl transition text-xs flex items-center justify-center gap-1.5 shadow"
              >
                <span>Download PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Dashboard Receipt Modal */}
      {selectedDashboardReceipt && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl flex flex-col items-center">
            <div className="flex justify-between items-center w-full border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Eye className="w-4 h-4 text-emerald-400" /> Bukti Struk Mesin
              </h3>
              <button 
                onClick={() => setSelectedDashboardReceipt(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 max-h-[70vh] overflow-auto flex items-center justify-center w-full">
              <img 
                src={selectedDashboardReceipt} 
                alt="Struk Mesin" 
                className="max-h-[60vh] object-contain rounded" 
              />
            </div>
            <button
              onClick={() => setSelectedDashboardReceipt(null)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
