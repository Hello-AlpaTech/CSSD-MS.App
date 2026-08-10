import React, { useState, useEffect } from "react";
import { UserProfile, RoleType, AccountStatus } from "../types";
import { db } from "../lib/firebase";
import { collection, onSnapshot, doc, setDoc, updateDoc, serverTimestamp, query, where } from "firebase/firestore";
import { sendPasswordResetEmail, getAuth } from "firebase/auth";
import {
  PERMISSIONS,
  ALL_PERMISSIONS,
  getDefaultPermissions,
  normalizeRole,
  checkPermissionOrThrow,
  hasPermission,
  isUserActive
} from "../lib/permissions";
import { writeAuditLog } from "../lib/auditLogger";
import {
  Users,
  UserPlus,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Key,
  Edit2,
  Lock,
  Search,
  Building2,
  Filter,
  Info,
  Check,
  AlertTriangle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Props {
  currentUser: UserProfile | null;
}

export default function UserManagement({ currentUser }: Props) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

  // Form State
  const [formNip, setFormNip] = useState("");
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formWhatsapp, setFormWhatsapp] = useState("");
  const [formRole, setFormRole] = useState<RoleType>("PETUGAS_CSSD");
  const [formTenantId, setFormTenantId] = useState("");
  const [formScope, setFormScope] = useState<string>("ALL");
  const [formStatus, setFormStatus] = useState<AccountStatus>("AKTIF");
  const [formPermissions, setFormPermissions] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Load Users from Firestore with real-time snapshot
  useEffect(() => {
    if (!currentUser || !isUserActive(currentUser)) return;

    const tenantId = currentUser?.tenantId || "RSUD-BENDA";
    const unsub = onSnapshot(
      query(collection(db, "users"), where("tenantId", "==", tenantId)),
      (snap) => {
        const list: UserProfile[] = [];
        snap.forEach((d) => {
          const data = d.data();
          const email = data.email || d.id;
          const normRole = normalizeRole(data.role);
          const normStatus: AccountStatus = data.statusAkun
            ? data.statusAkun
            : data.active === false
            ? "NONAKTIF"
            : "AKTIF";

          list.push({
            uid: data.uid || d.id,
            userId: data.userId || data.uid || d.id,
            nip: data.nip || "-",
            name: data.name || data.nama || email.split("@")[0],
            email: email.toLowerCase(),
            whatsapp: data.whatsapp || "-",
            role: normRole,
            tenantId: data.tenantId || "",
            scope: data.scope || "ALL",
            statusAkun: normStatus,
            active: normStatus === "AKTIF",
            permissions: Array.isArray(data.permissions) && data.permissions.length > 0
              ? data.permissions
              : getDefaultPermissions(normRole),
            photoUrl: data.photoUrl || "",
            createdAt: data.createdAt,
            updatedAt: data.updatedAt
          });
        });
        setUsers(list);
      },
      (err) => {
        console.warn("[FirestoreListener] users snapshot warning:", err?.message || err);
      }
    );

    return () => unsub();
  }, [currentUser]);

  const openAddModal = () => {
    try {
      checkPermissionOrThrow(currentUser, PERMISSIONS.USER_CREATE, {
        resource: "USERS",
        action: "OPEN_USER_CREATE_FORM",
        tenantId: currentUser?.tenantId || ""
      });
      setEditingUser(null);
      setFormNip("");
      setFormName("");
      setFormEmail("");
      setFormWhatsapp("");
      setFormRole("PETUGAS_CSSD");
      setFormTenantId(currentUser?.tenantId || "");
      setFormScope("ALL");
      setFormStatus("AKTIF");
      setFormPermissions(getDefaultPermissions("PETUGAS_CSSD"));
      setErrorMsg("");
      setSuccessMsg("");
      setIsModalOpen(true);
    } catch (err: any) {
      setErrorMsg(err.message || "Akses Ditolak");
    }
  };

  const openEditModal = (user: UserProfile) => {
    try {
      checkPermissionOrThrow(currentUser, PERMISSIONS.USER_EDIT, {
        resource: `USER/${user.email}`,
        action: "OPEN_USER_EDIT_FORM",
        tenantId: currentUser?.tenantId || ""
      });
      setEditingUser(user);
      setFormNip(user.nip);
      setFormName(user.name);
      setFormEmail(user.email);
      setFormWhatsapp(user.whatsapp || "");
      setFormRole(normalizeRole(user.role));
      setFormTenantId(user.tenantId || "");
      setFormScope(Array.isArray(user.scope) ? user.scope.join(", ") : user.scope || "ALL");
      setFormStatus(user.statusAkun);
      setFormPermissions(user.permissions || getDefaultPermissions(user.role));
      setErrorMsg("");
      setSuccessMsg("");
      setIsModalOpen(true);
    } catch (err: any) {
      setErrorMsg(err.message || "Akses Ditolak");
    }
  };

  const handleRoleChangeInForm = (newRole: RoleType) => {
    setFormRole(newRole);
    // Auto populate default permissions for selected role
    setFormPermissions(getDefaultPermissions(newRole));
  };

  const togglePermissionInForm = (perm: string) => {
    if (formPermissions.includes(perm)) {
      setFormPermissions(formPermissions.filter((p) => p !== perm));
    } else {
      setFormPermissions([...formPermissions, perm]);
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setSaving(true);

    try {
      const emailKey = formEmail.trim().toLowerCase();
      if (!emailKey || !emailKey.includes("@")) {
        throw new Error("Email tidak valid.");
      }

      const targetTenant = formTenantId.trim();

      // Tenant Boundary Verification
      const myTenant = currentUser?.tenantId || "";
      if (currentUser?.email !== "cssdrsudbenda@gmail.com" && targetTenant !== myTenant) {
        throw new Error(`AKSES DITOLAK: Anda hanya dapat mengelola user pada Tenant Anda (${myTenant}).`);
      }

      // Self-Privilege Escalation / Modification Protection
      if (currentUser?.email === emailKey) {
        if (formRole !== normalizeRole(currentUser.role)) {
          throw new Error("AKSES DITOLAK: Anda tidak diperbolehkan mengubah Role Anda sendiri.");
        }
        if (formStatus !== "AKTIF") {
          throw new Error("AKSES DITOLAK: Anda tidak diperbolehkan menonaktifkan akun Anda sendiri.");
        }
      }

      // Parse scope
      let parsedScope: string[] | "ALL" = "ALL";
      if (formScope.trim() && formScope.trim().toUpperCase() !== "ALL") {
        parsedScope = formScope
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);
      }

      if (editingUser) {
        // UPDATE EXISTING USER
        checkPermissionOrThrow(currentUser, PERMISSIONS.USER_EDIT, {
          resource: `USER/${emailKey}`,
          action: "UPDATE_USER_PROFILE",
          tenantId: targetTenant
        });

        const beforeState = JSON.stringify({
          role: editingUser.role,
          statusAkun: editingUser.statusAkun,
          scope: editingUser.scope,
          tenantId: editingUser.tenantId,
          permissionsCount: editingUser.permissions.length
        });

        const userDocRef = doc(db, "users", emailKey);

        await updateDoc(userDocRef, {
          nip: formNip.trim(),
          name: formName.trim(),
          whatsapp: formWhatsapp.trim(),
          role: formRole,
          tenantId: targetTenant,
          scope: parsedScope,
          statusAkun: formStatus,
          active: formStatus === "AKTIF",
          permissions: formPermissions,
          updatedAt: serverTimestamp()
        });

        const afterState = JSON.stringify({
          role: formRole,
          statusAkun: formStatus,
          scope: parsedScope,
          tenantId: targetTenant,
          permissionsCount: formPermissions.length
        });

        // Audit Logging
        if (editingUser.role !== formRole) {
          await writeAuditLog({
            action: "USER_ROLE_CHANGED",
            module: "USER_MANAGEMENT",
            entityType: "USER",
            entityId: emailKey,
            userId: currentUser?.userId || currentUser?.uid,
            userName: currentUser?.name,
            userRole: currentUser?.role,
            beforeState: String(editingUser.role),
            afterState: String(formRole),
            reason: `Perubahan role user ${emailKey} oleh Admin`,
            tenantId: targetTenant
          });
        }

        if (JSON.stringify(editingUser.permissions) !== JSON.stringify(formPermissions)) {
          await writeAuditLog({
            action: "USER_PERMISSION_CHANGED",
            module: "USER_MANAGEMENT",
            entityType: "USER",
            entityId: emailKey,
            userId: currentUser?.userId || currentUser?.uid,
            userName: currentUser?.name,
            userRole: currentUser?.role,
            beforeState: `${editingUser.permissions.length} Permissions`,
            afterState: `${formPermissions.length} Permissions`,
            reason: `Perubahan hak akses granular user ${emailKey}`,
            tenantId: targetTenant
          });
        }

        if (JSON.stringify(editingUser.scope) !== JSON.stringify(parsedScope)) {
          await writeAuditLog({
            action: "USER_SCOPE_CHANGED",
            module: "USER_MANAGEMENT",
            entityType: "USER",
            entityId: emailKey,
            userId: currentUser?.userId || currentUser?.uid,
            userName: currentUser?.name,
            userRole: currentUser?.role,
            beforeState: JSON.stringify(editingUser.scope),
            afterState: JSON.stringify(parsedScope),
            reason: `Perubahan scope instalasi user ${emailKey}`,
            tenantId: targetTenant
          });
        }

        if (editingUser.statusAkun !== formStatus) {
          const act = formStatus === "AKTIF" ? "USER_ACTIVATED" : "USER_DEACTIVATED";
          await writeAuditLog({
            action: act,
            module: "USER_MANAGEMENT",
            entityType: "USER",
            entityId: emailKey,
            userId: currentUser?.userId || currentUser?.uid,
            userName: currentUser?.name,
            userRole: currentUser?.role,
            beforeState: editingUser.statusAkun,
            afterState: formStatus,
            reason: `Perubahan status akun user ${emailKey} dari ${editingUser.statusAkun} ke ${formStatus}`,
            tenantId: targetTenant
          });
        }

        setSuccessMsg(`User ${formName} (${emailKey}) berhasil diperbarui.`);
      } else {
        // CREATE NEW USER
        checkPermissionOrThrow(currentUser, PERMISSIONS.USER_CREATE, {
          resource: `USER/${emailKey}`,
          action: "CREATE_USER_PROFILE",
          tenantId: targetTenant
        });

        const newUid = `usr-${Date.now().toString(36)}`;

        const newUserPayload = {
          uid: newUid,
          userId: newUid,
          nip: formNip.trim() || "-",
          name: formName.trim(),
          email: emailKey,
          whatsapp: formWhatsapp.trim() || "-",
          role: formRole,
          tenantId: targetTenant,
          scope: parsedScope,
          statusAkun: formStatus,
          active: formStatus === "AKTIF",
          permissions: formPermissions,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        await setDoc(doc(db, "users", emailKey), newUserPayload);

        await writeAuditLog({
          action: "USER_CREATED",
          module: "USER_MANAGEMENT",
          entityType: "USER",
          entityId: emailKey,
          userId: currentUser?.userId || currentUser?.uid,
          userName: currentUser?.name,
          userRole: currentUser?.role,
          afterState: JSON.stringify({ role: formRole, status: formStatus, tenant: targetTenant }),
          reason: `Pendaftaran akun user baru: ${formName} (${emailKey})`,
          tenantId: targetTenant
        });

        setSuccessMsg(`User baru ${formName} (${emailKey}) berhasil ditambahkan.`);
      }

      setIsModalOpen(false);
    } catch (err: any) {
      console.error("Save user error:", err);
      setErrorMsg(err.message || "Gagal menyimpan data user.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (user: UserProfile) => {
    try {
      if (user.email === currentUser?.email) {
        throw new Error("AKSES DITOLAK: Anda tidak diperbolehkan menonaktifkan akun Anda sendiri.");
      }

      const targetAction = user.statusAkun === "AKTIF" ? PERMISSIONS.USER_DEACTIVATE : PERMISSIONS.USER_EDIT;
      checkPermissionOrThrow(currentUser, targetAction, {
        resource: `USER/${user.email}`,
        action: "TOGGLE_USER_STATUS",
        tenantId: user.tenantId || ""
      });

      const nextStatus: AccountStatus = user.statusAkun === "AKTIF" ? "NONAKTIF" : "AKTIF";

      await updateDoc(doc(db, "users", user.email), {
        statusAkun: nextStatus,
        active: nextStatus === "AKTIF",
        updatedAt: serverTimestamp()
      });

      const auditAction = nextStatus === "AKTIF" ? "USER_ACTIVATED" : "USER_DEACTIVATED";

      await writeAuditLog({
        action: auditAction,
        module: "USER_MANAGEMENT",
        entityType: "USER",
        entityId: user.email,
        userId: currentUser?.userId || currentUser?.uid,
        userName: currentUser?.name,
        userRole: currentUser?.role,
        beforeState: user.statusAkun,
        afterState: nextStatus,
        reason: `Pengubahan status akun ${user.email} menjadi ${nextStatus}`,
        tenantId: user.tenantId || ""
      });

      setSuccessMsg(`Status akun ${user.name} diubah menjadi ${nextStatus}`);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal mengubah status akun.");
    }
  };

  const handleSendResetPassword = async (email: string) => {
    try {
      checkPermissionOrThrow(currentUser, PERMISSIONS.USER_EDIT, {
        resource: `USER/${email}`,
        action: "SEND_PASSWORD_RESET",
        tenantId: currentUser?.tenantId || ""
      });

      const authObj = getAuth();
      await sendPasswordResetEmail(authObj, email);
      setSuccessMsg(`Link reset password telah dikirim ke email ${email}`);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal mengirim link reset password.");
    }
  };

  // Filtered Users
  const currentTenant = currentUser?.tenantId || "";

  const filteredUsers = users.filter((u) => {
    const uTenant = u.tenantId || "";
    const matchTenant = currentTenant === uTenant || currentUser?.email === "cssdrsudbenda@gmail.com";

    const matchSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.nip.toLowerCase().includes(searchQuery.toLowerCase());

    const matchRole = roleFilter === "ALL" || normalizeRole(u.role) === roleFilter;
    const matchStatus = statusFilter === "ALL" || u.statusAkun === statusFilter;

    return matchTenant && matchSearch && matchRole && matchStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sky-400 font-semibold text-sm mb-1 uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              <span>Otorisasi Server-Side & Manajemen Akses Pengguna</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-100">Manajemen User, Role & Permission</h1>
            <p className="text-slate-400 text-sm mt-1">
              Kelola profil staff, penetapan Role baseline, hak akses granular (Permission), Scope Instalasi, dan status akun terisolasi Multi-Tenant.
            </p>
          </div>

          {hasPermission(currentUser, PERMISSIONS.USER_CREATE) && (
            <button
              onClick={openAddModal}
              className="px-4 py-2.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-semibold rounded-xl shadow-lg flex items-center justify-center gap-2 text-sm transition-all active:scale-[0.98] cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Tambah User Baru</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Controls & Search Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama, email, NIP..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl text-xs text-slate-400">
            <Filter className="w-3.5 h-3.5" />
            <span>Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none"
            >
              <option value="ALL">Semua Role</option>
              <option value="ADMIN">ADMIN</option>
              <option value="PETUGAS_CSSD">PETUGAS_CSSD</option>
              <option value="PENGAWAS">PENGAWAS</option>
              <option value="PETUGAS_INSTALASI">PETUGAS_INSTALASI</option>
              <option value="VIEWER">VIEWER</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl text-xs text-slate-400">
            <span>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none"
            >
              <option value="ALL">Semua Status</option>
              <option value="AKTIF">AKTIF</option>
              <option value="NONAKTIF">NONAKTIF</option>
              <option value="DITANGGUHKAN">DITANGGUHKAN</option>
            </select>
          </div>
        </div>
      </div>

      {/* User Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/80 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Pengguna / NIP</th>
                <th className="py-3.5 px-4">Role Baseline</th>
                <th className="py-3.5 px-4">Tenant / Rumah Sakit</th>
                <th className="py-3.5 px-4">Scope Instalasi</th>
                <th className="py-3.5 px-4">Permissions</th>
                <th className="py-3.5 px-4">Status Akun</th>
                <th className="py-3.5 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Tidak ada pengguna yang sesuai dengan kriteria pencarian.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const normRole = normalizeRole(u.role);
                  return (
                    <tr key={u.email} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-sky-400 shrink-0 uppercase">
                            {u.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-100">{u.name}</div>
                            <div className="text-xs text-slate-400 font-mono">{u.email}</div>
                            <div className="text-[11px] text-slate-500 font-mono">NIP: {u.nip}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${
                            normRole === "ADMIN"
                              ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                              : normRole === "PENGAWAS"
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                              : normRole === "PETUGAS_CSSD"
                              ? "bg-sky-500/10 border-sky-500/30 text-sky-400"
                              : normRole === "PETUGAS_INSTALASI"
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                              : "bg-slate-800 border-slate-700 text-slate-400"
                          }`}
                        >
                          {normRole}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-xs text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-500" />
                          <span>{u.tenantId || "-"}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-xs">
                        {Array.isArray(u.scope) ? (
                          <span className="text-emerald-400 font-semibold">{u.scope.join(", ")}</span>
                        ) : (
                          <span className="text-sky-400 font-semibold">{u.scope || "ALL"}</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-md text-xs font-mono text-slate-300">
                          {u.permissions?.length || 0} Izin Active
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                            u.statusAkun === "AKTIF"
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                              : u.statusAkun === "DITANGGUHKAN"
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                              : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                          }`}
                        >
                          {u.statusAkun === "AKTIF" ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5" />
                          )}
                          <span>{u.statusAkun}</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {hasPermission(currentUser, PERMISSIONS.USER_EDIT) && (
                            <button
                              onClick={() => openEditModal(u)}
                              title="Edit User & Permissions"
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}

                          {hasPermission(currentUser, PERMISSIONS.USER_DEACTIVATE) && (
                            <button
                              onClick={() => handleToggleStatus(u)}
                              title={u.statusAkun === "AKTIF" ? "Nonaktifkan Akun" : "Aktifkan Akun"}
                              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                u.statusAkun === "AKTIF"
                                  ? "bg-rose-500/10 hover:bg-rose-500/20 text-rose-400"
                                  : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400"
                              }`}
                            >
                              {u.statusAkun === "AKTIF" ? <Lock className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                            </button>
                          )}

                          <button
                            onClick={() => handleSendResetPassword(u.email)}
                            title="Kirim Reset Password Email"
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 rounded-lg transition-colors cursor-pointer"
                          >
                            <Key className="w-4 h-4" />
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

      {/* Modal Add / Edit User */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-2xl shadow-2xl space-y-6 my-8 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-sky-500/10 text-sky-400 rounded-xl">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-100">
                      {editingUser ? `Edit User: ${editingUser.name}` : "Tambah User Baru"}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Konfigurasi identitas, Role baseline, Scope, dan Hak Akses Granular (Permission).
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-slate-500 hover:text-slate-300 p-1 rounded-lg"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveUser} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                      Email (Gmail) <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      disabled={!!editingUser}
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      placeholder="petugas@gmail.com"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 disabled:opacity-50 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                      Nama Lengkap <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Nama Petugas"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">NIP / ID Pegawai</label>
                    <input
                      type="text"
                      value={formNip}
                      onChange={(e) => setFormNip(e.target.value)}
                      placeholder="199010..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">WhatsApp / HP</label>
                    <input
                      type="text"
                      value={formWhatsapp}
                      onChange={(e) => setFormWhatsapp(e.target.value)}
                      placeholder="0812..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                      Role Baseline <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={formRole}
                      onChange={(e) => handleRoleChangeInForm(e.target.value as RoleType)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500 font-semibold"
                    >
                      <option value="ADMIN">ADMIN (Akses Penuh)</option>
                      <option value="PETUGAS_CSSD">PETUGAS_CSSD (Operasional Sterilisasi)</option>
                      <option value="PENGAWAS">PENGAWAS (Supervisor / Opname / Monitoring)</option>
                      <option value="PETUGAS_INSTALASI">PETUGAS_INSTALASI (Unit Ruangan)</option>
                      <option value="VIEWER">VIEWER (Read-Only)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                      Status Akun <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as AccountStatus)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500 font-semibold"
                    >
                      <option value="AKTIF">AKTIF</option>
                      <option value="NONAKTIF">NONAKTIF</option>
                      <option value="DITANGGUHKAN">DITANGGUHKAN</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                      Tenant ID (Isolasi Rumah Sakit)
                    </label>
                    <input
                      type="text"
                      value={formTenantId}
                      onChange={(e) => setFormTenantId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                      Scope Instalasi (Contoh: ALL / IGD, OK, IBS)
                    </label>
                    <input
                      type="text"
                      value={formScope}
                      onChange={(e) => setFormScope(e.target.value)}
                      placeholder="ALL atau IGD, OK"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                    />
                  </div>
                </div>

                {/* Granular Permissions Checklist */}
                <div className="border-t border-slate-800 pt-4 mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Granular Permissions ({formPermissions.length} / {ALL_PERMISSIONS.length})
                    </label>
                    <button
                      type="button"
                      onClick={() => setFormPermissions(getDefaultPermissions(formRole))}
                      className="text-xs text-sky-400 hover:underline cursor-pointer"
                    >
                      Reset ke Default Role
                    </button>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 max-h-48 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    {ALL_PERMISSIONS.map((perm) => {
                      const checked = formPermissions.includes(perm);
                      const isCritical = perm === PERMISSIONS.KOREKSI_INVENTARIS || perm === PERMISSIONS.HOLD_RELEASE_APPROVE;
                      return (
                        <label
                          key={perm}
                          className={`flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer ${
                            checked
                              ? isCritical
                                ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                                : "bg-sky-500/10 border-sky-500/30 text-sky-300"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePermissionInForm(perm)}
                            className="rounded border-slate-700 text-sky-500 focus:ring-sky-500/20"
                          />
                          <span className="font-mono text-[11px] truncate">{perm}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-sm transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-semibold rounded-xl text-sm shadow-lg disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? "Menyimpan..." : editingUser ? "Simpan Perubahan" : "Buat User Baru"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
