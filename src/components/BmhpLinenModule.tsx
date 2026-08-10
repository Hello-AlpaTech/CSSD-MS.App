import React, { useState, useEffect } from "react";
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  doc, 
  setDoc, 
  addDoc, 
  serverTimestamp 
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { 
  UserProfile, 
  BMHPCatalog, 
  BMHPRequest, 
  BMHPDistribution, 
  BMHPReturn, 
  LinenItem, 
  LinenRequest, 
  LinenReturn,
  Unit 
} from "../types";
import { 
  canAccessInstallation, 
  hasPermission, 
  PERMISSIONS,
  requireTenantId 
} from "../lib/permissions";
import { 
  createBMHPRequest, 
  approveOrRejectBMHPRequest, 
  executeBMHPDistribution, 
  executeBMHPReturn, 
  createLinenRequest, 
  executeLinenDistribution, 
  executeLinenReturn 
} from "../lib/bmhpLinenTransaction";
import { 
  Package, 
  Plus, 
  Search, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Truck, 
  RotateCcw, 
  Calendar, 
  Tag, 
  ListFilter, 
  ShieldAlert, 
  Layers, 
  FileText, 
  Info, 
  Sparkles,
  ChevronRight,
  Flame,
  ArrowRightLeft
} from "lucide-react";
import { triggerActionConfirm } from "../lib/actionToast";

interface Props {
  currentUsername: string;
  currentUserProfile?: UserProfile | null;
  isDemoMode?: boolean;
}

type TabType = 
  | "dashboard" 
  | "master_bmhp" 
  | "stok_bmhp" 
  | "permintaan_bmhp" 
  | "distribusi_bmhp" 
  | "pengembalian_bmhp" 
  | "linen_ibs_ok" 
  | "monitoring_expired" 
  | "riwayat";

export default function BmhpLinenModule({ currentUsername, currentUserProfile, isDemoMode = false }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");

  // Realtime Data Collections
  const [bmhpList, setBmhpList] = useState<BMHPCatalog[]>([]);
  const [bmhpRequests, setBmhpRequests] = useState<BMHPRequest[]>([]);
  const [bmhpDistributions, setBmhpDistributions] = useState<BMHPDistribution[]>([]);
  const [bmhpReturns, setBmhpReturns] = useState<BMHPReturn[]>([]);
  
  const [linenList, setLinenList] = useState<LinenItem[]>([]);
  const [linenRequests, setLinenRequests] = useState<LinenRequest[]>([]);
  const [linenReturns, setLinenReturns] = useState<LinenReturn[]>([]);

  const [masterUnits, setMasterUnits] = useState<Unit[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "sterile" | "non_sterile">("all");

  // User Scope & Roles
  const userRole = currentUserProfile?.role?.toUpperCase() || "PETUGAS_CSSD";
  const userScope = currentUserProfile?.scope || "ALL";
  const userTenant = currentUserProfile?.tenantId || "";

  // Modal / Form States
  const [isMasterModalOpen, setIsMasterModalOpen] = useState(false);
  const [masterForm, setMasterForm] = useState<Partial<BMHPCatalog>>({
    id: "",
    name: "",
    category: "non_sterile",
    stockQty: 100,
    minStockAlert: 20,
    unit: "pcs",
    isReturnable: false,
    expirationDate: ""
  });

  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestUnit, setRequestUnit] = useState<string>("IGD");
  const [requestItems, setRequestItems] = useState<{ bmhpId: string; bmhpName: string; qtyRequested: number; unit: string }[]>([]);
  const [requestNotes, setRequestNotes] = useState("");

  const [isDistributeModalOpen, setIsDistributeModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<BMHPRequest | null>(null);
  const [recipientName, setRecipientName] = useState("");
  const [distributeNotes, setDistributeNotes] = useState("");

  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnSourceUnit, setReturnSourceUnit] = useState("IGD");
  const [returnItems, setReturnItems] = useState<{ bmhpId: string; bmhpName: string; qty: number; unit: string; condition: "NORMAL" | "RUSAK" | "KOTOR"; notes?: string }[]>([]);

  // Linen Modal States
  const [isLinenReqModalOpen, setIsLinenReqModalOpen] = useState(false);
  const [linenReqUnit, setLinenReqUnit] = useState("IBS_OK");
  const [linenReqItems, setLinenReqItems] = useState<{ linenId: string; linenName: string; qtyRequested: number; unit: string }[]>([]);

  const [isLinenDistModalOpen, setIsLinenDistModalOpen] = useState(false);
  const [selectedLinenReq, setSelectedLinenReq] = useState<LinenRequest | null>(null);

  const [isLinenReturnModalOpen, setIsLinenReturnModalOpen] = useState(false);
  const [linenReturnItems, setLinenReturnItems] = useState<{ linenId: string; linenName: string; qty: number; unit: string; condition: "KOTOR" | "RUSAK" | "HILANG"; notes?: string }[]>([]);

  // Submitting Spinner
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Idempotency Keys and Helpers
  const [distributeIdempotencyKey, setDistributeIdempotencyKey] = useState<string>("");
  const [returnIdempotencyKey, setReturnIdempotencyKey] = useState<string>("");
  const [linenDistIdempotencyKey, setLinenDistIdempotencyKey] = useState<string>("");
  const [linenReturnIdempotencyKey, setLinenReturnIdempotencyKey] = useState<string>("");

  const generateIdempotencyKey = () => {
    if (typeof window !== "undefined" && window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `key-${Date.now()}-${Math.random().toString(36).slice(2, 11)}-${Math.random().toString(36).slice(2, 11)}`;
  };

  const handleCloseDistributeModal = () => {
    setIsDistributeModalOpen(false);
    setSelectedRequest(null);
    setDistributeIdempotencyKey("");
  };

  const handleCloseReturnModal = () => {
    setIsReturnModalOpen(false);
    setReturnIdempotencyKey("");
  };

  const handleCloseLinenDistModal = () => {
    setIsLinenDistModalOpen(false);
    setSelectedLinenReq(null);
    setLinenDistIdempotencyKey("");
  };

  const handleCloseLinenReturnModal = () => {
    setIsLinenReturnModalOpen(false);
    setLinenReturnIdempotencyKey("");
  };

  // 1. Subscribe to Firestore Collections
  useEffect(() => {
    if (!currentUserProfile) return;

    // Master Units
    const unsubUnits = onSnapshot(collection(db, "master_units"), (snap) => {
      const uList = snap.docs.map(d => ({ id: d.id, name: d.data().name || d.id }));
      setMasterUnits(uList.length ? uList : [
        { id: "IGD", name: "Instalasi Gawat Darurat (IGD)" },
        { id: "IBS_OK", name: "Instalasi Bedah Sentral (IBS/OK)" },
        { id: "VK", name: "Kamar Bersalin (VK)" },
        { id: "ICU", name: "Intensive Care Unit (ICU)" },
        { id: "RAWAT_INAP", name: "Rawat Inap" }
      ]);
    });

    // BMHP Catalog
    const unsubBmhp = onSnapshot(collection(db, "bmhp_catalog"), (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() })) as BMHPCatalog[];
      setBmhpList(items);
    });

    // BMHP Requests
    const unsubRequests = onSnapshot(collection(db, "bmhp_requests"), (snap) => {
      const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() })) as BMHPRequest[];
      setBmhpRequests(reqs.sort((a,b) => (b.createdAt > a.createdAt ? 1 : -1)));
    });

    // BMHP Distributions
    const unsubDists = onSnapshot(collection(db, "bmhp_distributions"), (snap) => {
      const dists = snap.docs.map(d => ({ id: d.id, ...d.data() })) as BMHPDistribution[];
      setBmhpDistributions(dists.sort((a,b) => (b.createdAt > a.createdAt ? 1 : -1)));
    });

    // BMHP Returns
    const unsubRets = onSnapshot(collection(db, "bmhp_returns"), (snap) => {
      const rets = snap.docs.map(d => ({ id: d.id, ...d.data() })) as BMHPReturn[];
      setBmhpReturns(rets.sort((a,b) => (b.createdAt > a.createdAt ? 1 : -1)));
    });

    // Linen Catalog
    const unsubLinen = onSnapshot(collection(db, "linen_catalog"), (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() })) as LinenItem[];
      setLinenList(items);
    });

    // Linen Requests
    const unsubLinenReqs = onSnapshot(collection(db, "linen_requests"), (snap) => {
      const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() })) as LinenRequest[];
      setLinenRequests(reqs.sort((a,b) => (b.createdAt > a.createdAt ? 1 : -1)));
    });

    // Linen Returns
    const unsubLinenRets = onSnapshot(collection(db, "linen_returns"), (snap) => {
      const rets = snap.docs.map(d => ({ id: d.id, ...d.data() })) as LinenReturn[];
      setLinenReturns(rets.sort((a,b) => (b.createdAt > a.createdAt ? 1 : -1)));
    });

    return () => {
      unsubUnits();
      unsubBmhp();
      unsubRequests();
      unsubDists();
      unsubRets();
      unsubLinen();
      unsubLinenReqs();
      unsubLinenRets();
    };
  }, [currentUserProfile]);

  // Seed default data if catalog is empty
  useEffect(() => {
    if (bmhpList.length === 0 && !isDemoMode) {
      // Add default BMHP items if empty
      const defaultBmhp: Partial<BMHPCatalog>[] = [
        { id: "BM-KASSA-01", name: "Kassa Steril 10x10 cm", category: "sterile", stockQty: 250, minStockAlert: 50, unit: "box", isReturnable: false, expirationDate: "2027-12-31" },
        { id: "BM-GLOVE-01", name: "Sarung Tangan Steril No. 7.5", category: "sterile", stockQty: 180, minStockAlert: 30, unit: "pasang", isReturnable: false, expirationDate: "2026-11-15" },
        { id: "BM-MASK-01", name: "Masker Bedah 3-Ply", category: "non_sterile", stockQty: 500, minStockAlert: 100, unit: "box", isReturnable: false, expirationDate: "2028-06-30" },
        { id: "BM-POUCH-01", name: "Sterilization Pouch 15x30 cm", category: "non_sterile", stockQty: 400, minStockAlert: 80, unit: "roll", isReturnable: false, expirationDate: "2029-01-01" },
        { id: "BM-CREPE-01", name: "Crepe Paper Sterilisasi 90x90 cm", category: "non_sterile", stockQty: 120, minStockAlert: 20, unit: "lembar", isReturnable: false, expirationDate: "2028-10-10" }
      ];

      defaultBmhp.forEach(item => {
        setDoc(doc(db, "bmhp_catalog", item.id!), item, { merge: true }).catch(() => {});
      });
    }

    if (linenList.length === 0 && !isDemoMode) {
      const defaultLinen: Partial<LinenItem>[] = [
        { id: "LN-OP-01", name: "Linen Operasi Hijau Steril", category: "IBS_OK", stockQty: 60, minStockAlert: 15, unit: "set" },
        { id: "LN-DRAP-01", name: "Linen Draping Set IBS/OK", category: "IBS_OK", stockQty: 40, minStockAlert: 10, unit: "set" },
        { id: "LN-COV-01", name: "Linen Cover Meja Operasi", category: "IBS_OK", stockQty: 35, minStockAlert: 8, unit: "pcs" },
        { id: "LN-JAS-01", name: "Jas Operasi Dokter / Perawat", category: "IBS_OK", stockQty: 50, minStockAlert: 12, unit: "pcs" }
      ];

      defaultLinen.forEach(item => {
        setDoc(doc(db, "linen_catalog", item.id!), item, { merge: true }).catch(() => {});
      });
    }
  }, [bmhpList.length, linenList.length, isDemoMode]);

  // Derived Metrics for Dashboard
  const totalBmhpTypes = bmhpList.length;
  const totalBmhpStock = bmhpList.reduce((acc, curr) => acc + (curr.stockQty || 0), 0);
  const pendingRequests = bmhpRequests.filter(r => r.status === "DIAJUKAN").length;
  const approvedRequests = bmhpRequests.filter(r => r.status === "DISETUJUI").length;

  // Expiration Metrics
  const today = new Date();
  today.setHours(0,0,0,0);
  const thirtyDaysLater = new Date();
  thirtyDaysLater.setDate(today.getDate() + 30);

  const expiredItems = bmhpList.filter(item => {
    if (!item.expirationDate) return false;
    const exp = new Date(item.expirationDate);
    return exp < today;
  });

  const nearExpiredItems = bmhpList.filter(item => {
    if (!item.expirationDate) return false;
    const exp = new Date(item.expirationDate);
    return exp >= today && exp <= thirtyDaysLater;
  });

  // Linen Metrics
  const totalLinenStock = linenList.reduce((acc, curr) => acc + (curr.stockQty || 0), 0);
  const pendingLinenRequests = linenRequests.filter(r => r.status === "DIAJUKAN").length;

  // Handlers for Master BMHP
  const handleSaveMasterBmhp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!masterForm.name || !masterForm.unit) {
      alert("Harap isi Nama Barang dan Satuan!");
      return;
    }

    setIsSubmitting(true);
    try {
      const activeTenantId = requireTenantId(currentUserProfile);
      const bmhpId = masterForm.id?.trim() || `BM-${Date.now().toString().slice(-6)}`;
      const data: BMHPCatalog = {
        id: bmhpId,
        name: masterForm.name.trim(),
        category: masterForm.category || "non_sterile",
        stockQty: Number(masterForm.stockQty) || 0,
        minStockAlert: Number(masterForm.minStockAlert) || 10,
        unit: masterForm.unit.trim(),
        isReturnable: masterForm.isReturnable || false,
        expirationDate: masterForm.expirationDate || "",
        tenantId: activeTenantId,
        lastRestockedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "bmhp_catalog", bmhpId), data, { merge: true });
      triggerActionConfirm({ title: "Katalog BMHP Berhasil Disimpan", message: `BMHP ${data.name} (${bmhpId}) telah dicatat.` });
      setIsMasterModalOpen(false);
      setMasterForm({ id: "", name: "", category: "non_sterile", stockQty: 100, minStockAlert: 20, unit: "pcs", isReturnable: false, expirationDate: "" });
    } catch (err: any) {
      alert(`Gagal menyimpan BMHP: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handlers for Request BMHP
  const handleAddItemToRequest = (bmhpId: string) => {
    const item = bmhpList.find(b => b.id === bmhpId);
    if (!item) return;
    if (requestItems.some(i => i.bmhpId === bmhpId)) return;

    setRequestItems(prev => [
      ...prev,
      { bmhpId: item.id, bmhpName: item.name, qtyRequested: 10, unit: item.unit }
    ]);
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestItems.length) {
      alert("Pilih minimal 1 item BMHP!");
      return;
    }

    setIsSubmitting(true);
    try {
      const reqId = await createBMHPRequest({
        user: currentUserProfile,
        requestingUnit: requestUnit,
        items: requestItems,
        notes: requestNotes,
        isDemoMode
      });

      triggerActionConfirm({ title: "Permintaan BMHP Diajukan", message: `Nomor Permintaan: ${reqId}` });
      setIsRequestModalOpen(false);
      setRequestItems([]);
      setRequestNotes("");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handlers for Approval
  const handleApproveRequest = async (reqId: string, approve: boolean) => {
    try {
      await approveOrRejectBMHPRequest({
        user: currentUserProfile,
        requestId: reqId,
        approve,
        rejectionReason: approve ? "" : "Ditolak oleh verifikator / stok terbatas",
        isDemoMode
      });

      triggerActionConfirm({
        title: approve ? "Permintaan Disetujui" : "Permintaan Ditolak",
        message: `Nomor Permintaan: ${reqId}`
      });
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Handlers for Fulfill Distribution
  const handleExecuteDistribute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;
    if (!recipientName.trim()) {
      alert("Harap isi Nama Penerima!");
      return;
    }
    if (!distributeIdempotencyKey) {
      alert("Gagal memproses: ID Transaksi tidak valid (Kosong). Harap buka ulang form.");
      return;
    }

    setIsSubmitting(true);
    try {
      const distItems = selectedRequest.items.map(i => ({
        bmhpId: i.bmhpId,
        bmhpName: i.bmhpName,
        qty: i.qtyRequested,
        unit: i.unit
      }));

      const distId = await executeBMHPDistribution({
        user: currentUserProfile,
        requestId: selectedRequest.id,
        targetUnit: selectedRequest.requestingUnit,
        recipientName: recipientName.trim(),
        items: distItems,
        notes: distributeNotes,
        isDemoMode,
        idempotencyKey: distributeIdempotencyKey
      });

      triggerActionConfirm({ title: "Distribusi BMHP Berhasil", message: `Nomor Bukti: ${distId}` });
      setIsDistributeModalOpen(false);
      setSelectedRequest(null);
      setRecipientName("");
      setDistributeNotes("");
      setDistributeIdempotencyKey("");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handlers for Return BMHP
  const handleAddItemToReturn = (bmhpId: string) => {
    const item = bmhpList.find(b => b.id === bmhpId);
    if (!item) return;
    if (item.isReturnable === false) {
      alert(`PENGEMBALIAN DITOLAK: "${item.name}" adalah barang habis pakai (single-use) yang tidak dapat dikembalikan ke stok!`);
      return;
    }
    if (returnItems.some(i => i.bmhpId === bmhpId)) return;

    setReturnItems(prev => [
      ...prev,
      { bmhpId: item.id, bmhpName: item.name, qty: 5, unit: item.unit, condition: "NORMAL" }
    ]);
  };

  const handleExecuteReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnItems.length) {
      alert("Pilih minimal 1 barang untuk dikembalikan!");
      return;
    }
    if (!returnIdempotencyKey) {
      alert("Gagal memproses: ID Transaksi tidak valid (Kosong). Harap buka ulang form.");
      return;
    }

    setIsSubmitting(true);
    try {
      const returnId = await executeBMHPReturn({
        user: currentUserProfile,
        sourceUnit: returnSourceUnit,
        items: returnItems,
        notes: "Pengembalian BMHP dari unit",
        isDemoMode,
        idempotencyKey: returnIdempotencyKey
      });

      triggerActionConfirm({ title: "Pengembalian BMHP Tercatat", message: `Nomor Return: ${returnId}` });
      setIsReturnModalOpen(false);
      setReturnItems([]);
      setReturnIdempotencyKey("");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handlers for Linen IBS/OK
  const handleAddLinenToReq = (linenId: string) => {
    const item = linenList.find(l => l.id === linenId);
    if (!item) return;
    if (linenReqItems.some(i => i.linenId === linenId)) return;

    setLinenReqItems(prev => [
      ...prev,
      { linenId: item.id, linenName: item.name, qtyRequested: 5, unit: item.unit }
    ]);
  };

  const handleCreateLinenRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linenReqItems.length) {
      alert("Pilih minimal 1 jenis Linen!");
      return;
    }

    setIsSubmitting(true);
    try {
      const reqId = await createLinenRequest({
        user: currentUserProfile,
        requestingUnit: linenReqUnit,
        items: linenReqItems,
        notes: "Permintaan Linen Operasi IBS/OK",
        isDemoMode
      });

      triggerActionConfirm({ title: "Permintaan Linen IBS/OK Berhasil", message: `Nomor ID: ${reqId}` });
      setIsLinenReqModalOpen(false);
      setLinenReqItems([]);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExecuteLinenDist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLinenReq) return;
    if (!linenDistIdempotencyKey) {
      alert("Gagal memproses: ID Transaksi tidak valid (Kosong). Harap buka ulang form.");
      return;
    }

    setIsSubmitting(true);
    try {
      const items = selectedLinenReq.items.map(i => ({
        linenId: i.linenId,
        linenName: i.linenName,
        qty: i.qtyRequested,
        unit: i.unit
      }));

      const distId = await executeLinenDistribution({
        user: currentUserProfile,
        requestId: selectedLinenReq.id,
        targetUnit: selectedLinenReq.requestingUnit,
        items,
        notes: "Distribusi Linen Operasi ke IBS/OK",
        isDemoMode,
        idempotencyKey: linenDistIdempotencyKey
      });

      triggerActionConfirm({ title: "Distribusi Linen Berhasil", message: `Nomor Bukti: ${distId}` });
      setIsLinenDistModalOpen(false);
      setSelectedLinenReq(null);
      setLinenDistIdempotencyKey("");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddLinenReturnItem = (linenId: string) => {
    const item = linenList.find(l => l.id === linenId);
    if (!item) return;
    if (linenReturnItems.some(i => i.linenId === linenId)) return;

    setLinenReturnItems(prev => [
      ...prev,
      { linenId: item.id, linenName: item.name, qty: 5, unit: item.unit, condition: "KOTOR" }
    ]);
  };

  const handleExecuteLinenReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linenReturnItems.length) {
      alert("Pilih minimal 1 Linen untuk dikembalikan!");
      return;
    }
    if (!linenReturnIdempotencyKey) {
      alert("Gagal memproses: ID Transaksi tidak valid (Kosong). Harap buka ulang form.");
      return;
    }

    setIsSubmitting(true);
    try {
      const retId = await executeLinenReturn({
        user: currentUserProfile,
        sourceUnit: "IBS_OK",
        items: linenReturnItems,
        notes: "Pengembalian Linen dari IBS/OK",
        isDemoMode,
        idempotencyKey: linenReturnIdempotencyKey
      });

      triggerActionConfirm({ title: "Pengembalian Linen Tercatat", message: `Nomor ID: ${retId}` });
      setIsLinenReturnModalOpen(false);
      setLinenReturnItems([]);
      setLinenReturnIdempotencyKey("");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered BMHP Catalog List
  const filteredBmhp = bmhpList.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || item.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = categoryFilter === "all" || item.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-sky-900/40 via-slate-900 to-indigo-950 p-6 rounded-2xl border border-sky-800/40 shadow-lg">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-400/30 uppercase tracking-wider">
              BMHP KASSA + LINEN IBS/OK
            </span>
            <span className="text-slate-400 text-xs">RSUD Benda</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Package className="w-7 h-7 text-sky-400" />
            Manajemen BMHP Kassa & Linen Operasi
          </h1>
          <p className="text-sm text-slate-300 mt-1 max-w-2xl">
            Modul terintegrasi permintaan, distribusi, pengembalian, dan monitoring stok BMHP serta Linen Operasi IBS/OK dengan perlindungan expired & atomic transaction.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasPermission(currentUserProfile, PERMISSIONS.BMHP_CREATE) && (
            <button
              onClick={() => setIsMasterModalOpen(true)}
              className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold text-xs shadow-md transition flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Tambah Master BMHP
            </button>
          )}
          {hasPermission(currentUserProfile, PERMISSIONS.BMHP_REQUEST_CREATE) && (
            <button
              onClick={() => setIsRequestModalOpen(true)}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs shadow-md transition flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Minta BMHP
            </button>
          )}
        </div>
      </div>

      {/* SUBMENU NAVIGATION TABS */}
      <div className="flex items-center gap-2 border-b border-slate-700/60 pb-3 overflow-x-auto scrollbar-none">
        {[
          { id: "dashboard", label: "Dashboard", icon: Sparkles },
          { id: "master_bmhp", label: "Katalog Master BMHP", icon: Layers },
          { id: "stok_bmhp", label: "Stok BMHP", icon: Package },
          { id: "permintaan_bmhp", label: "Permintaan BMHP", icon: FileText, badge: pendingRequests },
          { id: "distribusi_bmhp", label: "Distribusi BMHP", icon: Truck },
          { id: "pengembalian_bmhp", label: "Pengembalian BMHP", icon: RotateCcw },
          { id: "linen_ibs_ok", label: "Linen IBS/OK", icon: Flame, badge: pendingLinenRequests },
          { id: "monitoring_expired", label: "Monitoring Expired", icon: ShieldAlert, badge: expiredItems.length },
          { id: "riwayat", label: "Riwayat Transaksi", icon: FileText }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                isActive 
                  ? "bg-sky-600 text-white shadow-md shadow-sky-900/30" 
                  : "bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {!!tab.badge && tab.badge > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT 1: DASHBOARD AGGREGATION */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase">Total Jenis BMHP</p>
                <h3 className="text-2xl font-black text-white mt-1">{totalBmhpTypes}</h3>
                <p className="text-[11px] text-sky-400 mt-1">Total Unit Stok: {totalBmhpStock.toLocaleString()} pcs</p>
              </div>
              <div className="p-3 bg-sky-500/10 border border-sky-500/20 rounded-xl text-sky-400">
                <Package className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase">Permintaan Menunggu</p>
                <h3 className="text-2xl font-black text-amber-400 mt-1">{pendingRequests}</h3>
                <p className="text-[11px] text-slate-400 mt-1">Siap disetujui / diproses</p>
              </div>
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                <Clock className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase">Barang EXPIRED</p>
                <h3 className="text-2xl font-black text-rose-400 mt-1">{expiredItems.length}</h3>
                <p className="text-[11px] text-rose-300 mt-1">Dilarang didistribusikan</p>
              </div>
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400">
                <ShieldAlert className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase">Stok Linen IBS/OK</p>
                <h3 className="text-2xl font-black text-emerald-400 mt-1">{totalLinenStock}</h3>
                <p className="text-[11px] text-emerald-300 mt-1">Linen Operasi Steril</p>
              </div>
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                <Flame className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* EXPIRED ALERT BANNER IF EXPIRED ITEMS EXIST */}
          {expiredItems.length > 0 && (
            <div className="bg-rose-950/40 border border-rose-800/60 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-rose-200">PERINGATAN SECURITY STOK EXPIRED</h4>
                <p className="text-xs text-rose-300/90 mt-1">
                  Terdapat {expiredItems.length} barang BMHP yang telah melewati tanggal kedaluwarsa. Sistem secara otomatis memblokir distribusi barang ini untuk keselamatan pasien.
                </p>
                <button
                  onClick={() => setActiveTab("monitoring_expired")}
                  className="mt-2 text-xs font-bold text-rose-400 hover:underline flex items-center gap-1"
                >
                  Lihat Barang Expired <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* QUICK SUMMARY TABLES */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* PENDING PERMINTAAN BMHP */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-sky-400" />
                  Permintaan BMHP Menunggu Persetujuan
                </h3>
                <button 
                  onClick={() => setActiveTab("permintaan_bmhp")}
                  className="text-xs text-sky-400 font-bold hover:underline"
                >
                  Lihat Semua
                </button>
              </div>

              {bmhpRequests.filter(r => r.status === "DIAJUKAN").length === 0 ? (
                <p className="text-xs text-slate-500 italic py-4 text-center">Tidak ada permintaan menunggu saat ini.</p>
              ) : (
                <div className="space-y-2">
                  {bmhpRequests.filter(r => r.status === "DIAJUKAN").slice(0, 4).map(req => (
                    <div key={req.id} className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-xs text-slate-200">{req.id} • Unit {req.requestingUnit}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">Oleh: {req.requestedBy} • {req.items.length} jenis item</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {hasPermission(currentUserProfile, PERMISSIONS.BMHP_REQUEST_APPROVE) && (
                          <>
                            <button
                              onClick={() => handleApproveRequest(req.id, true)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg"
                            >
                              Setujui
                            </button>
                            <button
                              onClick={() => handleApproveRequest(req.id, false)}
                              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold rounded-lg"
                            >
                              Tolak
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* PENDING LINEN REQUESTS */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <Flame className="w-4 h-4 text-emerald-400" />
                  Permintaan Linen IBS/OK
                </h3>
                <button 
                  onClick={() => setActiveTab("linen_ibs_ok")}
                  className="text-xs text-emerald-400 font-bold hover:underline"
                >
                  Kelola Linen
                </button>
              </div>

              {linenRequests.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-4 text-center">Belum ada riwayat permintaan Linen.</p>
              ) : (
                <div className="space-y-2">
                  {linenRequests.slice(0, 4).map(req => (
                    <div key={req.id} className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-xs text-slate-200">{req.id} • {req.requestingUnit}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">Pemohon: {req.requestedBy}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        req.status === "SELESAI" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"
                      }`}>
                        {req.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: KATALOG MASTER BMHP */}
      {activeTab === "master_bmhp" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900 p-4 rounded-xl border border-slate-800">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Cari BMHP..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:border-sky-500 outline-none"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500"
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value as any)}
              >
                <option value="all">Semua Kategori</option>
                <option value="sterile">Steril (Kassa, Sarung Tangan, dll)</option>
                <option value="non_sterile">Non-Steril (Masker, Pouch, dll)</option>
              </select>

              {hasPermission(currentUserProfile, PERMISSIONS.BMHP_CREATE) && (
                <button
                  onClick={() => setIsMasterModalOpen(true)}
                  className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Item Baru
                </button>
              )}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase">
                  <th className="p-3">ID Barang</th>
                  <th className="p-3">Nama Barang BMHP</th>
                  <th className="p-3">Kategori</th>
                  <th className="p-3">Stok Tersedia</th>
                  <th className="p-3">Sifat Barang</th>
                  <th className="p-3">Kadaluwarsa</th>
                  <th className="p-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {filteredBmhp.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 italic">Tidak ada data master BMHP.</td>
                  </tr>
                ) : (
                  filteredBmhp.map(item => {
                    const isLow = item.stockQty <= item.minStockAlert;
                    return (
                      <tr key={item.id} className="hover:bg-slate-800/40">
                        <td className="p-3 font-mono text-sky-400 font-bold">{item.id}</td>
                        <td className="p-3 font-semibold text-slate-100">{item.name}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.category === "sterile" ? "bg-sky-500/20 text-sky-300 border border-sky-500/30" : "bg-slate-800 text-slate-300"
                          }`}>
                            {item.category === "sterile" ? "Steril" : "Non-Steril"}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`font-bold ${isLow ? "text-rose-400" : "text-emerald-400"}`}>
                            {item.stockQty} {item.unit}
                          </span>
                          {isLow && <span className="ml-2 text-[10px] text-rose-400 font-semibold">(Stok Rendah)</span>}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.isReturnable ? "bg-indigo-500/20 text-indigo-300" : "bg-amber-500/20 text-amber-300"
                          }`}>
                            {item.isReturnable ? "Dapat Dikembalikan" : "Barang Habis Pakai (Single-use)"}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-slate-300">
                          {item.expirationDate || "-"}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => {
                              setMasterForm(item);
                              setIsMasterModalOpen(true);
                            }}
                            className="text-xs text-sky-400 font-bold hover:underline"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: STOK BMHP DETAIL */}
      {activeTab === "stok_bmhp" && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Package className="w-4 h-4 text-sky-400" />
              Monitoring Detail Stok BMHP CSSD
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {bmhpList.map(bmhp => (
                <div key={bmhp.id} className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-mono font-bold text-sky-400">{bmhp.id}</span>
                      <h4 className="font-bold text-sm text-slate-100">{bmhp.name}</h4>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-950 text-slate-300">
                      {bmhp.unit}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
                    <span className="text-xs text-slate-400">Jumlah Stok:</span>
                    <span className="text-lg font-black text-emerald-400">{bmhp.stockQty} {bmhp.unit}</span>
                  </div>

                  <div className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span>Kadaluwarsa:</span>
                    <span className="font-mono text-slate-200">{bmhp.expirationDate || "Tidak ada"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 4: PERMINTAAN BMHP */}
      {activeTab === "permintaan_bmhp" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-900 p-4 rounded-xl border border-slate-800">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-400" />
              Daftar Permintaan BMHP Instalasi
            </h3>

            {hasPermission(currentUserProfile, PERMISSIONS.BMHP_REQUEST_CREATE) && (
              <button
                onClick={() => setIsRequestModalOpen(true)}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Permintaan Baru
              </button>
            )}
          </div>

          <div className="space-y-3">
            {bmhpRequests.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 p-8 text-center text-slate-500 rounded-2xl italic">
                Belum ada permintaan BMHP yang diajukan.
              </div>
            ) : (
              bmhpRequests.map(req => (
                <div key={req.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-sky-400">{req.id}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300">
                          Unit: {req.requestingUnit}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">Oleh: {req.requestedBy} • {req.createdAt?.slice(0,16)}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                        req.status === "SELESAI" ? "bg-emerald-500/20 text-emerald-300" :
                        req.status === "DISETUJUI" ? "bg-sky-500/20 text-sky-300" :
                        req.status === "DITOLAK" ? "bg-rose-500/20 text-rose-300" : "bg-amber-500/20 text-amber-300"
                      }`}>
                        Status: {req.status}
                      </span>

                      {req.status === "DIAJUKAN" && hasPermission(currentUserProfile, PERMISSIONS.BMHP_REQUEST_APPROVE) && (
                        <>
                          <button
                            onClick={() => handleApproveRequest(req.id, true)}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg"
                          >
                            Setujui
                          </button>
                          <button
                            onClick={() => handleApproveRequest(req.id, false)}
                            className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg"
                          >
                            Tolak
                          </button>
                        </>
                      )}

                      {req.status === "DISETUJUI" && hasPermission(currentUserProfile, PERMISSIONS.BMHP_DISTRIBUTE) && (
                        <button
                          onClick={() => {
                            setSelectedRequest(req);
                            setDistributeIdempotencyKey(generateIdempotencyKey());
                            setIsDistributeModalOpen(true);
                          }}
                          className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-lg flex items-center gap-1"
                        >
                          <Truck className="w-3.5 h-3.5" /> Proses Distribusi
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                    {req.items.map((item, idx) => (
                      <div key={idx} className="bg-slate-800/50 p-2.5 rounded-xl border border-slate-700/50 flex justify-between">
                        <span className="font-semibold text-slate-200">{item.bmhpName}</span>
                        <span className="font-bold text-sky-400">{item.qtyRequested} {item.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT 5: DISTRIBUSI BMHP */}
      {activeTab === "distribusi_bmhp" && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Truck className="w-4 h-4 text-sky-400" />
              Riwayat Pengeluaran & Distribusi BMHP
            </h3>

            <div className="space-y-3">
              {bmhpDistributions.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-4 text-center">Belum ada catatan distribusi BMHP.</p>
              ) : (
                bmhpDistributions.map(dist => (
                  <div key={dist.id} className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-xl space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-700/50 pb-2">
                      <div>
                        <span className="font-mono text-xs font-bold text-sky-400">{dist.id}</span>
                        <span className="ml-2 text-xs font-bold text-slate-200">Tujuan: {dist.targetUnit}</span>
                      </div>
                      <span className="text-[11px] text-slate-400">Penerima: {dist.recipientName}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs pt-1">
                      {dist.items.map((item, i) => (
                        <div key={i} className="bg-slate-900/60 p-2 rounded border border-slate-800 flex justify-between">
                          <span className="text-slate-300">{item.bmhpName}</span>
                          <span className="font-bold text-emerald-400">{item.qty} {item.unit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 6: PENGEMBALIAN BMHP */}
      {activeTab === "pengembalian_bmhp" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-900 p-4 rounded-xl border border-slate-800">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-indigo-400" />
              Pengembalian BMHP
            </h3>

            {hasPermission(currentUserProfile, PERMISSIONS.BMHP_RETURN) && (
              <button
                onClick={() => {
                  setReturnIdempotencyKey(generateIdempotencyKey());
                  setIsReturnModalOpen(true);
                }}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Catat Pengembalian
              </button>
            )}
          </div>

          <div className="space-y-3">
            {bmhpReturns.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 p-8 text-center text-slate-500 rounded-2xl italic">
                Belum ada pengembalian BMHP tercatat.
              </div>
            ) : (
              bmhpReturns.map(ret => (
                <div key={ret.id} className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div>
                      <span className="font-mono text-xs font-bold text-sky-400">{ret.id}</span>
                      <span className="ml-2 text-xs text-slate-300">Asal Unit: {ret.sourceUnit}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      ret.status === "DIKEMBALIKAN" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"
                    }`}>
                      {ret.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                    {ret.items.map((item, idx) => (
                      <div key={idx} className="bg-slate-800/50 p-2.5 rounded-xl border border-slate-700/50 flex justify-between items-center">
                        <div>
                          <div className="font-semibold text-slate-200">{item.bmhpName}</div>
                          <div className="text-[10px] text-slate-400">Kondisi: {item.condition}</div>
                        </div>
                        <span className="font-bold text-sky-400">{item.qty} {item.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT 7: LINEN IBS/OK */}
      {activeTab === "linen_ibs_ok" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 p-5 rounded-2xl border border-emerald-800/40">
            <div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                KHUSUS IBS / OK
              </span>
              <h3 className="text-lg font-bold text-white mt-1 flex items-center gap-2">
                <Flame className="w-5 h-5 text-emerald-400" />
                Siklus Linen Operasi IBS / OK
              </h3>
              <p className="text-xs text-slate-300">Linen Operasi Hijau, Linen Set, Draping Set, Jas Operasi Dokter & Perawat.</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsLinenReqModalOpen(true)}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Minta Linen IBS
              </button>
              <button
                onClick={() => {
                  setLinenReturnIdempotencyKey(generateIdempotencyKey());
                  setIsLinenReturnModalOpen(true);
                }}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Return Linen Kotor / Rusak
              </button>
            </div>
          </div>

          {/* LINEN KATALOG STOK */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Katalog Stok Linen Operasi CSSD</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {linenList.map(linen => (
                <div key={linen.id} className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 space-y-2">
                  <span className="text-[10px] font-mono font-bold text-emerald-400">{linen.id}</span>
                  <h5 className="font-bold text-sm text-slate-100">{linen.name}</h5>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
                    <span className="text-xs text-slate-400">Stok Steril:</span>
                    <span className="text-lg font-black text-emerald-400">{linen.stockQty} {linen.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* LINEN REQUESTS LIST */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Daftar Permintaan & Distribusi Linen IBS/OK</h4>
            <div className="space-y-3">
              {linenRequests.length === 0 ? (
                <p className="text-xs text-slate-500 italic text-center py-4">Belum ada permintaan Linen IBS/OK.</p>
              ) : (
                linenRequests.map(req => (
                  <div key={req.id} className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="font-bold text-xs text-slate-200">{req.id} • {req.requestingUnit}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">Pemohon: {req.requestedBy} • {req.items.length} item Linen</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                        req.status === "SELESAI" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"
                      }`}>
                        {req.status}
                      </span>

                      {req.status === "DIAJUKAN" && (
                        <button
                          onClick={() => {
                            setSelectedLinenReq(req);
                            setLinenDistIdempotencyKey(generateIdempotencyKey());
                            setIsLinenDistModalOpen(true);
                          }}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg"
                        >
                          Distribusikan
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 8: MONITORING EXPIRED */}
      {activeTab === "monitoring_expired" && (
        <div className="space-y-4">
          <div className="bg-rose-950/30 border border-rose-800/50 p-5 rounded-2xl space-y-3">
            <h3 className="text-sm font-bold text-rose-200 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
              Monitoring Keamanan Tanggal Kadaluwarsa BMHP
            </h3>
            <p className="text-xs text-rose-300/80">
              Sistem e-CSSD secara ketat mencegah terjadinya penyerahan atau distribusi barang BMHP yang sudah kadaluwarsa (Expired).
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="p-4 bg-slate-950 border-b border-slate-800 font-bold text-xs text-slate-300 uppercase">
              Daftar BMHP Kedaluwarsa / Mendekati Expired (≤ 30 Hari)
            </div>

            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold uppercase">
                  <th className="p-3">ID BMHP</th>
                  <th className="p-3">Nama Barang</th>
                  <th className="p-3">Stok</th>
                  <th className="p-3">Tanggal Expired</th>
                  <th className="p-3">Status Keamanan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {[...expiredItems, ...nearExpiredItems].length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500 italic">
                      Seluruh barang BMHP berada dalam kondisi aman (tidak ada yang kedaluwarsa atau mendekati expired).
                    </td>
                  </tr>
                ) : (
                  [...expiredItems, ...nearExpiredItems].map(item => {
                    const isExp = new Date(item.expirationDate) < today;
                    return (
                      <tr key={item.id} className="hover:bg-slate-800/40">
                        <td className="p-3 font-mono font-bold text-sky-400">{item.id}</td>
                        <td className="p-3 font-semibold text-slate-100">{item.name}</td>
                        <td className="p-3 font-bold text-slate-200">{item.stockQty} {item.unit}</td>
                        <td className="p-3 font-mono text-slate-300">{item.expirationDate}</td>
                        <td className="p-3">
                          <span className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                            isExp ? "bg-rose-500/20 text-rose-300 border border-rose-500/30" : "bg-amber-500/20 text-amber-300"
                          }`}>
                            {isExp ? "EXPIRED (DILARANG DISTRIBUSI)" : "MENDEKATI EXPIRED"}
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
      )}

      {/* TAB CONTENT 9: RIWAYAT TRANSAKSI */}
      {activeTab === "riwayat" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <FileText className="w-4 h-4 text-sky-400" />
            Audit Log Ringkasan Transaksi BMHP & Linen
          </h3>
          <p className="text-xs text-slate-400">
            Seluruh mutasi stok dan pergerakan BMHP/Linen tercatat secara mutlak di sistem audit log append-only.
          </p>
        </div>
      )}

      {/* MODAL 1: ADD / EDIT MASTER BMHP */}
      {isMasterModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold">Katalog Item BMHP</h3>
              <button onClick={() => setIsMasterModalOpen(false)} className="text-slate-400 hover:text-white">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMasterBmhp} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-bold">ID Barang (Opsional, Otomatis jika kosong)</label>
                <input
                  type="text"
                  placeholder="Mis: BM-KASSA-01"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-sky-500"
                  value={masterForm.id || ""}
                  onChange={e => setMasterForm({...masterForm, id: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-bold">Nama Barang BMHP *</label>
                <input
                  type="text"
                  required
                  placeholder="Mis: Kassa Steril 10x10 cm"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-sky-500"
                  value={masterForm.name || ""}
                  onChange={e => setMasterForm({...masterForm, name: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-bold">Kategori</label>
                  <select
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-sky-500"
                    value={masterForm.category || "sterile"}
                    onChange={e => setMasterForm({...masterForm, category: e.target.value as any})}
                  >
                    <option value="sterile">Steril</option>
                    <option value="non_sterile">Non-Steril</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-bold">Satuan *</label>
                  <input
                    type="text"
                    required
                    placeholder="box / pasang / pcs / roll"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-sky-500"
                    value={masterForm.unit || ""}
                    onChange={e => setMasterForm({...masterForm, unit: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-bold">Jumlah Stok Awal</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-sky-500"
                    value={masterForm.stockQty ?? 0}
                    onChange={e => setMasterForm({...masterForm, stockQty: parseInt(e.target.value) || 0})}
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-bold">Batas Stok Minimal Alert</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-sky-500"
                    value={masterForm.minStockAlert ?? 10}
                    onChange={e => setMasterForm({...masterForm, minStockAlert: parseInt(e.target.value) || 0})}
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-bold">Tanggal Kadaluwarsa (Expired Date)</label>
                <input
                  type="date"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-sky-500"
                  value={masterForm.expirationDate || ""}
                  onChange={e => setMasterForm({...masterForm, expirationDate: e.target.value})}
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer bg-slate-800/50 p-2.5 rounded-xl border border-slate-700/50">
                  <input
                    type="checkbox"
                    checked={masterForm.isReturnable || false}
                    onChange={e => setMasterForm({...masterForm, isReturnable: e.target.checked})}
                    className="rounded text-sky-500"
                  />
                  <div>
                    <span className="font-bold text-slate-200">Barang Dapat Dikembalikan</span>
                    <p className="text-[10px] text-slate-400">Centang jika item dapat dikembalikan. Biarkan kosong untuk barang sekali pakai / single-use (misal Kassa, Sarung Tangan, Masker).</p>
                  </div>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsMasterModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl disabled:opacity-50"
                >
                  {isSubmitting ? "Menyimpan..." : "Simpan Master BMHP"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: REQUEST BMHP FORM */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold">Form Permintaan BMHP Instalasi</h3>
              <button onClick={() => setIsRequestModalOpen(false)} className="text-slate-400 hover:text-white">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-bold">Instalasi Pemohon *</label>
                <select
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-sky-500"
                  value={requestUnit}
                  onChange={e => setRequestUnit(e.target.value)}
                >
                  {masterUnits.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-bold">Pilih Barang BMHP dari Katalog</label>
                <select
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-sky-500"
                  onChange={e => {
                    if (e.target.value) handleAddItemToRequest(e.target.value);
                  }}
                  value=""
                >
                  <option value="">-- Pilih BMHP --</option>
                  {bmhpList.map(b => (
                    <option key={b.id} value={b.id}>{b.name} (Stok CSSD: {b.stockQty} {b.unit})</option>
                  ))}
                </select>
              </div>

              {/* LIST ITEMS IN REQUEST */}
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {requestItems.map((item, idx) => (
                  <div key={idx} className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-200">{item.bmhpName}</div>
                      <span className="text-[10px] text-slate-400">Satuan: {item.unit}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-center font-bold text-sky-400"
                        value={item.qtyRequested}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 1;
                          setRequestItems(prev => prev.map((it, i) => i === idx ? {...it, qtyRequested: val} : it));
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setRequestItems(prev => prev.filter((_, i) => i !== idx))}
                        className="text-rose-400 font-bold hover:underline"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-bold">Catatan Permintaan</label>
                <input
                  type="text"
                  placeholder="Catatan tambahan (opsional)..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-sky-500"
                  value={requestNotes}
                  onChange={e => setRequestNotes(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl disabled:opacity-50"
                >
                  {isSubmitting ? "Mengirim..." : "Kirim Permintaan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: DISTRIBUTE BMHP FORM */}
      {isDistributeModalOpen && selectedRequest && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold">Proses Distribusi BMHP #{selectedRequest.id}</h3>
              <button onClick={handleCloseDistributeModal} className="text-slate-400 hover:text-white">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteDistribute} className="space-y-3 text-xs">
              <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                <div className="font-bold text-slate-200">Tujuan: Instalasi {selectedRequest.requestingUnit}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Pemohon: {selectedRequest.requestedBy}</div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-bold">Nama Petugas Penerima di Instalasi *</label>
                <input
                  type="text"
                  required
                  placeholder="Nama penerima..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-sky-500"
                  value={recipientName}
                  onChange={e => setRecipientName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-bold">Rincian Item Diserahkan</label>
                <div className="space-y-1.5">
                  {selectedRequest.items.map((it, idx) => (
                    <div key={idx} className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex justify-between">
                      <span className="font-semibold text-slate-200">{it.bmhpName}</span>
                      <span className="font-bold text-emerald-400">{it.qtyRequested} {it.unit}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCloseDistributeModal}
                  className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl disabled:opacity-50"
                >
                  {isSubmitting ? "Memproses..." : "Konfirmasi Distribusi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: RETURN BMHP FORM */}
      {isReturnModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold">Catat Pengembalian BMHP</h3>
              <button onClick={handleCloseReturnModal} className="text-slate-400 hover:text-white">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteReturn} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-bold">Asal Instalasi *</label>
                <select
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-sky-500"
                  value={returnSourceUnit}
                  onChange={e => setReturnSourceUnit(e.target.value)}
                >
                  {masterUnits.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-bold">Pilih Barang yang Dikembalikan</label>
                <select
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-sky-500"
                  onChange={e => {
                    if (e.target.value) handleAddItemToReturn(e.target.value);
                  }}
                  value=""
                >
                  <option value="">-- Pilih BMHP --</option>
                  {bmhpList.filter(b => b.isReturnable).map(b => (
                    <option key={b.id} value={b.id}>{b.name} ({b.unit})</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">* Hanya menampilkan barang BMHP yang ditandai "Dapat Dikembalikan". Barang habis pakai tidak ditampilkan.</p>
              </div>

              <div className="space-y-2 max-h-40 overflow-y-auto">
                {returnItems.map((item, idx) => (
                  <div key={idx} className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200">{item.bmhpName}</span>
                      <button
                        type="button"
                        onClick={() => setReturnItems(prev => prev.filter((_, i) => i !== idx))}
                        className="text-rose-400 font-bold hover:underline"
                      >
                        Hapus
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 font-bold">Jumlah</label>
                        <input
                          type="number"
                          min={1}
                          className="w-full bg-slate-950 border border-slate-700 rounded p-1 text-center font-bold text-sky-400"
                          value={item.qty}
                          onChange={e => {
                            const val = parseInt(e.target.value) || 1;
                            setReturnItems(prev => prev.map((it, i) => i === idx ? {...it, qty: val} : it));
                          }}
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 font-bold">Kondisi</label>
                        <select
                          className="w-full bg-slate-950 border border-slate-700 rounded p-1 text-slate-200"
                          value={item.condition}
                          onChange={e => {
                            const cond = e.target.value as any;
                            setReturnItems(prev => prev.map((it, i) => i === idx ? {...it, condition: cond} : it));
                          }}
                        >
                          <option value="NORMAL">Normal (Bagus)</option>
                          <option value="RUSAK">Rusak / Tahan</option>
                          <option value="KOTOR">Kotor</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCloseReturnModal}
                  className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl disabled:opacity-50"
                >
                  {isSubmitting ? "Memproses..." : "Simpan Pengembalian"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: LINEN REQUEST FORM */}
      {isLinenReqModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold">Permintaan Linen Operasi IBS / OK</h3>
              <button onClick={() => setIsLinenReqModalOpen(false)} className="text-slate-400 hover:text-white">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLinenRequest} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-bold">Pilih Jenis Linen Operasi</label>
                <select
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-sky-500"
                  onChange={e => {
                    if (e.target.value) handleAddLinenToReq(e.target.value);
                  }}
                  value=""
                >
                  <option value="">-- Pilih Linen --</option>
                  {linenList.map(l => (
                    <option key={l.id} value={l.id}>{l.name} (Stok: {l.stockQty} {l.unit})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 max-h-40 overflow-y-auto">
                {linenReqItems.map((item, idx) => (
                  <div key={idx} className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-200">{item.linenName}</div>
                      <span className="text-[10px] text-slate-400">Satuan: {item.unit}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-center font-bold text-emerald-400"
                        value={item.qtyRequested}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 1;
                          setLinenReqItems(prev => prev.map((it, i) => i === idx ? {...it, qtyRequested: val} : it));
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setLinenReqItems(prev => prev.filter((_, i) => i !== idx))}
                        className="text-rose-400 font-bold hover:underline"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsLinenReqModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl disabled:opacity-50"
                >
                  {isSubmitting ? "Mengirim..." : "Kirim Permintaan Linen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: LINEN DISTRIBUTION */}
      {isLinenDistModalOpen && selectedLinenReq && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold">Proses Distribusi Linen #{selectedLinenReq.id}</h3>
              <button onClick={handleCloseLinenDistModal} className="text-slate-400 hover:text-white">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteLinenDist} className="space-y-3 text-xs">
              <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                <div className="font-bold text-slate-200">Tujuan: Instalasi {selectedLinenReq.requestingUnit}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Pemohon: {selectedLinenReq.requestedBy}</div>
              </div>

              <div className="space-y-2">
                {selectedLinenReq.items.map((it, idx) => (
                  <div key={idx} className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex justify-between">
                    <span className="font-semibold text-slate-200">{it.linenName}</span>
                    <span className="font-bold text-emerald-400">{it.qtyRequested} {it.unit}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCloseLinenDistModal}
                  className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl disabled:opacity-50"
                >
                  {isSubmitting ? "Memproses..." : "Konfirmasi Penyerahan Linen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 7: LINEN RETURN (KOTOR / RUSAK / HILANG) */}
      {isLinenReturnModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold">Return Linen Kotor / Rusak / Hilang</h3>
              <button onClick={handleCloseLinenReturnModal} className="text-slate-400 hover:text-white">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteLinenReturn} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-bold">Pilih Jenis Linen</label>
                <select
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-sky-500"
                  onChange={e => {
                    if (e.target.value) handleAddLinenReturnItem(e.target.value);
                  }}
                  value=""
                >
                  <option value="">-- Pilih Linen --</option>
                  {linenList.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 max-h-40 overflow-y-auto">
                {linenReturnItems.map((item, idx) => (
                  <div key={idx} className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200">{item.linenName}</span>
                      <button
                        type="button"
                        onClick={() => setLinenReturnItems(prev => prev.filter((_, i) => i !== idx))}
                        className="text-rose-400 font-bold hover:underline"
                      >
                        Hapus
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 font-bold">Jumlah</label>
                        <input
                          type="number"
                          min={1}
                          className="w-full bg-slate-950 border border-slate-700 rounded p-1 text-center font-bold text-amber-400"
                          value={item.qty}
                          onChange={e => {
                            const val = parseInt(e.target.value) || 1;
                            setLinenReturnItems(prev => prev.map((it, i) => i === idx ? {...it, qty: val} : it));
                          }}
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 font-bold">Kondisi</label>
                        <select
                          className="w-full bg-slate-950 border border-slate-700 rounded p-1 text-slate-200"
                          value={item.condition}
                          onChange={e => {
                            const cond = e.target.value as any;
                            setLinenReturnItems(prev => prev.map((it, i) => i === idx ? {...it, condition: cond} : it));
                          }}
                        >
                          <option value="KOTOR">Kotor (Laundry/Cuci)</option>
                          <option value="RUSAK">Rusak / Sobek</option>
                          <option value="HILANG">Hilang</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCloseLinenReturnModal}
                  className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl disabled:opacity-50"
                >
                  {isSubmitting ? "Memproses..." : "Simpan Pengembalian Linen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
