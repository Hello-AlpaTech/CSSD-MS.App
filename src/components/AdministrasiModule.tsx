import React, { useState, useEffect } from "react";
import { UserProfile, Tenant, TenantInstallation } from "../types";
import { db } from "../lib/firebase";
import { collection, onSnapshot, doc, setDoc, query, where, getDoc, getDocs, updateDoc, serverTimestamp } from "firebase/firestore";
import { writeAuditLog } from "../lib/auditLogger";
import { requireTenantId } from "../lib/permissions";
import TenantManagement from "./TenantManagement";
import { Building2, Layers, Sliders, Plus, Calendar, Clock, ArrowLeft, Shield, Check, Edit2, AlertTriangle, FileText, CheckCircle, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Props {
  currentUser: UserProfile | null;
}

export default function AdministrasiModule({ currentUser }: Props) {
  const [activeTab, setActiveTab] = useState<'tenant' | 'instalasi' | 'konfigurasi'>('tenant');
  const tenantId = currentUser?.tenantId || "";
  const userRole = currentUser?.role || "OPERATOR";

  // State Tenant (for non-Platform Admin - local Tenant view)
  const [tenantData, setTenantData] = useState<Tenant | null>(null);
  const [loadingTenant, setLoadingTenant] = useState(true);
  const [isEditingTenant, setIsEditingTenant] = useState(false);
  const [formNamaRS, setFormNamaRS] = useState("");
  const [formNamaSingkat, setFormNamaSingkat] = useState("");
  const [formAlamat, setFormAlamat] = useState("");
  const [formKota, setFormKota] = useState("");
  const [formTelepon, setFormTelepon] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPrinter, setFormPrinter] = useState("");
  const [savingTenant, setSavingTenant] = useState(false);

  // State Instalasi
  const [installations, setInstallations] = useState<TenantInstallation[]>([]);
  const [loadingInst, setLoadingInst] = useState(true);
  const [isAddInstOpen, setIsAddInstOpen] = useState(false);
  const [newInstKode, setNewInstKode] = useState("");
  const [newInstNama, setNewInstNama] = useState("");
  const [savingInst, setSavingInst] = useState(false);

  // State Konfigurasi Sistem (Expired Rules)
  const [linenDays, setLinenDays] = useState(7);
  const [pouchDays, setPouchDays] = useState(30);
  const [plasmaPouchDays, setPlasmaPouchDays] = useState(90);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configLogs, setConfigLogs] = useState<any[]>([]);

  const isPlatformAdmin = currentUser?.email === "cssdrsudbenda@gmail.com" || userRole === "PLATFORM_ADMIN";

  // 1. Live listener for single Tenant (for normal Tenant Admin)
  useEffect(() => {
    if (isPlatformAdmin) {
      setLoadingTenant(false);
      return;
    }

    const unsub = onSnapshot(doc(db, "master_tenants", tenantId), (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        const t: Tenant = {
          id: docSnap.id,
          tenantId: d.tenantId || docSnap.id,
          kodeTenant: d.kodeTenant || docSnap.id,
          namaRumahSakit: d.namaRumahSakit || d.nama || docSnap.id,
          namaSingkat: d.namaSingkat || d.nama || docSnap.id,
          alamat: d.alamat || "",
          kota: d.kota || "",
          telepon: d.telepon || "",
          email: d.email || "",
          logo: d.logo || "/IconNew.png",
          statusTenant: d.statusTenant || "AKTIF",
          namaCSSD: d.namaCSSD || "Instalasi CSSD",
          pengaturanCetak: d.pengaturanCetak || {
            printerType: "VSC MP-58 C (Thermal 58mm ESC/POS)",
            paperWidth: "58mm",
            autoPrintQr: true
          }
        };
        setTenantData(t);
        setFormNamaRS(t.namaRumahSakit);
        setFormNamaSingkat(t.namaSingkat);
        setFormAlamat(t.alamat);
        setFormKota(t.kota);
        setFormTelepon(t.telepon);
        setFormEmail(t.email);
        setFormPrinter(t.pengaturanCetak.printerType);
      }
      setLoadingTenant(false);
    });

    return () => unsub();
  }, [tenantId, isPlatformAdmin]);

  // 2. Live listener for Installations under this Tenant
  useEffect(() => {
    const q = query(collection(db, "tenant_installations"), where("tenantId", "==", tenantId));
    const unsub = onSnapshot(q, (snap) => {
      const list: TenantInstallation[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id,
          installationId: d.installationId || d.kodeInstalasi || docSnap.id,
          tenantId: d.tenantId,
          kodeInstalasi: d.kodeInstalasi,
          namaInstalasi: d.namaInstalasi,
          status: d.status || "AKTIF",
          createdAt: d.createdAt
        });
      });
      setInstallations(list.sort((a, b) => a.kodeInstalasi.localeCompare(b.kodeInstalasi)));
      setLoadingInst(false);
    });

    return () => unsub();
  }, [tenantId]);

  // 3. Load Expired Rules Settings
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const docSnap = await getDoc(doc(db, "settings", `expired_rules_${tenantId}`));
        if (docSnap.exists()) {
          const d = docSnap.data();
          if (d.linenDays) setLinenDays(d.linenDays);
          if (d.pouchDays) setPouchDays(d.pouchDays);
          if (d.plasmaPouchDays) setPlasmaPouchDays(d.plasmaPouchDays);
        } else {
          // Seed defaults if not exist
          await setDoc(doc(db, "settings", `expired_rules_${tenantId}`), {
            linenDays: 7,
            pouchDays: 30,
            plasmaPouchDays: 90,
            tenantId
          });
        }
      } catch (err) {
        console.warn("Could not load expired config:", err);
      } finally {
        setLoadingConfig(false);
      }
    };

    const loadAuditHistory = async () => {
      try {
        const q = query(
          collection(db, "log_audit"),
          where("tenantId", "==", tenantId),
          where("action", "==", "EXPIRED_CONFIG_CHANGED")
        );
        const snap = await getDocs(q);
        const logs: any[] = [];
        snap.forEach(d => {
          logs.push(d.data());
        });
        setConfigLogs(logs.sort((a, b) => {
          const timeA = a.timestamp?.seconds || new Date(a.timestamp).getTime();
          const timeB = b.timestamp?.seconds || new Date(b.timestamp).getTime();
          return timeB - timeA;
        }));
      } catch (err) {
        console.warn("Could not load audit logs:", err);
      }
    };

    loadConfig();
    loadAuditHistory();
  }, [tenantId, activeTab]);

  // Handle tenant details update
  const handleUpdateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setSavingTenant(true);

    try {
      const activeTenant = requireTenantId(currentUser);
      const ref = doc(db, "master_tenants", activeTenant);
      const updateData = {
        namaRumahSakit: formNamaRS,
        namaSingkat: formNamaSingkat,
        alamat: formAlamat,
        kota: formKota,
        telepon: formTelepon,
        email: formEmail,
        "pengaturanCetak.printerType": formPrinter,
        updatedAt: serverTimestamp()
      };

      await updateDoc(ref, updateData);

      await writeAuditLog({
        action: "TENANT_CONFIG_UPDATED",
        module: "SYSTEM_CONFIG",
        entityType: "TENANT",
        entityId: activeTenant,
        tenantId: activeTenant,
        userId: currentUser.uid || currentUser.userId,
        userName: currentUser.name,
        userRole: currentUser.role,
        reason: `Update profil rumah sakit / printer: ${formNamaSingkat}`,
        result: "SUCCESS"
      });

      setIsEditingTenant(false);
      alert("Profil Rumah Sakit berhasil diperbarui!");
    } catch (err: any) {
      alert("Gagal memperbarui profil tenant: " + err.message);
    } finally {
      setSavingTenant(false);
    }
  };

  // Handle add new installation
  const handleAddInstallation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!newInstKode || !newInstNama) return;

    const kodeClean = newInstKode.trim().toUpperCase();
    const namaClean = newInstNama.trim();

    // Validate Kode length/alphanumeric
    if (kodeClean.length < 2 || kodeClean.length > 8) {
      return alert("Kode instalasi harus antara 2 s/d 8 karakter.");
    }

    // Check if code already exists locally
    if (installations.some(i => i.kodeInstalasi === kodeClean)) {
      return alert(`Kode Instalasi "${kodeClean}" sudah terdaftar di Rumah Sakit ini!`);
    }

    setSavingInst(true);
    try {
      const activeTenant = requireTenantId(currentUser);
      const docId = `${activeTenant}-${kodeClean}`;
      const instRef = doc(db, "tenant_installations", docId);

      const instPayload: TenantInstallation = {
        id: docId,
        installationId: kodeClean,
        tenantId: activeTenant,
        kodeInstalasi: kodeClean,
        namaInstalasi: namaClean,
        status: "AKTIF",
        createdAt: new Date().toISOString()
      };

      await setDoc(instRef, instPayload);

      await writeAuditLog({
        action: "INSTALLATION_CREATED",
        module: "SYSTEM_CONFIG",
        entityType: "INSTALLATION",
        entityId: docId,
        tenantId: activeTenant,
        userId: currentUser.uid || currentUser.userId,
        userName: currentUser.name,
        userRole: currentUser.role,
        reason: `Mendaftarkan unit pelayanan baru: ${kodeClean} - ${namaClean}`,
        result: "SUCCESS"
      });

      setNewInstKode("");
      setNewInstNama("");
      setIsAddInstOpen(false);
      alert(`Instalasi ${namaClean} berhasil didaftarkan.`);
    } catch (err: any) {
      alert("Gagal mendaftarkan instalasi: " + err.message);
    } finally {
      setSavingInst(false);
    }
  };

  // Handle save system config (expired rules)
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setSavingConfig(true);

    try {
      const activeTenant = requireTenantId(currentUser);
      const configRef = doc(db, "settings", `expired_rules_${activeTenant}`);
      const oldDoc = await getDoc(configRef);
      const oldData = oldDoc.exists() ? oldDoc.data() : { linenDays: 7, pouchDays: 30, plasmaPouchDays: 90 };

      await setDoc(configRef, {
        linenDays,
        pouchDays,
        plasmaPouchDays,
        tenantId: activeTenant,
        updatedAt: serverTimestamp()
      }, { merge: true });

      const logMsg = `Mengubah durasi kedaluwarsa: LINEN (${oldData.linenDays} -> ${linenDays} hari), POUCH (${oldData.pouchDays} -> ${pouchDays} hari), PLASMA POUCH (${oldData.plasmaPouchDays} -> ${plasmaPouchDays} hari)`;

      await writeAuditLog({
        action: "EXPIRED_CONFIG_CHANGED",
        module: "SYSTEM_CONFIG",
        entityType: "CONFIG",
        entityId: `expired_rules_${activeTenant}`,
        tenantId: activeTenant,
        userId: currentUser.uid || currentUser.userId,
        userName: currentUser.name,
        userRole: currentUser.role,
        reason: logMsg,
        result: "SUCCESS"
      });

      alert("Konfigurasi Kedaluwarsa berhasil diperbarui dan berlaku untuk transaksi baru!");
    } catch (err: any) {
      alert("Gagal menyimpan konfigurasi: " + err.message);
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title block */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-sky-400">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Administrasi Sistem</h1>
            <p className="text-xs text-slate-400">Pusat tata kelola tenant, instalasi unit pelayanan, dan aturan operasional</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 gap-1 p-1 bg-slate-950 rounded-xl max-w-lg border">
        <button
          onClick={() => setActiveTab('tenant')}
          className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'tenant' ? 'bg-slate-800 text-sky-400 shadow-md' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Tenant / RS</span>
        </button>
        <button
          onClick={() => setActiveTab('instalasi')}
          className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'instalasi' ? 'bg-slate-800 text-sky-400 shadow-md' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Daftar Instalasi</span>
        </button>
        <button
          onClick={() => setActiveTab('konfigurasi')}
          className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'konfigurasi' ? 'bg-slate-800 text-sky-400 shadow-md' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Konfigurasi</span>
        </button>
      </div>

      {/* TAB CONTENT: TENANT */}
      {activeTab === 'tenant' && (
        <div className="space-y-6">
          {isPlatformAdmin ? (
            // Platform admin views global tenant list
            <TenantManagement currentUser={currentUser} />
          ) : (
            // Normal Tenant admin views their isolated tenant details
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-6 max-w-4xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-sky-500/10 text-sky-400 rounded-lg">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100">Profil Rumah Sakit Anda</h3>
                    <p className="text-xs text-slate-400">Kelola identitas resmi dan printer tenant yang terisolasi secara total</p>
                  </div>
                </div>
                {!isEditingTenant && (
                  <button
                    onClick={() => setIsEditingTenant(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg transition"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-sky-400" />
                    <span>Edit Profil</span>
                  </button>
                )}
              </div>

              {loadingTenant ? (
                <div className="py-8 text-center text-slate-500 text-xs">Memuat profil Rumah Sakit...</div>
              ) : !tenantData ? (
                <div className="py-8 text-center text-rose-400 text-xs">Profil Rumah Sakit tidak ditemukan.</div>
              ) : !isEditingTenant ? (
                // Display Mode
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                  <div className="space-y-4">
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">ID Tenant (Kunci Permanen)</span>
                      <span className="font-mono text-sky-400 font-bold block mt-1">{tenantData.tenantId}</span>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Nama Lengkap Rumah Sakit</span>
                      <span className="text-slate-100 font-semibold block mt-1">{tenantData.namaRumahSakit}</span>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Nama Singkat / Panggilan</span>
                      <span className="text-slate-100 block mt-1">{tenantData.namaSingkat}</span>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Nama Unit / Instalasi CSSD</span>
                      <span className="text-slate-100 block mt-1">{tenantData.namaCSSD}</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Alamat Resmi</span>
                      <span className="text-slate-100 block mt-1">{tenantData.alamat || "-"}</span>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Kota / Kabupaten</span>
                      <span className="text-slate-100 block mt-1">{tenantData.kota || "-"}</span>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Telepon / Email</span>
                      <span className="text-slate-100 block mt-1">{tenantData.telepon || "-"} / {tenantData.email || "-"}</span>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Target Printer Label Utama</span>
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-xs border border-emerald-500/20 font-mono mt-1">
                        {tenantData.pengaturanCetak?.printerType || "VSC MP-58 C (Thermal 58mm ESC/POS)"}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                // Edit Form Mode
                <form onSubmit={handleUpdateTenant} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">Nama Lengkap Rumah Sakit</label>
                      <input
                        type="text"
                        required
                        value={formNamaRS}
                        onChange={e => setFormNamaRS(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">Nama Singkat</label>
                      <input
                        type="text"
                        required
                        value={formNamaSingkat}
                        onChange={e => setFormNamaSingkat(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">Alamat</label>
                      <input
                        type="text"
                        value={formAlamat}
                        onChange={e => setFormAlamat(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">Kota / Kabupaten</label>
                      <input
                        type="text"
                        value={formKota}
                        onChange={e => setFormKota(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">No. Telepon</label>
                      <input
                        type="text"
                        value={formTelepon}
                        onChange={e => setFormTelepon(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">Email Kontak Resmi</label>
                      <input
                        type="email"
                        value={formEmail}
                        onChange={e => setFormEmail(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">Model Printer Label (ESC/POS 58mm)</label>
                      <select
                        value={formPrinter}
                        onChange={e => setFormPrinter(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                      >
                        <option value="VSC MP-58 C (Thermal 58mm ESC/POS)">VSC MP-58 C (Thermal 58mm ESC/POS)</option>
                        <option value="RawBT ESC/POS Emulator">RawBT ESC/POS Emulator</option>
                        <option value="Universal ESC/POS (Thermal 58mm)">Universal ESC/POS (Thermal 58mm)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setIsEditingTenant(false)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={savingTenant}
                      className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-lg shadow-md transition disabled:opacity-50"
                    >
                      {savingTenant ? "Menyimpan..." : "Simpan Perubahan"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: INSTALASI */}
      {activeTab === 'instalasi' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-6 max-w-4xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-sky-500/10 text-sky-400 rounded-lg">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Registrasi Unit / Instalasi</h3>
                <p className="text-xs text-slate-400">Kelola daftar instalasi internal Rumah Sakit Anda yang terhubung dengan siklus sirkulasi instrumen</p>
              </div>
            </div>
            <button
              onClick={() => setIsAddInstOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-lg transition shadow-md cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Daftarkan Unit Baru</span>
            </button>
          </div>

          {loadingInst ? (
            <div className="py-8 text-center text-slate-500 text-xs">Memuat daftar instalasi pelayanan...</div>
          ) : (
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800">
                    <th className="p-3">Kode Unit</th>
                    <th className="p-3">Nama Lengkap Pelayanan</th>
                    <th className="p-3">Sistem ID</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {installations.map((inst) => (
                    <tr key={inst.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="p-3 font-mono text-sky-400 font-bold">{inst.kodeInstalasi}</td>
                      <td className="p-3 font-semibold">{inst.namaInstalasi}</td>
                      <td className="p-3 font-mono text-slate-500 text-[11px]">{inst.id}</td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                          {inst.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {installations.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500">
                        Belum ada instalasi pelayanan terdaftar untuk Rumah Sakit ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Add Installation Modal */}
          <AnimatePresence>
            {isAddInstOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4"
                >
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h3 className="text-base font-bold text-slate-100">Daftarkan Unit Pelayanan Baru</h3>
                    <button onClick={() => setIsAddInstOpen(false)} className="text-slate-400 hover:text-slate-200">
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>

                  <form onSubmit={handleAddInstallation} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">Kode Unit (e.g. IGD, IBS, ICU)</label>
                      <input
                        type="text"
                        required
                        placeholder="Maks 8 Huruf Alfanumerik"
                        value={newInstKode}
                        onChange={e => setNewInstKode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 font-mono focus:border-sky-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">Nama Lengkap Instalasi</label>
                      <input
                        type="text"
                        required
                        placeholder="Contoh: Instalasi Gawat Darurat"
                        value={newInstNama}
                        onChange={e => setNewInstNama(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => setIsAddInstOpen(false)}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        disabled={savingInst}
                        className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-lg shadow-md transition disabled:opacity-50"
                      >
                        {savingInst ? "Mendaftarkan..." : "Konfirmasi Registrasi"}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* TAB CONTENT: KONFIGURASI SISTEM */}
      {activeTab === 'konfigurasi' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl">
          {/* Settings form */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="p-2 bg-sky-500/10 text-sky-400 rounded-lg">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Aturan Masa Kedaluwarsa Alat (Expired Rules)</h3>
                <p className="text-xs text-slate-400">Atur batasan masa steril instrumen medis berdasarkan jenis kemasan</p>
              </div>
            </div>

            {loadingConfig ? (
              <div className="py-8 text-center text-slate-500 text-xs">Memuat konfigurasi sistem...</div>
            ) : (
              <form onSubmit={handleSaveConfig} className="space-y-6">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-300 space-y-1">
                    <p className="font-bold text-amber-300">Pemberitahuan Regulasi SOP Medis:</p>
                    <p>Sesuai dengan SOP standar, pengaturan default adalah:</p>
                    <ul className="list-disc list-inside text-slate-400 mt-1 pl-1 space-y-0.5">
                      <li>Kemasan Bahan Linen: <span className="text-slate-200 font-semibold">7 Hari</span></li>
                      <li>Kemasan Pouch Steril Standar: <span className="text-slate-200 font-semibold">30 Hari</span></li>
                      <li>Kemasan Plasma Pouch Kedap Udara: <span className="text-slate-200 font-semibold">90 Hari</span></li>
                    </ul>
                    <p className="mt-1.5 text-slate-400">Setiap perubahan durasi akan dicatat di <strong>Audit Log</strong> dan hanya akan mempengaruhi Lot baru yang dikemas pasca penyimpanan konfigurasi ini.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-2">Masa Steril Kemasan Linen (Hari)</label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={365}
                      value={linenDays}
                      onChange={e => setLinenDays(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-2">Masa Steril Kemasan Pouch Steril (Hari)</label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={365}
                      value={pouchDays}
                      onChange={e => setPouchDays(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-2">Masa Steril Kemasan Plasma Pouch (Hari)</label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={365}
                      value={plasmaPouchDays}
                      onChange={e => setPlasmaPouchDays(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-800">
                  <button
                    type="submit"
                    disabled={savingConfig}
                    className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-lg shadow-md transition disabled:opacity-50"
                  >
                    {savingConfig ? "Menyimpan..." : "Simpan Aturan Baru"}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Audit Trail for Configuration changes */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-4 flex flex-col h-[520px]">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <FileText className="w-5 h-5 text-indigo-400" />
              <div>
                <h4 className="text-sm font-bold text-slate-200">Histori Perubahan</h4>
                <p className="text-[10px] text-slate-400">Jejak audit modifikasi aturan masa steril</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {configLogs.map((log, index) => (
                <div key={index} className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5 hover:border-slate-700 transition">
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-bold text-slate-300 block">{log.userName || "Admin"}</span>
                    <span className="text-[9px] font-mono text-slate-500 block">{log.timestampStr || "-"}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{log.reason || "-"}</p>
                  <div className="flex items-center gap-1 text-[9px] text-sky-400 font-mono">
                    <CheckCircle className="w-3 h-3 text-sky-400 shrink-0" />
                    <span>SUCCESS</span>
                  </div>
                </div>
              ))}

              {configLogs.length === 0 && (
                <div className="text-center py-12 text-slate-500 text-xs">Belum ada histori perubahan konfigurasi.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
