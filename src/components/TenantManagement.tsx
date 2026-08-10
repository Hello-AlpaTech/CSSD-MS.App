import React, { useState, useEffect } from "react";
import { UserProfile, Tenant, TenantStatus, TenantInstallation } from "../types";
import { db } from "../lib/firebase";
import { collection, onSnapshot, doc, setDoc, updateDoc, serverTimestamp, query, where, getDocs } from "firebase/firestore";
import {
  PERMISSIONS,
  checkPermissionOrThrow,
  hasPermission,
  isUserActive
} from "../lib/permissions";
import { writeAuditLog } from "../lib/auditLogger";
import {
  Building2,
  Plus,
  Edit2,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  AlertTriangle,
  Info,
  Power,
  Printer,
  MapPin,
  Phone,
  Mail,
  ListOrdered,
  Users,
  Settings,
  X,
  Check,
  Layers
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Props {
  currentUser: UserProfile | null;
}

export default function TenantManagement({ currentUser }: Props) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [installations, setInstallations] = useState<TenantInstallation[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isInstallationsModalOpen, setIsInstallationsModalOpen] = useState(false);

  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);

  // Form States - Tenant
  const [formTenantId, setFormTenantId] = useState("");
  const [formKodeTenant, setFormKodeTenant] = useState("");
  const [formNamaRumahSakit, setFormNamaRumahSakit] = useState("");
  const [formNamaSingkat, setFormNamaSingkat] = useState("");
  const [formAlamat, setFormAlamat] = useState("");
  const [formKota, setFormKota] = useState("");
  const [formTelepon, setFormTelepon] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formLogo, setFormLogo] = useState("");
  const [formNamaCSSD, setFormNamaCSSD] = useState("");
  const [formPrinterType, setFormPrinterType] = useState("VSC MP-58 C (Thermal 58mm ESC/POS)");
  const [formStatus, setFormStatus] = useState<TenantStatus>("AKTIF");
  const [statusReason, setStatusReason] = useState("");

  // Form States - Installation
  const [newInstKode, setNewInstKode] = useState("");
  const [newInstNama, setNewInstNama] = useState("");

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Realtime Listeners
  useEffect(() => {
    if (!currentUser || !isUserActive(currentUser)) return;

    // Listen to master_tenants collection
    const unsubTenants = onSnapshot(
      collection(db, "master_tenants"),
      (snap) => {
        const list: Tenant[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          list.push({
            id: docSnap.id,
            tenantId: d.tenantId || docSnap.id,
            kodeTenant: d.kodeTenant || docSnap.id,
            namaRumahSakit: d.namaRumahSakit || d.nama || docSnap.id,
            namaSingkat: d.namaSingkat || d.namaRumahSakit || docSnap.id,
            alamat: d.alamat || "",
            kota: d.kota || "",
            telepon: d.telepon || "",
            email: d.email || "",
            logo: d.logo || "/IconNew.png",
            statusTenant: (d.statusTenant || (d.active === false ? "NONAKTIF" : "AKTIF")) as TenantStatus,
            tanggalAktif: d.tanggalAktif,
            tanggalNonaktif: d.tanggalNonaktif,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
            namaCSSD: d.namaCSSD || `Instalasi CSSD ${d.namaSingkat || d.namaRumahSakit || ""}`,
            pengaturanCetak: d.pengaturanCetak || {
              printerType: "VSC MP-58 C (Thermal 58mm ESC/POS)",
              paperWidth: "58mm",
              autoPrintQr: true
            },
            timezone: d.timezone || "Asia/Jakarta",
            formatTanggal: d.formatTanggal || "DD/MM/YYYY HH:mm",
            nonactiveReason: d.nonactiveReason || ""
          });
        });

        // Seed default RSUD-BENDA if collection is completely empty
        if (list.length === 0) {
          const defaultTenant: Tenant = {
            id: "RSUD-BENDA",
            tenantId: "RSUD-BENDA",
            kodeTenant: "BENDA",
            namaRumahSakit: "RSUD Benda Kota Tangerang",
            namaSingkat: "RSUD Benda",
            alamat: "Jl. Raya Prancis No. 1, Benda, Kota Tangerang",
            kota: "Kota Tangerang",
            telepon: "(021) 555-0199",
            email: "info@rsudbenda.id",
            logo: "/IconNew.png",
            statusTenant: "AKTIF",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            namaCSSD: "Instalasi CSSD RSUD Benda",
            pengaturanCetak: {
              printerType: "VSC MP-58 C (Thermal 58mm ESC/POS)",
              paperWidth: "58mm",
              autoPrintQr: true
            },
            timezone: "Asia/Jakarta",
            formatTanggal: "DD/MM/YYYY HH:mm"
          };

          setDoc(doc(db, "master_tenants", "RSUD-BENDA"), defaultTenant).catch(() => {});
          list.push(defaultTenant);
        }

        setTenants(list);
      },
      (err) => {
        console.warn("[FirestoreListener] master_tenants snapshot warning:", err?.message || err);
      }
    );

    // Listen to tenant_installations collection
    const unsubInst = onSnapshot(
      collection(db, "tenant_installations"),
      (snap) => {
        const list: TenantInstallation[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          list.push({
            id: docSnap.id,
            installationId: d.installationId || docSnap.id,
            tenantId: d.tenantId || "",
            kodeInstalasi: d.kodeInstalasi || d.installationId || docSnap.id,
            namaInstalasi: d.namaInstalasi || d.kodeInstalasi || docSnap.id,
            status: d.status || "AKTIF",
            createdAt: d.createdAt,
            updatedAt: d.updatedAt
          });
        });
        setInstallations(list);
      },
      (err) => {
        console.warn("[FirestoreListener] tenant_installations snapshot warning:", err?.message || err);
      }
    );

    return () => {
      unsubTenants();
      unsubInst();
    };
  }, [currentUser]);

  // Open Create Tenant Modal
  const openCreateModal = () => {
    try {
      checkPermissionOrThrow(currentUser, PERMISSIONS.TENANT_CREATE, {
        resource: "TENANTS",
        action: "OPEN_TENANT_CREATE_FORM",
        tenantId: currentUser?.tenantId || ""
      });

      setFormTenantId("");
      setFormKodeTenant("");
      setFormNamaRumahSakit("");
      setFormNamaSingkat("");
      setFormAlamat("");
      setFormKota("");
      setFormTelepon("");
      setFormEmail("");
      setFormLogo("/IconNew.png");
      setFormNamaCSSD("");
      setFormPrinterType("VSC MP-58 C (Thermal 58mm ESC/POS)");
      setErrorMsg("");
      setSuccessMsg("");
      setIsCreateModalOpen(true);
    } catch (err: any) {
      setErrorMsg(err.message || "Akses Ditolak");
    }
  };

  // Save New Tenant
  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setSaving(true);

    try {
      const rawId = formTenantId.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
      if (!rawId) {
        throw new Error("ID Tenant / Kode Tenant tidak boleh kosong dan hanya boleh berisi huruf, angka, strip (-), dan underscore (_).");
      }

      if (!formNamaRumahSakit.trim()) {
        throw new Error("Nama Rumah Sakit wajib diisi.");
      }

      // Check if Tenant ID already exists
      const existing = tenants.find(t => t.tenantId === rawId || t.id === rawId);
      if (existing) {
        throw new Error(`Tenant dengan ID "${rawId}" sudah ada di database.`);
      }

      const kode = formKodeTenant.trim().toUpperCase() || rawId;
      const namaSingkat = formNamaSingkat.trim() || formNamaRumahSakit.trim();
      const namaCSSD = formNamaCSSD.trim() || `Instalasi CSSD ${namaSingkat}`;

      const newTenantPayload: Tenant = {
        id: rawId,
        tenantId: rawId,
        kodeTenant: kode,
        namaRumahSakit: formNamaRumahSakit.trim(),
        namaSingkat: namaSingkat,
        alamat: formAlamat.trim() || "-",
        kota: formKota.trim() || "-",
        telepon: formTelepon.trim() || "-",
        email: formEmail.trim() || "-",
        logo: formLogo.trim() || "/IconNew.png",
        statusTenant: "AKTIF",
        tanggalAktif: new Date().toISOString(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        namaCSSD: namaCSSD,
        pengaturanCetak: {
          printerType: formPrinterType,
          paperWidth: "58mm",
          autoPrintQr: true
        },
        timezone: "Asia/Jakarta",
        formatTanggal: "DD/MM/YYYY HH:mm"
      };

      // Save Tenant Document
      await setDoc(doc(db, "master_tenants", rawId), newTenantPayload);

      // Initialize default installations for new tenant (IGD, OK, POLI_GIGI, RAWAT_INAP, ICU, CSSD)
      const defaultInsts = [
        { id: `${rawId}_IGD`, installationId: "IGD", kodeInstalasi: "IGD", namaInstalasi: "Instalasi Gawat Darurat" },
        { id: `${rawId}_OK`, installationId: "OK", kodeInstalasi: "OK", namaInstalasi: "Kamar Operasi (OK Sentral)" },
        { id: `${rawId}_POLI_GIGI`, installationId: "POLI_GIGI", kodeInstalasi: "POLI_GIGI", namaInstalasi: "Poli Gigi & Mulut" },
        { id: `${rawId}_RAWAT_INAP`, installationId: "RAWAT_INAP", kodeInstalasi: "RAWAT_INAP", namaInstalasi: "Ruang Rawat Inap" },
        { id: `${rawId}_ICU`, installationId: "ICU", kodeInstalasi: "ICU", namaInstalasi: "Intensive Care Unit (ICU)" },
        { id: `${rawId}_CSSD`, installationId: "CSSD", kodeInstalasi: "CSSD", namaInstalasi: "Instalasi CSSD" }
      ];

      for (const inst of defaultInsts) {
        await setDoc(doc(db, "tenant_installations", inst.id), {
          id: inst.id,
          installationId: inst.installationId,
          tenantId: rawId,
          kodeInstalasi: inst.kodeInstalasi,
          namaInstalasi: inst.namaInstalasi,
          status: "AKTIF",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      // Audit Logging
      await writeAuditLog({
        action: "TENANT_DIBUAT",
        module: "TENANT_MANAGEMENT",
        entityType: "TENANT",
        entityId: rawId,
        userId: currentUser?.userId || currentUser?.uid,
        userName: currentUser?.name,
        userRole: currentUser?.role,
        afterState: JSON.stringify({ tenantId: rawId, nama: formNamaRumahSakit, status: "AKTIF" }),
        reason: `Pembuatan Tenant / Rumah Sakit baru: ${formNamaRumahSakit} (${rawId})`,
        tenantId: rawId
      });

      setSuccessMsg(`Tenant baru "${formNamaRumahSakit}" (${rawId}) berhasil dibuat dengan konfigurasi awal.`);
      setIsCreateModalOpen(false);
    } catch (err: any) {
      console.error("Create tenant error:", err);
      setErrorMsg(err.message || "Gagal membuat tenant baru.");
    } finally {
      setSaving(false);
    }
  };

  // Open Edit Tenant Modal
  const openEditModal = (tenant: Tenant) => {
    try {
      checkPermissionOrThrow(currentUser, PERMISSIONS.TENANT_EDIT, {
        resource: `TENANT/${tenant.tenantId}`,
        action: "OPEN_TENANT_EDIT_FORM",
        tenantId: currentUser?.tenantId || ""
      });

      setSelectedTenant(tenant);
      setFormTenantId(tenant.tenantId);
      setFormKodeTenant(tenant.kodeTenant);
      setFormNamaRumahSakit(tenant.namaRumahSakit);
      setFormNamaSingkat(tenant.namaSingkat);
      setFormAlamat(tenant.alamat || "");
      setFormKota(tenant.kota || "");
      setFormTelepon(tenant.telepon || "");
      setFormEmail(tenant.email || "");
      setFormLogo(tenant.logo || "/IconNew.png");
      setFormNamaCSSD(tenant.namaCSSD || "");
      setFormPrinterType(tenant.pengaturanCetak?.printerType || "VSC MP-58 C (Thermal 58mm ESC/POS)");
      setErrorMsg("");
      setSuccessMsg("");
      setIsEditModalOpen(true);
    } catch (err: any) {
      setErrorMsg(err.message || "Akses Ditolak");
    }
  };

  // Save Tenant Edits
  const handleUpdateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant) return;

    setErrorMsg("");
    setSuccessMsg("");
    setSaving(true);

    try {
      const beforeState = JSON.stringify({
        namaRumahSakit: selectedTenant.namaRumahSakit,
        namaSingkat: selectedTenant.namaSingkat,
        alamat: selectedTenant.alamat,
        namaCSSD: selectedTenant.namaCSSD
      });

      const updatedPayload = {
        kodeTenant: formKodeTenant.trim() || selectedTenant.kodeTenant,
        namaRumahSakit: formNamaRumahSakit.trim(),
        namaSingkat: formNamaSingkat.trim() || formNamaRumahSakit.trim(),
        alamat: formAlamat.trim(),
        kota: formKota.trim(),
        telepon: formTelepon.trim(),
        email: formEmail.trim(),
        logo: formLogo.trim() || "/IconNew.png",
        namaCSSD: formNamaCSSD.trim() || `Instalasi CSSD ${formNamaSingkat.trim()}`,
        pengaturanCetak: {
          printerType: formPrinterType,
          paperWidth: "58mm",
          autoPrintQr: true
        },
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, "master_tenants", selectedTenant.tenantId), updatedPayload);

      const afterState = JSON.stringify({
        namaRumahSakit: updatedPayload.namaRumahSakit,
        namaSingkat: updatedPayload.namaSingkat,
        alamat: updatedPayload.alamat,
        namaCSSD: updatedPayload.namaCSSD
      });

      // Audit Logging
      await writeAuditLog({
        action: "TENANT_CONFIG_DIUBAH",
        module: "TENANT_MANAGEMENT",
        entityType: "TENANT",
        entityId: selectedTenant.tenantId,
        userId: currentUser?.userId || currentUser?.uid,
        userName: currentUser?.name,
        userRole: currentUser?.role,
        beforeState: beforeState,
        afterState: afterState,
        reason: `Pembaruan profil dan konfigurasi Tenant ${selectedTenant.tenantId}`,
        tenantId: selectedTenant.tenantId
      });

      setSuccessMsg(`Informasi Tenant "${formNamaRumahSakit}" berhasil diperbarui.`);
      setIsEditModalOpen(false);
    } catch (err: any) {
      console.error("Update tenant error:", err);
      setErrorMsg(err.message || "Gagal memperbarui data tenant.");
    } finally {
      setSaving(false);
    }
  };

  // Open Toggle Status Modal
  const openStatusModal = (tenant: Tenant) => {
    try {
      checkPermissionOrThrow(currentUser, PERMISSIONS.TENANT_EDIT, {
        resource: `TENANT/${tenant.tenantId}`,
        action: "TOGGLE_TENANT_STATUS",
        tenantId: currentUser?.tenantId || ""
      });

      setSelectedTenant(tenant);
      setFormStatus(tenant.statusTenant === "AKTIF" ? "NONAKTIF" : "AKTIF");
      setStatusReason("");
      setErrorMsg("");
      setSuccessMsg("");
      setIsStatusModalOpen(true);
    } catch (err: any) {
      setErrorMsg(err.message || "Akses Ditolak");
    }
  };

  // Save Status Change (Activate/Deactivate)
  const handleToggleStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant) return;

    if (!statusReason.trim()) {
      setErrorMsg("Alasan perubahan status Tenant wajib diisi.");
      return;
    }

    setErrorMsg("");
    setSuccessMsg("");
    setSaving(true);

    try {
      const isDeactivating = formStatus === "NONAKTIF";
      const actionName = isDeactivating ? "TENANT_DINONAKTIFKAN" : "TENANT_DIAKTIFKAN";

      const updateData: any = {
        statusTenant: formStatus,
        nonactiveReason: isDeactivating ? statusReason.trim() : "",
        updatedAt: serverTimestamp()
      };

      if (isDeactivating) {
        updateData.tanggalNonaktif = new Date().toISOString();
      } else {
        updateData.tanggalAktif = new Date().toISOString();
      }

      await updateDoc(doc(db, "master_tenants", selectedTenant.tenantId), updateData);

      // Audit Logging
      await writeAuditLog({
        action: actionName,
        module: "TENANT_MANAGEMENT",
        entityType: "TENANT",
        entityId: selectedTenant.tenantId,
        userId: currentUser?.userId || currentUser?.uid,
        userName: currentUser?.name,
        userRole: currentUser?.role,
        beforeState: selectedTenant.statusTenant,
        afterState: formStatus,
        reason: `Perubahan status Tenant ${selectedTenant.tenantId} menjadi ${formStatus}. Alasan: ${statusReason.trim()}`,
        tenantId: selectedTenant.tenantId
      });

      setSuccessMsg(`Status Tenant "${selectedTenant.namaRumahSakit}" berhasil diubah menjadi ${formStatus}.`);
      setIsStatusModalOpen(false);
    } catch (err: any) {
      console.error("Toggle status error:", err);
      setErrorMsg(err.message || "Gagal mengubah status tenant.");
    } finally {
      setSaving(false);
    }
  };

  // Open Installations Modal
  const openInstallationsModal = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setNewInstKode("");
    setNewInstNama("");
    setErrorMsg("");
    setSuccessMsg("");
    setIsInstallationsModalOpen(true);
  };

  // Add New Installation to Tenant
  const handleAddInstallation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant) return;

    const kode = newInstKode.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "");
    const nama = newInstNama.trim();

    if (!kode || !nama) {
      setErrorMsg("Kode Instalasi dan Nama Instalasi tidak boleh kosong.");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    try {
      const docId = `${selectedTenant.tenantId}_${kode}`;
      const payload: TenantInstallation = {
        id: docId,
        installationId: kode,
        tenantId: selectedTenant.tenantId,
        kodeInstalasi: kode,
        namaInstalasi: nama,
        status: "AKTIF",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, "tenant_installations", docId), payload);

      await writeAuditLog({
        action: "TENANT_INSTALLATION_ADDED",
        module: "TENANT_MANAGEMENT",
        entityType: "INSTALLATION",
        entityId: docId,
        userId: currentUser?.userId || currentUser?.uid,
        userName: currentUser?.name,
        userRole: currentUser?.role,
        afterState: JSON.stringify({ kode, nama, tenantId: selectedTenant.tenantId }),
        reason: `Penambahan Instalasi "${nama}" (${kode}) pada Tenant ${selectedTenant.tenantId}`,
        tenantId: selectedTenant.tenantId
      });

      setNewInstKode("");
      setNewInstNama("");
      setSuccessMsg(`Instalasi "${nama}" (${kode}) berhasil ditambahkan.`);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal menambahkan instalasi.");
    } finally {
      setSaving(false);
    }
  };

  // Filter Tenants
  const currentTenantId = currentUser?.tenantId || "";

  const filteredTenants = tenants.filter((t) => {
    const matchSearch =
      t.tenantId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.namaRumahSakit.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.namaSingkat.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.kota || "").toLowerCase().includes(searchQuery.toLowerCase());

    const matchStatus = statusFilter === "ALL" || t.statusTenant === statusFilter;

    return matchSearch && matchStatus;
  });

  // Active tenant installations for selected tenant
  const selectedTenantInstallations = installations.filter(
    (i) => i.tenantId === selectedTenant?.tenantId
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm mb-1 uppercase tracking-wider">
              <Building2 className="w-4 h-4" />
              <span>Multi-Tenant & Platform System Configuration</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-100">Manajemen Tenant / Rumah Sakit</h1>
            <p className="text-slate-400 text-sm mt-1">
              Kelola entitas Rumah Sakit terisolasi, konfigurasi awal instalasi, parameter operasional, dan status keaktifan Tenant secara terpusat.
            </p>
          </div>

          {hasPermission(currentUser, PERMISSIONS.TENANT_CREATE) && (
            <button
              onClick={openCreateModal}
              className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold rounded-xl shadow-lg flex items-center justify-center gap-2 text-sm transition-all active:scale-[0.98] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Tenant Baru</span>
            </button>
          )}
        </div>
      </div>

      {/* Global Alerts */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-sm flex items-center gap-3"
          >
            <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <div className="flex-1">{errorMsg}</div>
            <button onClick={() => setErrorMsg("")} className="text-rose-400 hover:text-rose-200">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl text-sm flex items-center gap-3"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div className="flex-1">{successMsg}</div>
            <button onClick={() => setSuccessMsg("")} className="text-emerald-400 hover:text-emerald-200">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            placeholder="Cari ID Tenant, nama Rumah Sakit, kota..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 text-sm rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Filter className="w-4 h-4 text-slate-500" />
            <span>Status:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">Semua Status</option>
            <option value="AKTIF">AKTIF</option>
            <option value="NONAKTIF">NONAKTIF</option>
          </select>
        </div>
      </div>

      {/* Tenant Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTenants.map((tenant) => {
          const isCurrentActive = tenant.tenantId === currentTenantId;
          const tenantInstCount = installations.filter(i => i.tenantId === tenant.tenantId).length;

          return (
            <motion.div
              key={tenant.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`bg-slate-900 border rounded-2xl p-5 shadow-lg flex flex-col justify-between relative overflow-hidden transition-all ${
                tenant.statusTenant === "AKTIF"
                  ? isCurrentActive
                    ? "border-emerald-500/50 ring-1 ring-emerald-500/30"
                    : "border-slate-800 hover:border-slate-700"
                  : "border-rose-500/30 bg-rose-950/10 opacity-80"
              }`}
            >
              {isCurrentActive && (
                <div className="absolute top-0 right-0 bg-emerald-500 text-slate-950 text-[10px] font-extrabold px-3 py-1 rounded-bl-xl tracking-wider uppercase">
                  Tenant Aktif Anda
                </div>
              )}

              <div>
                {/* Top Badge & ID */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <span className="text-xs font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                      ID: {tenant.tenantId}
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                      tenant.statusTenant === "AKTIF"
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                        : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                    }`}
                  >
                    {tenant.statusTenant === "AKTIF" ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        <span>AKTIF</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3 h-3" />
                        <span>NONAKTIF</span>
                      </>
                    )}
                  </span>
                </div>

                {/* Hospital Name & Logo */}
                <div className="flex items-center gap-3 my-3">
                  <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center p-1 overflow-hidden flex-shrink-0">
                    <img
                      src={tenant.logo || "/IconNew.png"}
                      alt={tenant.namaRumahSakit}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                    <Building2 className="w-6 h-6 text-slate-500 absolute" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100 line-clamp-1">
                      {tenant.namaRumahSakit}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {tenant.namaSingkat} {tenant.kodeTenant ? `(${tenant.kodeTenant})` : ""}
                    </p>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-1.5 text-xs text-slate-400 border-t border-slate-800/80 pt-3 my-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    <span className="truncate">{tenant.alamat || "-"}, {tenant.kota || "-"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    <span>{tenant.telepon || "-"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    <span className="truncate text-slate-300 font-medium">{tenant.namaCSSD}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    <span>{tenantInstCount} Instalasi Terdaftar</span>
                  </div>
                </div>

                {tenant.statusTenant === "NONAKTIF" && tenant.nonactiveReason && (
                  <div className="bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-lg text-xs text-rose-300 my-2">
                    <span className="font-semibold block mb-0.5">Alasan Nonaktif:</span>
                    {tenant.nonactiveReason}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2 mt-2">
                <button
                  onClick={() => openInstallationsModal(tenant)}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Kelola Instalasi"
                >
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Instalasi ({tenantInstCount})</span>
                </button>

                <div className="flex items-center gap-1.5">
                  {hasPermission(currentUser, PERMISSIONS.TENANT_EDIT) && (
                    <>
                      <button
                        onClick={() => openEditModal(tenant)}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 rounded-lg transition-colors cursor-pointer"
                        title="Edit Profil Tenant"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => openStatusModal(tenant)}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          tenant.statusTenant === "AKTIF"
                            ? "bg-rose-500/10 hover:bg-rose-500/20 text-rose-400"
                            : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400"
                        }`}
                        title={tenant.statusTenant === "AKTIF" ? "Nonaktifkan Tenant" : "Aktifkan Tenant"}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {filteredTenants.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
          <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-600" />
          <h3 className="text-base font-semibold text-slate-200">Tidak Ada Data Tenant Found</h3>
          <p className="text-sm mt-1">Coba sesuaikan kata kunci pencarian atau filter status Tenant Anda.</p>
        </div>
      )}

      {/* CREATE TENANT MODAL */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-2xl shadow-2xl space-y-4 my-8"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-100">Pendaftaran Tenant / Rumah Sakit Baru</h3>
                    <p className="text-xs text-slate-400">Buat entitas isolasi tenant baru dengan identitas permanen.</p>
                  </div>
                </div>
                <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateTenant} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      ID Tenant (Permanen / Immutable) <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. RSUD-BENDA / RS-SEHAT"
                      value={formTenantId}
                      onChange={(e) => setFormTenantId(e.target.value.toUpperCase())}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl p-2.5 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">ID tidak dapat diubah setelah disimpan.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Kode Tenant / Singkatan Kode</label>
                    <input
                      type="text"
                      placeholder="e.g. BENDA / SEHAT"
                      value={formKodeTenant}
                      onChange={(e) => setFormKodeTenant(e.target.value.toUpperCase())}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl p-2.5 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Nama Lengkap Rumah Sakit <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. RSUD Benda Kota Tangerang"
                      value={formNamaRumahSakit}
                      onChange={(e) => setFormNamaRumahSakit(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl p-2.5 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Nama Singkat / Populer</label>
                    <input
                      type="text"
                      placeholder="e.g. RSUD Benda"
                      value={formNamaSingkat}
                      onChange={(e) => setFormNamaSingkat(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl p-2.5 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Alamat Lengkap</label>
                    <input
                      type="text"
                      placeholder="Jl. Raya Utama No. 123"
                      value={formAlamat}
                      onChange={(e) => setFormAlamat(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl p-2.5 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Kota / Kabupaten</label>
                    <input
                      type="text"
                      placeholder="Kota Tangerang"
                      value={formKota}
                      onChange={(e) => setFormKota(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl p-2.5 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Nomor Telepon / Hotline</label>
                    <input
                      type="text"
                      placeholder="(021) 555-0199"
                      value={formTelepon}
                      onChange={(e) => setFormTelepon(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl p-2.5 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Email Resmi</label>
                    <input
                      type="email"
                      placeholder="info@rsudbenda.id"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl p-2.5 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Nama Instalasi CSSD</label>
                    <input
                      type="text"
                      placeholder="Instalasi CSSD RSUD Benda"
                      value={formNamaCSSD}
                      onChange={(e) => setFormNamaCSSD(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl p-2.5 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Tipe Printer Label Target</label>
                    <input
                      type="text"
                      value={formPrinterType}
                      onChange={(e) => setFormPrinterType(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl p-2.5 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-start gap-2">
                  <Info className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block mb-0.5">Penetapan Isolasi Tenant:</span>
                    Tenant baru akan diinisialisasi secara bersih (tanpa data instrumen/inventaris palsu). Instalasi default (IGD, OK, POLI GIGI, ICU, RAWAT INAP, CSSD) akan dibuatkan otomatis.
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold rounded-xl shadow-lg transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
                  >
                    {saving ? "Menyimpan..." : "Simpan & Inisialisasi Tenant"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* EDIT TENANT MODAL */}
      <AnimatePresence>
        {isEditModalOpen && selectedTenant && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-2xl shadow-2xl space-y-4 my-8"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-sky-500/10 text-sky-400 rounded-xl">
                    <Edit2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-100">Edit Profil & Konfigurasi Tenant</h3>
                    <p className="text-xs text-slate-400">ID Tenant: <span className="font-mono text-sky-400">{selectedTenant.tenantId}</span> (Permanen)</p>
                  </div>
                </div>
                <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleUpdateTenant} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">ID Tenant (Kunci Permanen)</label>
                    <input
                      type="text"
                      disabled
                      value={formTenantId}
                      className="w-full bg-slate-950 border border-slate-800 text-slate-400 text-sm rounded-xl p-2.5 font-mono cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Kode Tenant</label>
                    <input
                      type="text"
                      value={formKodeTenant}
                      onChange={(e) => setFormKodeTenant(e.target.value.toUpperCase())}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl p-2.5 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Nama Lengkap Rumah Sakit</label>
                    <input
                      type="text"
                      required
                      value={formNamaRumahSakit}
                      onChange={(e) => setFormNamaRumahSakit(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl p-2.5 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Nama Singkat</label>
                    <input
                      type="text"
                      value={formNamaSingkat}
                      onChange={(e) => setFormNamaSingkat(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl p-2.5 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Alamat</label>
                    <input
                      type="text"
                      value={formAlamat}
                      onChange={(e) => setFormAlamat(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl p-2.5 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Kota / Kabupaten</label>
                    <input
                      type="text"
                      value={formKota}
                      onChange={(e) => setFormKota(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl p-2.5 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Telepon</label>
                    <input
                      type="text"
                      value={formTelepon}
                      onChange={(e) => setFormTelepon(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl p-2.5 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Email</label>
                    <input
                      type="email"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl p-2.5 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Nama Instalasi CSSD</label>
                    <input
                      type="text"
                      value={formNamaCSSD}
                      onChange={(e) => setFormNamaCSSD(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl p-2.5 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Target Printer Label</label>
                    <input
                      type="text"
                      value={formPrinterType}
                      onChange={(e) => setFormPrinterType(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl p-2.5 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-bold rounded-xl shadow-lg transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
                  >
                    {saving ? "Menyimpan..." : "Simpan Perubahan"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TOGGLE STATUS MODAL */}
      <AnimatePresence>
        {isStatusModalOpen && selectedTenant && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${formStatus === "NONAKTIF" ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                    <Power className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100">
                      {formStatus === "NONAKTIF" ? "Nonaktifkan Tenant" : "Aktifkan Tenant"}
                    </h3>
                    <p className="text-xs text-slate-400">{selectedTenant.namaRumahSakit} ({selectedTenant.tenantId})</p>
                  </div>
                </div>
                <button onClick={() => setIsStatusModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleToggleStatus} className="space-y-4">
                <p className="text-xs text-slate-300">
                  {formStatus === "NONAKTIF" ? (
                    <span className="text-rose-300 font-semibold">
                      ⚠️ PERHATIAN: Menonaktifkan Tenant akan MEMBEKUKAN seluruh akses operasional dan login staff pada Rumah Sakit ini!
                    </span>
                  ) : (
                    <span>
                      Mengaktifkan kembali Tenant akan memulihkan akses operasional staff Rumah Sakit ini.
                    </span>
                  )}
                </p>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Alasan Perubahan Status <span className="text-rose-400">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Masukkan alasan resmi perubahan status Tenant ini..."
                    value={statusReason}
                    onChange={(e) => setStatusReason(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl p-2.5 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsStatusModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className={`px-5 py-2 text-sm font-bold rounded-xl shadow-lg transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 ${
                      formStatus === "NONAKTIF"
                        ? "bg-rose-500 hover:bg-rose-400 text-white"
                        : "bg-emerald-500 hover:bg-emerald-400 text-slate-950"
                    }`}
                  >
                    {saving ? "Proses..." : formStatus === "NONAKTIF" ? "Konfirmasi Nonaktifkan" : "Konfirmasi Aktifkan"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MANAGE INSTALLATIONS MODAL */}
      <AnimatePresence>
        {isInstallationsModalOpen && selectedTenant && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-xl shadow-2xl space-y-4 my-8"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100">Kelola Instalasi / Unit Pelayanan</h3>
                    <p className="text-xs text-slate-400">{selectedTenant.namaRumahSakit} ({selectedTenant.tenantId})</p>
                  </div>
                </div>
                <button onClick={() => setIsInstallationsModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form Add New Installation */}
              <form onSubmit={handleAddInstallation} className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl space-y-3">
                <span className="text-xs font-semibold text-slate-200 block">Tambah Instalasi / Unit Baru:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Kode (e.g. ICU, OK, VK)"
                    value={newInstKode}
                    onChange={(e) => setNewInstKode(e.target.value.toUpperCase())}
                    className="bg-slate-900 border border-slate-700 text-slate-100 text-xs rounded-lg p-2 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Nama Lengkap (e.g. Intensive Care Unit)"
                    value={newInstNama}
                    onChange={(e) => setNewInstNama(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-slate-100 text-xs rounded-lg p-2 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Instalasi</span>
                </button>
              </form>

              {/* Installation List Table */}
              <div className="border border-slate-800 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/80 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">Kode</th>
                      <th className="p-2.5">Nama Instalasi</th>
                      <th className="p-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    {selectedTenantInstallations.map((inst) => (
                      <tr key={inst.id} className="hover:bg-slate-800/40">
                        <td className="p-2.5 font-mono text-indigo-400 font-semibold">{inst.kodeInstalasi}</td>
                        <td className="p-2.5">{inst.namaInstalasi}</td>
                        <td className="p-2.5">
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium border border-emerald-500/20">
                            {inst.status}
                          </span>
                        </td>
                      </tr>
                    ))}

                    {selectedTenantInstallations.length === 0 && (
                      <tr>
                        <td colSpan={3} className="p-4 text-center text-slate-500">
                          Belum ada instalasi terdaftar untuk tenant ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsInstallationsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
