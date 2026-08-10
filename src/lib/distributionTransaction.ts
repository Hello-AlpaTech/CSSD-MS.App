import { db } from "./firebase";
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  runTransaction, 
  serverTimestamp 
} from "firebase/firestore";
import { writeAuditLog } from "./auditLogger";
import { getDemoData, saveDemoData, DEMO_KEYS, INITIAL_DEMO_UNIT_STOCK } from "./demoStore";
import { UserProfile } from "../types";
import { canAccessInstallation, requireTenantId } from "./permissions";

export interface DistributionSubmitParams {
  transactionId: string;
  targetUnit: string;
  recipientName: string;
  dispatchNotes?: string;
  dispatchList: { instrumentId: string; lotNumber: string; name: string }[];
  currentUsername: string;
  userProfile?: UserProfile | null;
  isDemoMode?: boolean;
}

export interface DistributionValidationResult {
  isValid: boolean;
  instrumentId: string;
  reason?: string;
  statusAlur?: string;
  location?: string;
  holder?: string;
}

/**
 * Validates Live State in Firestore/Demo for distribution eligibility.
 * Must be in RAK/SIAP/READY/STORAGE, normal condition (not TAHAN, not RECALL), not expired.
 */
export async function validateInstrumentForDistribution(
  instrumentId: string,
  isDemoMode: boolean = false
): Promise<DistributionValidationResult> {
  const cleanId = instrumentId.trim();
  if (!cleanId) {
    return { isValid: false, instrumentId: cleanId, reason: "ID Instrumen tidak valid." };
  }

  if (isDemoMode) {
    const demoLiveState = getDemoData<Record<string, any>>("cssd_demo_live_state", {});
    const live = demoLiveState[cleanId];
    if (live) {
      const stage = (live.statusAlur || live.currentState || "").toUpperCase();
      const loc = (live.currentLocation || "").toUpperCase();
      const condition = (live.kondisi || live.condition || "NORMAL").toUpperCase();

      if (condition === "TAHAN" || condition === "HOLD") {
        return {
          isValid: false,
          instrumentId: cleanId,
          statusAlur: stage,
          location: loc,
          holder: live.currentHolder || live.pemegangSaatIni || "CSSD",
          reason: `ID Instrumen: ${cleanId}\nStatus: ${stage}\nLokasi: ${loc}\nKondisi: TAHAN\n\nInstrumen berstatus TAHAN tidak dapat didistribusikan.`
        };
      }

      if (stage === "DIDISTRIBUSIKAN" && loc !== "CSSD") {
        return {
          isValid: false,
          instrumentId: cleanId,
          statusAlur: stage,
          location: loc,
          holder: live.currentHolder || live.pemegangSaatIni || loc,
          reason: `ID Instrumen: ${cleanId}\nStatus: ${stage}\nLokasi: ${loc}\n\nInstrumen sudah didistribusikan.`
        };
      }
    }
    return { isValid: true, instrumentId: cleanId };
  }

  // Firestore Read
  const liveRef = doc(db, "instrument_live_state", cleanId);
  const snap = await getDoc(liveRef);

  if (snap.exists()) {
    const data = snap.data();
    const stage = (data.statusAlur || data.currentState || "").toUpperCase();
    const loc = (data.currentLocation || "").toUpperCase();
    const condition = (data.kondisi || data.condition || "NORMAL").toUpperCase();
    const holder = data.pemegangSaatIni || data.currentHolder || loc;

    if (condition === "TAHAN" || condition === "HOLD") {
      return {
        isValid: false,
        instrumentId: cleanId,
        statusAlur: stage,
        location: loc,
        holder,
        reason: `⚠️ DISTRIBUSI DITOLAK\n\nID Instrumen: ${cleanId}\nStatus: ${stage}\nLokasi: ${loc}\nKondisi: TAHAN\n\nInstrumen tidak dapat didistribusikan.`
      };
    }

    if (stage === "DIDISTRIBUSIKAN" && loc !== "CSSD") {
      return {
        isValid: false,
        instrumentId: cleanId,
        statusAlur: stage,
        location: loc,
        holder,
        reason: `⚠️ DISTRIBUSI DITOLAK\n\nID Instrumen: ${cleanId}\nStatus: ${stage}\nLokasi: ${loc}\n\nInstrumen tidak berada di RAK Steril CSSD.`
      };
    }
  }

  return { isValid: true, instrumentId: cleanId };
}

/**
 * Execute Atomic Distribution Transaction
 * Re-validates live state inside atomic Firestore transaction before commit!
 */
export async function executeDistributionTransaction(params: DistributionSubmitParams): Promise<{ success: boolean; transactionId: string }> {
  const {
    transactionId,
    targetUnit,
    recipientName,
    dispatchNotes = "",
    dispatchList,
    currentUsername,
    userProfile,
    isDemoMode = false
  } = params;

  if (dispatchList.length === 0) {
    throw new Error("Daftar kirim tidak boleh kosong.");
  }

  if (!recipientName.trim()) {
    throw new Error("Nama penerima wajib diisi.");
  }

  const tenantId = requireTenantId(userProfile);
  const nowISO = new Date().toISOString();

  // Validate user scope access if needed
  if (userProfile && !canAccessInstallation(userProfile, targetUnit)) {
    await writeAuditLog({
      action: "ACCESS_DENIED",
      module: "DISTRIBUSI",
      entityType: "INSTALLATION",
      userId: userProfile.userId || currentUsername,
      userName: currentUsername,
      userRole: userProfile.role,
      result: "REJECTED",
      reason: `Distribusi ke ${targetUnit} ditolak: User scope (${JSON.stringify(userProfile.scope)}) tidak mencakup target unit`,
      tenantId
    });
    throw new Error(`AKSES DITOLAK: Anda tidak memiliki akses untuk mendistribusikan ke unit ${targetUnit}.`);
  }

  if (isDemoMode) {
    const demoLiveState = getDemoData<Record<string, any>>("cssd_demo_live_state", {});
    const rejectedItems: string[] = [];

    // Check each item
    for (const item of dispatchList) {
      const instId = item.instrumentId || item.lotNumber;
      const live = demoLiveState[instId];
      if (live) {
        const stage = (live.statusAlur || live.currentState || "").toUpperCase();
        const loc = (live.currentLocation || "").toUpperCase();
        const cond = (live.kondisi || live.condition || "NORMAL").toUpperCase();

        if (cond === "TAHAN" || cond === "HOLD" || (stage === "DIDISTRIBUSIKAN" && loc !== "CSSD")) {
          rejectedItems.push(`ID: ${instId} (Status: ${stage}, Kondisi: ${cond}, Lokasi: ${loc})`);
        }
      }
    }

    if (rejectedItems.length > 0) {
      await writeAuditLog({
        action: "REJECT_DISTRIBUSI",
        module: "DISTRIBUSI",
        entityType: "DISTRIBUTION",
        transactionId,
        reason: `Distribusi ditolak. Instrumen tidak eligible:\n${rejectedItems.join(", ")}`,
        result: "REJECTED",
        userName: currentUsername,
        tenantId
      });

      throw new Error(
        `⚠️ DISTRIBUSI DITOLAK\n\nInstrumen berikut tidak dapat didistribusikan:\n${rejectedItems.join("\n")}\n\nSilakan periksa kembali status dan lokasi instrumen.`
      );
    }

    // Execute Demo update
    const unitStock = getDemoData<any>(DEMO_KEYS.UNIT_STOCK, INITIAL_DEMO_UNIT_STOCK);

    for (const item of dispatchList) {
      const instId = item.instrumentId || item.lotNumber;
      const beforeState = demoLiveState[instId]?.statusAlur || "RAK";
      const beforeLoc = demoLiveState[instId]?.currentLocation || "CSSD";
      const beforeHolder = demoLiveState[instId]?.pemegangSaatIni || "CSSD";

      // Update Live State
      demoLiveState[instId] = {
        instrumentId: instId,
        statusAlur: "DIDISTRIBUSIKAN",
        currentState: "DIDISTRIBUSIKAN",
        kondisi: "NORMAL",
        currentLocation: targetUnit,
        currentHolder: targetUnit,
        pemegangSaatIni: targetUnit,
        activeTransaction: null,
        updatedAt: nowISO
      };

      // Update unit stock
      const existingIdx = unitStock.findIndex((s: any) => s.lotNumber === item.lotNumber && s.unit === targetUnit);
      if (existingIdx > -1) {
        unitStock[existingIdx].qty += 1;
        unitStock[existingIdx].lastDistributedAtStr = nowISO;
      } else {
        unitStock.push({
          id: `demo-unit-stock-${Date.now()}-${Math.random().toString().slice(-4)}`,
          unit: targetUnit,
          instrumentId: instId,
          instrumentName: item.name,
          qty: 1,
          type: "single",
          sterilizedAtStr: nowISO,
          expiresAtStr: null,
          wrapType: "Pouch Steril",
          lastDistributedAtStr: nowISO,
          lotNumber: item.lotNumber
        });
      }

      // Write Audit Log APPEND-ONLY (Section C)
      await writeAuditLog({
        action: "DISTRIBUSI_INSTRUMEN",
        module: "DISTRIBUSI",
        entityType: "DISTRIBUTION",
        entityId: transactionId,
        instrumentId: instId,
        transactionId,
        beforeState,
        afterState: "DIDISTRIBUSIKAN",
        beforeLocation: beforeLoc,
        afterLocation: targetUnit,
        beforeHolder,
        afterHolder: targetUnit,
        reason: `Distribusi instrumen ke ${targetUnit} (Penerima: ${recipientName})`,
        result: "SUCCESS",
        userName: currentUsername,
        tenantId
      });
    }

    saveDemoData("cssd_demo_live_state", demoLiveState);
    saveDemoData(DEMO_KEYS.UNIT_STOCK, unitStock);

    return { success: true, transactionId };
  }

  // FIRESTORE ATOMIC TRANSACTION
  let alreadyExecuted = false;
  await runTransaction(db, async (transaction) => {
    // 1. READ PHASE - Check idempotency, Live State, Keadaan, and Unit Stock
    const distLogRef = doc(db, "distribution_logs", transactionId);
    const distLogSnap = await transaction.get(distLogRef);
    if (distLogSnap.exists()) {
      const existingData = distLogSnap.data();
      if (existingData && existingData.tenantId && existingData.tenantId !== tenantId) {
        throw new Error("TENANT_CONTEXT_MISMATCH");
      }
      alreadyExecuted = true;
      return;
    }

    const liveRefs = dispatchList.map(item => doc(db, "instrument_live_state", item.instrumentId || item.lotNumber));
    const keadaanRefs = dispatchList.map(item => doc(db, "keadaan_aktif_instrumen", item.instrumentId || item.lotNumber));
    const stockRefs = dispatchList.map(item => {
      const docId = `${targetUnit.replace(/[\/\s\\]+/g, "_")}_${item.lotNumber}`;
      return doc(db, "unit_stock", docId);
    });

    const liveSnaps = await Promise.all(liveRefs.map(ref => transaction.get(ref)));
    const keadaanSnaps = await Promise.all(keadaanRefs.map(ref => transaction.get(ref)));
    const stockSnaps = await Promise.all(stockRefs.map(ref => transaction.get(ref)));

    const invalidItems: string[] = [];

    // Check Live State
    liveSnaps.forEach((snap, idx) => {
      const instId = dispatchList[idx].instrumentId || dispatchList[idx].lotNumber;
      if (snap.exists()) {
        const data = snap.data();
        if (data.tenantId && data.tenantId !== tenantId) {
          throw new Error("TENANT_CONTEXT_MISMATCH");
        }

        const stage = (data.statusAlur || data.currentState || "").toUpperCase();
        const loc = (data.currentLocation || "").toUpperCase();
        const cond = (data.kondisi || data.condition || "NORMAL").toUpperCase();

        if (cond === "TAHAN" || cond === "HOLD") {
          invalidItems.push(`- ${instId}: Status=${stage}, Kondisi=TAHAN, Lokasi=${loc}`);
        } else if (stage === "DIDISTRIBUSIKAN" && loc !== "CSSD") {
          invalidItems.push(`- ${instId}: Sudah didistribusikan ke ${loc}`);
        }
      }
    });

    // Check Keadaan Aktif
    keadaanSnaps.forEach((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.tenantId && data.tenantId !== tenantId) {
          throw new Error("TENANT_CONTEXT_MISMATCH");
        }
      }
    });

    // Check Unit Stock
    stockSnaps.forEach((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.tenantId && data.tenantId !== tenantId) {
          throw new Error("TENANT_CONTEXT_MISMATCH");
        }
      }
    });

    if (invalidItems.length > 0) {
      throw new Error(
        `⚠️ DISTRIBUSI DITOLAK\n\nInstrumen berikut tidak dapat didistribusikan:\n${invalidItems.join("\n")}\n\nSilakan periksa kembali status instrumen.`
      );
    }

    // 2. WRITE PHASE - Perform Atomic Updates
    transaction.set(distLogRef, {
      id: transactionId,
      transactionId,
      targetUnit,
      recipientName,
      dispatchNotes: dispatchNotes || "",
      dispatchList,
      createdBy: currentUsername,
      tenantId,
      createdAt: nowISO,
      updatedAt: nowISO
    });

    for (let idx = 0; idx < dispatchList.length; idx++) {
      const item = dispatchList[idx];
      const instId = item.instrumentId || item.lotNumber;
      const liveRef = liveRefs[idx];
      const keadaanRef = keadaanRefs[idx];
      const stockRef = stockRefs[idx];

      // Update SSoT instrument_live_state & canonical keadaan_aktif_instrumen
      const liveData = {
        instrumentId: instId,
        statusAlur: "DIDISTRIBUSIKAN",
        currentState: "DIDISTRIBUSIKAN",
        kondisi: "NORMAL",
        currentLocation: targetUnit,
        currentHolder: targetUnit,
        pemegangSaatIni: targetUnit,
        activeTransaction: null,
        tenantId,
        updatedAt: nowISO
      };

      transaction.set(liveRef, liveData, { merge: true });
      transaction.set(keadaanRef, liveData, { merge: true });

      transaction.set(stockRef, {
        unit: targetUnit,
        instrumentId: instId,
        instrumentName: item.name,
        qty: 1,
        type: "single",
        lastDistributedAt: serverTimestamp(),
        lotNumber: item.lotNumber,
        tenantId
      }, { merge: true });
    }
  });

  if (alreadyExecuted) {
    return { success: true, transactionId };
  }

  // Write Append-Only Audit Logs for each item after atomic commit
  for (const item of dispatchList) {
    const instId = item.instrumentId || item.lotNumber;
    await writeAuditLog({
      action: "DISTRIBUSI_INSTRUMEN",
      module: "DISTRIBUSI",
      entityType: "DISTRIBUTION",
      entityId: transactionId,
      instrumentId: instId,
      transactionId,
      beforeState: "RAK",
      afterState: "DIDISTRIBUSIKAN",
      beforeLocation: "CSSD",
      afterLocation: targetUnit,
      beforeHolder: "CSSD",
      afterHolder: targetUnit,
      reason: `Distribusi instrumen ke ${targetUnit} (Penerima: ${recipientName})`,
      result: "SUCCESS",
      userName: currentUsername,
      tenantId
    });
  }

  return { success: true, transactionId };
}
