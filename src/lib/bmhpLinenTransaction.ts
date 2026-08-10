import { 
  doc, 
  collection, 
  getDoc, 
  setDoc, 
  runTransaction, 
  serverTimestamp,
  addDoc 
} from "firebase/firestore";
import { db } from "./firebase";
import { UserProfile, BMHPRequest, BMHPDistribution, BMHPReturn, LinenRequest, LinenReturn, BMHPCatalog, LinenItem } from "../types";
import { checkPermissionOrThrow, PERMISSIONS, requireTenantId } from "./permissions";
import { writeAuditLog } from "./auditLogger";

/**
 * 1. CREATE BMHP REQUEST BY INSTALLATION
 */
export async function createBMHPRequest(params: {
  user: UserProfile | null;
  requestingUnit: string;
  items: { bmhpId: string; bmhpName: string; qtyRequested: number; unit: string }[];
  notes?: string;
  isDemoMode?: boolean;
}): Promise<string> {
  const { user, requestingUnit, items, notes, isDemoMode } = params;
  const tenantId = requireTenantId(user);

  checkPermissionOrThrow(user, PERMISSIONS.BMHP_REQUEST_CREATE, {
    action: "CREATE_BMHP_REQUEST",
    resource: "BMHP_REQUEST",
    tenantId,
    installationId: requestingUnit
  });

  if (!items || items.length === 0) {
    throw new Error("Daftar barang permintaan BMHP tidak boleh kosong.");
  }

  for (const item of items) {
    if (!item.qtyRequested || item.qtyRequested <= 0) {
      throw new Error(`Jumlah permintaan untuk ${item.bmhpName} harus lebih dari 0.`);
    }
  }

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const requestId = `REQ-BMHP-${dateStr}-${randomNum}`;

  const requestData: BMHPRequest = {
    id: requestId,
    tenantId,
    requestingUnit,
    requestedBy: user?.name || "Petugas Instalasi",
    requestedByUserId: user?.userId || user?.uid,
    items,
    status: "DIAJUKAN",
    notes: notes || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (isDemoMode) {
    await writeAuditLog({
      action: "PERMINTAAN_BMHP_DIBUAT",
      module: "BMHP",
      entityType: "BMHP_REQUEST",
      entityId: requestId,
      transactionId: requestId,
      userId: user?.userId || user?.uid || "DEMO",
      userName: user?.name || "Demo User",
      userRole: user?.role || "PETUGAS_INSTALASI",
      tenantId,
      installationId: requestingUnit,
      result: "SUCCESS",
      reason: `Permintaan BMHP ${requestId} berhasil dibuat oleh ${requestingUnit}`
    });
    return requestId;
  }

  await setDoc(doc(db, "bmhp_requests", requestId), requestData);

  await writeAuditLog({
    action: "PERMINTAAN_BMHP_DIBUAT",
    module: "BMHP",
    entityType: "BMHP_REQUEST",
    entityId: requestId,
    transactionId: requestId,
    userId: user?.userId || user?.uid,
    userName: user?.name,
    userRole: user?.role,
    tenantId,
    installationId: requestingUnit,
    result: "SUCCESS",
    reason: `Permintaan BMHP ${requestId} (${items.length} item) berhasil diajukan oleh instalasi ${requestingUnit}`
  });

  return requestId;
}

/**
 * 2. APPROVE / REJECT BMHP REQUEST
 */
export async function approveOrRejectBMHPRequest(params: {
  user: UserProfile | null;
  requestId: string;
  approve: boolean;
  rejectionReason?: string;
  isDemoMode?: boolean;
}): Promise<void> {
  const { user, requestId, approve, rejectionReason, isDemoMode } = params;
  const tenantId = requireTenantId(user);

  checkPermissionOrThrow(user, PERMISSIONS.BMHP_REQUEST_APPROVE, {
    action: approve ? "APPROVE_BMHP_REQUEST" : "REJECT_BMHP_REQUEST",
    resource: "BMHP_REQUEST",
    tenantId
  });

  const reqRef = doc(db, "bmhp_requests", requestId);
  const nowISO = new Date().toISOString();

  if (!isDemoMode) {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(reqRef);
      if (!snap.exists()) {
        throw new Error("BMHP_REQUEST_NOT_FOUND");
      }
      const data = snap.data() as BMHPRequest;
      
      if (data.tenantId && data.tenantId !== tenantId) {
        throw new Error("TENANT_CONTEXT_MISMATCH");
      }

      if (data.status !== "DIAJUKAN") {
        throw new Error(`Permintaan ${requestId} sudah diproses (Status: ${data.status}).`);
      }

      transaction.set(
        reqRef,
        {
          status: approve ? "DISETUJUI" : "DITOLAK",
          approverName: user?.name || "Approver",
          approvedAt: nowISO,
          rejectionReason: rejectionReason || "",
          updatedAt: nowISO
        },
        { merge: true }
      );
    });
  }

  await writeAuditLog({
    action: approve ? "PERMINTAAN_BMHP_DISETUJUI" : "PERMINTAAN_BMHP_DITOLAK",
    module: "BMHP",
    entityType: "BMHP_REQUEST",
    entityId: requestId,
    transactionId: requestId,
    userId: user?.userId || user?.uid,
    userName: user?.name,
    userRole: user?.role,
    tenantId,
    result: "SUCCESS",
    reason: approve
      ? `Permintaan BMHP ${requestId} disetujui oleh ${user?.name}`
      : `Permintaan BMHP ${requestId} ditolak oleh ${user?.name}. Alasan: ${rejectionReason || "-"}`
  });
}

/**
 * 3. FULFILL / DISTRIBUTE BMHP WITH ATOMIC TRANSACTION & EXPIRY CHECK
 */
export async function executeBMHPDistribution(params: {
  user: UserProfile | null;
  requestId?: string;
  targetUnit: string;
  recipientName: string;
  items: { bmhpId: string; bmhpName: string; qty: number; unit: string }[];
  notes?: string;
  isDemoMode?: boolean;
  idempotencyKey?: string;
}): Promise<string> {
  const { user, requestId, targetUnit, recipientName, items, notes, isDemoMode, idempotencyKey } = params;
  const tenantId = requireTenantId(user);

  checkPermissionOrThrow(user, PERMISSIONS.BMHP_DISTRIBUTE, {
    action: "DISTRIBUTE_BMHP",
    resource: "BMHP_DISTRIBUTION",
    tenantId
  });

  if (!items || items.length === 0) {
    throw new Error("Daftar item distribusi BMHP tidak boleh kosong.");
  }

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const distId = idempotencyKey ? `DIS-BMHP-${idempotencyKey}` : `DIS-BMHP-${dateStr}-${randomNum}`;
  const nowISO = new Date().toISOString();

  if (isDemoMode) {
    await writeAuditLog({
      action: "DISTRIBUSI_BMHP",
      module: "BMHP",
      entityType: "BMHP_DISTRIBUTION",
      entityId: distId,
      transactionId: distId,
      userId: user?.userId || user?.uid || "DEMO",
      userName: user?.name || "Demo User",
      userRole: user?.role || "PETUGAS_CSSD",
      tenantId,
      installationId: targetUnit,
      result: "SUCCESS",
      reason: `Distribusi BMHP ${distId} ke ${targetUnit} berhasil (Demo Mode)`
    });
    return distId;
  }

  // Execute atomic transaction for stock validation & deduction
  const txResult = await runTransaction(db, async (transaction) => {
    if (idempotencyKey) {
      const idempotencyRef = doc(db, "transaction_idempotency", `${tenantId}:BMHP_DISTRIBUTION:${idempotencyKey}`);
      const idempotencySnap = await transaction.get(idempotencyRef);
      if (idempotencySnap.exists()) {
        const idenData = idempotencySnap.data();
        if (idenData.tenantId !== tenantId) {
          throw new Error("TENANT_CONTEXT_MISMATCH");
        }
        return { isDuplicate: true, result: idenData.result };
      }
    }

    // 1. Validate request if provided
    let reqData: BMHPRequest | null = null;
    let reqRef = null;
    if (requestId) {
      reqRef = doc(db, "bmhp_requests", requestId);
      const reqSnap = await transaction.get(reqRef);
      if (reqSnap.exists()) {
        reqData = reqSnap.data() as BMHPRequest;
        if (reqData.tenantId && reqData.tenantId !== tenantId) {
          throw new Error("TENANT_CONTEXT_MISMATCH");
        }
      } else {
        throw new Error("BMHP_REQUEST_NOT_FOUND");
      }
    }

    // 2. Validate all items stock & expiry date
    for (const item of items) {
      const catalogRef = doc(db, "bmhp_catalog", item.bmhpId);
      const catalogSnap = await transaction.get(catalogRef);

      if (!catalogSnap.exists()) {
        throw new Error("BMHP_NOT_FOUND");
      }

      const catalogData = catalogSnap.data() as BMHPCatalog;
      if (catalogData.tenantId && catalogData.tenantId !== tenantId) {
        throw new Error("TENANT_CONTEXT_MISMATCH");
      }

      // Check Expiry
      if (catalogData.expirationDate) {
        const expStr = typeof catalogData.expirationDate === "string" 
          ? catalogData.expirationDate 
          : catalogData.expirationDate.toDate 
            ? catalogData.expirationDate.toDate().toISOString() 
            : "";
        
        if (expStr) {
          const expDate = new Date(expStr);
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          if (expDate < today) {
            throw new Error(`DISTRIBUSI DITOLAK: Barang BMHP "${item.bmhpName}" sudah EXPIRED (${expStr.slice(0, 10)}). Tidak boleh didistribusikan!`);
          }
        }
      }

      // Check Stock Quantity
      const currentQty = catalogData.stockQty || 0;
      if (currentQty < item.qty) {
        const shortage = item.qty - currentQty;
        throw new Error(
          `PERMINTAAN TIDAK DAPAT DIPENUHI.\nStok tersedia: ${currentQty} ${catalogData.unit || 'pcs'}\nJumlah diminta: ${item.qty}\nKekurangan: ${shortage}`
        );
      }

      // Deduct stock atomically
      const newStock = currentQty - item.qty;
      transaction.update(catalogRef, {
        stockQty: newStock,
        updatedAt: nowISO
      });

      // Write BMHP log
      const logRef = doc(collection(db, "bmhp_logs"));
      transaction.set(logRef, {
        bmhpId: item.bmhpId,
        bmhpName: item.bmhpName,
        type: "out",
        qty: item.qty,
        operator: user?.name || "Petugas CSSD",
        timestamp: serverTimestamp(),
        notes: `Distribusi ke ${targetUnit} (${distId})`,
        currentStock: newStock,
        tenantId
      });
    }

    // 3. Write Distribution record
    const distRef = doc(db, "bmhp_distributions", distId);
    transaction.set(distRef, {
      id: distId,
      requestId: requestId || null,
      tenantId,
      targetUnit,
      dispatchBy: user?.name || "Petugas CSSD",
      recipientName,
      items,
      notes: notes || "",
      createdAt: nowISO
    });

    // 4. Update request status to SELESAI if linked
    if (reqRef && reqData) {
      transaction.update(reqRef, {
        status: "SELESAI",
        updatedAt: nowISO
      });
    }

    if (idempotencyKey) {
      const idempotencyRef = doc(db, "transaction_idempotency", `${tenantId}:BMHP_DISTRIBUTION:${idempotencyKey}`);
      transaction.set(idempotencyRef, {
        tenantId,
        idempotencyKey,
        operationType: "BMHP_DISTRIBUTION",
        status: "COMPLETED",
        result: distId,
        createdAt: nowISO,
        completedAt: nowISO
      });
    }

    return { isDuplicate: false, result: distId };
  });

  if (txResult.isDuplicate) {
    return txResult.result;
  }

  await writeAuditLog({
    action: "DISTRIBUSI_BMHP",
    module: "BMHP",
    entityType: "BMHP_DISTRIBUTION",
    entityId: distId,
    transactionId: distId,
    userId: user?.userId || user?.uid,
    userName: user?.name,
    userRole: user?.role,
    tenantId,
    installationId: targetUnit,
    result: "SUCCESS",
    reason: `Distribusi BMHP ${distId} ke instalasi ${targetUnit} (Penerima: ${recipientName}) berhasil dilaksanakan`
  });

  return distId;
}

/**
 * 4. PROCESS BMHP RETURN (ONLY RETURNABLE ITEMS ALLOWED)
 */
export async function executeBMHPReturn(params: {
  user: UserProfile | null;
  sourceUnit: string;
  items: { bmhpId: string; bmhpName: string; qty: number; unit: string; condition: 'NORMAL' | 'RUSAK' | 'KOTOR'; notes?: string }[];
  notes?: string;
  isDemoMode?: boolean;
  idempotencyKey?: string;
}): Promise<string> {
  const { user, sourceUnit, items, notes, isDemoMode, idempotencyKey } = params;
  const tenantId = requireTenantId(user);

  checkPermissionOrThrow(user, PERMISSIONS.BMHP_RETURN, {
    action: "RETURN_BMHP",
    resource: "BMHP_RETURN",
    tenantId,
    installationId: sourceUnit
  });

  if (!items || items.length === 0) {
    throw new Error("Daftar item pengembalian BMHP tidak boleh kosong.");
  }

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const returnId = idempotencyKey ? `RET-BMHP-${idempotencyKey}` : `RET-BMHP-${dateStr}-${randomNum}`;
  const nowISO = new Date().toISOString();

  if (isDemoMode) {
    await writeAuditLog({
      action: "RETURN_BMHP",
      module: "BMHP",
      entityType: "BMHP_RETURN",
      entityId: returnId,
      transactionId: returnId,
      userId: user?.userId || user?.uid || "DEMO",
      userName: user?.name || "Demo User",
      userRole: user?.role || "PETUGAS_INSTALASI",
      tenantId,
      installationId: sourceUnit,
      result: "SUCCESS",
      reason: `Pengembalian BMHP ${returnId} dari ${sourceUnit} berhasil (Demo Mode)`
    });
    return returnId;
  }

  const txResult = await runTransaction(db, async (transaction) => {
    if (idempotencyKey) {
      const idempotencyRef = doc(db, "transaction_idempotency", `${tenantId}:BMHP_RETURN:${idempotencyKey}`);
      const idempotencySnap = await transaction.get(idempotencyRef);
      if (idempotencySnap.exists()) {
        const idenData = idempotencySnap.data();
        if (idenData.tenantId !== tenantId) {
          throw new Error("TENANT_CONTEXT_MISMATCH");
        }
        return { isDuplicate: true, result: idenData.result };
      }
    }

    for (const item of items) {
      const catalogRef = doc(db, "bmhp_catalog", item.bmhpId);
      const catalogSnap = await transaction.get(catalogRef);

      if (!catalogSnap.exists()) {
        throw new Error("BMHP_NOT_FOUND");
      }

      const catalogData = catalogSnap.data() as BMHPCatalog;
      if (catalogData.tenantId && catalogData.tenantId !== tenantId) {
        throw new Error("TENANT_CONTEXT_MISMATCH");
      }

      // Single-use items (kassa, gloves, etc.) cannot be returned to usable stock
      if (catalogData.isReturnable === false) {
        throw new Error(
          `PENGEMBALIAN DITOLAK: Item "${item.bmhpName}" adalah barang habis pakai (single-use) yang tidak dapat dikembalikan ke stok.`
        );
      }

      if (item.condition === "NORMAL") {
        // Return normal item back to usable stock
        const newStock = (catalogData.stockQty || 0) + item.qty;
        transaction.update(catalogRef, {
          stockQty: newStock,
          updatedAt: nowISO
        });

        const logRef = doc(collection(db, "bmhp_logs"));
        transaction.set(logRef, {
          bmhpId: item.bmhpId,
          bmhpName: item.bmhpName,
          type: "in",
          qty: item.qty,
          operator: user?.name || "Petugas Instalasi",
          timestamp: serverTimestamp(),
          notes: `Pengembalian dari ${sourceUnit} (${returnId})`,
          currentStock: newStock,
          tenantId
        });
      } else {
        // Condition RUSAK / KOTOR -> Do not add to usable stock. Create discrepancy / hold record!
        const discRef = doc(collection(db, "discrepancy_cases"));
        transaction.set(discRef, {
          caseId: `CASE-BMHP-${returnId}`,
          tenantId,
          installationId: sourceUnit,
          entityType: "BMHP",
          entityId: item.bmhpId,
          entityName: item.bmhpName,
          issueType: item.condition === "RUSAK" ? "BARANG_RUSAK" : "BARANG_KOTOR",
          quantity: item.qty,
          reportedBy: user?.name || "Petugas",
          status: "DITAHAN",
          notes: item.notes || `Pengembalian BMHP kondisi ${item.condition} dari ${sourceUnit}`,
          createdAt: nowISO
        });
      }
    }

    const returnRef = doc(db, "bmhp_returns", returnId);
    transaction.set(returnRef, {
      id: returnId,
      tenantId,
      sourceUnit,
      returnedBy: user?.name || "Petugas Instalasi",
      items,
      status: items.some(i => i.condition !== "NORMAL") ? "DITAHAN" : "DIKEMBALIKAN",
      notes: notes || "",
      createdAt: nowISO
    });

    if (idempotencyKey) {
      const idempotencyRef = doc(db, "transaction_idempotency", `${tenantId}:BMHP_RETURN:${idempotencyKey}`);
      transaction.set(idempotencyRef, {
        tenantId,
        idempotencyKey,
        operationType: "BMHP_RETURN",
        status: "COMPLETED",
        result: returnId,
        createdAt: nowISO,
        completedAt: nowISO
      });
    }

    return { isDuplicate: false, result: returnId };
  });

  if (txResult.isDuplicate) {
    return txResult.result;
  }

  await writeAuditLog({
    action: "RETURN_BMHP",
    module: "BMHP",
    entityType: "BMHP_RETURN",
    entityId: returnId,
    transactionId: returnId,
    userId: user?.userId || user?.uid,
    userName: user?.name,
    userRole: user?.role,
    tenantId,
    installationId: sourceUnit,
    result: "SUCCESS",
    reason: `Pengembalian BMHP ${returnId} dari ${sourceUnit} tercatat`
  });

  return returnId;
}

/**
 * 5. LINEN IBS/OK REQUEST
 */
export async function createLinenRequest(params: {
  user: UserProfile | null;
  requestingUnit: string;
  items: { linenId: string; linenName: string; qtyRequested: number; unit: string }[];
  notes?: string;
  isDemoMode?: boolean;
}): Promise<string> {
  const { user, requestingUnit, items, notes, isDemoMode } = params;
  const tenantId = requireTenantId(user);

  checkPermissionOrThrow(user, PERMISSIONS.LINEN_REQUEST_CREATE, {
    action: "CREATE_LINEN_REQUEST",
    resource: "LINEN_REQUEST",
    tenantId,
    installationId: requestingUnit
  });

  if (!items || items.length === 0) {
    throw new Error("Daftar Linen yang diminta tidak boleh kosong.");
  }

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const requestId = `REQ-LINEN-${dateStr}-${randomNum}`;

  const requestData: LinenRequest = {
    id: requestId,
    tenantId,
    requestingUnit,
    requestedBy: user?.name || "Petugas IBS/OK",
    items,
    status: "DIAJUKAN",
    notes: notes || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (isDemoMode) {
    await writeAuditLog({
      action: "LINEN_DIMINTA",
      module: "LINEN",
      entityType: "LINEN_REQUEST",
      entityId: requestId,
      transactionId: requestId,
      userId: user?.userId || user?.uid || "DEMO",
      userName: user?.name || "Demo User",
      userRole: user?.role || "PETUGAS_INSTALASI",
      tenantId,
      installationId: requestingUnit,
      result: "SUCCESS",
      reason: `Permintaan Linen ${requestId} untuk ${requestingUnit} berhasil diajukan`
    });
    return requestId;
  }

  await setDoc(doc(db, "linen_requests", requestId), requestData);

  await writeAuditLog({
    action: "LINEN_DIMINTA",
    module: "LINEN",
    entityType: "LINEN_REQUEST",
    entityId: requestId,
    transactionId: requestId,
    userId: user?.userId || user?.uid,
    userName: user?.name,
    userRole: user?.role,
    tenantId,
    installationId: requestingUnit,
    result: "SUCCESS",
    reason: `Permintaan Linen Operasi ${requestId} diajukan oleh instalasi ${requestingUnit}`
  });

  return requestId;
}

/**
 * 6. LINEN DISTRIBUTION TO IBS/OK
 */
export async function executeLinenDistribution(params: {
  user: UserProfile | null;
  requestId?: string;
  targetUnit: string;
  items: { linenId: string; linenName: string; qty: number; unit: string }[];
  notes?: string;
  isDemoMode?: boolean;
  idempotencyKey?: string;
}): Promise<string> {
  const { user, requestId, targetUnit, items, notes, isDemoMode, idempotencyKey } = params;
  const tenantId = requireTenantId(user);

  checkPermissionOrThrow(user, PERMISSIONS.LINEN_DISTRIBUTE, {
    action: "DISTRIBUTE_LINEN",
    resource: "LINEN_DISTRIBUTION",
    tenantId
  });

  if (!items || items.length === 0) {
    throw new Error("Daftar Linen yang didistribusikan tidak boleh kosong.");
  }

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const distId = idempotencyKey ? `DIS-LINEN-${idempotencyKey}` : `DIS-LINEN-${dateStr}-${randomNum}`;
  const nowISO = new Date().toISOString();

  if (isDemoMode) {
    await writeAuditLog({
      action: "LINEN_DISTRIBUSIKAN",
      module: "LINEN",
      entityType: "LINEN_DISTRIBUTION",
      entityId: distId,
      transactionId: distId,
      userId: user?.userId || user?.uid || "DEMO",
      userName: user?.name || "Demo User",
      userRole: user?.role || "PETUGAS_CSSD",
      tenantId,
      installationId: targetUnit,
      result: "SUCCESS",
      reason: `Distribusi Linen ${distId} ke ${targetUnit} berhasil`
    });
    return distId;
  }

  const txResult = await runTransaction(db, async (transaction) => {
    if (idempotencyKey) {
      const idempotencyRef = doc(db, "transaction_idempotency", `${tenantId}:LINEN_DISTRIBUTION:${idempotencyKey}`);
      const idempotencySnap = await transaction.get(idempotencyRef);
      if (idempotencySnap.exists()) {
        const idenData = idempotencySnap.data();
        if (idenData.tenantId !== tenantId) {
          throw new Error("TENANT_CONTEXT_MISMATCH");
        }
        return { isDuplicate: true, result: idenData.result };
      }
    }

    // Check request if requestId provided
    let reqRef = null;
    if (requestId) {
      reqRef = doc(db, "linen_requests", requestId);
      const reqSnap = await transaction.get(reqRef);
      if (reqSnap.exists()) {
        const reqData = reqSnap.data() as LinenRequest;
        if (reqData.tenantId && reqData.tenantId !== tenantId) {
          throw new Error("TENANT_CONTEXT_MISMATCH");
        }
        if (reqData.status !== "DIAJUKAN") {
          throw new Error(`Permintaan ${requestId} sudah diproses (Status: ${reqData.status}).`);
        }
      } else {
        throw new Error("LINEN_NOT_FOUND");
      }
    }

    for (const item of items) {
      const catalogRef = doc(db, "linen_catalog", item.linenId);
      const catalogSnap = await transaction.get(catalogRef);

      if (!catalogSnap.exists()) {
        throw new Error("LINEN_NOT_FOUND");
      }

      const catalogData = catalogSnap.data() as LinenItem;
      if (catalogData.tenantId && catalogData.tenantId !== tenantId) {
        throw new Error("TENANT_CONTEXT_MISMATCH");
      }
      const currentQty = catalogData.stockQty || 0;

      if (currentQty < item.qty) {
        throw new Error(
          `PERMINTAAN LINEN TIDAK DAPAT DIPENUHI.\nStok Linen CSSD tersedia: ${currentQty}\nJumlah diminta: ${item.qty}`
        );
      }

      const newStock = currentQty - item.qty;
      transaction.update(catalogRef, {
        stockQty: newStock,
        updatedAt: nowISO
      });
    }

    if (requestId) {
      const reqRef = doc(db, "linen_requests", requestId);
      transaction.update(reqRef, {
        status: "SELESAI",
        updatedAt: nowISO
      });
    }

    const distRef = doc(db, "linen_distributions", distId);
    transaction.set(distRef, {
      id: distId,
      requestId: requestId || null,
      tenantId,
      targetUnit,
      dispatchBy: user?.name || "Petugas CSSD",
      items,
      notes: notes || "",
      createdAt: nowISO
    });

    if (idempotencyKey) {
      const idempotencyRef = doc(db, "transaction_idempotency", `${tenantId}:LINEN_DISTRIBUTION:${idempotencyKey}`);
      transaction.set(idempotencyRef, {
        tenantId,
        idempotencyKey,
        operationType: "LINEN_DISTRIBUTION",
        status: "COMPLETED",
        result: distId,
        createdAt: nowISO,
        completedAt: nowISO
      });
    }

    return { isDuplicate: false, result: distId };
  });

  if (txResult.isDuplicate) {
    return txResult.result;
  }

  await writeAuditLog({
    action: "LINEN_DISTRIBUSIKAN",
    module: "LINEN",
    entityType: "LINEN_DISTRIBUTION",
    entityId: distId,
    transactionId: distId,
    userId: user?.userId || user?.uid,
    userName: user?.name,
    userRole: user?.role,
    tenantId,
    installationId: targetUnit,
    result: "SUCCESS",
    reason: `Distribusi Linen Operasi ${distId} ke unit ${targetUnit} berhasil`
  });

  return distId;
}

/**
 * 7. LINEN RETURN & DISCREPANCY (KOTOR / RUSAK / HILANG)
 */
export async function executeLinenReturn(params: {
  user: UserProfile | null;
  sourceUnit: string;
  items: { linenId: string; linenName: string; qty: number; unit: string; condition: 'KOTOR' | 'RUSAK' | 'HILANG'; notes?: string }[];
  notes?: string;
  isDemoMode?: boolean;
  idempotencyKey?: string;
}): Promise<string> {
  const { user, sourceUnit, items, notes, isDemoMode, idempotencyKey } = params;
  const tenantId = requireTenantId(user);

  checkPermissionOrThrow(user, PERMISSIONS.LINEN_RETURN, {
    action: "RETURN_LINEN",
    resource: "LINEN_RETURN",
    tenantId,
    installationId: sourceUnit
  });

  if (!items || items.length === 0) {
    throw new Error("Daftar Linen yang dikembalikan tidak boleh kosong.");
  }

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const returnId = idempotencyKey ? `RET-LINEN-${idempotencyKey}` : `RET-LINEN-${dateStr}-${randomNum}`;
  const nowISO = new Date().toISOString();

  if (isDemoMode) {
    await writeAuditLog({
      action: "LINEN_DIKEMBALIKAN",
      module: "LINEN",
      entityType: "LINEN_RETURN",
      entityId: returnId,
      transactionId: returnId,
      userId: user?.userId || user?.uid || "DEMO",
      userName: user?.name || "Demo User",
      userRole: user?.role || "PETUGAS_INSTALASI",
      tenantId,
      installationId: sourceUnit,
      result: "SUCCESS",
      reason: `Pengembalian Linen ${returnId} dari ${sourceUnit} tercatat`
    });
    return returnId;
  }

  const pendingAuditLogs: any[] = [];

  const txResult = await runTransaction(db, async (transaction) => {
    pendingAuditLogs.length = 0; // clear on transaction retry

    if (idempotencyKey) {
      const idempotencyRef = doc(db, "transaction_idempotency", `${tenantId}:LINEN_RETURN:${idempotencyKey}`);
      const idempotencySnap = await transaction.get(idempotencyRef);
      if (idempotencySnap.exists()) {
        const idenData = idempotencySnap.data();
        if (idenData.tenantId !== tenantId) {
          throw new Error("TENANT_CONTEXT_MISMATCH");
        }
        return { isDuplicate: true, result: idenData.result };
      }
    }

    for (const item of items) {
      if (item.condition === "KOTOR") {
        // Linen Kotor -> Sent to Laundry / CSSD process
        const laundryRef = doc(collection(db, "linen_laundry_queue"));
        transaction.set(laundryRef, {
          id: `LAUNDRY-${returnId}-${item.linenId}`,
          tenantId,
          sourceUnit,
          linenId: item.linenId,
          linenName: item.linenName,
          qty: item.qty,
          status: "DIPROSES",
          receivedAt: nowISO
        });

        pendingAuditLogs.push({
          action: "LINEN_DIKEMBALIKAN",
          module: "LINEN",
          entityType: "LINEN_ITEM",
          entityId: item.linenId,
          transactionId: returnId,
          userId: user?.userId || user?.uid,
          userName: user?.name,
          userRole: user?.role,
          tenantId,
          installationId: sourceUnit,
          result: "SUCCESS",
          reason: `Linen Kotor (${item.linenName} x${item.qty}) diterima dari ${sourceUnit} untuk proses laundry/pencucian`
        });
      } else if (item.condition === "RUSAK") {
        const discRef = doc(collection(db, "discrepancy_cases"));
        transaction.set(discRef, {
          caseId: `CASE-LINEN-${returnId}`,
          tenantId,
          installationId: sourceUnit,
          entityType: "LINEN",
          entityId: item.linenId,
          entityName: item.linenName,
          issueType: "LINEN_RUSAK",
          quantity: item.qty,
          reportedBy: user?.name || "Petugas IBS/OK",
          status: "DITAHAN",
          notes: item.notes || `Linen rusak dari ${sourceUnit}`,
          createdAt: nowISO
        });

        pendingAuditLogs.push({
          action: "LINEN_RUSAK",
          module: "LINEN",
          entityType: "LINEN_ITEM",
          entityId: item.linenId,
          transactionId: returnId,
          userId: user?.userId || user?.uid,
          userName: user?.name,
          userRole: user?.role,
          tenantId,
          installationId: sourceUnit,
          result: "WARNING",
          reason: `Linen Rusak (${item.linenName} x${item.qty}) dilaporkan dari ${sourceUnit}. Status DITAHAN.`
        });
      } else if (item.condition === "HILANG") {
        const discRef = doc(collection(db, "discrepancy_cases"));
        transaction.set(discRef, {
          caseId: `CASE-LINEN-${returnId}`,
          tenantId,
          installationId: sourceUnit,
          entityType: "LINEN",
          entityId: item.linenId,
          entityName: item.linenName,
          issueType: "LINEN_HILANG",
          quantity: item.qty,
          reportedBy: user?.name || "Petugas IBS/OK",
          status: "HILANG",
          notes: item.notes || `Linen hilang di ${sourceUnit}`,
          createdAt: nowISO
        });

        pendingAuditLogs.push({
          action: "LINEN_HILANG",
          module: "LINEN",
          entityType: "LINEN_ITEM",
          entityId: item.linenId,
          transactionId: returnId,
          userId: user?.userId || user?.uid,
          userName: user?.name,
          userRole: user?.role,
          tenantId,
          installationId: sourceUnit,
          result: "WARNING",
          reason: `Linen Hilang (${item.linenName} x${item.qty}) dilaporkan dari ${sourceUnit}. Kasus ketidaksesuaian dibuat.`
        });
      }
    }

    const returnRef = doc(db, "linen_returns", returnId);
    transaction.set(returnRef, {
      id: returnId,
      tenantId,
      sourceUnit,
      returnedBy: user?.name || "Petugas IBS/OK",
      items,
      status: "DIKEMBALIKAN",
      notes: notes || "",
      createdAt: nowISO
    });

    if (idempotencyKey) {
      const idempotencyRef = doc(db, "transaction_idempotency", `${tenantId}:LINEN_RETURN:${idempotencyKey}`);
      transaction.set(idempotencyRef, {
        tenantId,
        idempotencyKey,
        operationType: "LINEN_RETURN",
        status: "COMPLETED",
        result: returnId,
        createdAt: nowISO,
        completedAt: nowISO
      });
    }

    return { isDuplicate: false, result: returnId };
  });

  if (txResult.isDuplicate) {
    return txResult.result;
  }

  // Write all buffered audit logs only after transaction successfully commits
  for (const log of pendingAuditLogs) {
    await writeAuditLog(log);
  }

  return returnId;
}
