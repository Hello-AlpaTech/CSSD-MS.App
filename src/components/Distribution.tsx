import React, { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { 
  collection, 
  onSnapshot, 
  updateDoc, 
  deleteDoc,
  doc, 
  addDoc, 
  serverTimestamp,
  getDocs,
  query,
  where,
  setDoc,
  getDoc
} from "firebase/firestore";
import { 
  ClipboardList, 
  CheckCircle, 
  AlertTriangle, 
  User, 
  Layers, 
  Clock, 
  Handshake, 
  Search,
  Plus,
  ArrowRight,
  QrCode,
  FileText,
  Printer,
  Trash2,
  X
} from "lucide-react";
import { DistributionRecord, SterileStock, InstrumentCatalog, WorkflowLog, UserProfile } from "../types";
import ScannerComponent from "./ScannerComponent";
import InlineScanner from "./InlineScanner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";
import { printViaBluetooth } from "../lib/bluetooth";
import { QRCodeSVG } from "qrcode.react";
import { DEMO_KEYS, getDemoData, saveDemoData, INITIAL_DEMO_WORKFLOW_LOGS, INITIAL_DEMO_ACTIVITY_LOGS, INITIAL_DEMO_STERILE_STOCK, INITIAL_DEMO_UNIT_STOCK } from "../lib/demoStore";
import { triggerActionConfirm } from "../lib/actionToast";

import { ConfirmDialog } from "./ConfirmDialog";
const Barcode1DSVG = ({ value }: { value: string }) => {
  const bars = React.useMemo(() => {
    let result = [];
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash += value.charCodeAt(i) * (i + 1);
    }
    let x = 8;
    for (let i = 0; i < 44; i++) {
      const w = ((hash + i * 5) % 3) + 1;
      const isBlack = (i + hash) % 3 !== 0;
      if (isBlack) {
        result.push(<rect key={i} x={x} y="0" width={w} height="32" fill="#000000" />);
      }
      x += w + (((i * 2 + hash) % 2) + 1);
    }
    x += 8;
    return { result, totalWidth: x };
  }, [value]);

  return (
    <div className="flex flex-col items-center my-1">
      <svg width={bars.totalWidth} height="32" viewBox={`0 0 ${bars.totalWidth} 32`} className="max-w-full h-8">
        <rect width="100%" height="100%" fill="#ffffff" />
        {bars.result}
      </svg>
    </div>
  );
};

import { executeDistributionTransaction } from "../lib/distributionTransaction";

interface DistributionProps {
  currentUsername: string;
  isDemoMode?: boolean;
  userProfile?: UserProfile | null;
}

export default function Distribution({ currentUsername, isDemoMode = false, userProfile = null }: DistributionProps) {
  const [activeTab, setActiveTab] = useState<"distribution" | "tracking">("distribution");
  const [confirmState, setConfirmState] = useState({ isOpen: false, title: "", message: "", action: null as (() => void) | null });
  const closeConfirm = () => setConfirmState(prev => ({ ...prev, isOpen: false }));
  
  const [distributions, setDistributions] = useState<DistributionRecord[]>([]);
  const [sterileStock, setSterileStock] = useState<SterileStock[]>([]);
  const [catalog, setCatalog] = useState<InstrumentCatalog[]>([]);
  const [logs, setLogs] = useState<WorkflowLog[]>([]);

  // Direct dispatch states
  const [targetUnit, setTargetUnit] = useState<string>("IGD");
  const [originFilter, setOriginFilter] = useState<string>("ALL");
  const [stockSearch, setStockSearch] = useState<string>("");
  const [recipientName, setRecipientName] = useState<string>("");
  const [dispatchNotes, setDispatchNotes] = useState<string>("");
  const [distributionIdempotencyKey, setDistributionIdempotencyKey] = useState<string>("");
  
  // Selection
  const [selectedInstId, setSelectedInstId] = useState<string>("");
  const [selectedLotNumber, setSelectedLotNumber] = useState<string>("");
  const [dispatchList, setDispatchList] = useState<{ instrumentId: string, lotNumber: string, name: string }[]>([]);

  // Master RSUD Benda Units
  const [masterUnits, setMasterUnits] = useState<string[]>([
    "IGD",
    "IBS/OK",
    "HCU",
    "R Yudistira",
    "ICU",
    "PICU",
    "NICU",
    "Anjani",
    "Kebidanan (VK)",
    "R Srikandi",
    "R Arjuna",
    "Poli Bedah",
    "Poli Gigi",
    "Poli Obgyn",
    "Poli Anak",
    "Poli Bima",
    "Poli Antasena"
  ]);

  // Combined stock containing sterile_stock
  const combinedAvailableStock = React.useMemo(() => {
    const map = new Map<string, {
      lotNumber: string;
      instrumentId: string;
      instrumentName: string;
      originUnit: string;
      shelfLocation: string;
      expiresAt?: any;
      sterilizedAt?: any;
      cycleNumber?: string | number;
      wrapType?: string;
      qty: number;
      source: string;
    }>();

    // 1. Items from sterile_stock collection
    sterileStock.forEach(s => {
      if (s.lotNumber) {
        map.set(s.lotNumber, {
          lotNumber: s.lotNumber,
          instrumentId: s.instrumentId || 'INST-GENERIC',
          instrumentName: s.instrumentName || 'Instrumen Steril',
          originUnit: s.originUnit || s.requestingUnit || 'Steril Storage',
          shelfLocation: s.shelfLocation || 'Rak Steril',
          expiresAt: s.expiresAt,
          sterilizedAt: s.sterilizedAt,
          cycleNumber: s.cycleNumber || '578',
          wrapType: (s as any).wrapType || 'sterilization_pouch',
          qty: s.qty || 1,
          source: 'sterile_stock'
        });
      }
    });

    return Array.from(map.values());
  }, [sterileStock]);

  // Filtered stock based on Origin filter & Search
  const filteredStockList = React.useMemo(() => {
    return combinedAvailableStock.filter(item => {
      const matchOrigin = originFilter === "ALL" || item.originUnit.toLowerCase().includes(originFilter.toLowerCase()) || originFilter.toLowerCase().includes(item.originUnit.toLowerCase());
      const matchSearch = !stockSearch || 
        item.instrumentName.toLowerCase().includes(stockSearch.toLowerCase()) || 
        item.lotNumber.toLowerCase().includes(stockSearch.toLowerCase()) ||
        item.originUnit.toLowerCase().includes(stockSearch.toLowerCase());
      return matchOrigin && matchSearch;
    });
  }, [combinedAvailableStock, originFilter, stockSearch]);

  // QR Scanning
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannedResult, setScannedResult] = useState<string | null>(null);
  const [trackingData, setTrackingData] = useState<WorkflowLog | null>(null);

  // Dispatch scanner states
  const [isDispatchScannerOpen, setIsDispatchScannerOpen] = useState(false);
  const [dispatchScanInput, setDispatchScanInput] = useState("");

  // 57mm Thermal Print Receipt Modal State
  const [selectedPrintRecord, setSelectedPrintRecord] = useState<DistributionRecord | null>(null);

  useEffect(() => {
    // 1. Listen to clinical requests (now acting as distribution records, fulfilled only)
    const unsubReq = onSnapshot(collection(db, "distribution_logs"), (snap) => {
      const list: DistributionRecord[] = [];
      snap.forEach((doc) => {
        const data = doc.data() as DistributionRecord;
        if (data.status === 'fulfilled') {
          list.push({ id: doc.id, ...data });
        }
      });
      list.sort((a, b) => b.fulfilledAt?.toDate().getTime() - a.fulfilledAt?.toDate().getTime());
      setDistributions(list);
    });

    // 2. Listen to available sterile stock
    const unsubStock = onSnapshot(
      collection(db, "sterile_stock"),
      (snap) => {
        const list: SterileStock[] = [];
        const now = new Date();
        snap.forEach((docSnap) => {
          const item = docSnap.data() as SterileStock;
          const expDate = item.expiresAt?.toDate();
          let status = item.status;
          if (status === "sterile" && expDate) {
            const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
            if (diffDays <= 0) {
              status = "expired";
            }
          }
          // Only list items that are actually sterile and ready
          if (status === "sterile") {
            list.push({ id: docSnap.id, ...item });
          }
        });
        setSterileStock(list);
      }
    );

    // 3. Listen to catalog
    const unsubCat = onSnapshot(collection(db, "instruments"), (snap) => {
      const list: InstrumentCatalog[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as InstrumentCatalog);
      });
      setCatalog(list);
      if (list.length > 0) setSelectedInstId(list[0].id);
    });

    // 4. Listen to logs for tracking
    const unsubLogs = onSnapshot(collection(db, "workflow_logs"), (snap) => {
      const list: WorkflowLog[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as WorkflowLog);
      });
      setLogs(list);
    });

    // 5. Listen to master_units
    const unsubUnits = onSnapshot(collection(db, "master_units"), (snap) => {
      const list: string[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.name) list.push(data.name);
      });
      if (list.length > 0) {
        setMasterUnits(list.sort((a, b) => a.localeCompare(b)));
      }
    });

    return () => {
      unsubReq();
      unsubStock();
      unsubCat();
      unsubLogs();
      unsubUnits();
    };
  }, []);

  const handleDispatchScan = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    // Find matching item in combinedAvailableStock by instrumentId or lotNumber or id
    const availableItem = combinedAvailableStock.find(item => 
      (item.instrumentId === trimmed || item.lotNumber === trimmed || item.id === trimmed) &&
      !dispatchList.some(d => d.lotNumber === item.lotNumber)
    );

    if (availableItem) {
      setDispatchList(prev => [...prev, {
        instrumentId: availableItem.instrumentId || 'INST-GENERIC',
        lotNumber: availableItem.lotNumber,
        name: availableItem.instrumentName
      }]);
      if (dispatchList.length === 0 && availableItem.originUnit && masterUnits.includes(availableItem.originUnit)) {
        setTargetUnit(availableItem.originUnit);
      }
      // alert(`Sukses menambahkan: ${availableItem.instrumentName} (Lot: ${availableItem.lotNumber})`);
    } else {
      const alreadyInList = combinedAvailableStock.some(item => 
        (item.instrumentId === trimmed || item.lotNumber === trimmed || item.id === trimmed) &&
        dispatchList.some(d => d.lotNumber === item.lotNumber)
      );
      if (alreadyInList) {
        alert("Semua item dengan ID/Lot tersebut yang tersedia sudah ditambahkan ke daftar kirim.");
      } else {
        alert("ID Instrumen atau Lot tidak ditemukan di dalam stok steril aktif yang siap didistribusikan.");
      }
    }
    setDispatchScanInput("");
  };



  const handleSearchTracking = (id: string) => {
    setScannedResult(id);
    // Find in workflow logs by instrumentId or lotNumber
    const log = logs.find(l => l.instrumentId === id || l.lotNumber === id);
    if (log) {
      setTrackingData(log);
    } else {
      setTrackingData(null);
      alert("Alat/Lot tidak ditemukan dalam riwayat aktif.");
    }
  };



  const handlePrintDistributionBluetooth = async (req: DistributionRecord) => {
    try {
      let fullReceiptText = "";

      const itemsToPrint = (req.fulfilledLots && req.fulfilledLots.length > 0)
        ? req.fulfilledLots
        : req.requestedItems.map(i => ({
            lotNumber: `LOT-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-548-SP`,
            instrumentId: i.instrumentId,
            qty: i.qty
          }));

      itemsToPrint.forEach((lotInfo: any, idx: number) => {
        const catItem = catalog.find(c => c.id === lotInfo.instrumentId) || catalog.find(c => c.name === req.requestedItems[idx]?.name);
        const wfLog = logs.find(l => l.lotNumber === lotInfo.lotNumber);
        const stockItem = sterileStock.find(s => s.lotNumber === lotInfo.lotNumber);

        const instId = lotInfo.instrumentId || catItem?.id || lotInfo.sku || catItem?.sku || '-';
        const lotNumber = lotInfo.lotNumber;
        const itemName = lotInfo.instrumentName || catItem?.name || req.requestedItems[idx]?.name || '-';
        const requestingUnit = req.requestingUnit || 'IBS/OK';
        
        const rawWrap = lotInfo.wrapType || wfLog?.packaging?.wrapType || 'sterilization_pouch';
        const wrapLabel = WRAP_TYPE_LABELS[rawWrap] || 'Packing Pouch';

        const batchNo = lotInfo.cycleNumber || stockItem?.cycleNumber || wfLog?.sterilization?.cycleNumber || '578';

        const diserahkanDate = req.fulfilledAt?.toDate ? req.fulfilledAt.toDate() : new Date();
        const waktuServah = diserahkanDate.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' + diserahkanDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

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



        const sterilDateObj = parseDateObj(lotInfo.sterilizedAt) || parseDateObj(stockItem?.sterilizedAt) || parseDateObj(wfLog?.sterilization?.completedAt) || parseDateObj(wfLog?.createdAt) || diserahkanDate;
        const tglSteril = sterilDateObj ? sterilDateObj.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';

        let expDateObj = parseDateObj(lotInfo.expiresAt) || parseDateObj(stockItem?.expiresAt) || parseDateObj(wfLog?.storage?.expiresAt) || parseDateObj(wfLog?.expiresAt);
        if (!expDateObj && sterilDateObj) {
          expDateObj = new Date(sterilDateObj.getTime() + 30 * 24 * 3600 * 1000);
        }
        const tglExp = expDateObj ? expDateObj.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';

        const rawSetItems = (lotInfo.setItems && lotInfo.setItems.length > 0) ? lotInfo.setItems : (catItem?.items || []);
        const setItems = rawSetItems.filter((sub: any) => sub.name && sub.name.trim().toLowerCase() !== itemName.trim().toLowerCase());

        const field = (label: string, val: string) => {
          const lbl = label.padEnd(12, ' ').substring(0, 12);
          const maxValLen = 18;
          let v = val || '-';
          if (v.length > maxValLen) {
            v = v.substring(0, maxValLen);
          }
          return `${lbl}: ${v}`;
        };



        let table = "                  JML  PR  PS\n";
        let totalQty = 0;
        if (setItems.length > 0) {
          setItems.forEach((sub: any) => {
            const sName = sub.name.length > 18 ? sub.name.substring(0, 18) : sub.name.padEnd(18, ' ');
            const sQty = String(sub.qty || 1).padStart(3, ' ');
            table += `${sName}${sQty} [  ][  ]\n`;
            totalQty += Number(sub.qty || 1);
          });
        } else {
          const sName = itemName.length > 18 ? itemName.substring(0, 18) : itemName.padEnd(18, ' ');
          table += `${sName}  1 [  ][  ]\n`;
          totalQty = 1;
        }
        table += `JUMLAH      ${String(totalQty).padStart(3, ' ')}`;

        const receipt = [
          `[[QR]]${instId}[[/QR]]`,
          `[[CENTER]]${instId}[[/CENTER]]`,
          `[[CENTER]]TRACKING ALUR[[/CENTER]]`,
          `[[CENTER]]CSSD - RSUD BENDA[[/CENTER]]`,
          `--------------------------------`,
          `BUKTI SERAH`,
          field('Nama Item', itemName),
          field('Instalasi', requestingUnit),
          field('Diserahkan', `${waktuServah}`),
          field('Jenis Packing', wrapLabel),
          field('No Batch', String(batchNo)),
          field('Tgl Steril', `${tglSteril}`),
          field('Tgl Exp', tglExp),
          `--------------------------------`,
          `RINCIAN ISI SET:`,
          table,
          `--------------------------------`,
          field('Petugas CSSD', currentUsername),
          `--------------------------------`,
          `NOTE`,
          `- Indikator label tempel di struk ini`,
          `  jika alat bekas pakai.`,
          `- Struk ini jangan sampai hilang.`,
          `--------------------------------`,
          `   TTD PENYERAHAN DISTRIBUSI`,
          `Petugas Steril     Petugas Ruang`,
          ``,
          ``,
          ``,
          ``,
          ``,
          ``,
          `(           )     (           )`,
          `--------------------------------`,
          `    PENYERAHAN DEKONTAMINASI`,
          `Petugas Ruang      Petugas Steril`,
          ``,
          ``,
          ``,
          ``,
          ``,
          ``,
          `(           )     (           )`,
          `--------------------------------`,
          `[[CENTER]]*Terima kasih.*[[/CENTER]]`,
        ].join('\n') + '\n\n';

        fullReceiptText += receipt;
      });

      const printed = await printViaBluetooth(fullReceiptText);
      if (printed) {
        alert(`Struk Bukti Serah Distribusi #${req.id} berhasil dicetak ke Bluetooth printer!`);
      }
    } catch (err) {
      console.error(err);
    }
  };



  const generateReceiptPDF = async (req: DistributionRecord) => {
    const element = document.getElementById("thermal-receipt-57mm");
    if (!element) {
      alert("Elemen struk thermal tidak ditemukan.");
      return;
    }

    try {
      const canvas = await html2canvas(element, {
        scale: 3, // High resolution for clear thermal text
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        onclone: (clonedDoc) => {
          // Remove link tags with external stylesheets that may contain oklch
          clonedDoc.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
            link.remove();
          });

          // Replace oklch in all <style> tags
          clonedDoc.querySelectorAll("style").forEach((s) => {
            if (s.textContent) {
              s.textContent = s.textContent.replace(/oklch\([^\)]*\)/gi, "#000000");
            }
          });

          // Inject clean thermal styles to guarantee crisp B&W rendering without Tailwind oklch rules
          const styleEl = clonedDoc.createElement("style");
          styleEl.textContent = `
            #thermal-receipt-57mm {
              background-color: #ffffff !important;
              color: #000000 !important;
              font-family: monospace, Courier, monospace !important;
              width: 280px !important;
              padding: 8px !important;
              margin: 0 !important;
            }
            #thermal-receipt-57mm * {
              color: #000000 !important;
              border-color: #000000 !important;
              box-shadow: none !important;
              text-shadow: none !important;
            }
          `;
          clonedDoc.head.appendChild(styleEl);

          // Sanitize inline styles on all cloned elements
          clonedDoc.querySelectorAll("*").forEach((node) => {
            const htmlNode = node as HTMLElement;
            if (htmlNode.style && htmlNode.style.cssText && htmlNode.style.cssText.includes("oklch")) {
              htmlNode.style.cssText = htmlNode.style.cssText.replace(/oklch\([^\)]*\)/gi, "#000000");
            }
          });
        },
      });

      const imgData = canvas.toDataURL("image/png");
      const pdfWidth = 58; // 58mm thermal paper width
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [pdfWidth, pdfHeight],
      });

      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Struk_Distribusi_${req.id || '57mm'}.pdf`);
    } catch (err: any) {
      console.error("Gagal cetak/download PDF:", err);
      alert("Terjadi kesalahan saat mengunduh PDF struk: " + (err?.message || ""));
    }
  };



 const STERILIZATION_METHOD_LABELS: Record<string, string> = {
    steam_autoclave: 'Autoclave (Suhu Tinggi)',
    dry_heat: 'Dry Heat (Panas Kering)',
    plasma_h2o2: 'Plasma H2O2',
    ethylene_oxide: 'Ethylene Oxide (EtO)',
  };



  const WRAP_TYPE_LABELS: Record<string, string> = {
    crepe_paper: 'Crepe Paper',
    sterilization_pouch: 'Packing Pouch',
    linen: 'Linen',
    rigid_container: 'Rigid Container',
  };




  const generateReport = () => {
    const pdf = new jsPDF();
    pdf.setFontSize(16);
    pdf.text("Laporan Distribusi CSSD", 14, 20);
    pdf.setFontSize(10);
    pdf.text(`Tanggal Cetak: ${new Date().toLocaleString()}`, 14, 28);
    
    const tableData = distributions.map(r => [
      r.id,
      r.requestingUnit,
      r.recipientName,
      r.fulfilledAt?.toDate().toLocaleDateString() || "-",
      r.fulfilledLots?.map(l => l.lotNumber).join(", ") || "-"
    ]);

    autoTable(pdf, {
      startY: 35,
      head: [['ID Dis', 'Tujuan', 'Penerima', 'Tanggal', 'Lot Number']],
      body: tableData,
    });

    pdf.save("Laporan_Distribusi_CSSD.pdf");
  };



  const handleAddStockItemToList = (stockItem: { lotNumber: string; instrumentId: string; instrumentName: string; originUnit?: string }) => {
    if (dispatchList.find(d => d.lotNumber === stockItem.lotNumber)) {
      alert("Lot/Alat ini sudah ada di daftar kirim.");
      return;
    }
    setDispatchList(prev => [...prev, {
      instrumentId: stockItem.instrumentId || 'INST-GENERIC',
      lotNumber: stockItem.lotNumber,
      name: stockItem.instrumentName
    }]);
    if (dispatchList.length === 0 && stockItem.originUnit && masterUnits.includes(stockItem.originUnit)) {
      setTargetUnit(stockItem.originUnit);
    }
  };



  const handleAddToList = () => {
    if (!selectedLotNumber) {
      alert("Harap pilih lot steril terlebih dahulu.");
      return;
    }
    
    if (dispatchList.find(d => d.lotNumber === selectedLotNumber)) {
      alert("Lot ini sudah ditambahkan ke daftar.");
      return;
    }

    const stockItem = combinedAvailableStock.find(s => s.lotNumber === selectedLotNumber);
    const catItem = catalog.find(i => i.id === selectedInstId || i.id === stockItem?.instrumentId);

    const instName = stockItem?.instrumentName || catItem?.name || 'Instrumen Steril';
    const instId = stockItem?.instrumentId || catItem?.id || selectedInstId || 'INST-GENERIC';

    setDispatchList(prev => [...prev, { instrumentId: instId, lotNumber: selectedLotNumber, name: instName }]);
    if (dispatchList.length === 0 && stockItem?.originUnit && masterUnits.includes(stockItem.originUnit)) {
      setTargetUnit(stockItem.originUnit);
    }
    setSelectedLotNumber("");
  };



  const handleRemoveFromList = (lotNumber: string) => {
    setDispatchList(dispatchList.filter(d => d.lotNumber !== lotNumber));
  };



  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientName || dispatchList.length === 0) {
      alert("Harap isi penerima dan tambahkan setidaknya 1 lot alat.");
      return;
    }

    try {
      const activeKey = distributionIdempotencyKey || `DIS-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      if (!distributionIdempotencyKey) setDistributionIdempotencyKey(activeKey);
      const reqId = activeKey;

      // 🔒 ATOMIC TRANSACTION & SSoT VALIDATION (Section C & M)
      await executeDistributionTransaction({
        transactionId: reqId,
        targetUnit,
        recipientName,
        dispatchNotes: dispatchNotes.trim(),
        dispatchList,
        currentUsername,
        userProfile: userProfile || undefined,
        isDemoMode
      });

      // Format items
      const requestedItemsMap = new Map<string, { instrumentId: string, name: string, qty: number, fulfilledQty: number }>();
      const fulfilledLotsList: any[] = [];

      for (const dispatchItem of dispatchList) {
        if (!requestedItemsMap.has(dispatchItem.instrumentId)) {
          requestedItemsMap.set(dispatchItem.instrumentId, {
            instrumentId: dispatchItem.instrumentId,
            name: dispatchItem.name,
            qty: 0,
            fulfilledQty: 0
          });
        }
        
        const mapItem = requestedItemsMap.get(dispatchItem.instrumentId)!;
        mapItem.qty += 1;
        mapItem.fulfilledQty += 1;

        const stockItem = combinedAvailableStock.find(s => s.lotNumber === dispatchItem.lotNumber);
        const catItem = catalog.find(c => c.id === dispatchItem.instrumentId || c.name === dispatchItem.name);
        const wfLog = logs.find(l => l.lotNumber === dispatchItem.lotNumber || l.idTerima === dispatchItem.lotNumber || l.id === dispatchItem.lotNumber);

        fulfilledLotsList.push({
          lotNumber: dispatchItem.lotNumber,
          instrumentId: dispatchItem.instrumentId,
          qty: 1,
          sku: catItem?.sku || stockItem?.instrumentId || dispatchItem.instrumentId || 'SKU-MED-DEN-004',
          instrumentName: catItem?.name || stockItem?.instrumentName || dispatchItem.name,
          wrapType: stockItem?.wrapType || wfLog?.packaging?.wrapType || 'sterilization_pouch',
          cycleNumber: stockItem?.cycleNumber || wfLog?.sterilization?.cycleNumber || '578',
          sterilizedAt: stockItem?.sterilizedAt || wfLog?.sterilization?.completedAt || null,
          expiresAt: stockItem?.expiresAt || wfLog?.storage?.expiresAt || null,
          setItems: catItem?.items || []
        } as any);
      }

      const requestedItems = Array.from(requestedItemsMap.values());

      const newRecord: Omit<DistributionRecord, 'id'> = {
        requestingUnit: targetUnit,
        requestedItems,
        status: "fulfilled",
        createdAt: serverTimestamp(),
        fulfilledAt: serverTimestamp(),
        fulfilledLots: fulfilledLotsList,
        recipientName: recipientName,
        notes: dispatchNotes.trim()
      };



      await addDoc(collection(db, "activity_logs"), {
        timestamp: serverTimestamp(),
        instrumentName: fulfilledLotsList.map((l: any) => l.instrumentName).join(', ') || 'Instrumen Steril',
        installation: targetUnit,
        qty: fulfilledLotsList.reduce((acc: number, cur: any) => acc + (cur.qty || 1), 0),
        type: 'Set',
        status: 'Distribusi',
        operator: currentUsername
      });

      // Process stock reduction & workflow updates for each lot
      for (const item of dispatchList) {
        const selectedLotNum = item.lotNumber;
        
        // 1. Mark sterile stock item as distributed in database
        const q = query(collection(db, "sterile_stock"), where("lotNumber", "==", selectedLotNum));
        const snap = await getDocs(q);
        if (!snap.empty) {
          await updateDoc(doc(db, "sterile_stock", snap.docs[0].id), {
            status: "distributed"
          });
          
          // 🔒 HOTFIX LOCKED RULE: Update Live State
          const instrumentId = item.id || item.lotNumber || snap.docs[0].data().instrumentId || snap.docs[0].data().lotNumber;
          if (instrumentId) {
            const lsRef = doc(db, "instrument_live_state", instrumentId);
            setDoc(lsRef, {
              statusAlur: "DIDISTRIBUSIKAN",
              currentState: "DIDISTRIBUSIKAN",
              kondisi: "NORMAL",
              currentLocation: targetUnit,
              currentHolder: targetUnit,
              updatedAt: new Date().toISOString()
            }, { merge: true }).catch(() => {});
            
            const instRef = doc(db, "instruments", instrumentId);
            updateDoc(instRef, {
              currentState: "DISTRIBUSI",
              currentLocation: targetUnit,
              updatedAt: serverTimestamp()
            }).catch(() => {});

            const auditRef = doc(collection(db, "audit_logs"));
            setDoc(auditRef, {
              action: "DISTRIBUTE",
              instrumentId: instrumentId,
              details: `Didistribusikan ke ${targetUnit}`,
              timestamp: new Date().toISOString(),
              user: currentUsername || "Admin"
            }).catch(() => {});
          }
        }

        // 2. Update workflow_logs
        const qWf = query(collection(db, "workflow_logs"), where("lotNumber", "==", selectedLotNum));
        const snapWf = await getDocs(qWf);
        if (!snapWf.empty) {
          const wfDoc = snapWf.docs[0];
          const originalWf = wfDoc.data();
          const updatedHistory = [
            ...(originalWf.history || []),
            {
              stage: "distributed" as const,
              timestamp: new Date(),
              operatorName: currentUsername,
              notes: `Distribusi ke unit ${targetUnit} diterima oleh ${recipientName}`
            }
          ];
          await updateDoc(doc(db, "workflow_logs", wfDoc.id), {
            currentStage: "distributed",
            distribution: {
              distributedAt: serverTimestamp(),
              distributedBy: currentUsername,
              recipientUnit: targetUnit,
              recipientName,
              requestId: reqId,
              notes: dispatchNotes.trim()
            },
            history: updatedHistory,
            updatedAt: serverTimestamp()
          });
        } else {
          // Check by idTerima
          const qWf2 = query(collection(db, "workflow_logs"), where("idTerima", "==", selectedLotNum));
          const snapWf2 = await getDocs(qWf2);
          if (!snapWf2.empty) {
            const wfDoc = snapWf2.docs[0];
            await updateDoc(doc(db, "workflow_logs", wfDoc.id), {
              currentStage: "distributed",
              updatedAt: serverTimestamp()
            });
          }
        }
      }

      // Add to distribution_logs
      await addDoc(collection(db, "distribution_logs"), newRecord);

      // Increase Unit Stock for the recipient unit
      if (isDemoMode) {
        const currentUnitStock = getDemoData<any>(DEMO_KEYS.UNIT_STOCK, INITIAL_DEMO_UNIT_STOCK);
        fulfilledLotsList.forEach((lot: any) => {
          const existingIdx = currentUnitStock.findIndex(s => s.lotNumber === lot.lotNumber && s.unit === targetUnit);
          if (existingIdx > -1) {
            currentUnitStock[existingIdx].qty += Number(lot.qty || 1);
            currentUnitStock[existingIdx].lastDistributedAtStr = new Date().toISOString();
          } else {
            currentUnitStock.push({
              id: `demo-unit-stock-${Date.now()}-${Math.random().toString().slice(-4)}`,
              unit: targetUnit,
              instrumentId: lot.instrumentId,
              instrumentName: lot.instrumentName,
              qty: Number(lot.qty || 1),
              type: lot.setItems && lot.setItems.length > 0 ? "set" : "single",
              sterilizedAtStr: lot.sterilizedAt ? (lot.sterilizedAt.toDate ? lot.sterilizedAt.toDate().toISOString() : new Date(lot.sterilizedAt).toISOString()) : new Date().toISOString(),
              expiresAtStr: lot.expiresAt ? (lot.expiresAt.toDate ? lot.expiresAt.toDate().toISOString() : new Date(lot.expiresAt).toISOString()) : null,
              wrapType: lot.wrapType || "Pouch Steril",
              lastDistributedAtStr: new Date().toISOString(),
              lotNumber: lot.lotNumber
            });
          }
        });
        saveDemoData(DEMO_KEYS.UNIT_STOCK, currentUnitStock);
      } else {
        for (const lot of fulfilledLotsList) {
          const docId = `${targetUnit.replace(/[\/\s\\]+/g, "_")}_${lot.lotNumber}`;
          const stockRef = doc(db, "unit_stock", docId);
          const stockSnap = await getDoc(stockRef);
          if (stockSnap.exists()) {
            const currentQty = stockSnap.data().qty || 0;
            await updateDoc(stockRef, {
              qty: currentQty + Number(lot.qty || 1),
              lastDistributedAt: serverTimestamp()
            });
          } else {
            await setDoc(stockRef, {
              unit: targetUnit,
              instrumentId: lot.instrumentId,
              instrumentName: lot.instrumentName,
              qty: Number(lot.qty || 1),
              type: lot.setItems && lot.setItems.length > 0 ? "set" : "single",
              sterilizedAt: lot.sterilizedAt || serverTimestamp(),
              expiresAt: lot.expiresAt || null,
              wrapType: lot.wrapType || "Pouch Steril",
              lastDistributedAt: serverTimestamp(),
              lotNumber: lot.lotNumber
            });
          }
        }
      }

      const createdRecord: DistributionRecord = {
        id: reqId,
        ...newRecord
      };



      setDispatchList([]);
      setRecipientName("");
      setDispatchNotes("");
      setDistributionIdempotencyKey("");

      triggerActionConfirm({
        title: "Distribusi Berhasil Dikonfirmasi!",
        message: `Instrumen steril berhasil diserahterimakan ke unit ${targetUnit} (${recipientName}).`
      });
      setSelectedPrintRecord(createdRecord);
      alert("Alat berhasil didistribusikan! Struk serah terima (57mm) siap dicetak.");
      
    } catch (err) {
      console.error(err);
      alert("Gagal melakukan distribusi.");
    }
  };



  const executeDeleteDistribution = async (req: DistributionRecord) => {
    if (false) {
      return;
    }
    try {
      if (req.fulfilledLots && req.fulfilledLots.length > 0) {
        for (const lot of req.fulfilledLots) {
          // Revert sterile_stock status to sterile
          const qStock = query(collection(db, "sterile_stock"), where("lotNumber", "==", lot.lotNumber));
          const snapStock = await getDocs(qStock);
          if (!snapStock.empty) {
            await updateDoc(doc(db, "sterile_stock", snapStock.docs[0].id), {
              status: "sterile"
            });
          }
          
          // Revert workflow_logs currentStage to storage
          const qWf = query(collection(db, "workflow_logs"), where("lotNumber", "==", lot.lotNumber));
          const snapWf = await getDocs(qWf);
          if (!snapWf.empty) {
            const wfDoc = snapWf.docs[0];
            await updateDoc(doc(db, "workflow_logs", wfDoc.id), {
              currentStage: "storage"
            });
          } else {
             // check idTerima
             const qWf2 = query(collection(db, "workflow_logs"), where("idTerima", "==", lot.lotNumber));
             const snapWf2 = await getDocs(qWf2);
             if (!snapWf2.empty) {
               await updateDoc(doc(db, "workflow_logs", snapWf2.docs[0].id), {
                 currentStage: "storage"
               });
             }
          }
        }
      }

      await deleteDoc(doc(db, "distribution_logs", req.id));
      alert("Riwayat distribusi berhasil dihapus dan stok alat telah dikembalikan.");
    } catch (err) {
      console.error(err);
      alert("Gagal menghapus riwayat distribusi.");
    }
  };



  const handleDeleteDistribution = (req: DistributionRecord) => {
    setConfirmState({
      isOpen: true,
      title: "Hapus Riwayat Distribusi",
      message: `Yakin ingin menghapus riwayat distribusi ke unit "${req.requestingUnit}" (ID: ${req.id})? Alat akan dikembalikan ke stok steril siap distribusi.`,
      action: () => executeDeleteDistribution(req)
    });
  };

  return (
    <>
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={() => confirmState.action?.()}
        onCancel={closeConfirm}
      />
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
            <Handshake className="w-6 h-6 text-teal-400" />
            Distribusi &amp; Serah Terima CSSD
          </h2>
          <p className="text-sm text-slate-400 mt-1">Penyerahan alat medis steril &amp; inventaris kepada petugas instalasi peminta (IGD, OK, Poli, dll).</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-slate-900 rounded-lg max-w-sm mb-6">
        <button
          onClick={() => setActiveTab('distribution')}
          className={`flex-1 py-2 text-xs font-bold rounded-md transition ${activeTab === 'distribution' ? 'bg-indigo-600 text-slate-100 shadow' : 'text-slate-400 hover:text-slate-200'}`}
        >
          Distribusi Baru
        </button>
        <button
          onClick={() => setActiveTab('tracking')}
          className={`flex-1 py-2 text-xs font-bold rounded-md transition ${activeTab === 'tracking' ? 'bg-indigo-600 text-slate-100 shadow' : 'text-slate-400 hover:text-slate-200'}`}
        >
          Pelacakan & Laporan
        </button>
      </div>

      {activeTab === 'distribution' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Form Distribusi (Col 5) */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg h-fit">
            <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-400" />
              Form Distribusi Alat Steril
            </h3>
            
            <form onSubmit={handleDispatch} className="space-y-4 text-xs">
              
              <div className="space-y-3 p-3 border border-slate-800 rounded-lg bg-slate-950/50">
                <span className="font-bold text-slate-300 block mb-2">1. Informasi Penerima</span>
                <div>
                  <label className="block font-medium text-slate-400 mb-1">Unit / Ruangan Tujuan</label>
                  <select
                    value={targetUnit}
                    onChange={(e) => setTargetUnit(e.target.value)}
                    className="w-full text-xs rounded-lg border-slate-800 bg-slate-950 text-slate-100 p-2 border focus:border-indigo-500 font-medium"
                  >
                    {masterUnits.map((u, i) => (
                      <option key={i} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-400 mb-1">Nama Penerima</label>
                  <input 
                    type="text"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Contoh: Suster Diana, Amd.Kep"
                    className="w-full text-xs rounded-lg border-slate-800 bg-slate-950 text-slate-100 p-2 border focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div className="space-y-3 p-3 border border-slate-800 rounded-lg bg-slate-950/50">
                <span className="font-bold text-slate-300 block mb-2">2. Pilih & Tambahkan Lot / Alat</span>

                {/* Scan section */}
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-2.5 mb-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-400 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                      <QrCode className="w-3.5 h-3.5 text-indigo-400" />
                      Scan QR Alat / ID Instrumen
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsDispatchScannerOpen(!isDispatchScannerOpen)}
                      className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold uppercase rounded hover:bg-indigo-500/20 transition-colors flex items-center gap-1"
                    >
                      <QrCode className="w-3 h-3" />
                      {isDispatchScannerOpen ? 'Tutup Scanner' : 'Kamera'}
                    </button>
                  </div>

                  {isDispatchScannerOpen && (
                    <div className="bg-slate-950 p-1 rounded-lg border border-slate-800 overflow-hidden relative" style={{ height: "200px" }}>
                      <InlineScanner 
                        isScanning={isDispatchScannerOpen} 
                        onScan={(text) => {
                          handleDispatchScan(text);
                          setIsDispatchScannerOpen(false);
                        }} 
                      />
                      <button 
                        type="button"
                        onClick={() => setIsDispatchScannerOpen(false)} 
                        className="absolute bottom-1 right-1 z-10 bg-slate-850 text-slate-300 px-2 py-1 rounded text-[9px] font-bold hover:bg-slate-700 transition"
                      >
                        Tutup
                      </button>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={dispatchScanInput}
                      onChange={(e) => setDispatchScanInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleDispatchScan(dispatchScanInput);
                        }
                      }}
                      placeholder="Scan atau ketik ID/Lot disini..."
                      className="flex-1 text-xs rounded-lg border-slate-800 bg-slate-900 text-slate-100 p-2 border focus:border-indigo-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleDispatchScan(dispatchScanInput)}
                      className="px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold"
                    >
                      Cari
                    </button>
                  </div>
                </div>

    <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-medium text-slate-400 mb-1">Filter Asal Ruangan</label>
                      <select
                        value={originFilter}
                        onChange={(e) => setOriginFilter(e.target.value)}
                        className="w-full text-xs rounded-lg border-slate-800 bg-slate-950 text-slate-100 p-2 border"
                      >
                        <option value="ALL">-- Semua Ruangan --</option>
                        {masterUnits.map((u, i) => (
                          <option key={i} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-medium text-slate-400 mb-1">Cari Lot / Nama</label>
                      <input
                        type="text"
                        value={stockSearch}
                        onChange={(e) => setStockSearch(e.target.value)}
                        placeholder="Contoh: IGD, Hecting, LOT..."
                        className="w-full text-xs rounded-lg border-slate-800 bg-slate-950 text-slate-100 p-2 border"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-400 mb-1">Pilih Lot / Stok Tersedia ({filteredStockList.length})</label>
                    <select
                      value={selectedLotNumber}
                      onChange={(e) => setSelectedLotNumber(e.target.value)}
                      className="w-full text-xs rounded-lg border-slate-800 bg-slate-950 text-slate-100 p-2 border focus:border-indigo-500 font-mono"
                    >
                      <option value="">-- Pilih Nomor Lot Steril / Alat --</option>
                      {(Object.entries(
                        filteredStockList.reduce<Record<string, typeof filteredStockList>>((acc, stock) => {
                          const unit = stock.originUnit || 'Belum Ditentukan';
                          if (!acc[unit]) acc[unit] = [];
                          acc[unit].push(stock);
                          return acc;
                        }, {})
                      ) as [string, typeof filteredStockList][]).map(([unitGroup, items]) => (
                        <optgroup key={unitGroup} label={`Asal Instalasi: ${unitGroup}`}>
                          {items.map(stock => (
                            <option key={stock.lotNumber} value={stock.lotNumber}>
                              {stock.instrumentName} - {stock.lotNumber} ({stock.shelfLocation || 'Rak Steril'})
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <button 
                    type="button" 
                    onClick={handleAddToList}
                    className="w-full mt-1 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 font-bold rounded-lg transition flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" /> Tambahkan ke Daftar Kirim
                  </button>
                </div>

                {/* List of items to dispatch */}
                {dispatchList.length > 0 && (
                  <div className="mt-4 space-y-2 pt-2 border-t border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Daftar Kirim ({dispatchList.length} Item):</span>
                    {dispatchList.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-slate-900 border border-slate-800 p-2 rounded-lg">
                        <div>
                          <div className="font-bold text-slate-200">{item.name}</div>
                          <div className="font-mono text-[10px] text-indigo-400">Lot: {item.lotNumber}</div>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => handleRemoveFromList(item.lotNumber)}
                          className="text-rose-400 hover:text-rose-300 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-medium text-slate-400 mb-1">Catatan Tambahan (Opsional)</label>
                <textarea 
                  value={dispatchNotes}
                  onChange={(e) => setDispatchNotes(e.target.value)}
                  placeholder="Catatan pengiriman..."
                  className="w-full text-xs rounded-lg border-slate-800 bg-slate-950 text-slate-100 p-2 border h-16 focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-teal-600 hover:bg-teal-500 text-white font-extrabold rounded-lg text-xs transition shadow-md cursor-pointer flex items-center justify-center gap-2"
              >
                <Handshake className="w-4 h-4" /> Serah Terima &amp; Cetak Struk Distribusi
              </button>
            </form>
          </div>

          {/* Right Side: Quick Stock Selector & History (Col 7) */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Panel Stok Steril Siap Distribusi */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    Stok Steril Siap Distribusi ({filteredStockList.length})
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Klik <span className="text-emerald-400 font-bold">+ Tambah</span> pada alat untuk langsung memasukkannya ke daftar distribusi.</p>
                </div>

                {/* Quick Unit Filter Pills */}
                <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
                  {['ALL', ...masterUnits].map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setOriginFilter(u)}
                      className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition whitespace-nowrap ${
                        originFilter === u
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {u === 'ALL' ? 'Semua Ruangan' : u}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid cards stok */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
                {filteredStockList.length === 0 ? (
                  <div className="col-span-full text-center py-8 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl font-mono">
                    Tidak ada stok steril / inventaris yang sesuai filter "{originFilter}".
                  </div>
                ) : (
                  filteredStockList.map((stk) => {
                    const isAdded = dispatchList.some(d => d.lotNumber === stk.lotNumber);
                    const isIGD = stk.originUnit.toLowerCase().includes('igd') || stk.originUnit.toLowerCase().includes('gawat');

                    return (
                      <div 
                        key={stk.lotNumber} 
                        className={`p-3 rounded-lg border transition space-y-2 flex flex-col justify-between ${
                          isAdded 
                            ? 'bg-indigo-950/40 border-indigo-500/40' 
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex justify-between items-start gap-1">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-tight ${
                              isIGD 
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                                : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                            }`}>
                              {stk.originUnit}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono truncate max-w-[100px]">{stk.shelfLocation}</span>
                          </div>

                          <h4 className="font-bold text-slate-200 text-xs line-clamp-1">{stk.instrumentName}</h4>
                          <div className="text-[10px] font-mono text-slate-400">
                            Lot: <span className="text-indigo-400 font-bold">{stk.lotNumber}</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                          <span className="text-[9.5px] text-slate-500">
                            {stk.expiresAt?.toDate ? `Exp: ${stk.expiresAt.toDate().toLocaleDateString("id-ID")}` : 'Tersedia'}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleAddStockItemToList(stk)}
                            disabled={isAdded}
                            className={`px-2.5 py-1 text-[10px] font-bold rounded transition flex items-center gap-1 ${
                              isAdded 
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                                : 'bg-emerald-600 hover:bg-emerald-500 text-slate-950'
                            }`}
                          >
                            {isAdded ? 'Sudah Ditambah' : '+ Tambah'}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Riwayat Distribusi */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-3">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-slate-400" />
                Riwayat Distribusi Terakhir ({distributions.length})
              </h3>

              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
                {distributions.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl font-mono">
                    Belum ada riwayat distribusi.
                  </div>
                ) : (
                  distributions.map((req) => (
                    <div key={req.id} className="p-3 rounded-lg border border-slate-800 bg-slate-950/40 hover:bg-slate-950 flex justify-between items-center text-xs">
                      <div>
                        <h4 className="font-bold text-indigo-400">{req.requestingUnit}</h4>
                        <p className="text-[10px] text-slate-500 font-mono">ID: {req.id} • Penerima: {req.recipientName || '-'} • Tgl: {req.fulfilledAt?.toDate ? req.fulfilledAt.toDate().toLocaleDateString("id-ID") : '-'}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => handleDeleteDistribution(req)} className="p-1.5 rounded bg-slate-800 text-slate-400 hover:text-red-400" title="Hapus Riwayat Distribusi">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handlePrintDistributionBluetooth(req)} className="p-1.5 rounded bg-slate-800 text-slate-400 hover:text-emerald-400" title="Cetak Bluetooth (57mm)">
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setSelectedPrintRecord(req)} className="p-1.5 rounded bg-slate-800 text-slate-400 hover:text-indigo-400" title="Pratinjau Struk (57mm)">
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {activeTab === 'tracking' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
            <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
              <QrCode className="w-4 h-4 text-sky-400" />
              Lacak Instrumen (QR Code)
            </h3>
            
            <div className="mb-6 flex gap-2">
              <button 
                onClick={() => setIsScannerOpen(true)}
                className="flex-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg py-3 text-sm font-bold flex items-center justify-center gap-2 transition"
              >
                <QrCode className="w-5 h-5" /> Mulai Scan Kamera
              </button>
              <div className="flex-1 relative">
                <input 
                  type="text" 
                  placeholder="Atau ketik ID Instrumen/Lot"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-3 pr-10 py-3 text-sm text-slate-200 focus:border-sky-500 h-full"
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSearchTracking(e.currentTarget.value);
                  }}
                />
                <Search className="w-4 h-4 text-slate-500 absolute right-3 top-3.5" />
              </div>
            </div>

            {isScannerOpen && (
              <div className="bg-slate-950 p-4 rounded-xl mb-6 border border-slate-800 overflow-hidden relative" style={{ height: "280px" }}>
                <InlineScanner 
                  isScanning={isScannerOpen} 
                  onScan={(text) => {
                    handleSearchTracking(text);
                    setIsScannerOpen(false);
                  }} 
                />
                <button 
                  onClick={() => setIsScannerOpen(false)} 
                  className="absolute bottom-4 right-4 z-10 bg-slate-800/80 backdrop-blur text-slate-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-700 transition"
                >
                  Tutup Kamera
                </button>
              </div>
            )}

            {scannedResult && !trackingData && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-sm font-bold text-center">
                Data tidak ditemukan untuk ID: {scannedResult}
              </div>
            )}

            {trackingData && (
              <div className="space-y-4">
                <div className="p-4 bg-sky-500/10 border border-sky-500/20 rounded-xl">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-slate-200">{trackingData.instrumentName}</h4>
                      <p className="text-xs text-slate-400 font-mono mt-1">ID: {trackingData.instrumentId}</p>
                    </div>
                    <span className="bg-slate-800 px-2 py-1 rounded text-xs font-bold text-slate-300 uppercase tracking-wide">
                      {trackingData.currentStage}
                    </span>
                  </div>
                </div>

                <div className="border-l-2 border-slate-800 ml-3 pl-4 space-y-4">
                  {trackingData.history?.map((h, i) => (
                    <div key={i} className="relative">
                      <div className="absolute -left-[23px] top-1 w-3 h-3 bg-sky-500 rounded-full ring-4 ring-slate-900" />
                      <div className="text-xs">
                        <span className="font-bold text-slate-300 uppercase">{h.stage}</span>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">{h.timestamp?.toDate().toLocaleString()}</div>
                        <div className="text-slate-400 mt-1">{h.operatorName}</div>
                        {h.notes && <div className="text-[10px] text-slate-400 bg-slate-950 p-2 rounded mt-1 italic">"{h.notes}"</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg h-fit">
            <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-400" />
              Laporan & Analitik (PDF)
            </h3>
            <p className="text-xs text-slate-400 mb-6">Unduh laporan rekapan distribusi harian atau bulanan untuk audit inventaris dan mutu.</p>
            
            <button 
              onClick={generateReport}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition border border-slate-700"
            >
              <FileText className="w-5 h-5 text-emerald-400" /> Generate Laporan PDF
            </button>
          </div>
        </div>
      )}

      {/* Modal Thermal Print 57mm Struk Serah Terima Distribusi */}
      {selectedPrintRecord && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white text-slate-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative font-mono text-xs border border-slate-300">
            <button
              onClick={() => setSelectedPrintRecord(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Thermal Slip Content (Simulated 57mm width matching physical receipt photo) */}
            <div id="thermal-receipt-57mm" className="border border-dashed border-slate-400 p-4 bg-white space-y-3 rounded-lg text-[11px] text-slate-900 shadow-inner font-mono">
              {((selectedPrintRecord.fulfilledLots && selectedPrintRecord.fulfilledLots.length > 0)
                ? selectedPrintRecord.fulfilledLots
                : selectedPrintRecord.requestedItems.map(i => ({
                    lotNumber: `LOT-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-548-SP`,
                    instrumentId: i.instrumentId,
                    qty: i.qty
                  }))
              ).map((lotInfo: any, idx: number) => {
                const catItem = catalog.find(c => c.id === lotInfo.instrumentId) || catalog.find(c => c.name === selectedPrintRecord.requestedItems[idx]?.name);
                const wfLog = logs.find(l => l.lotNumber === lotInfo.lotNumber);
                const stockItem = sterileStock.find(s => s.lotNumber === lotInfo.lotNumber);

                const instId = lotInfo.instrumentId || catItem?.id || lotInfo.sku || catItem?.sku || '-';
                const lotNumber = lotInfo.lotNumber;
                const itemName = lotInfo.instrumentName || catItem?.name || selectedPrintRecord.requestedItems[idx]?.name || 'Set Cabut Gigi';
                const requestingUnit = selectedPrintRecord.requestingUnit || 'Kamar Operasi (OK) Sentral';
                
                const rawWrap = lotInfo.wrapType || wfLog?.packaging?.wrapType || 'sterilization_pouch';
                const wrapTypeLabel = WRAP_TYPE_LABELS[rawWrap] || 'Packing Pouch';

                const noBatch = lotInfo.cycleNumber || stockItem?.cycleNumber || wfLog?.sterilization?.cycleNumber || '578';

                const diserahkanDate = selectedPrintRecord.fulfilledAt?.toDate ? selectedPrintRecord.fulfilledAt.toDate() : new Date();
                const diserahkanStr = diserahkanDate.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' + diserahkanDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

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



                const sterilDateObj = parseDateObj(lotInfo.sterilizedAt) || parseDateObj(stockItem?.sterilizedAt) || parseDateObj(wfLog?.sterilization?.completedAt) || parseDateObj(wfLog?.createdAt) || diserahkanDate;
                const tglSteril = sterilDateObj ? sterilDateObj.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';

                let expDateObj = parseDateObj(lotInfo.expiresAt) || parseDateObj(stockItem?.expiresAt) || parseDateObj(wfLog?.storage?.expiresAt) || parseDateObj(wfLog?.expiresAt);
                if (!expDateObj && sterilDateObj) {
                  expDateObj = new Date(sterilDateObj.getTime() + 30 * 24 * 3600 * 1000);
                }
                const tglExp = expDateObj ? expDateObj.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';

                const rawSetItems = (lotInfo.setItems && lotInfo.setItems.length > 0) ? lotInfo.setItems : (catItem?.items || []);
                const setItems = rawSetItems.filter((sub: any) => sub.name && sub.name.trim().toLowerCase() !== itemName.trim().toLowerCase());

                return (
                  <div key={idx} className="space-y-2 border-b border-dashed border-slate-300 pb-3 last:border-0 last:pb-0">
                    {/* Top: QR Code (SKU - Profil Instrument) */}
                    <div className="text-center">
                      <div className="flex justify-center my-1">
                        <QRCodeSVG value={instId} size={80} />
                      </div>
                      <div className="font-bold text-xs font-mono">{instId}</div>
                      <div className="font-bold text-[11px] uppercase tracking-wider my-1">TRACKING ALUR</div>
                      <div className="text-[10px] font-bold text-slate-700 uppercase mt-0.5">CSSD - RSUD BENDA</div>
                    </div>

                    <div className="border-t border-slate-400 pt-1 text-[10.5px] space-y-0.5">
                      <div className="font-extrabold uppercase text-[11px] mb-1">BUKTI SERAH</div>
                      <div className="grid grid-cols-12">
                        <span className="col-span-4 text-slate-700">Nama Item</span>
                        <span className="col-span-8 font-bold">: {itemName}</span>
                      </div>
                      <div className="grid grid-cols-12">
                        <span className="col-span-4 text-slate-700">Instalasi</span>
                        <span className="col-span-8 font-bold">: {requestingUnit}</span>
                      </div>
                      <div className="grid grid-cols-12">
                        <span className="col-span-4 text-slate-700">Diserahkan</span>
                        <span className="col-span-8">: {diserahkanStr}</span>
                      </div>
                      <div className="grid grid-cols-12">
                        <span className="col-span-4 text-slate-700">Jenis Packing</span>
                        <span className="col-span-8">: {wrapTypeLabel}</span>
                      </div>
                      <div className="grid grid-cols-12">
                        <span className="col-span-4 text-slate-700">No Batch</span>
                        <span className="col-span-8">: {noBatch}</span>
                      </div>
                      <div className="grid grid-cols-12">
                        <span className="col-span-4 text-slate-700">Tgl Steril</span>
                        <span className="col-span-8">: {tglSteril}</span>
                      </div>
                      <div className="grid grid-cols-12">
                        <span className="col-span-4 text-slate-700">Tgl Exp</span>
                        <span className="col-span-8">: {tglExp}</span>
                      </div>
                    </div>

                    {/* Table Rincian Isi Set */}
                    <div className="border-t border-slate-400 pt-1">
                      <div className="font-bold text-[10px] uppercase mb-1">RINCIAN ISI SET:</div>
                      <div className="grid grid-cols-12 font-bold text-[9.5px] border-b border-slate-300 pb-0.5">
                        <span className="col-span-7"></span>
                        <span className="col-span-2 text-center">JML</span>
                        <span className="col-span-1 text-center">PR</span>
                        <span className="col-span-2 text-center">PS</span>
                      </div>
                      <div className="space-y-0.5 text-[9.5px] pt-1">
                        {setItems.length > 0 ? (
                          setItems.map((sub: any, sIdx: number) => (
                            <div key={sIdx} className="grid grid-cols-12">
                              <span className="col-span-7 truncate">{sub.name}</span>
                              <span className="col-span-2 text-center font-bold">{sub.qty || 1}</span>
                              <span className="col-span-1 text-center text-slate-400">[ ]</span>
                              <span className="col-span-2 text-center text-slate-400">[ ]</span>
                            </div>
                          ))
                        ) : (
                          <div className="grid grid-cols-12">
                            <span className="col-span-7 truncate">{itemName}</span>
                            <span className="col-span-2 text-center font-bold">1</span>
                            <span className="col-span-1 text-center text-slate-400">[ ]</span>
                            <span className="col-span-2 text-center text-slate-400">[ ]</span>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-12 font-bold text-[10px] border-t border-slate-300 pt-0.5 mt-1">
                        <span className="col-span-7">JUMLAH</span>
                        <span className="col-span-2 text-center">{setItems.length > 0 ? setItems.reduce((acc: number, cur: any) => acc + (cur.qty || 1), 0) : 1}</span>
                      </div>
                    </div>

                    {/* Operator Name */}
                    <div className="border-t border-slate-400 pt-1 text-[10px]">
                      <div>Petugas CSSD: <span className="font-bold">{currentUsername}</span></div>
                    </div>

                    {/* Note Box */}
                    <div className="border-t border-slate-300 pt-1 text-[9px] text-slate-700 space-y-0.5">
                      <div className="font-bold">NOTE</div>
                      <div>- Indikator label tempel di struk ini jika alat bekas pakai.</div>
                      <div>- Struk ini jangan sampai hilang.</div>
                      <div>.</div>
                    </div>

                    {/* Signatures */}
                    <div className="border-t border-slate-400 pt-2 text-center text-[9.5px]">
                      <div className="font-bold mb-1">TTD PENYERAHAN DISTRIBUSI</div>
                      <div className="flex justify-between px-2 text-[9px] mb-20">
                        <span>Petugas Steril</span>
                        <span>Petugas Ruang</span>
                      </div>
                      <div className="flex justify-between px-2 text-[9px]">
                        <span>(            )</span>
                        <span>(            )</span>
                      </div>
                    </div>

                    <div className="border-t border-slate-300 pt-2 text-center text-[9.5px]">
                      <div className="font-bold mb-1">PENYERAHAN DEKONTAMINASI</div>
                      <div className="flex justify-between px-2 text-[9px] mb-20">
                        <span>Petugas Ruang</span>
                        <span>Petugas Steril</span>
                      </div>
                      <div className="flex justify-between px-2 text-[9px]">
                        <span>(            )</span>
                        <span>(            )</span>
                      </div>
                    </div>

                    <div className="border-t border-slate-300 pt-1 text-center text-[10px] font-bold italic">
                      *Terima kasih.*
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="mt-4 space-y-2">
              <button
                onClick={() => handlePrintDistributionBluetooth(selectedPrintRecord)}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-md"
              >
                <Printer className="w-4 h-4" /> Cetak Termal Bluetooth (57mm)
              </button>
              <button
                onClick={() => generateReceiptPDF(selectedPrintRecord)}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-md border border-slate-700"
              >
                <FileText className="w-4 h-4 text-sky-400" /> Simpan / Cetak Struk PDF
              </button>
              <button
                onClick={() => setSelectedPrintRecord(null)}
                className="w-full py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition mt-1"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
