import React, { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  serverTimestamp, 
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  doc,
  where,
  setDoc
} from "firebase/firestore";
import { 
  FolderClosed, 
  Search, 
  Filter, 
  Thermometer, 
  Droplets, 
  AlertTriangle, 
  CheckCircle, 
  Calendar, 
  Layers, 
  Plus, 
  ClipboardList,
  Printer,
  QrCode,
  Edit2,
  Trash2,
  X,
  Camera
} from "lucide-react";
import { SterileStock, EnvironmentalLog, UserProfile } from "../types";
import { QRCodeSVG } from 'qrcode.react';
import QRCode from 'qrcode';
import { printViaBluetooth } from "../lib/bluetooth";
import ScannerComponent from "./ScannerComponent";
import { ConfirmDialog } from './ConfirmDialog';
import { DEMO_KEYS, getDemoData, saveDemoData, INITIAL_DEMO_STERILE_STOCK, INITIAL_DEMO_ACTIVITY_LOGS } from "../lib/demoStore";
import { triggerActionConfirm } from "../lib/actionToast";

interface StorageProps {
  currentUsername: string;
  currentRole?: string;
  isDemoMode?: boolean;
  currentUserProfile?: UserProfile | null;
}

export default function Storage({ currentUsername, currentRole = "operator", isDemoMode = false, currentUserProfile }: StorageProps) {
  const [sterileStock, setSterileStock] = useState<SterileStock[]>([]);
  const [envLogs, setEnvLogs] = useState<EnvironmentalLog[]>([]);
  const [deletedEnvLogIds, setDeletedEnvLogIds] = useState<string[]>([]);
  
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: (() => void) | null;
  }>({
    isOpen: false,
    title: "",
    message: "",
    action: null
  });

  const closeConfirm = () => setConfirmState(prev => ({ ...prev, isOpen: false }));
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<'rak' | 'qr' | 'scan'>('rak');

  // Multi-select states
  const [selectedStockIds, setSelectedStockIds] = useState<string[]>([]);
  const [selectedGrids, setSelectedGrids] = useState<string[]>([]);

  // Scan to Shelf states
  const [scanLot, setScanLot] = useState("");
  const [scanGrid, setScanGrid] = useState("");
  const [scanningTarget, setScanningTarget] = useState<'lot' | 'grid' | null>(null);
  const [matchingStocks, setMatchingStocks] = useState<SterileStock[]>([]);
  const [selectedStockForShelf, setSelectedStockForShelf] = useState<SterileStock | null>(null);

  useEffect(() => {
    setMatchingStocks([]);
    setSelectedStockForShelf(null);
  }, [scanLot]);

  useEffect(() => {
    setSelectedStockIds([]);
  }, [searchTerm, statusFilter]);

  // QR Grid generator states
  const [gridName, setGridName] = useState<string>("");
  const [generatedGrids, setGeneratedGrids] = useState<string[]>([]);

  // Environmental Logging states
  const [temperatureCelsius, setTemperatureCelsius] = useState<number>(21.5);
  const [humidityPercent, setHumidityPercent] = useState<number>(45);
  const [loadingEnv, setLoadingEnv] = useState<boolean>(false);

  // Edit stock states
  const [editingStock, setEditingStock] = useState<SterileStock | null>(null);
  const [editShelfLocation, setEditShelfLocation] = useState("");
  const [editOriginUnit, setEditOriginUnit] = useState("");
  const [editStatus, setEditStatus] = useState<any>("sterile");

  // Edit grid states
  const [editingGrid, setEditingGrid] = useState<string | null>(null);
  const [editGridValue, setEditGridValue] = useState("");

  useEffect(() => {
    if (isDemoMode) {
      const loadDemoStock = () => {
        const demoData = getDemoData(DEMO_KEYS.STERILE_STOCK, INITIAL_DEMO_STERILE_STOCK);
        const mappedStock: SterileStock[] = demoData.map((item: any) => ({
          id: item.id || item.lotNumber,
          lotNumber: item.lotNumber,
          instrumentId: item.instrumentId || "INST-001",
          instrumentName: item.instrumentName,
          targetUnit: item.targetUnit || "IGD",
          originUnit: item.targetUnit || "IGD",
          qty: item.qty || 1,
          rackLocation: item.rackLocation || "RAK-A1-S1",
          shelfLocation: item.rackLocation || "RAK-A1-S1",
          status: item.status === "Aman" ? "sterile" : item.status,
          machineName: item.machineUsed || "BUMA STERILIZER VACUM",
          machineUsed: item.machineUsed || "BUMA STERILIZER VACUM",
          cycleNumber: item.cycleNumber || 101,
          indicatorPass: item.indicatorPass ?? true,
          operator: item.operator || "Pengguna Demo",
          sterilizedAt: undefined,
          expiresAt: item.expiryDateStr ? { toDate: () => new Date(item.expiryDateStr) } as any : undefined
        }));
        setSterileStock(mappedStock);
        
        const storedGrids = localStorage.getItem("cssd_demo_storage_grids");
        if (storedGrids) {
          setGeneratedGrids(JSON.parse(storedGrids));
        } else {
          const defaultGrids = ["RAK-A1-S1", "RAK-A1-S2", "RAK-B2-S1", "RAK-B2-S3"];
          localStorage.setItem("cssd_demo_storage_grids", JSON.stringify(defaultGrids));
          setGeneratedGrids(defaultGrids);
        }
      };

      loadDemoStock();

      const handleStoreChange = (e: any) => {
        if (!e.detail?.key || e.detail.key === DEMO_KEYS.STERILE_STOCK || e.detail.key === "all") {
          loadDemoStock();
        }
      };

      window.addEventListener("cssd_demo_store_change", handleStoreChange);
      return () => window.removeEventListener("cssd_demo_store_change", handleStoreChange);
    }

    const tenantId = currentUserProfile?.tenantId || "RSUD-BENDA";

    // 1. Listen to sterile stock
    const unsubStock = onSnapshot(query(collection(db, "sterile_stock"), where("tenantId", "==", tenantId)), (snap) => {
      const items: SterileStock[] = [];
      const now = new Date();
      snap.forEach((docSnap) => {
        const item = docSnap.data() as SterileStock;
        if (item.status === "distributed") return;
        // Verify expiry on the fly for display status
        const expDate = item.expiresAt?.toDate();
        let status = item.status;
        if (item.status === "sterile" && expDate) {
          const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
          if (diffDays <= 0) {
            status = "expired";
          }
        }
        items.push({ ...item, status, id: docSnap.id });
      });
      setSterileStock(items);
    });

    // 2. Listen to environmental temperature/humidity logs
    const envQuery = query(collection(db, "environmental_logs"), where("tenantId", "==", tenantId), orderBy("timestamp", "desc"), limit(10));
    const unsubEnv = onSnapshot(envQuery, (snap) => {
      const logs: EnvironmentalLog[] = [];
      snap.forEach((doc) => {
        logs.push({ id: doc.id, ...doc.data() } as EnvironmentalLog);
      });
      setEnvLogs(logs);
    }, (err) => {
      console.warn("Environmental logs snapshot warning:", err);
    });

    // 3. Listen to generated grids
    const unsubGrids = onSnapshot(doc(db, "settings", `storage_grids_${tenantId}`), (docSnap) => {
      if (docSnap.exists() && docSnap.data().grids) {
        setGeneratedGrids(docSnap.data().grids);
      }
    });

    return () => {
      unsubStock();
      unsubEnv();
      unsubGrids();
    };
  }, [isDemoMode, currentUserProfile]);

  const formatEnvTimestamp = (ts: any) => {
    if (!ts) return "Baru saja";
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
    if (isNaN(d.getTime())) return "Baru saja";

    const dateStr = d.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
    const timeStr = d.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    return `${dateStr}, ${timeStr}`;
  };

  // Save Environmental Parameter check
  const handleSaveEnvLog = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingEnv(true);

    const now = new Date();
    let status: EnvironmentalLog['status'] = "normal";
    const isTempAlert = temperatureCelsius < 18 || temperatureCelsius > 22;
    const isHumAlert = humidityPercent < 35 || humidityPercent > 60;

    if (isTempAlert && isHumAlert) status = "alert_both";
    else if (isTempAlert) status = "alert_temp";
    else if (isHumAlert) status = "alert_humidity";

    const tenantId = currentUserProfile?.tenantId || "RSUD-BENDA";

    const newLog = {
      timestamp: serverTimestamp(),
      temperatureCelsius,
      humidityPercent,
      operatorName: currentUsername || "Petugas CSSD",
      status,
      tenantId
    };

    try {
      if (!isDemoMode) {
        await addDoc(collection(db, "environmental_logs"), newLog);
      }
    } catch (err) {
      console.warn("Saving env log to Firestore failed, fallback to local state:", err);
    }

    // Always update local state so demo mode & offline mode reflect immediately with date & time
    const localEntry: EnvironmentalLog = {
      id: "env-log-" + Date.now(),
      timestamp: now,
      temperatureCelsius,
      humidityPercent,
      operatorName: currentUsername || "Petugas CSSD",
      status
    };
    setEnvLogs((prev) => [localEntry, ...prev]);

    triggerActionConfirm({
      title: "Suhu & Kelembaban Tersimpan!",
      message: `Data lingkungan (${temperatureCelsius}°C / ${humidityPercent}%) berhasil dicatat.`
    });
    setLoadingEnv(false);
  };

  // Delete Environmental Log (With confirmation and Firestore cleanup)
  const handleDeleteEnvLog = async (logId: string) => {
    try {
      if (!logId.startsWith("sample-") && !logId.startsWith("env-log-")) {
        await deleteDoc(doc(db, "environmental_logs", logId));
      }
    } catch (err) {
      console.warn("Failed to delete log from Firestore:", err);
    }

    setDeletedEnvLogIds((prev) => [...prev, logId]);
    setEnvLogs((prev) => prev.filter((item) => item.id !== logId));
  };

  const handleResetEnvLogs = async () => {
    try {
      // Create batch to delete from Firestore
      const deletePromises = envLogs.map(async (log) => {
        if (!log.id.startsWith("sample-") && !log.id.startsWith("env-log-")) {
          return deleteDoc(doc(db, "environmental_logs", log.id));
        }
      });
      await Promise.all(deletePromises);
    } catch (err) {
      console.warn("Failed to reset logs from Firestore:", err);
    }

    setDeletedEnvLogIds((prev) => [...prev, "sample-1", "sample-2", "sample-3", ...envLogs.map(l => l.id)]);
    setEnvLogs([]);
  };

  // Trigger Recall for expired items
  const handleAssignShelfSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanLot || !scanGrid) return;
    
    const targetGrid = scanGrid.trim().toUpperCase();
    
    if (!generatedGrids.includes(targetGrid)) {
      alert(`Gagal: Grid / Rak "${targetGrid}" belum terdaftar! Silakan daftarkan terlebih dahulu di menu "Buat Label QR Rak".`);
      return;
    }

    if (isDemoMode) {
      const stock = getDemoData(DEMO_KEYS.STERILE_STOCK, INITIAL_DEMO_STERILE_STOCK);
      
      const matching = stock.filter((item: any) => 
        (item.lotNumber === scanLot.trim() || 
         item.instrumentId === scanLot.trim() || 
         item.id === scanLot.trim()) &&
        (!item.rackLocation || item.rackLocation === "Belum Masuk Rak" || item.rackLocation === "Belum Ada Rak" || item.rackLocation === "-")
      );

      if (matching.length > 1 && !selectedStockForShelf) {
        const mappedStocks = matching.map((item: any) => ({
          id: item.id || item.lotNumber,
          lotNumber: item.lotNumber,
          instrumentId: item.instrumentId || "INST-001",
          instrumentName: item.instrumentName,
          targetUnit: item.targetUnit || "IGD",
          originUnit: item.targetUnit || "IGD",
          qty: item.qty || 1,
          rackLocation: item.rackLocation || "Belum Masuk Rak",
          shelfLocation: item.rackLocation || "Belum Masuk Rak",
          status: item.status === "Aman" ? "sterile" : item.status,
          machineName: item.machineUsed || "BUMA STERILIZER VACUM",
          machineUsed: item.machineUsed || "BUMA STERILIZER VACUM",
          cycleNumber: item.cycleNumber || 101,
          indicatorPass: item.indicatorPass ?? true,
          operator: item.operator || "Pengguna Demo",
          expiresAt: item.expiryDateStr ? { toDate: () => new Date(item.expiryDateStr) } as any : undefined
        }));
        setMatchingStocks(mappedStocks);
        alert(`Ditemukan ${matching.length} paket berbeda untuk ID Instrumen ini. Silakan pilih salah satu paket yang ingin disimpan di rak!`);
        return;
      }

      const targetItem = selectedStockForShelf || matching[0] || stock.find((item: any) => 
        item.lotNumber === scanLot.trim() || 
        item.instrumentId === scanLot.trim() || 
        item.id === scanLot.trim()
      );

      if (!targetItem) {
        alert("Lot atau ID Instrumen tidak ditemukan di dalam stok steril aktif!");
        return;
      }

      const foundIdx = stock.findIndex((item: any) => item.lotNumber === targetItem.lotNumber);
      if (foundIdx === -1) {
        alert("Lot atau ID Instrumen tidak ditemukan!");
        return;
      }

      stock[foundIdx].rackLocation = targetGrid;
      saveDemoData(DEMO_KEYS.STERILE_STOCK, stock);

      // update activity logs
      const actLogs = getDemoData(DEMO_KEYS.ACTIVITY_LOGS, INITIAL_DEMO_ACTIVITY_LOGS);
      const newAct = {
        id: "demo-act-" + Date.now(),
        timestampStr: new Date().toISOString(),
        dateStr: new Date().toLocaleString("id-ID"),
        instrumentName: stock[foundIdx].instrumentName || "Instrumen Steril",
        installation: stock[foundIdx].targetUnit || "IGD",
        qty: stock[foundIdx].qty || 1,
        type: "Set",
        status: "Penyimpanan",
        operator: currentUsername
      };
      saveDemoData(DEMO_KEYS.ACTIVITY_LOGS, [newAct, ...actLogs]);

      alert(`Sukses! ${stock[foundIdx].instrumentName} disimpan di rak ${targetGrid}`);
      setScanLot("");
      setScanGrid("");
      setMatchingStocks([]);
      setSelectedStockForShelf(null);
      setActiveTab('rak');
      return;
    }

    try {
      let stockDoc: any = null;
      let actualLotNumber = scanLot.trim();

      const tenantId = currentUserProfile?.tenantId || "RSUD-BENDA";

      // Try lookup by lotNumber
      const q = query(collection(db, "sterile_stock"), where("tenantId", "==", tenantId), where("lotNumber", "==", scanLot.trim()));
      let snap = await getDocs(q);
      
      if (!snap.empty) {
        stockDoc = snap.docs[0];
      } else {
        // Fallback: try lookup by instrumentId in sterile status
        const qInst = query(collection(db, "sterile_stock"), where("tenantId", "==", tenantId), where("instrumentId", "==", scanLot.trim()), where("status", "==", "sterile"));
        snap = await getDocs(qInst);
        
        if (snap.empty) {
          alert("Lot atau ID Instrumen tidak ditemukan di dalam stok steril aktif!");
          return;
        }

        const unstoredDocs = snap.docs.filter(d => {
          const data = d.data();
          return !data.shelfLocation || data.shelfLocation === "Belum Masuk Rak" || data.shelfLocation === "Belum Ada Rak";
        });

        const targetDocs = unstoredDocs.length > 0 ? unstoredDocs : snap.docs;

        if (targetDocs.length > 1 && !selectedStockForShelf) {
          const mapped: SterileStock[] = targetDocs.map(d => ({
            id: d.id,
            ...d.data()
          } as SterileStock));
          setMatchingStocks(mapped);
          alert(`Ditemukan ${targetDocs.length} data paket terpisah untuk ID Instrumen ini. Silakan pilih salah satu paket di bawah!`);
          return;
        }

        if (selectedStockForShelf) {
          stockDoc = snap.docs.find(d => d.id === selectedStockForShelf.id);
        } else {
          stockDoc = targetDocs[0];
        }
        
        actualLotNumber = stockDoc.data().lotNumber || scanLot.trim();
      }
      
      if (!stockDoc) {
        alert("Lot atau ID Instrumen tidak ditemukan di dalam stok steril aktif!");
        return;
      }
      
      await updateDoc(doc(db, "sterile_stock", stockDoc.id), {
        shelfLocation: targetGrid
      });

      // 🔒 HOTFIX LOCKED RULE: Update Live State
      const instrumentId = stockDoc.data().instrumentId || stockDoc.data().lotNumber;
      if (instrumentId) {
        const lsRef = doc(db, "instrument_live_state", instrumentId);
        setDoc(lsRef, {
          statusAlur: "RAK",
          currentState: "RAK",
          kondisi: "NORMAL",
          currentLocation: targetGrid,
          currentHolder: "CSSD",
          updatedAt: new Date().toISOString()
        }, { merge: true }).catch(err => console.warn("Live state not found, skipping..."));
        
        const instRef = doc(db, "instruments", instrumentId);
        updateDoc(instRef, {
          currentState: "READY",
          currentLocation: targetGrid,
          updatedAt: serverTimestamp()
        }).catch(err => console.warn("Legacy instrument not found..."));

        const auditRef = doc(collection(db, "audit_logs"));
        setDoc(auditRef, {
          action: "MOVE_TO_RACK",
          instrumentId: instrumentId,
          details: `Dipindahkan ke rak ${targetGrid}`,
          timestamp: new Date().toISOString(),
          user: currentUsername || "Admin",
          tenantId
        }).catch(() => {});
      }
      
      // Update workflow
      try {
        await updateDoc(doc(db, "workflow_logs", actualLotNumber), {
          "storage.shelfLocation": targetGrid,
          "storage.storedAt": serverTimestamp(),
          "storage.storedBy": currentUsername
        });
      } catch (err) {}

      await addDoc(collection(db, "activity_logs"), {
        timestamp: serverTimestamp(),
        instrumentName: stockDoc.data().instrumentName || 'Instrumen Steril',
        installation: stockDoc.data().originUnit || 'IGD',
        qty: stockDoc.data().qty || 1,
        type: 'Set',
        status: 'Penyimpanan',
        operator: currentUsername,
        tenantId
      });
      
      alert(`Sukses! Lot ${actualLotNumber} disimpan di rak ${targetGrid}`);
      setScanLot("");
      setScanGrid("");
      setMatchingStocks([]);
      setSelectedStockForShelf(null);
      setActiveTab('rak');
    } catch (err) {
      console.error(err);
      alert("Terjadi kesalahan saat menyimpan ke rak.");
    }
  };

  const handleRecallItem = async (stockItem: SterileStock) => {
    if (false) {
      return;
    }

    try {
      // 1. Update sterile stock status to recalled
      await updateDoc(doc(db, "sterile_stock", stockItem.id), {
        status: "recalled"
      });

      // 2. Also locate original workflow_log and update state to recalled
      try {
        await updateDoc(doc(db, "workflow_logs", stockItem.lotNumber), {
          currentStage: "recalled",
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        console.log("Associated workflow log document not found under lot id, continuing.");
      }

      alert(`Sukses menarik Lot ${stockItem.lotNumber} dari sistem. Silakan bawa kembali kontainer ke Dekontaminasi.`);
    } catch (err) {
      console.error(err);
      alert("Gagal melakukan penarikan lot.");
    }
  };

  const handleOpenEdit = (stock: SterileStock) => {
    setEditingStock(stock);
    setEditShelfLocation(stock.shelfLocation || "");
    setEditOriginUnit(stock.originUnit || "");
    setEditStatus(stock.status || "sterile");
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStock) return;
    try {
      await updateDoc(doc(db, "sterile_stock", editingStock.id), {
        shelfLocation: editShelfLocation.trim().toUpperCase(),
        originUnit: editOriginUnit,
        status: editStatus
      });
      alert("Data stok steril berhasil diperbarui!");
      setEditingStock(null);
    } catch (err) {
      console.error(err);
      alert("Gagal memperbarui data stok.");
    }
  };

  const executeDeleteStock = async (stockItem: SterileStock) => {
    if (isDemoMode) {
      const stock = getDemoData(DEMO_KEYS.STERILE_STOCK, INITIAL_DEMO_STERILE_STOCK);
      const filtered = stock.filter((item: any) => (item.id || item.lotNumber) !== stockItem.id);
      saveDemoData(DEMO_KEYS.STERILE_STOCK, filtered);
      const mappedStock: SterileStock[] = filtered.map((item: any) => ({
        id: item.id || item.lotNumber,
        lotNumber: item.lotNumber,
        instrumentId: item.instrumentId || "INST-001",
        instrumentName: item.instrumentName,
        targetUnit: item.targetUnit || "IGD",
        originUnit: item.targetUnit || "IGD",
        qty: item.qty || 1,
        rackLocation: item.rackLocation || "RAK-A1-S1",
        shelfLocation: item.rackLocation || "RAK-A1-S1",
        status: item.status === "Aman" ? "sterile" : item.status,
        machineName: item.machineUsed || "BUMA STERILIZER VACUM",
        machineUsed: item.machineUsed || "BUMA STERILIZER VACUM",
        cycleNumber: item.cycleNumber || 101,
        indicatorPass: item.indicatorPass ?? true,
        operator: item.operator || "Pengguna Demo",
        sterilizedAt: undefined,
        expiresAt: item.expiryDateStr ? { toDate: () => new Date(item.expiryDateStr) } as any : undefined
      }));
      setSterileStock(mappedStock);
      alert("Data stok steril berhasil dihapus (Demo Mode).");
      return;
    }
    try {
      await deleteDoc(doc(db, "sterile_stock", stockItem.id));
      alert("Data stok steril berhasil dihapus.");
    } catch (err) {
      console.error(err);
      alert("Gagal menghapus data stok.");
    }
  };

  const handleDeleteStock = (stockItem: SterileStock) => {
    setConfirmState({
      isOpen: true,
      title: "Hapus Data Stok",
      message: `Yakin ingin menghapus data stok steril "${stockItem.instrumentName}" (Lot: ${stockItem.lotNumber})?`,
      action: () => executeDeleteStock(stockItem)
    });
  };

  const handleSelectStock = (id: string) => {
    setSelectedStockIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllStock = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedStockIds(filteredStock.map(s => s.id));
    } else {
      setSelectedStockIds([]);
    }
  };

  const executeDeleteMultipleStock = async () => {
    if (isDemoMode) {
      const stock = getDemoData(DEMO_KEYS.STERILE_STOCK, INITIAL_DEMO_STERILE_STOCK);
      const filtered = stock.filter((item: any) => {
        const itemId = item.id || item.lotNumber;
        return !selectedStockIds.includes(itemId);
      });
      saveDemoData(DEMO_KEYS.STERILE_STOCK, filtered);
      const mappedStock: SterileStock[] = filtered.map((item: any) => ({
        id: item.id || item.lotNumber,
        lotNumber: item.lotNumber,
        instrumentId: item.instrumentId || "INST-001",
        instrumentName: item.instrumentName,
        targetUnit: item.targetUnit || "IGD",
        originUnit: item.targetUnit || "IGD",
        qty: item.qty || 1,
        rackLocation: item.rackLocation || "RAK-A1-S1",
        shelfLocation: item.rackLocation || "RAK-A1-S1",
        status: item.status === "Aman" ? "sterile" : item.status,
        machineName: item.machineUsed || "BUMA STERILIZER VACUM",
        machineUsed: item.machineUsed || "BUMA STERILIZER VACUM",
        cycleNumber: item.cycleNumber || 101,
        indicatorPass: item.indicatorPass ?? true,
        operator: item.operator || "Pengguna Demo",
        sterilizedAt: undefined,
        expiresAt: item.expiryDateStr ? { toDate: () => new Date(item.expiryDateStr) } as any : undefined
      }));
      setSterileStock(mappedStock);
      setSelectedStockIds([]);
      alert("Beberapa data stok steril berhasil dihapus (Demo Mode).");
      return;
    }

    try {
      const deletePromises = selectedStockIds.map(async (id) => {
        await deleteDoc(doc(db, "sterile_stock", id));
      });
      await Promise.all(deletePromises);
      setSelectedStockIds([]);
      alert("Beberapa data stok steril berhasil dihapus.");
    } catch (err) {
      console.error(err);
      alert("Gagal menghapus beberapa data stok.");
    }
  };

  const handleDeleteMultipleStock = () => {
    if (selectedStockIds.length === 0) return;
    setConfirmState({
      isOpen: true,
      title: "Hapus Banyak Data Stok",
      message: `Yakin ingin menghapus ${selectedStockIds.length} data stok steril terpilih?`,
      action: () => executeDeleteMultipleStock()
    });
  };

  const handleOpenEditGrid = (grid: string) => {
    setEditingGrid(grid);
    setEditGridValue(grid);
  };

  const handleSaveEditGrid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGrid) return;
    const newVal = editGridValue.trim().toUpperCase();
    if (!newVal) return;

    if (generatedGrids.includes(newVal) && newVal !== editingGrid) {
      alert("Nama rak/grid tersebut sudah ada.");
      return;
    }

    const newGrids = generatedGrids.map(g => g === editingGrid ? newVal : g);
    if (isDemoMode) {
      localStorage.setItem("cssd_demo_storage_grids", JSON.stringify(newGrids));
      setGeneratedGrids(newGrids);
      alert("Label QR Rak/Grid berhasil diperbarui! (Demo Mode)");
      setEditingGrid(null);
      return;
    }

    try {
      await setDoc(doc(db, "settings", "storage_grids"), {
        grids: newGrids
      }, { merge: true });
      alert("Label QR Rak/Grid berhasil diperbarui!");
      setEditingGrid(null);
    } catch (err) {
      console.error(err);
      alert("Gagal memperbarui label QR Rak/Grid.");
    }
  };

  const executeDeleteGrid = async (grid: string) => {
    const newGrids = generatedGrids.filter(g => g !== grid);
    if (isDemoMode) {
      localStorage.setItem("cssd_demo_storage_grids", JSON.stringify(newGrids));
      setGeneratedGrids(newGrids);
      setSelectedGrids(prev => prev.filter(g => g !== grid));
      alert("Rak/Grid berhasil dihapus. (Demo Mode)");
      return;
    }
    try {
      await setDoc(doc(db, "settings", "storage_grids"), {
        grids: newGrids
      }, { merge: true });
      setSelectedGrids(prev => prev.filter(g => g !== grid));
      alert("Rak/Grid berhasil dihapus.");
    } catch (err) {
      console.error(err);
      alert("Gagal menghapus Rak/Grid.");
    }
  };

  const handleDeleteGrid = (grid: string) => {
    setConfirmState({
      isOpen: true,
      title: "Hapus Rak/Grid",
      message: `Yakin ingin menghapus Rak/Grid "${grid}" dari daftar?`,
      action: () => executeDeleteGrid(grid)
    });
  };

  const handleSelectGrid = (grid: string) => {
    setSelectedGrids(prev =>
      prev.includes(grid) ? prev.filter(g => g !== grid) : [...prev, grid]
    );
  };

  const handleSelectAllGrids = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedGrids([...generatedGrids]);
    } else {
      setSelectedGrids([]);
    }
  };

  const executeDeleteMultipleGrids = async () => {
    const newGrids = generatedGrids.filter(g => !selectedGrids.includes(g));
    if (isDemoMode) {
      localStorage.setItem("cssd_demo_storage_grids", JSON.stringify(newGrids));
      setGeneratedGrids(newGrids);
      setSelectedGrids([]);
      alert("Rak/Grid terpilih berhasil dihapus (Demo Mode).");
      return;
    }
    try {
      await setDoc(doc(db, "settings", "storage_grids"), {
        grids: newGrids
      }, { merge: true });
      setSelectedGrids([]);
      alert("Rak/Grid terpilih berhasil dihapus.");
    } catch (err) {
      console.error(err);
      alert("Gagal menghapus beberapa Rak/Grid.");
    }
  };

  const handleDeleteMultipleGrids = () => {
    if (selectedGrids.length === 0) return;
    setConfirmState({
      isOpen: true,
      title: "Hapus Banyak Rak/Grid",
      message: `Yakin ingin menghapus ${selectedGrids.length} Rak/Grid terpilih dari daftar?`,
      action: () => executeDeleteMultipleGrids()
    });
  };

  const canvasToEscPos = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return new Uint8Array();
  const width = canvas.width;
  const height = canvas.height;
  const imgData = ctx.getImageData(0, 0, width, height);
  const pixels = imgData.data;

  const xBytes = Math.ceil(width / 8);
  const data = new Uint8Array(8 + xBytes * height);
  
  data[0] = 0x1D; data[1] = 0x76; data[2] = 0x30; data[3] = 0;
  data[4] = xBytes & 0xFF; data[5] = (xBytes >> 8) & 0xFF;
  data[6] = height & 0xFF; data[7] = (height >> 8) & 0xFF;
  
  let offset = 8;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < xBytes; x++) {
      let byte = 0;
      for (let b = 0; b < 8; b++) {
        const px = x * 8 + b;
        if (px < width) {
          const idx = (y * width + px) * 4;
          const r = pixels[idx];
          const g = pixels[idx+1];
          const b_col = pixels[idx+2];
          const a = pixels[idx+3];
          const isBlack = (a > 128) && ((r + g + b_col) / 3 < 128);
          if (isBlack) {
            byte |= (1 << (7 - b));
          }
        }
      }
      data[offset++] = byte;
    }
  }
  return data;
};

  const generateReceiptBluetooth = async (stock: SterileStock) => {
    try {
      const parseDateObj = (val: any) => {
        if (!val) return null;
        if (typeof val?.toDate === 'function') return val.toDate();
        if (val instanceof Date) return val;
        if (typeof val === 'string' || typeof val === 'number') {
          const d = new Date(val);
          if (!isNaN(d.getTime())) return d;
        }
        return null;
      };

      const sterilDateObj = parseDateObj(stock.sterilizedAt);
      const tglSteril = sterilDateObj
        ? sterilDateObj.toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '-';

      let expDateObj = parseDateObj(stock.expiresAt);
      if (!expDateObj && sterilDateObj) {
        expDateObj = new Date(sterilDateObj.getTime() + 30 * 24 * 3600 * 1000);
      }
      const tglExp = expDateObj
        ? expDateObj.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '-';
        
      const catalogDoc = await getDoc(doc(db, "instruments", stock.instrumentId));
      const catalogData = catalogDoc.exists() ? catalogDoc.data() : null;

      const logDoc = await getDoc(doc(db, "workflow_logs", stock.lotNumber));
      const logData = logDoc.exists() ? logDoc.data() : null;

      const sterilisasi = logData?.sterilization;
      const lot = stock.lotNumber;
      const sku = catalogData?.sku || stock.instrumentId;

      let receipt = "";
      receipt += "[[CENTER]]RSUD BENDA - INSTALASI CSSD[[/CENTER]]\n";
      receipt += "[[CENTER]]PROFIL INSTRUMEN STERIL[[/CENTER]]\n";
      receipt += "================================\n";
      
      receipt += `[[QR]]${stock.instrumentId}[[/QR]]\n`;
      receipt += `[[CENTER]]${stock.instrumentId}[[/CENTER]]\n\n`;

      receipt += `Nama Item   : ${stock.instrumentName}\n`;
      receipt += `No. SKU/ID  : ${sku}\n`;
      receipt += `Tipe Alat   : ${catalogData?.type === 'set' ? 'SET INSTRUMEN' : 'TUNGGAL'}\n`;
      receipt += `Asal Unit   : ${catalogData?.originUnit || stock.originUnit || '-'}\n`;
      receipt += `Lokasi Rak  : ${stock.shelfLocation || '-'}\n`;
      receipt += `Mesin/Batch : ${sterilisasi?.machineName || stock.machineName || 'Sterilizer'} / Batch #${sterilisasi?.cycleNumber || stock.cycleNumber || 1}\n`;
      receipt += `Tgl Steril  : ${tglSteril}\n`;
      receipt += `Tgl Expired : ${tglExp}\n`;
      receipt += `Status QC   : STERIL & LULUS INDIKATOR\n`;
      receipt += `Petugas CSSD: ${currentUsername}\n`;

      // Detail isi set jika bertipe SET
      const itemsList = catalogData?.items || [];
      if (catalogData?.type === 'set' || itemsList.length > 0) {
        receipt += "--------------------------------\n";
        receipt += "RINCIAN ISI KOMPONEN SET:\n";
        itemsList.forEach((itm: any, idx: number) => {
          receipt += `${idx + 1}. ${itm.name} (${itm.qty || 1} pcs)\n`;
        });
      }

      receipt += "================================\n";
      receipt += "[[CENTER]]Label Profil Storage Steril[[/CENTER]]\n";
      receipt += "[[CENTER]]Tempelkan pada Pouch/Kontainer[[/CENTER]]\n";

      await printViaBluetooth(receipt);
      alert("Profil instrumen berhasil dicetak ke printer termal!");
    } catch (error) {
      console.error(error);
      alert("Gagal mencetak profil instrumen ke printer Bluetooth.");
    }
  };

  const handleAddGrid = async (e: React.FormEvent) => {
    e.preventDefault();
    const gridId = gridName.trim().toUpperCase();
    if (gridId && !generatedGrids.includes(gridId)) {
      const newGrids = [...generatedGrids, gridId];
      if (isDemoMode) {
        localStorage.setItem("cssd_demo_storage_grids", JSON.stringify(newGrids));
        setGeneratedGrids(newGrids);
        setGridName("");
        return;
      }
      try {
        await setDoc(doc(db, "settings", "storage_grids"), {
          grids: newGrids
        }, { merge: true });
        setGridName("");
      } catch (err) {
        console.error(err);
        alert("Gagal menyimpan grid ke database.");
      }
    }
  };

  const printGridLabelBluetooth = async (gridValue: string) => {
    try {
      const canvas = document.createElement('canvas');
      // 50x25 mm thermal label (width: ~384 dots, height: ~200 dots)
      canvas.width = 384; 
      canvas.height = 200; 
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // QR Canvas
      const qrCanvas = document.createElement('canvas');
      await QRCode.toCanvas(qrCanvas, gridValue, { width: 160, margin: 1 });
      ctx.drawImage(qrCanvas, 10, 20);
      
      // Text
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(gridValue, 180, 100);
      
      const rasterData = canvasToEscPos(canvas);
      const init = new Uint8Array([0x1B, 0x40]);
      // small feed between labels (maybe not needed if label printer, but we send it)
      const feed = new Uint8Array([0x1B, 0x64, 0x02]); 
      
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
      });
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
      
      const sendChunked = async (dataArray: Uint8Array) => {
        const CHUNK_SIZE = 20;
        for (let i = 0; i < dataArray.length; i += CHUNK_SIZE) {
          const chunk = dataArray.slice(i, i + CHUNK_SIZE);
          await characteristic.writeValue(chunk);
        }
      };
      
      await sendChunked(init);
      await sendChunked(rasterData);
      await sendChunked(feed);
      
      alert("Label Rak berhasil dicetak ke printer Bluetooth!");
    } catch (error) {
      console.error(error);
    }
  };

  // Filter & Search Logic
  const filteredStock = sterileStock.filter((item) => {
    const matchesSearch = 
      item.instrumentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.lotNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.shelfLocation.toLowerCase().includes(searchTerm.toLowerCase());

    const now = new Date();
    const expDate = item.expiresAt?.toDate();
    const diffDays = expDate ? Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 3600 * 24)) : 99;

    if (statusFilter === "all") return matchesSearch;
    if (statusFilter === "sterile") return matchesSearch && item.status === "sterile" && diffDays > 3;
    if (statusFilter === "near_expired") return matchesSearch && item.status === "sterile" && diffDays <= 3 && diffDays > 0;
    if (statusFilter === "expired") return matchesSearch && item.status === "expired";
    if (statusFilter === "recalled") return matchesSearch && item.status === "recalled";

    return matchesSearch;
  });

  return (
    <>
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={() => confirmState.action?.()}
        onCancel={closeConfirm}
        confirmText="Ya, Lanjutkan"
      />
      <div className="space-y-6" id="storage-container">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 font-sans tracking-tight">Storage Area Steril</h2>
          <p className="text-xs text-slate-400 mt-0.5">Mengontrol persediaan alat steril, memeriksa masa kedaluwarsa, mengelola lokasi rak, dan memantau suhu/kelembaban HVAC.</p>
        </div>
        <div className="p-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg flex items-center gap-1.5 text-xs font-semibold print:hidden">
          <FolderClosed className="w-4 h-4 text-emerald-400" />
          <span>Storage Area Tekanan Positif</span>
        </div>
      </div>

      <div className="flex border-b border-slate-800 print:hidden">
        <button
          onClick={() => setActiveTab('scan')}
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'scan' 
              ? 'border-indigo-500 text-indigo-400 bg-slate-900/50' 
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          Scan Masuk Rak
        </button>
        <button
          onClick={() => setActiveTab('rak')}
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'rak' 
              ? 'border-emerald-500 text-emerald-400 bg-slate-900/50' 
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          Rak & Stok Steril
        </button>
        <button
          onClick={() => setActiveTab('qr')}
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'qr' 
              ? 'border-sky-500 text-sky-400 bg-slate-900/50' 
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          Buat Label QR Rak
        </button>
      </div>

      {activeTab === 'scan' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg max-w-lg mx-auto print:hidden">
          <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-indigo-400" />
              Scan Masuk Rak (Inventory)
            </span>
            <span className="text-xs text-slate-400 font-normal">Gunakan Kamera / Barcode Scanner</span>
          </h3>
          <form onSubmit={handleAssignShelfSubmit} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-bold text-slate-300">1. Scan SKU / No. Lot</label>
                <button
                  type="button"
                  onClick={() => setScanningTarget('lot')}
                  className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 rounded text-xs font-bold flex items-center gap-1 border border-indigo-500/30"
                >
                  <Camera className="w-3.5 h-3.5" /> Buka Kamera
                </button>
              </div>
              <input 
                type="text" 
                placeholder="Scan Barcode Instrumen/Lot"
                value={scanLot}
                onChange={(e) => setScanLot(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-lg p-3 font-mono focus:border-indigo-500"
                required
                autoFocus
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-bold text-slate-300">2. Scan Grid / Rak</label>
                <button
                  type="button"
                  onClick={() => setScanningTarget('grid')}
                  className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 rounded text-xs font-bold flex items-center gap-1 border border-indigo-500/30"
                >
                  <Camera className="w-3.5 h-3.5" /> Buka Kamera
                </button>
              </div>
              <input 
                type="text" 
                placeholder="Scan Barcode Grid/Rak"
                value={scanGrid}
                onChange={(e) => setScanGrid(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-lg p-3 font-mono focus:border-indigo-500"
                required
              />
            </div>

            {matchingStocks.length > 0 && (
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2 mt-2">
                <label className="block text-xs font-bold text-sky-400">Pilih Paket Terpisah (ID: {scanLot})</label>
                <div className="max-h-40 overflow-y-auto space-y-1.5">
                  {matchingStocks.map((stockItem) => (
                    <div 
                      key={stockItem.id} 
                      onClick={() => setSelectedStockForShelf(stockItem)}
                      className={`p-2 rounded-lg border text-xs cursor-pointer transition flex justify-between items-center ${
                        selectedStockForShelf?.id === stockItem.id 
                          ? 'border-indigo-500 bg-indigo-500/10 text-slate-100' 
                          : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:bg-slate-900/80'
                      }`}
                    >
                      <div className="text-left">
                        <span className="font-bold text-slate-200 block">{stockItem.instrumentName}</span>
                        <span className="text-[10px] font-mono text-slate-400 block mt-0.5">Lot: {stockItem.lotNumber}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300 font-semibold block w-max ml-auto">
                          Asal: {stockItem.originUnit || '-'}
                        </span>
                        <span className="text-[9px] text-slate-500 block mt-0.5">
                          Qty: {stockItem.qty}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button type="submit" className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition mt-4 shadow-lg shadow-indigo-900/30">
              Save & Simpan
            </button>
          </form>

          {/* Scanner Modal */}
          {scanningTarget && (
            <ScannerComponent 
              onScan={(code) => {
                if (scanningTarget === 'lot') {
                  setScanLot(code);
                } else if (scanningTarget === 'grid') {
                  setScanGrid(code.toUpperCase());
                }
                setScanningTarget(null);
              }}
              onClose={() => setScanningTarget(null)}
            />
          )}
        </div>
      )}

      {activeTab === 'rak' && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:hidden">
        
        {/* Left Col: Stock Search & Inventory List */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          
          {/* Search bar & Filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
              <input 
                type="text" 
                placeholder="Cari Nama Set, No. Lot, atau Rak..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-xs rounded-lg border-slate-800 bg-slate-950 text-slate-100 pl-9 p-2.5 border focus:border-emerald-500"
              />
            </div>
            
            <div className="flex gap-2">
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs rounded-lg border-slate-800 bg-slate-950 text-slate-100 p-2.5 border font-semibold"
              >
                <option value="all">Semua Status</option>
                <option value="sterile">Steril Aman (&gt;3 Hari)</option>
                <option value="near_expired">⚠️ Mendekati Expired (&lt;3 Hari)</option>
                <option value="expired">🚨 Kedaluwarsa (Expired)</option>
                <option value="recalled">Ditarik (Recalled)</option>
              </select>
            </div>
          </div>

          {/* Bulk Selection Actions Bar */}
          <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs gap-3">
            <label className="flex items-center gap-2 text-slate-300 font-medium cursor-pointer select-none">
              <input 
                type="checkbox"
                checked={filteredStock.length > 0 && selectedStockIds.length === filteredStock.length}
                onChange={handleSelectAllStock}
                className="w-4 h-4 rounded border-slate-800 bg-slate-900 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
              />
              <span>Pilih Semua Sesuai Filter ({filteredStock.length})</span>
            </label>
            {selectedStockIds.length > 0 && (
              <button
                type="button"
                onClick={handleDeleteMultipleStock}
                className="bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/20 hover:border-rose-500/35 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Hapus Terpilih ({selectedStockIds.length})
              </button>
            )}
          </div>

          {/* Sterile Inventory Table */}
          <div className="overflow-x-auto overflow-y-hidden touch-pan-x overscroll-x-contain border border-slate-800 rounded-xl bg-slate-950/20 pb-2">
            <div className="text-[10px] text-sky-400 mb-2 italic sm:hidden flex items-center gap-1 font-mono px-3 pt-3">
              <span>← Geser tabel ke kiri/kanan untuk melihat semua kolom →</span>
            </div>
            {filteredStock.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl font-mono bg-slate-950/40 m-3">
                Tidak ada instrumen steril yang cocok dengan kriteria pencarian.
              </div>
            ) : (
              <table className="w-full text-xs text-left text-slate-300">
                <thead className="text-[10px] text-slate-400 uppercase bg-slate-950 font-bold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4 w-10"></th>
                    <th className="py-3 px-4">Instrumen & No. Lot</th>
                    <th className="py-3 px-3">Asal Instalasi</th>
                    <th className="py-3 px-3">Lokasi Rak</th>
                    <th className="py-3 px-3">Tanggal Steril</th>
                    <th className="py-3 px-3">Masa Berlaku (Expiry)</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-900/40">
                  {filteredStock.map((stock) => {
                    const now = new Date();
                    const expDate = stock.expiresAt?.toDate();
                    const diffDays = expDate ? Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 3600 * 24)) : 0;
                    
                    let statusLabel = "";
                    let rowClass = "";
                    let badgeClass = "";

                    if (stock.status === "recalled") {
                      statusLabel = "RECALLED";
                      rowClass = "bg-red-500/5";
                      badgeClass = "bg-red-600 text-white font-extrabold";
                    } else if (stock.status === "distributed") {
                      statusLabel = "DISTRIBUTED";
                      rowClass = "opacity-60";
                      badgeClass = "bg-slate-800 text-slate-400";
                    } else if (stock.status === "expired" || diffDays <= 0) {
                      statusLabel = "EXPIRED";
                      rowClass = "bg-red-500/5";
                      badgeClass = "bg-red-500/20 text-red-400 border border-red-500/30 font-bold animate-pulse";
                    } else if (diffDays <= 3) {
                      statusLabel = `EXP DALAM ${diffDays} HARI`;
                      rowClass = "bg-amber-500/5";
                      badgeClass = "bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold";
                    } else {
                      statusLabel = "STERIL AMAN";
                      badgeClass = "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium";
                    }

                    return (
                      <tr key={stock.id} className={`hover:bg-slate-950 transition-colors ${rowClass}`}>
                        <td className="py-3.5 px-4 w-10">
                          <input 
                            type="checkbox"
                            checked={selectedStockIds.includes(stock.id)}
                            onChange={() => handleSelectStock(stock.id)}
                            className="w-4 h-4 rounded border-slate-800 bg-slate-950 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-bold text-slate-100 block">{stock.instrumentName}</span>
                          <div className="flex items-center gap-2 font-mono text-[10px] text-slate-400 mt-0.5">
                            <span>ID: <span className="text-sky-400 font-semibold">{stock.instrumentId || '-'}</span></span>
                            <span>•</span>
                            <span>Lot: <span className="text-slate-300 font-semibold">{stock.lotNumber}</span></span>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 font-semibold text-slate-300">
                          {stock.originUnit || '-'}
                        </td>
                        <td className="py-3.5 px-3 font-mono font-bold text-slate-200">{stock.shelfLocation}</td>
                        <td className="py-3.5 px-3 text-slate-400">{stock.sterilizedAt?.toDate().toLocaleDateString("id-ID")}</td>
                        <td className="py-3.5 px-3 font-mono">
                          <span className="text-slate-200 block">{stock.expiresAt?.toDate().toLocaleDateString("id-ID")}</span>
                          <span className="text-[9px] text-slate-400 block">{stock.machineName}</span>
                        </td>
                        <td className="py-3.5 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] whitespace-nowrap ${badgeClass}`}>{statusLabel}</span>
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEdit(stock)}
                              className="p-1.5 rounded bg-slate-800 text-slate-300 hover:text-sky-400 hover:bg-slate-700"
                              title="Edit Data Stok"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteStock(stock)}
                              className="p-1.5 rounded bg-slate-800 text-slate-300 hover:text-red-400 hover:bg-slate-700"
                              title="Hapus Data Stok"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            {stock.status === "sterile" && diffDays <= 0 && (
                              <button 
                                onClick={() => handleRecallItem(stock)}
                                className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded font-bold text-[10px]"
                              >
                                Recall
                              </button>
                            )}
                            {stock.status === "sterile" && diffDays > 0 && (
                              <button
                                onClick={() => generateReceiptBluetooth(stock)}
                                className="p-1.5 rounded bg-slate-800 text-slate-400 hover:text-emerald-400"
                                title="Cetak Struk Serah Terima (Thermal)"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Col: Climate Controls & Environmental History */}
        <div className="space-y-6">
          
          {/* Climate Logger Form */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
            <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-slate-400" />
              Catat Suhu & Kelembaban (RH)
            </h3>

            <form onSubmit={handleSaveEnvLog} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Suhu Udara (°C)</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={temperatureCelsius}
                    onChange={(e) => setTemperatureCelsius(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs rounded-lg border-slate-800 bg-slate-950 text-slate-100 p-2 border font-mono font-bold focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1">Kelembaban (RH %)</label>
                  <input 
                    type="number" 
                    value={humidityPercent}
                    onChange={(e) => setHumidityPercent(parseInt(e.target.value) || 0)}
                    className="w-full text-xs rounded-lg border-slate-800 bg-slate-950 text-slate-100 p-2 border font-mono font-bold focus:border-emerald-500"
                    required
                  />
                </div>
              </div>

              {(temperatureCelsius < 18 || temperatureCelsius > 22 || humidityPercent < 35 || humidityPercent > 60) && (
                <div className="p-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span>Melebihi Batas Aman!</span>
                  </div>
                  <p className="text-[10px] leading-relaxed">Nilai out of bounds akan memicu peringatan merah di dashboard utama. Silakan hubungi Teknisi IPSRS untuk memeriksa unit kompresor AC / Hepa Filter.</p>
                </div>
              )}

              <button 
                type="submit"
                disabled={loadingEnv}
                className="w-full py-2 bg-emerald-600 text-slate-950 font-extrabold rounded-lg text-xs hover:bg-emerald-500 transition shadow-md cursor-pointer"
              >
                {loadingEnv ? "Menyimpan..." : "Simpan Parameter Ruangan"}
              </button>
            </form>
          </div>

          {/* Historical Env Logs */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-slate-400" />
                Histori Pengecekan Suhu
              </h3>
              {currentRole === "admin" && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleResetEnvLogs}
                    className="text-[10px] font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 px-2 py-0.5 rounded transition cursor-pointer"
                  >
                    Reset Semua
                  </button>
                </div>
              )}
            </div>
            
            <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
              {envLogs.length > 0 ? (
                envLogs.map((log) => (
                <div key={log.id} className="flex justify-between items-center bg-slate-950 p-2.5 rounded border border-slate-800 text-[11px] hover:border-slate-700 transition">
                  <div>
                    <span className="font-mono font-bold text-slate-200">{log.temperatureCelsius}°C</span>
                    <span className="text-slate-600 mx-1.5">|</span>
                    <span className="font-mono text-slate-300">{log.humidityPercent}% RH</span>
                    <span className="text-[9px] text-slate-500 block mt-0.5">Oleh: {log.operatorName}</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="text-right">
                      <span className="text-[10px] font-mono text-slate-300 font-semibold block">{formatEnvTimestamp(log.timestamp)}</span>
                      {log.status === "normal" ? (
                        <span className="text-[9px] text-emerald-400 font-bold uppercase">✓ Normal</span>
                      ) : (
                        <span className="text-[9px] text-red-400 font-bold uppercase">⚠️ Alert</span>
                      )}
                    </div>
                    {currentRole === "admin" && (
                      <button
                        type="button"
                        onClick={() => handleDeleteEnvLog(log.id)}
                        title="Hapus Log Suhu (Khusus Administrasi)"
                        className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 hover:border-rose-500/40 transition cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                ))
              ) : (
                <div className="text-center py-8 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl font-mono">
                  Belum ada catatan histori.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      )}

      {activeTab === 'qr' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-6">
          <div className="flex justify-between items-center print:hidden">
            <div>
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <QrCode className="w-4 h-4 text-sky-400" />
                Buat Label QR Rak / Grid
              </h3>
              <p className="text-xs text-slate-400 mt-1">Buat kode QR untuk ditempel di rak/grid inventory agar mudah discan.</p>
            </div>
            {/* Button print removed since we print individually via bluetooth now */}
          </div>

          <form onSubmit={handleAddGrid} className="flex gap-3 print:hidden">
            <input 
              type="text" 
              placeholder="Contoh: RAK-A1, RAK-B2, GRID-05..."
              value={gridName}
              onChange={(e) => setGridName(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 text-sm text-slate-200 rounded-lg p-3 focus:border-sky-500"
              required
            />
            <button type="submit" className="bg-sky-600 hover:bg-sky-500 text-white px-6 py-3 rounded-lg text-sm font-bold transition shadow-md whitespace-nowrap">
              + Tambah QR
            </button>
          </form>

          {/* Bulk Selection Actions Bar for Grids */}
          {generatedGrids.length > 0 && (
            <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs gap-3 print:hidden">
              <label className="flex items-center gap-2 text-slate-300 font-medium cursor-pointer select-none">
                <input 
                  type="checkbox"
                  checked={selectedGrids.length === generatedGrids.length}
                  onChange={handleSelectAllGrids}
                  className="w-4 h-4 rounded border-slate-800 bg-slate-900 text-sky-500 focus:ring-sky-500 cursor-pointer"
                />
                <span>Pilih Semua Rak/Grid ({generatedGrids.length})</span>
              </label>
              {selectedGrids.length > 0 && (
                <button
                  type="button"
                  onClick={handleDeleteMultipleGrids}
                  className="bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/20 hover:border-rose-500/35 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Hapus Terpilih ({selectedGrids.length})
                </button>
              )}
            </div>
          )}

          {generatedGrids.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl font-mono bg-slate-950/40 print:hidden">
              Belum ada grid yang dibuat. Silakan masukkan nama rak/grid di atas.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 pt-4">
              {generatedGrids.map((grid, idx) => (
                <div key={idx} className="flex flex-col items-center justify-between bg-white p-4 rounded-xl border border-slate-200 relative group">
                  <div className="absolute top-2 left-2 flex items-center">
                    <input 
                      type="checkbox"
                      checked={selectedGrids.includes(grid)}
                      onChange={() => handleSelectGrid(grid)}
                      className="w-4 h-4 rounded border-slate-300 bg-white text-sky-600 focus:ring-sky-500 cursor-pointer"
                    />
                  </div>
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEditGrid(grid)}
                      className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-sky-600"
                      title="Edit Nama Rak/Grid"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleDeleteGrid(grid)}
                      className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-red-600"
                      title="Hapus Rak/Grid"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex flex-col items-center mt-4">
                    <QRCodeSVG value={grid} size={100} />
                    <span className="mt-3 text-slate-900 font-bold font-mono text-sm uppercase tracking-widest">{grid}</span>
                  </div>
                  <button 
                    onClick={() => printGridLabelBluetooth(grid)}
                    className="mt-3 bg-slate-900 hover:bg-slate-800 text-slate-200 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 w-full justify-center"
                    title="Cetak via Printer Termal Bluetooth"
                  >
                    <Printer className="w-3 h-3" /> Cetak Termal
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit Grid Modal */}
      {editingGrid && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-sky-400" />
                Edit Rak / Grid: {editingGrid}
              </h3>
              <button 
                onClick={() => setEditingGrid(null)}
                className="text-slate-400 hover:text-slate-100 p-1 rounded-lg bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditGrid} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">Nama Rak / Grid Baru</label>
                <input 
                  type="text" 
                  value={editGridValue} 
                  onChange={(e) => setEditGridValue(e.target.value)} 
                  required
                  placeholder="Contoh: RAK-A1"
                  className="w-full rounded-lg border-slate-800 bg-slate-950 text-slate-100 p-2.5 border uppercase font-mono focus:border-sky-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingGrid(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold shadow-lg"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingStock && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-sky-400" />
                Edit Stok Steril: {editingStock.instrumentName}
              </h3>
              <button 
                onClick={() => setEditingStock(null)}
                className="text-slate-400 hover:text-slate-100 p-1 rounded-lg bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">Nomor Lot</label>
                <input 
                  type="text" 
                  value={editingStock.lotNumber} 
                  disabled 
                  className="w-full rounded-lg border-slate-800 bg-slate-950/60 text-slate-500 p-2.5 border font-mono cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Lokasi Rak / Grid</label>
                <input 
                  type="text" 
                  value={editShelfLocation} 
                  onChange={(e) => setEditShelfLocation(e.target.value)} 
                  required
                  placeholder="Contoh: RAK-A1"
                  className="w-full rounded-lg border-slate-800 bg-slate-950 text-slate-100 p-2.5 border uppercase font-mono focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Asal Instalasi</label>
                <input 
                  type="text" 
                  value={editOriginUnit} 
                  onChange={(e) => setEditOriginUnit(e.target.value)} 
                  required
                  className="w-full rounded-lg border-slate-800 bg-slate-950 text-slate-100 p-2.5 border focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Status</label>
                <select 
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full rounded-lg border-slate-800 bg-slate-950 text-slate-100 p-2.5 border font-semibold focus:border-sky-500"
                >
                  <option value="sterile">Steril Aman</option>
                  <option value="expired">Expired / Kedaluwarsa</option>
                  <option value="recalled">Recalled</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingStock(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold shadow-lg"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
    </>
  );
}
