import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "./firebase";
import { AuditLog, AuditActionResult } from "../types";

export const AUDIT_STORAGE_KEY = "cssd_demo_audit_logs";

export function formatAuditDate(dateObj?: any): string {
  if (!dateObj) {
    const now = new Date();
    return now.toLocaleString("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).replace(/\./g, ":");
  }

  try {
    const d = dateObj.toDate ? dateObj.toDate() : new Date(dateObj);
    if (isNaN(d.getTime())) return String(dateObj);
    return d.toLocaleString("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).replace(/\./g, ":");
  } catch {
    return String(dateObj);
  }
}

export function generateAuditLogId(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  return `LOG-${yyyy}${mm}${dd}-${randomSuffix}`;
}

export function getStoredDemoAuditLogs(tenantId?: string): AuditLog[] {
  try {
    const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (tenantId) {
          return parsed.filter(log => log.tenantId === tenantId);
        }
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Failed to load demo audit logs from localStorage:", e);
  }

  if (tenantId) {
    const initial = getInitialSeedAuditLogs(tenantId);
    saveDemoAuditLogs(initial);
    return initial;
  }

  return [];
}

export function saveDemoAuditLogs(logs: AuditLog[]) {
  try {
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(logs));
  } catch (e) {
    console.warn("Failed to save demo audit logs to localStorage:", e);
  }
}

/**
 * Write an append-only Audit Log.
 * Writes to Firestore audit_logs collection and updates demo localStorage.
 */
export async function writeAuditLog(params: Partial<AuditLog>): Promise<AuditLog> {
  if (!params.tenantId) {
    throw new Error("TENANT_CONTEXT_REQUIRED");
  }
  const nowISO = new Date().toISOString();
  const nowFormatted = formatAuditDate(new Date());
  const newId = params.id || generateAuditLogId();

  const auditEntry: AuditLog = {
    id: newId,
    timestamp: nowISO,
    timestampStr: nowFormatted,
    tenantId: params.tenantId,
    installationId: params.installationId || "CSSD",
    userId: params.userId || "USR-OPERATOR",
    userName: params.userName || "Petugas CSSD",
    userRole: params.userRole || "PETUGAS_CSSD",
    action: params.action || "UNKNOWN_ACTION",
    module: params.module || "SYSTEM",
    entityType: params.entityType || "SYSTEM",
    entityId: params.entityId || newId,
    instrumentId: params.instrumentId || "",
    transactionId: params.transactionId || "",
    ticketId: params.ticketId || "",
    beforeState: params.beforeState || "-",
    afterState: params.afterState || "-",
    beforeLocation: params.beforeLocation || "-",
    afterLocation: params.afterLocation || "-",
    reason: params.reason || "-",
    referenceId: params.referenceId || "",
    result: params.result || "SUCCESS",
    deviceInfo: params.deviceInfo || "Web Thermal MP-58 / Chrome Browser"
  };

  // 1. Try writing to Firestore (audit_logs and canonical log_audit)
  try {
    const docData = {
      ...auditEntry,
      timestamp: serverTimestamp()
    };
    await addDoc(collection(db, "audit_logs"), docData);
    try {
      await addDoc(collection(db, "log_audit"), docData);
    } catch {
      // Ignore if secondary alias fails
    }
  } catch (err) {
    console.warn("Firestore audit log write fallback to local demo store:", err);
  }

  // 2. Always persist to demo localStorage store for append-only view consistency
  const currentDemoLogs = getStoredDemoAuditLogs(params.tenantId);
  currentDemoLogs.unshift(auditEntry);
  saveDemoAuditLogs(currentDemoLogs);

  return auditEntry;
}

/**
 * Rich Initial Seed Audit Trail representing realistic history,
 * including complete lifecycle of ST-HECST01-IGD1 (Hecting Set #01 IGD).
 */
export function getInitialSeedAuditLogs(tenantId: string): AuditLog[] {
  return [
    {
      id: "LOG-20260803-000105",
      timestamp: "2026-08-03T16:30:00.000Z",
      timestampStr: "03/08/2026 16:30:00",
      tenantId: tenantId,
      installationId: "CSSD",
      userId: "USR-001",
      userName: "Administrator",
      userRole: "ADMIN",
      action: "CORRECTION",
      module: "SYSTEM",
      entityType: "AUDIT",
      entityId: "LOG-20260803-000080",
      instrumentId: "ST-HECST01-IGD1",
      transactionId: "TX-CORR-001",
      ticketId: "-",
      beforeState: "Distributed to IGD",
      afterState: "Distributed to IGD (Note Clarified)",
      beforeLocation: "Loket Distribusi",
      afterLocation: "IGD Ruang Tindakan",
      reason: "Koreksi catatan verifikasi serah terima fisik set oleh perawat IGD",
      referenceId: "LOG-20260803-000080",
      result: "SUCCESS",
      deviceInfo: "Chrome / Windows 11 Desktop (Admin PC)"
    },
    {
      id: "LOG-20260803-000095",
      timestamp: "2026-08-03T15:45:00.000Z",
      timestampStr: "03/08/2026 15:45:00",
      tenantId: tenantId,
      installationId: "CSSD",
      userId: "USR-002",
      userName: "Ahmad Yani",
      userRole: "PETUGAS_CSSD",
      action: "SCAN_REJECTED",
      module: "PENERIMAAN",
      entityType: "RECEIVING",
      entityId: "REC-20260803-009",
      instrumentId: "ST-HECST01-IGD1",
      transactionId: "TX-SCAN-REJ-04",
      ticketId: "-",
      beforeState: "Penerimaan Selesai",
      afterState: "Ditolak (Duplicate Scan)",
      beforeLocation: "Loket Penerimaan",
      afterLocation: "Loket Penerimaan",
      reason: "Scan Ditolak: Instrumen sudah berada di area Dekontaminasi CSSD",
      referenceId: "REC-20260803-001",
      result: "REJECTED",
      deviceInfo: "Barcode Scanner Zebra DS2208"
    },
    {
      id: "LOG-20260803-000080",
      timestamp: "2026-08-03T14:20:00.000Z",
      timestampStr: "03/08/2026 14:20:00",
      tenantId: tenantId,
      installationId: "IGD",
      userId: "USR-003",
      userName: "Siti Rahma",
      userRole: "PETUGAS_INSTALASI",
      action: "DISTRIBUTE",
      module: "DISTRIBUSI",
      entityType: "DISTRIBUTION",
      entityId: "DST-20260803-012",
      instrumentId: "ST-HECST01-IGD1",
      transactionId: "TX-DST-9912",
      ticketId: "TCK-58-0091",
      beforeState: "Sterile Storage (Ready)",
      afterState: "Distributed to IGD",
      beforeLocation: "RAK-A1 (Penyimpanan Steril)",
      afterLocation: "IGD Ruang Tindakan",
      reason: "Penyerahan instrumen steril ke perawat IGD via Tiket Thermal MP-58",
      referenceId: "LOT-20260803-001",
      result: "SUCCESS",
      deviceInfo: "Thermal Printer VSC MP-58 C (ESC/POS Bluetooth)"
    },
    {
      id: "LOG-20260803-000072",
      timestamp: "2026-08-03T11:10:00.000Z",
      timestampStr: "03/08/2026 11:10:00",
      tenantId: tenantId,
      installationId: "CSSD",
      userId: "USR-002",
      userName: "Ahmad Yani",
      userRole: "PETUGAS_CSSD",
      action: "MOVE_TO_RACK",
      module: "RAK",
      entityType: "INVENTORY",
      entityId: "STK-20260803-01",
      instrumentId: "ST-HECST01-IGD1",
      transactionId: "TX-RAK-8812",
      ticketId: "-",
      beforeState: "Sterilization Pass",
      afterState: "Sterile Storage (Ready)",
      beforeLocation: "Mesin BUMA Sterilizer #01",
      afterLocation: "RAK-A1 (Penyimpanan Steril)",
      reason: "Pemindahan instrumen steril pasca sterilisasi ke Rak Penyimpanan",
      referenceId: "LOT-20260803-001",
      result: "SUCCESS",
      deviceInfo: "Mobile Scanner Handheld"
    },
    {
      id: "LOG-20260803-000065",
      timestamp: "2026-08-03T09:30:00.000Z",
      timestampStr: "03/08/2026 09:30:00",
      tenantId: tenantId,
      installationId: "CSSD",
      userId: "USR-002",
      userName: "Ahmad Yani",
      userRole: "PETUGAS_CSSD",
      action: "STERILIZATION_PASS",
      module: "STERILISASI",
      entityType: "STERILIZATION",
      entityId: "STR-20260803-005",
      instrumentId: "ST-HECST01-IGD1",
      transactionId: "TX-STR-3301",
      ticketId: "-",
      beforeState: "Packaging Complete",
      afterState: "Sterilization Pass",
      beforeLocation: "Ruang Pengemasan",
      afterLocation: "Mesin BUMA Sterilizer #01",
      reason: "Proses Autoclave Steam 134°C 3.5 Bar selesai (Indikator Kimia & Biologi Lolos)",
      referenceId: "LOT-20260803-001",
      result: "SUCCESS",
      deviceInfo: "BUMA STERILIZER VACUM (Siklus #14)"
    },
    {
      id: "LOG-20260803-000050",
      timestamp: "2026-08-03T08:15:00.000Z",
      timestampStr: "03/08/2026 08:15:00",
      tenantId: tenantId,
      installationId: "CSSD",
      userId: "USR-002",
      userName: "Ahmad Yani",
      userRole: "PETUGAS_CSSD",
      action: "PACKING_PASS",
      module: "PACKING",
      entityType: "INSTRUMENT",
      entityId: "PCK-20260803-002",
      instrumentId: "ST-HECST01-IGD1",
      transactionId: "TX-PCK-1120",
      ticketId: "-",
      beforeState: "Decontamination Passed",
      afterState: "Packaging Complete",
      beforeLocation: "Ruang Dekontaminasi",
      afterLocation: "Ruang Pengemasan",
      reason: "Pengemasan dengan Sterilization Pouch + Indikator Internal berhasil & cetak label Lot",
      referenceId: "LOT-20260803-001",
      result: "SUCCESS",
      deviceInfo: "Sealer Machine & Thermal Label Printer"
    },
    {
      id: "LOG-20260803-000035",
      timestamp: "2026-08-03T07:40:00.000Z",
      timestampStr: "03/08/2026 07:40:00",
      tenantId: tenantId,
      installationId: "CSSD",
      userId: "USR-002",
      userName: "Ahmad Yani",
      userRole: "PETUGAS_CSSD",
      action: "COMPLETE_DECONTAMINATION",
      module: "DEKONTAMINASI",
      entityType: "INSTRUMENT",
      entityId: "DEC-20260803-001",
      instrumentId: "ST-HECST01-IGD1",
      transactionId: "TX-DEC-0041",
      ticketId: "-",
      beforeState: "Received / Dirty",
      afterState: "Decontamination Passed",
      beforeLocation: "Loket Penerimaan",
      afterLocation: "Ruang Dekontaminasi",
      reason: "Pencucian enzimatik, disinfeksi, dan pembilasan air murni selesai tanpa residu",
      referenceId: "REC-20260803-001",
      result: "SUCCESS",
      deviceInfo: "Ultrasonic Washer & Manual Basin"
    },
    {
      id: "LOG-20260803-000020",
      timestamp: "2026-08-03T07:15:00.000Z",
      timestampStr: "03/08/2026 07:15:00",
      tenantId: tenantId,
      installationId: "IGD",
      userId: "USR-002",
      userName: "Ahmad Yani",
      userRole: "PETUGAS_CSSD",
      action: "CONFIRM_RECEIVING",
      module: "PENERIMAAN",
      entityType: "RECEIVING",
      entityId: "REC-20260803-001",
      instrumentId: "ST-HECST01-IGD1",
      transactionId: "TX-REC-7712",
      ticketId: "TCK-58-0001",
      beforeState: "In Use (Dirty at IGD)",
      afterState: "Received / Dirty",
      beforeLocation: "IGD Ruang Tindakan",
      afterLocation: "Loket Penerimaan CSSD",
      reason: "Penerimaan fisik instrumen kotor dari IGD (1 Set Hecting lengkap 8 komponen)",
      referenceId: "LOT-20260803-001",
      result: "SUCCESS",
      deviceInfo: "Loket Touch Screen PC & Esc/Pos Thermal Printer"
    },
    {
      id: "LOG-20260801-000001",
      timestamp: "2026-08-01T08:00:00.000Z",
      timestampStr: "01/08/2026 08:00:00",
      tenantId: tenantId,
      installationId: "CSSD",
      userId: "USR-001",
      userName: "Administrator",
      userRole: "ADMIN",
      action: "MASTER_INSTRUMENT_CREATED",
      module: "MASTER",
      entityType: "INSTRUMENT",
      entityId: "ST-HECST01-IGD1",
      instrumentId: "ST-HECST01-IGD1",
      transactionId: "TX-MST-0001",
      ticketId: "-",
      beforeState: "Non-Existent",
      afterState: "Registered / Active",
      beforeLocation: "-",
      afterLocation: "IGD (Instalasi Pemilik)",
      reason: "Registrasi awal Master Instrumen Set Hecting Standar IGD (8 Komponen)",
      referenceId: "SKU-HEC-ST-01",
      result: "SUCCESS",
      deviceInfo: "Chrome Browser / Admin Console"
    }
  ];
}
