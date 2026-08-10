import { UserProfile, RoleType, AccountStatus } from "../types";
import { writeAuditLog } from "./auditLogger";

/**
 * Legacy compatibility only.
 * DO NOT use this as a fallback for operational users.
 */
export const LEGACY_BOOTSTRAP_TENANT_ID = "RSUD-BENDA";

// Permission Constants
export const PERMISSIONS = {
  // Master Instrument
  MASTER_INSTRUMEN_VIEW: "MASTER_INSTRUMEN_VIEW",
  MASTER_INSTRUMEN_CREATE: "MASTER_INSTRUMEN_CREATE",
  MASTER_INSTRUMEN_EDIT: "MASTER_INSTRUMEN_EDIT",
  MASTER_INSTRUMEN_DEACTIVATE: "MASTER_INSTRUMEN_DEACTIVATE",

  // Official Inventory & Correction
  INVENTARIS_VIEW: "INVENTARIS_VIEW",
  INVENTARIS_REGISTER: "INVENTARIS_REGISTER",
  KOREKSI_INVENTARIS: "KOREKSI_INVENTARIS",

  // Receiving
  PENERIMAAN_VIEW: "PENERIMAAN_VIEW",
  PENERIMAAN_CREATE: "PENERIMAAN_CREATE",
  PENERIMAAN_CONFIRM: "PENERIMAAN_CONFIRM",
  PENERIMAAN_VOID: "PENERIMAAN_VOID",

  // Operations
  DEKONTAMINASI_PROCESS: "DEKONTAMINASI_PROCESS",
  PACKING_PROCESS: "PACKING_PROCESS",
  STERILISASI_PROCESS: "STERILISASI_PROCESS",

  // Storage
  STORAGE_VIEW: "STORAGE_VIEW",
  STORAGE_MOVE: "STORAGE_MOVE",

  // Distribution & Return
  DISTRIBUSI_CREATE: "DISTRIBUSI_CREATE",
  DISTRIBUSI_CONFIRM: "DISTRIBUSI_CONFIRM",
  RETURN_CREATE: "RETURN_CREATE",

  // Hold / Quarantine
  HOLD_CREATE: "HOLD_CREATE",
  HOLD_RELEASE_REQUEST: "HOLD_RELEASE_REQUEST",
  HOLD_RELEASE_APPROVE: "HOLD_RELEASE_APPROVE",

  // Recall
  RECALL_CREATE: "RECALL_CREATE",
  RECALL_PROCESS: "RECALL_PROCESS",
  RECALL_APPROVE: "RECALL_APPROVE",

  // Stock Opname
  STOCK_OPNAME_VIEW: "STOCK_OPNAME_VIEW",
  STOCK_OPNAME_CREATE: "STOCK_OPNAME_CREATE",
  STOCK_OPNAME_CLARIFY: "STOCK_OPNAME_CLARIFY",

  // Audit
  AUDIT_VIEW: "AUDIT_VIEW",
  AUDIT_EXPORT: "AUDIT_EXPORT",

  // Report
  REPORT_VIEW: "REPORT_VIEW",
  REPORT_EXPORT: "REPORT_EXPORT",

  // User Management
  USER_VIEW: "USER_VIEW",
  USER_CREATE: "USER_CREATE",
  USER_EDIT: "USER_EDIT",
  USER_DEACTIVATE: "USER_DEACTIVATE",

  // Tenant Management
  TENANT_VIEW: "TENANT_VIEW",
  TENANT_CREATE: "TENANT_CREATE",
  TENANT_EDIT: "TENANT_EDIT",

  // BMHP & Linen
  BMHP_VIEW: "BMHP_VIEW",
  BMHP_CREATE: "BMHP_CREATE",
  BMHP_EDIT: "BMHP_EDIT",
  BMHP_STOK_ADJUST: "BMHP_STOK_ADJUST",
  BMHP_REQUEST_CREATE: "BMHP_REQUEST_CREATE",
  BMHP_REQUEST_APPROVE: "BMHP_REQUEST_APPROVE",
  BMHP_DISTRIBUTE: "BMHP_DISTRIBUTE",
  BMHP_RETURN: "BMHP_RETURN",

  LINEN_VIEW: "LINEN_VIEW",
  LINEN_CREATE: "LINEN_CREATE",
  LINEN_REQUEST_CREATE: "LINEN_REQUEST_CREATE",
  LINEN_DISTRIBUTE: "LINEN_DISTRIBUTE",
  LINEN_RETURN: "LINEN_RETURN",

  // Machine Management & Bowie-Dick
  MESIN_VIEW: "MESIN_VIEW",
  MESIN_CREATE: "MESIN_CREATE",
  MESIN_EDIT: "MESIN_EDIT",
  MESIN_STATUS_CHANGE: "MESIN_STATUS_CHANGE",
  BOWIE_DICK_CREATE: "BOWIE_DICK_CREATE",
  BOWIE_DICK_VIEW: "BOWIE_DICK_VIEW",
  STERILIZATION_MACHINE_USE: "STERILIZATION_MACHINE_USE",
  STERILIZATION_RESULT_CREATE: "STERILIZATION_RESULT_CREATE",
  STERILIZATION_RESULT_REVIEW: "STERILIZATION_RESULT_REVIEW",

  // Approvals
  APPROVAL_EXECUTE: "APPROVAL_EXECUTE"
} as const;

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

/**
 * Standard Default Role -> Permissions Mapping
 */
export function getDefaultPermissions(roleInput: string): string[] {
  const role = normalizeRole(roleInput);

  switch (role) {
    case "ADMIN":
      return [...ALL_PERMISSIONS];

    case "PETUGAS_CSSD":
      return [
        PERMISSIONS.PENERIMAAN_VIEW,
        PERMISSIONS.PENERIMAAN_CREATE,
        PERMISSIONS.PENERIMAAN_CONFIRM,
        PERMISSIONS.DEKONTAMINASI_PROCESS,
        PERMISSIONS.PACKING_PROCESS,
        PERMISSIONS.STERILISASI_PROCESS,
        PERMISSIONS.STORAGE_VIEW,
        PERMISSIONS.STORAGE_MOVE,
        PERMISSIONS.DISTRIBUSI_CREATE,
        PERMISSIONS.DISTRIBUSI_CONFIRM,
        PERMISSIONS.RETURN_CREATE,
        PERMISSIONS.HOLD_CREATE,
        PERMISSIONS.HOLD_RELEASE_REQUEST,
        PERMISSIONS.RECALL_CREATE,
        PERMISSIONS.RECALL_PROCESS,
        PERMISSIONS.INVENTARIS_VIEW,
        PERMISSIONS.STOCK_OPNAME_VIEW,
        PERMISSIONS.MASTER_INSTRUMEN_VIEW,
        PERMISSIONS.REPORT_VIEW,
        PERMISSIONS.AUDIT_VIEW,
        PERMISSIONS.BMHP_VIEW,
        PERMISSIONS.BMHP_CREATE,
        PERMISSIONS.BMHP_EDIT,
        PERMISSIONS.BMHP_STOK_ADJUST,
        PERMISSIONS.BMHP_REQUEST_APPROVE,
        PERMISSIONS.BMHP_DISTRIBUTE,
        PERMISSIONS.BMHP_RETURN,
        PERMISSIONS.LINEN_VIEW,
        PERMISSIONS.LINEN_CREATE,
        PERMISSIONS.LINEN_DISTRIBUTE,
        PERMISSIONS.LINEN_RETURN,
        PERMISSIONS.MESIN_VIEW,
        PERMISSIONS.MESIN_STATUS_CHANGE,
        PERMISSIONS.BOWIE_DICK_CREATE,
        PERMISSIONS.BOWIE_DICK_VIEW,
        PERMISSIONS.STERILIZATION_MACHINE_USE,
        PERMISSIONS.STERILIZATION_RESULT_CREATE,
        PERMISSIONS.STERILIZATION_RESULT_REVIEW
      ];

    case "PENGAWAS":
      return [
        PERMISSIONS.INVENTARIS_VIEW,
        PERMISSIONS.STOCK_OPNAME_VIEW,
        PERMISSIONS.STOCK_OPNAME_CREATE,
        PERMISSIONS.STOCK_OPNAME_CLARIFY,
        PERMISSIONS.PENERIMAAN_VIEW,
        PERMISSIONS.STORAGE_VIEW,
        PERMISSIONS.HOLD_RELEASE_APPROVE,
        PERMISSIONS.RECALL_APPROVE,
        PERMISSIONS.REPORT_VIEW,
        PERMISSIONS.REPORT_EXPORT,
        PERMISSIONS.AUDIT_VIEW,
        PERMISSIONS.AUDIT_EXPORT,
        PERMISSIONS.APPROVAL_EXECUTE,
        PERMISSIONS.BMHP_VIEW,
        PERMISSIONS.BMHP_REQUEST_APPROVE,
        PERMISSIONS.LINEN_VIEW,
        PERMISSIONS.MESIN_VIEW,
        PERMISSIONS.BOWIE_DICK_VIEW,
        PERMISSIONS.STERILIZATION_RESULT_REVIEW
      ];

    case "PETUGAS_INSTALASI":
      return [
        PERMISSIONS.INVENTARIS_VIEW,
        PERMISSIONS.PENERIMAAN_VIEW,
        PERMISSIONS.DISTRIBUSI_CREATE,
        PERMISSIONS.DISTRIBUSI_CONFIRM,
        PERMISSIONS.RETURN_CREATE,
        PERMISSIONS.RECALL_PROCESS,
        PERMISSIONS.BMHP_VIEW,
        PERMISSIONS.BMHP_REQUEST_CREATE,
        PERMISSIONS.BMHP_RETURN,
        PERMISSIONS.LINEN_VIEW,
        PERMISSIONS.LINEN_REQUEST_CREATE,
        PERMISSIONS.LINEN_RETURN
      ];

    case "VIEWER":
      return [
        PERMISSIONS.INVENTARIS_VIEW,
        PERMISSIONS.PENERIMAAN_VIEW,
        PERMISSIONS.STORAGE_VIEW,
        PERMISSIONS.REPORT_VIEW,
        PERMISSIONS.AUDIT_VIEW
      ];

    default:
      return [PERMISSIONS.INVENTARIS_VIEW, PERMISSIONS.REPORT_VIEW];
  }
}

/**
 * Normalizes input role string to Official RoleType
 */
export function normalizeRole(roleInput?: string): RoleType {
  if (!roleInput) return "PETUGAS_CSSD";
  const upper = roleInput.toUpperCase().trim();

  if (upper === "PLATFORM_ADMIN" || upper === "SUPER_ADMIN" || upper === "PLATFORM") return "PLATFORM_ADMIN";
  if (upper === "ADMIN" || upper === "ADMINISTRATOR") return "ADMIN";
  if (upper === "PETUGAS_CSSD" || upper === "OPERATOR" || upper === "CSSD") return "PETUGAS_CSSD";
  if (upper === "PENGAWAS" || upper === "SUPERVISOR") return "PENGAWAS";
  if (upper === "PETUGAS_INSTALASI" || upper === "RUANGAN" || upper === "INSTALASI") return "PETUGAS_INSTALASI";
  if (upper === "VIEWER" || upper === "TAMU") return "VIEWER";

  return "PETUGAS_CSSD";
}

/**
 * Normalizes account status
 */
export function normalizeAccountStatus(statusInput?: string, activeInput?: boolean): AccountStatus {
  if (statusInput) {
    const s = statusInput.toUpperCase().trim();
    if (s === "AKTIF" || s === "NONAKTIF" || s === "DITANGGUHKAN") {
      return s as AccountStatus;
    }
  }
  if (activeInput === false) return "NONAKTIF";
  return "AKTIF";
}

/**
 * Checks if user is currently ACTIVE
 */
export function isUserActive(user: UserProfile | null): boolean {
  if (!user) return false;
  const status = normalizeAccountStatus(user.statusAkun, user.active);
  return status === "AKTIF";
}

export function hasValidTenantContext(user: UserProfile | null): boolean {
  return Boolean(
    user &&
    isUserActive(user) &&
    typeof user.tenantId === "string" &&
    user.tenantId.trim().length > 0
  );
}

export function requireTenantId(user: UserProfile | null): string {
  if (!hasValidTenantContext(user)) {
    throw new Error("TENANT_CONTEXT_REQUIRED");
  }
  return user!.tenantId.trim();
}

/**
 * Checks if user has a specific granular permission
 */
export function hasPermission(user: UserProfile | null, permission: string): boolean {
  if (!user) return false;
  if (!isUserActive(user)) return false;

  const role = normalizeRole(user.role);
  if (role === "ADMIN" || role === "PLATFORM_ADMIN") return true;

  const userPerms = user.permissions || getDefaultPermissions(role);
  return userPerms.includes(permission);
}

/**
 * Verifies scope access for Petugas Instalasi
 */
export function canAccessInstallation(user: UserProfile | null, installationId: string): boolean {
  if (!user) return false;
  if (!isUserActive(user)) return false;

  const role = normalizeRole(user.role);
  if (role === "ADMIN" || role === "PETUGAS_CSSD" || role === "PENGAWAS") return true;

  if (!user.scope || user.scope === "ALL") return true;
  if (Array.isArray(user.scope)) {
    if (user.scope.includes("ALL")) return true;
    return user.scope.includes(installationId);
  }
  return String(user.scope) === installationId;
}

/**
 * Verifies tenant isolation
 */
export function canAccessTenant(user: UserProfile | null, targetTenantId: string): boolean {
  if (!hasValidTenantContext(user)) {
    return false;
  }

  if (!targetTenantId || !targetTenantId.trim()) {
    return false;
  }

  const role = normalizeRole(user?.role);
  if (role === "PLATFORM_ADMIN") {
    return true;
  }

  return user!.tenantId.trim() === targetTenantId.trim();
}

/**
 * Enforces permission check server-side / in handler.
 * Throws explicit Error AND logs ACCESS_DENIED or KOREKSI_INVENTARIS_DITOLAK to log_audit if rejected!
 */
export function checkPermissionOrThrow(
  user: UserProfile | null,
  permission: string,
  options?: {
    resource?: string;
    action?: string;
    tenantId?: string;
    installationId?: string;
  }
): void {
  const targetTenant = options?.tenantId?.trim() || (user?.tenantId?.trim() || "");

  if (!user) {
    writeAuditLog({
      action: "ACCESS_DENIED",
      module: "SECURITY",
      entityType: "USER",
      result: "REJECTED",
      reason: `Akses ditolak: Pengguna tidak terautentikasi (meminta permission: ${permission})`,
      tenantId: targetTenant
    }).catch(() => {});

    throw new Error("AKSES DITOLAK: Anda harus login untuk melakukan tindakan ini.");
  }

  if (!isUserActive(user)) {
    writeAuditLog({
      action: "ACCESS_DENIED",
      module: "SECURITY",
      entityType: "USER",
      entityId: user.userId || user.uid,
      userId: user.userId || user.uid,
      userName: user.name,
      userRole: user.role,
      result: "REJECTED",
      reason: `Akses ditolak: Akun ${user.email} berstatus ${user.statusAkun || "NONAKTIF"}`,
      tenantId: targetTenant
    }).catch(() => {});

    throw new Error(`AKSES DITOLAK: Akun Anda berstatus ${user.statusAkun || "NONAKTIF"}. Silakan hubungi Administrator.`);
  }

  if (!hasValidTenantContext(user)) {
    writeAuditLog({
      action: "ACCESS_DENIED",
      module: "SECURITY",
      entityType: "TENANT",
      userId: user.userId || user.uid,
      userName: user.name,
      userRole: user.role,
      result: "REJECTED",
      reason: `Akses ditolak: Context Tenant tidak valid / tidak ada untuk user ${user.email}`,
      tenantId: targetTenant
    }).catch(() => {});

    throw new Error("AKSES DITOLAK: Context Tenant tidak valid.");
  }

  if (!canAccessTenant(user, targetTenant)) {
    writeAuditLog({
      action: "ACCESS_DENIED",
      module: "SECURITY",
      entityType: "TENANT",
      userId: user.userId || user.uid,
      userName: user.name,
      userRole: user.role,
      result: "REJECTED",
      reason: `Akses lintas tenant ditolak: User Tenant (${user.tenantId}) mencoba mengakses Target Tenant (${targetTenant})`,
      tenantId: targetTenant
    }).catch(() => {});

    throw new Error("AKSES DITOLAK: Anda tidak memiliki akses ke data Rumah Sakit / Tenant ini.");
  }

  if (options?.installationId && !canAccessInstallation(user, options.installationId)) {
    writeAuditLog({
      action: "ACCESS_DENIED",
      module: "SECURITY",
      entityType: "INSTALLATION",
      userId: user.userId || user.uid,
      userName: user.name,
      userRole: user.role,
      result: "REJECTED",
      reason: `Akses scope instalasi ditolak: User scope (${JSON.stringify(user.scope)}) tidak mencakup instalasi ${options.installationId}`,
      tenantId: targetTenant
    }).catch(() => {});

    throw new Error(`AKSES DITOLAK: Anda tidak memiliki kewenangan untuk mengakses instalasi ${options.installationId}.`);
  }

  if (!hasPermission(user, permission)) {
    const isCorrectionAttempt = permission === PERMISSIONS.KOREKSI_INVENTARIS;
    const auditAction = isCorrectionAttempt ? "KOREKSI_INVENTARIS_DITOLAK" : "ACCESS_DENIED";

    writeAuditLog({
      action: auditAction,
      module: "SECURITY",
      entityType: "PERMISSION",
      userId: user.userId || user.uid,
      userName: user.name,
      userRole: user.role,
      result: "REJECTED",
      reason: `Akses ditolak: User tidak memiliki permission ${permission} untuk aksi ${options?.action || "MUTATION"} pada resource ${options?.resource || "RESOURCE"}`,
      tenantId: targetTenant
    }).catch(() => {});

    throw new Error(`AKSES DITOLAK: Anda tidak memiliki izin (${permission}) untuk melakukan tindakan ini.`);
  }
}

/**
 * Migration helper for user profiles loaded from database
 */
export function migrateUserProfile(raw: any, uid: string, email: string): UserProfile {
  const normalizedRole = normalizeRole(raw?.role);
  const statusAkun = normalizeAccountStatus(raw?.statusAkun, raw?.active);
  
  const rawTenantId = typeof raw?.tenantId === "string" ? raw.tenantId.trim() : "";
  // Isolation for legacy profile bootstrap migration only
  const tenantId = rawTenantId || LEGACY_BOOTSTRAP_TENANT_ID;
  const scope = raw?.scope || "ALL";

  let permissions = raw?.permissions;
  if (!Array.isArray(permissions) || permissions.length === 0) {
    permissions = getDefaultPermissions(normalizedRole);
  }

  return {
    uid: uid || raw?.uid || raw?.userId || "",
    userId: raw?.userId || raw?.uid || uid,
    nip: raw?.nip || "000000",
    name: raw?.name || raw?.nama || email.split("@")[0] || "User",
    email: email.toLowerCase(),
    whatsapp: raw?.whatsapp || "-",
    role: normalizedRole,
    tenantId,
    scope,
    statusAkun,
    active: statusAkun === "AKTIF",
    permissions,
    photoUrl: raw?.photoUrl || "",
    createdAt: raw?.createdAt || new Date().toISOString(),
    updatedAt: raw?.updatedAt || new Date().toISOString(),
    lastLoginAt: new Date().toISOString()
  };
}
