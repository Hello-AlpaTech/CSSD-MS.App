import { 
  db, 
  handleFirestoreError, 
  OperationType 
} from "./firebase";
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  runTransaction, 
  serverTimestamp 
} from "firebase/firestore";
import { writeAuditLog } from "./auditLogger";
import { getDemoData, saveDemoData, DEMO_KEYS } from "./demoStore";
import { UserProfile } from "../types";
import { requireTenantId } from "./permissions";

export interface ScannedReceptionItem {
  id: string;
  instrumentId: string;
  name: string;
  type: string;
  qty: number;
  condition: 'Bekas Pakai' | 'Bekas Pakai - Rusak' | 'Expired Date';
  components?: any[];
  isDamaged?: boolean;
  isIncomplete?: boolean;
  missingComponentsNote?: string;
}

export interface ReceptionSubmitParams {
  idTerima: string;
  idempotencyKey?: string;
  tanggalPenerimaan: string;
  asalInstalasi: string;
  namaPenyerah: string;
  namaPenerima: string;
  items: ScannedReceptionItem[];
  userProfile: UserProfile;
  userScope?: string;
  isDemoMode?: boolean;
}

export interface ReceptionTransactionDoc {
  id: string;
  idPenerimaan: string;
  tanggalPenerimaan: string;
  asalInstalasi: string;
  namaPenyerah: string;
  namaPenerima: string;
  items: ScannedReceptionItem[];
  totalPcs: number;
  status: 'AKTIF' | 'SELESAI' | 'VOID';
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
  pickedUpAt?: string;
  pickedUpBy?: string;
  voidReason?: string;
  voidAt?: string;
  voidBy?: string;
}

export interface CSSDCheckResult {
  isEligible: boolean;
  instrumentId: string;
  statusAlur: string;
  location: string;
  holder?: string;
  activeTransaction: string;
  reason?: string;
  isRecallHold?: boolean;
}

const ACTIVE_CSSD_STAGES = [
  "DITERIMA",
  "DEKONTAMINASI",
  "DECONTAMINATION",
  "PACKING",
  "STERILIZATION",
  "STERILISASI",
  "SIAP",
  "READY",
  "RAK",
  "HOLD",
  "KARANTINA_CSSD"
];

/**
 * Check whether an instrument ID is currently active in CSSD.
 * SSoT: instrument_live_state
 */
export async function checkInstrumentCSSDEligibility(
  instrumentId: string, 
  userScope: string = "ALL",
  isDemoMode: boolean = false
): Promise<CSSDCheckResult> {
  const cleanId = instrumentId.trim();
  if (!cleanId) {
    return {
      isEligible: false,
      instrumentId: cleanId,
      statusAlur: "UNKNOWN",
      location: "-",
      activeTransaction: "-",
      reason: "ID Instrumen tidak valid."
    };
  }

  try {
    if (isDemoMode) {
      const demoLiveState = getDemoData<Record<string, any>>("cssd_demo_live_state", {});
      const live = demoLiveState[cleanId];
      if (live) {
        const stage = (live.statusAlur || live.currentState || "").toUpperCase();
        const loc = (live.currentLocation || "").toUpperCase();
        const holder = live.pemegangSaatIni || live.currentHolder || loc;
        const activeTx = live.activeTransaction || "-";
        const isRecall = live.recallStatus === "RECALL_REQUESTED" || live.kondisi === "TAHAN";

        const isInCSSD = loc === "CSSD" || loc === "KARANTINA_CSSD" || ACTIVE_CSSD_STAGES.includes(stage);
        const isDistributed = stage === "DIDISTRIBUSIKAN" || stage === "INSTALASI" || loc === live.originUnit;

        // Duplicate Check (Section G)
        if (isInCSSD && !isDistributed) {
          return {
            isEligible: false,
            instrumentId: cleanId,
            statusAlur: stage || "DITERIMA",
            location: loc || "CSSD",
            holder,
            activeTransaction: activeTx,
            reason: `⚠️ PENGEMBALIAN DITOLAK\n\nID Instrumen sudah berada di CSSD.\n\nID Instrumen:\n${cleanId}\n\nLokasi:\n${loc || 'CSSD'}\n\nStatus:\n${stage || 'DITERIMA'}\n\nID Penerimaan Aktif:\n${activeTx}\n\nInstrumen tidak dapat dikembalikan kembali.`
          };
        }

        // Scope Check (Section H)
        if (userScope && userScope !== "ALL" && userScope !== "GLOBAL" && userScope !== "ALL_UNITS") {
          if (holder && holder.toUpperCase() !== userScope.toUpperCase()) {
            return {
              isEligible: false,
              instrumentId: cleanId,
              statusAlur: stage,
              location: loc,
              holder,
              activeTransaction: activeTx,
              reason: `⚠️ PENGEMBALIAN DITOLAK\n\nInstrumen tidak berada dalam penguasaan instalasi Anda.`
            };
          }
        }

        return {
          isEligible: true,
          instrumentId: cleanId,
          statusAlur: stage || "INSTALASI",
          location: loc || "INSTALASI",
          holder,
          activeTransaction: activeTx,
          isRecallHold: isRecall
        };
      }

      return {
        isEligible: true,
        instrumentId: cleanId,
        statusAlur: "INSTALASI",
        location: "INSTALASI",
        activeTransaction: "-"
      };
    }

    // Read SSoT: instrument_live_state
    const liveRef = doc(db, "instrument_live_state", cleanId);
    const snap = await getDoc(liveRef);

    if (snap.exists()) {
      const data = snap.data();
      const stage = (data.statusAlur || data.currentState || "").toUpperCase();
      const loc = (data.currentLocation || "").toUpperCase();
      const holder = data.pemegangSaatIni || data.currentHolder || loc;
      const activeTx = data.activeTransaction || "-";
      const isRecall = data.recallStatus === "RECALL_REQUESTED" || data.kondisi === "TAHAN";

      const isInCSSD = loc === "CSSD" || loc === "KARANTINA_CSSD" || ACTIVE_CSSD_STAGES.includes(stage);
      const isDistributed = stage === "DIDISTRIBUSIKAN" || stage === "INSTALASI";

      if (isInCSSD && !isDistributed) {
        return {
          isEligible: false,
          instrumentId: cleanId,
          statusAlur: stage || "DITERIMA",
          location: loc || "CSSD",
          holder,
          activeTransaction: activeTx,
          reason: `⚠️ PENGEMBALIAN DITOLAK\n\nID Instrumen sudah berada di CSSD.\n\nID Instrumen:\n${cleanId}\n\nLokasi:\n${loc || 'CSSD'}\n\nStatus:\n${stage || 'DITERIMA'}\n\nID Penerimaan Aktif:\n${activeTx}\n\nInstrumen tidak dapat dikembalikan kembali.`
        };
      }

      if (userScope && userScope !== "ALL" && userScope !== "GLOBAL" && userScope !== "ALL_UNITS") {
        if (holder && holder.toUpperCase() !== userScope.toUpperCase()) {
          return {
            isEligible: false,
            instrumentId: cleanId,
            statusAlur: stage,
            location: loc,
            holder,
            activeTransaction: activeTx,
            reason: `⚠️ PENGEMBALIAN DITOLAK\n\nInstrumen tidak berada dalam penguasaan instalasi Anda.`
          };
        }
      }

      return {
        isEligible: true,
        instrumentId: cleanId,
        statusAlur: stage || "INSTALASI",
        location: loc || "INSTALASI",
        holder,
        activeTransaction: activeTx,
        isRecallHold: isRecall
      };
    }

    return {
      isEligible: true,
      instrumentId: cleanId,
      statusAlur: "INSTALASI",
      location: "INSTALASI",
      activeTransaction: "-"
    };
  } catch (e: any) {
    console.error("Error checking instrument CSSD eligibility:", e);
    return {
      isEligible: true,
      instrumentId: cleanId,
      statusAlur: "INSTALASI",
      location: "INSTALASI",
      activeTransaction: "-"
    };
  }
}

/**
 * Execute Atomic Reception / Return Transaction
 * Complies with Section F, G, H, I, J, K, L & M:
 * - Creates new Reception ID (TRM-YYYYMMDD-XXXX)
 * - Keeps original instrumentId (NEVER creates new physical instrumentId)
 * - Prevents duplicate return to CSSD
 * - Validates scope
 * - Handles damaged returns (Hold/Karantina) without changing official inventory
 * - Handles incomplete sets (Discrepancy case)
 * - Handles recall returns
 * - Atomic execution with rollback
 */
export async function executeReceptionTransaction(params: ReceptionSubmitParams): Promise<{ success: boolean; idTerima: string }> {
  const tenantId = requireTenantId(params.userProfile);
  const {
    idTerima,
    tanggalPenerimaan,
    asalInstalasi,
    namaPenyerah,
    namaPenerima,
    items,
    userProfile,
    userScope = "ALL",
    isDemoMode = false
  } = params;

  if (items.length === 0) {
    throw new Error("Tidak ada item yang di-scan untuk penerimaan.");
  }

  let totalPcs = 0;
  items.forEach(item => {
    if (item.type === 'set' && item.components && item.components.length > 0) {
      let setPcs = 0;
      item.components.forEach((c: any) => setPcs += Number(c.standardQty || c.qty || 1));
      totalPcs += setPcs * item.qty;
    } else {
      totalPcs += item.qty;
    }
  });

  const nowISO = new Date().toISOString();

  if (isDemoMode) {
    const demoLiveState = getDemoData<Record<string, any>>("cssd_demo_live_state", {});
    const rejectionReasons: string[] = [];

    for (const item of items) {
      const live = demoLiveState[item.instrumentId];
      if (live) {
        const stage = (live.statusAlur || live.currentState || "").toUpperCase();
        const loc = (live.currentLocation || "").toUpperCase();
        const holder = live.pemegangSaatIni || live.currentHolder || loc;
        const isInCSSD = loc === "CSSD" || loc === "KARANTINA_CSSD" || ACTIVE_CSSD_STAGES.includes(stage);
        const isDistributed = stage === "DIDISTRIBUSIKAN" || stage === "INSTALASI";

        if (isInCSSD && !isDistributed) {
          rejectionReasons.push(`ID ${item.instrumentId}: Sudah berada di CSSD (${loc})`);
          await writeAuditLog({
            action: "TOLAK_PENGEMBALIAN_DUPLIKASI",
            module: "PENERIMAAN",
            entityType: "RECEIVING",
            instrumentId: item.instrumentId,
            transactionId: idTerima,
            reason: `Pengembalian ditolak: Instrumen ${item.instrumentId} sudah berada di CSSD (${loc})`,
            result: "REJECTED",
            userName: namaPenerima,
            tenantId
          });
        }

        if (userScope && userScope !== "ALL" && userScope !== "GLOBAL" && userScope !== "ALL_UNITS") {
          if (holder && holder.toUpperCase() !== userScope.toUpperCase()) {
            rejectionReasons.push(`ID ${item.instrumentId}: Dipegang oleh ${holder}, bukan scope ${userScope}`);
            await writeAuditLog({
              action: "TOLAK_PENGEMBALIAN_SCOPE",
              module: "PENERIMAAN",
              entityType: "RECEIVING",
              instrumentId: item.instrumentId,
              transactionId: idTerima,
              reason: `Pengembalian ditolak: Instrumen ${item.instrumentId} dipegang oleh ${holder}, di luar scope ${userScope}`,
              result: "REJECTED",
              userName: namaPenerima,
              tenantId
            });
          }
        }
      }
    }

    if (rejectionReasons.length > 0) {
      throw new Error(
        `⚠️ PENGEMBALIAN DITOLAK\n\nTransaksi tidak dapat diproses:\n${rejectionReasons.join("\n")}`
      );
    }

    // Process each item in demo mode
    const existingTxs = getDemoData("cssd_demo_reception_transactions", []);
    const newTx: ReceptionTransactionDoc = {
      id: idTerima,
      idPenerimaan: idTerima,
      tanggalPenerimaan,
      asalInstalasi,
      namaPenyerah,
      namaPenerima,
      items,
      totalPcs,
      status: "AKTIF",
      tenantId,
      createdAt: nowISO,
      updatedAt: nowISO
    };
    saveDemoData("cssd_demo_reception_transactions", [newTx, ...existingTxs]);

    for (const item of items) {
      const isDamaged = item.condition === 'Bekas Pakai - Rusak' || item.isDamaged;
      const isRecall = demoLiveState[item.instrumentId]?.recallStatus === "RECALL_REQUESTED" || demoLiveState[item.instrumentId]?.kondisi === "TAHAN";

      let finalKondisi = "NORMAL";
      let finalLocation = "CSSD";
      let finalHolder = "CSSD";
      let auditAction = "PENERIMAAN_KEMBALI";

      if (isDamaged) {
        finalKondisi = "TAHAN";
        finalLocation = "KARANTINA_CSSD";
        auditAction = "PENGEMBALIAN_INSTRUMEN_RUSAK";
      } else if (isRecall) {
        finalKondisi = "TAHAN";
        finalLocation = "KARANTINA_CSSD";
        auditAction = "PENGEMBALIAN_RECALL";
      }

      demoLiveState[item.instrumentId] = {
        instrumentId: item.instrumentId,
        statusAlur: "DITERIMA",
        currentState: "DITERIMA",
        kondisi: finalKondisi,
        currentLocation: finalLocation,
        currentHolder: finalHolder,
        pemegangSaatIni: finalHolder,
        activeTransaction: idTerima,
        tenantId,
        updatedAt: nowISO
      };

      // Write Audit Log APPEND-ONLY
      await writeAuditLog({
        action: auditAction,
        module: "PENERIMAAN",
        entityType: "RECEIVING",
        entityId: idTerima,
        instrumentId: item.instrumentId,
        transactionId: idTerima,
        ticketId: idTerima,
        beforeState: "DIDISTRIBUSIKAN",
        afterState: "DITERIMA",
        beforeLocation: asalInstalasi,
        afterLocation: finalLocation,
        beforeHolder: asalInstalasi,
        afterHolder: finalHolder,
        reason: `Pengembalian fisik instrumen dari ${asalInstalasi} oleh ${namaPenyerah}`,
        result: "SUCCESS",
        userName: namaPenerima,
        tenantId
      });

      if (isDamaged) {
        await writeAuditLog({
          action: "TAHAN_INSTRUMEN",
          module: "HOLD",
          entityType: "HOLD",
          instrumentId: item.instrumentId,
          transactionId: idTerima,
          reason: `Instrumen ${item.instrumentId} masuk Karantina CSSD karena rusak saat pengembalian`,
          result: "SUCCESS",
          userName: namaPenerima,
          tenantId
        });
      }

      if (item.isIncomplete) {
        const existingCases = getDemoData<any[]>("cssd_demo_discrepancies", []);
        const caseId = `DISC-${nowISO.slice(0, 10).replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;
        existingCases.unshift({
          id: caseId,
          caseId,
          instrumentId: item.instrumentId,
          idPenerimaan: idTerima,
          installation: asalInstalasi,
          notes: item.missingComponentsNote || "Komponen set tidak lengkap saat pengembalian",
          status: "DALAM_KLARIFIKASI",
          operator: namaPenerima,
          createdAt: nowISO
        });
        saveDemoData("cssd_demo_discrepancies", existingCases);

        await writeAuditLog({
          action: "PENGEMBALIAN_INSTRUMEN_TIDAK_LENGKAP",
          module: "DISCREPANCY",
          entityType: "DISCREPANCY",
          entityId: caseId,
          instrumentId: item.instrumentId,
          transactionId: idTerima,
          reason: `Kasus ketidaksesuaian dibuat: ${item.missingComponentsNote || "Set tidak lengkap"}`,
          result: "SUCCESS",
          userName: namaPenerima,
          tenantId
        });
      }
    }

    saveDemoData("cssd_demo_live_state", demoLiveState);
    return { success: true, idTerima };
  }

  // FIRESTORE ATOMIC TRANSACTION
  let alreadyExecuted = false;
  await runTransaction(db, async (transaction) => {
    // 1. READ PHASE - Check transaction idempotency and Live State for ALL items
    const txRef = doc(db, "reception_transactions", idTerima);
    const txSnap = await transaction.get(txRef);
    if (txSnap.exists()) {
      const existingData = txSnap.data();
      if (existingData && existingData.tenantId && existingData.tenantId !== tenantId) {
        throw new Error("TENANT_CONTEXT_MISMATCH");
      }
      // Transaction already executed - idempotent guard
      alreadyExecuted = true;
      return;
    }

    const liveRefs = items.map(item => doc(db, "instrument_live_state", item.instrumentId));
    const liveSnaps = await Promise.all(liveRefs.map(ref => transaction.get(ref)));

    const invalidItems: string[] = [];

    liveSnaps.forEach((snap, idx) => {
      const instId = items[idx].instrumentId;
      if (snap.exists()) {
        const data = snap.data();
        if (data && data.tenantId && data.tenantId !== tenantId) {
          throw new Error("TENANT_CONTEXT_MISMATCH");
        }
        const stage = (data.statusAlur || data.currentState || "").toUpperCase();
        const loc = (data.currentLocation || "").toUpperCase();
        const holder = data.pemegangSaatIni || data.currentHolder || loc;

        const isInCSSD = loc === "CSSD" || loc === "KARANTINA_CSSD" || ACTIVE_CSSD_STAGES.includes(stage);
        const isDistributed = stage === "DIDISTRIBUSIKAN" || stage === "INSTALASI";

        if (isInCSSD && !isDistributed) {
          invalidItems.push(`- ${instId}: Sudah di CSSD (${loc})`);
        }

        if (userScope && userScope !== "ALL" && userScope !== "GLOBAL" && userScope !== "ALL_UNITS") {
          if (holder && holder.toUpperCase() !== userScope.toUpperCase()) {
            invalidItems.push(`- ${instId}: Dipegang oleh ${holder}, bukan scope Anda`);
          }
        }
      }
    });

    if (invalidItems.length > 0) {
      throw new Error(
        `⚠️ PENGEMBALIAN DITOLAK\n\nInstrumen tidak valid untuk dikembalikan:\n${invalidItems.join("\n")}`
      );
    }

    // 2. WRITE PHASE - Prepare Documents
    const legacyRecRef = doc(db, "receiving_transactions", idTerima);
    const ticketRef = doc(db, "tickets", idTerima);
    const wfRef = doc(db, "workflow_logs", idTerima);

    const txData: ReceptionTransactionDoc = {
      id: idTerima,
      idPenerimaan: idTerima,
      tanggalPenerimaan,
      asalInstalasi,
      namaPenyerah,
      namaPenerima,
      items,
      totalPcs,
      status: "AKTIF",
      tenantId,
      createdAt: nowISO,
      updatedAt: nowISO
    };

    transaction.set(txRef, txData);
    transaction.set(doc(db, "transaksi_penerimaan", idTerima), txData);
    transaction.set(legacyRecRef, { ...txData, currentStage: "decontamination", status: "Sedang di Cuci" });
    const ticketData = {
      ticketId: idTerima,
      idPenerimaan: idTerima,
      type: "RECEIVING",
      asalInstalasi,
      items: items.map(i => ({ instrumentId: i.instrumentId, name: i.name, qty: i.qty })),
      namaPenyerah,
      namaPenerima,
      status: "AKTIF",
      tenantId,
      createdAt: nowISO
    };
    transaction.set(ticketRef, ticketData);
    transaction.set(doc(db, "tiket", idTerima), ticketData);
    transaction.set(wfRef, {
      idTerima,
      lotNumber: idTerima,
      asal: asalInstalasi,
      currentStage: "decontamination",
      status: "Sedang di Cuci",
      items,
      tenantId,
      createdAt: serverTimestamp()
    });

    // Update Live State for each instrument
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const liveRef = liveRefs[idx];
      const snap = liveSnaps[idx];

      let isRecall = false;
      if (snap.exists()) {
        const d = snap.data();
        isRecall = d.recallStatus === "RECALL_REQUESTED" || d.kondisi === "TAHAN";
      }

      const isDamaged = item.condition === 'Bekas Pakai - Rusak' || item.isDamaged;
      let finalKondisi = "NORMAL";
      let finalLoc = "CSSD";

      if (isDamaged || isRecall) {
        finalKondisi = "TAHAN";
        finalLoc = "KARANTINA_CSSD";
      }

      const liveData = {
        instrumentId: item.instrumentId,
        statusAlur: "DITERIMA",
        currentState: "DITERIMA",
        kondisi: finalKondisi,
        currentLocation: finalLoc,
        currentHolder: "CSSD",
        pemegangSaatIni: "CSSD",
        activeTransaction: idTerima,
        tenantId,
        updatedAt: nowISO
      };
      transaction.set(liveRef, liveData, { merge: true });
      transaction.set(doc(db, "keadaan_aktif_instrumen", item.instrumentId), liveData, { merge: true });

      // If damaged, add to hold_records with deterministic ID
      if (isDamaged) {
        const holdRef = doc(db, "hold_records", `HOLD-${idTerima}-${item.instrumentId}`);
        transaction.set(holdRef, {
          holdId: `HOLD-${idTerima}-${item.instrumentId}`,
          instrumentId: item.instrumentId,
          reason: "PACKAGING_DAMAGE_OR_INSTRUMENT_CONTAMINATED",
          details: "Instrumen dikembalikan dalam kondisi rusak",
          status: "HOLD",
          reportedBy: namaPenerima,
          tenantId,
          createdAt: nowISO
        });
      }

      // If incomplete set, add to kasus_ketidaksesuaian with deterministic ID
      if (item.isIncomplete) {
        const caseId = `DISC-${idTerima}-${item.instrumentId}`;
        const caseRef = doc(db, "kasus_ketidaksesuaian", caseId);
        transaction.set(caseRef, {
          caseId,
          instrumentId: item.instrumentId,
          idPenerimaan: idTerima,
          installation: asalInstalasi,
          notes: item.missingComponentsNote || "Komponen set tidak lengkap saat pengembalian",
          status: "DALAM_KLARIFIKASI",
          operator: namaPenerima,
          tenantId,
          createdAt: nowISO
        });
      }
    }
  });

  if (alreadyExecuted) {
    return { success: true, idTerima };
  }

  // Write Append-Only Audit Logs after atomic transaction
  for (const item of items) {
    const isDamaged = item.condition === 'Bekas Pakai - Rusak' || item.isDamaged;
    let auditAction = isDamaged ? "PENGEMBALIAN_INSTRUMEN_RUSAK" : "PENGEMBALIAN_INSTRUMEN";

    await writeAuditLog({
      action: auditAction,
      module: "PENERIMAAN",
      entityType: "RECEIVING",
      entityId: idTerima,
      instrumentId: item.instrumentId,
      transactionId: idTerima,
      ticketId: idTerima,
      beforeState: "DIDISTRIBUSIKAN",
      afterState: "DITERIMA",
      beforeLocation: asalInstalasi,
      afterLocation: isDamaged ? "KARANTINA_CSSD" : "CSSD",
      beforeHolder: asalInstalasi,
      afterHolder: "CSSD",
      reason: `Pengembalian fisik instrumen dari ${asalInstalasi} oleh ${namaPenyerah}`,
      result: "SUCCESS",
      userName: namaPenerima,
      tenantId
    });

    if (item.isIncomplete) {
      await writeAuditLog({
        action: "PENGEMBALIAN_INSTRUMEN_TIDAK_LENGKAP",
        module: "DISCREPANCY",
        entityType: "DISCREPANCY",
        instrumentId: item.instrumentId,
        transactionId: idTerima,
        reason: `Pengembalian set tidak lengkap: ${item.missingComponentsNote || "Komponen kurang"}`,
        result: "SUCCESS",
        userName: namaPenerima,
        tenantId
      });
    }
  }

  return { success: true, idTerima };
}


/**
 * Execute Pickup / Serah Terima Transaction for a Ticket
 */
export async function executePickupTransaction(params: {
  ticketId: string;
  deliveredInstrumentIds: string[];
  recipientName: string;
  operatorName: string;
  userProfile: UserProfile;
  isDemoMode?: boolean;
}): Promise<{ success: boolean; isFullyCompleted: boolean }> {
  const tenantId = requireTenantId(params.userProfile);
  const { ticketId, deliveredInstrumentIds, recipientName, operatorName, userProfile, isDemoMode } = params;
  const nowISO = new Date().toISOString();

  if (deliveredInstrumentIds.length === 0) {
    throw new Error("Tidak ada instrumen yang dipilih untuk serah terima.");
  }

  if (isDemoMode) {
    const txs: ReceptionTransactionDoc[] = getDemoData("cssd_demo_reception_transactions", []);
    const txIdx = txs.findIndex(t => t.idPenerimaan === ticketId || t.id === ticketId);
    let targetUnit = "INSTALASI";

    if (txIdx > -1) {
      targetUnit = txs[txIdx].asalInstalasi;
    }

    const demoLiveState = getDemoData<Record<string, any>>("cssd_demo_live_state", {});

    for (const instId of deliveredInstrumentIds) {
      demoLiveState[instId] = {
        instrumentId: instId,
        statusAlur: "DIDISTRIBUSIKAN",
        currentState: "DIDISTRIBUSIKAN",
        kondisi: "NORMAL",
        currentLocation: targetUnit,
        currentHolder: targetUnit,
        activeTransaction: null,
        updatedAt: nowISO
      };

      await writeAuditLog({
        action: "PICKUP_PENERIMAAN",
        module: "PENERIMAAN",
        entityType: "RECEIVING",
        entityId: ticketId,
        instrumentId: instId,
        transactionId: ticketId,
        ticketId: ticketId,
        beforeState: "SIAP",
        afterState: "DIDISTRIBUSIKAN",
        beforeLocation: "CSSD",
        afterLocation: targetUnit,
        reason: `Pengambilan / serah terima instrumen via Tiket ${ticketId} kepada ${recipientName}`,
        result: "SUCCESS",
        userName: operatorName,
        tenantId
      });
    }

    saveDemoData("cssd_demo_live_state", demoLiveState);

    // Check if all items in txs are delivered
    let isFullyCompleted = true;
    if (txIdx > -1) {
      const tx = txs[txIdx];
      const allItemIds = tx.items.map(i => i.instrumentId);
      const allDelivered = allItemIds.every(id => {
        const ls = demoLiveState[id];
        return (ls && (ls.statusAlur === "DIDISTRIBUSIKAN" || ls.currentState === "DIDISTRIBUSIKAN")) || deliveredInstrumentIds.includes(id);
      });

      if (allDelivered) {
        txs[txIdx].status = "SELESAI";
        txs[txIdx].pickedUpAt = nowISO;
        txs[txIdx].pickedUpBy = recipientName;
        saveDemoData("cssd_demo_reception_transactions", txs);
      } else {
        isFullyCompleted = false;
      }
    }

    return { success: true, isFullyCompleted };
  }

  // FIRESTORE UPDATE
  const txRef = doc(db, "reception_transactions", ticketId);
  const ticketRef = doc(db, "tickets", ticketId);

  const result = await runTransaction(db, async (transaction) => {
    // 1. READ
    const txSnap = await transaction.get(txRef);
    const ticketSnap = await transaction.get(ticketRef);

    let targetUnit = "INSTALASI";
    let txItems: ScannedReceptionItem[] = [];

    if (txSnap.exists()) {
      const data = txSnap.data();
      if (data.tenantId && data.tenantId !== tenantId) {
        throw new Error("TENANT_CONTEXT_MISMATCH");
      }
      targetUnit = data.asalInstalasi || "INSTALASI";
      txItems = data.items || [];
    }

    if (ticketSnap.exists()) {
      const ticketData = ticketSnap.data();
      if (ticketData.tenantId && ticketData.tenantId !== tenantId) {
        throw new Error("TENANT_CONTEXT_MISMATCH");
      }
    }

    // Prepare live state references
    const allRelevantInstIds = Array.from(new Set([
      ...deliveredInstrumentIds,
      ...txItems.map(i => i.instrumentId)
    ]));

    const liveRefs = allRelevantInstIds.map(instId => doc(db, "instrument_live_state", instId));
    const liveSnaps = [];
    
    for (const liveRef of liveRefs) {
      liveSnaps.push(await transaction.get(liveRef));
    }

    // 2. VALIDATE
    const liveDataMap = new Map<string, any>();
    liveSnaps.forEach((snap, idx) => {
      const instId = allRelevantInstIds[idx];
      if (snap.exists()) {
        const liveData = snap.data();
        if (liveData.tenantId && liveData.tenantId !== tenantId) {
          throw new Error("TENANT_CONTEXT_MISMATCH");
        }
        liveDataMap.set(instId, liveData);
      }
    });

    // Validate that all delivered instruments exist in the system
    for (const instId of deliveredInstrumentIds) {
      if (!liveDataMap.has(instId)) {
        throw new Error(`Instrumen ${instId} tidak ditemukan.`);
      }
    }

    // 3. WRITE INSTRUMENT STATES
    for (const instId of deliveredInstrumentIds) {
      const liveRef = doc(db, "instrument_live_state", instId);
      transaction.set(liveRef, {
        instrumentId: instId,
        tenantId,
        statusAlur: "DIDISTRIBUSIKAN",
        currentState: "DIDISTRIBUSIKAN",
        kondisi: "NORMAL",
        currentLocation: targetUnit,
        currentHolder: targetUnit,
        activeTransaction: null,
        updatedAt: nowISO
      }, { merge: true });
    }

    // 4. CALCULATE isFullyCompleted
    let isFullyCompleted = true;
    if (txItems.length > 0) {
      const allDelivered = txItems.every(item => {
        const instId = item.instrumentId;
        if (deliveredInstrumentIds.includes(instId)) return true;
        
        const liveData = liveDataMap.get(instId);
        if (liveData) {
          const st = liveData.statusAlur || liveData.currentState;
          return st === "DIDISTRIBUSIKAN" || st === "INSTALASI";
        }
        return false;
      });

      if (allDelivered) {
        if (txSnap.exists()) {
          transaction.update(txRef, {
            status: "SELESAI",
            pickedUpAt: nowISO,
            pickedUpBy: recipientName,
            updatedAt: nowISO
          });
        }
        if (ticketSnap.exists()) {
          transaction.update(ticketRef, {
            status: "SELESAI",
            updatedAt: nowISO
          });
        }
      } else {
        isFullyCompleted = false;
      }
    }

    return { isFullyCompleted, targetUnit };
  });

  // 5. AUDIT LOGGING AFTER COMMIT
  for (const instId of deliveredInstrumentIds) {
    await writeAuditLog({
      action: "PICKUP_PENERIMAAN",
      module: "PENERIMAAN",
      entityType: "RECEIVING",
      entityId: ticketId,
      instrumentId: instId,
      transactionId: ticketId,
      ticketId: ticketId,
      beforeState: "SIAP",
      afterState: "DIDISTRIBUSIKAN",
      beforeLocation: "CSSD",
      afterLocation: result.targetUnit,
      reason: `Serah terima instrumen via Tiket ${ticketId} kepada ${recipientName}`,
      result: "SUCCESS",
      userName: operatorName,
      tenantId
    });
  }

  return { success: true, isFullyCompleted: result.isFullyCompleted };
}

/**
 * Execute VOID Ticket
 */
export async function executeVoidTicket(
  ticketId: string, 
  reason: string, 
  userProfile: UserProfile, 
  isDemoMode: boolean = false
): Promise<{ success: boolean }> {
  const tenantId = requireTenantId(userProfile);
  if (!reason.trim()) {
    throw new Error("Alasan VOID transaksi wajib diisi.");
  }

  const user = userProfile.name || userProfile.email || "Unknown User";

  const nowISO = new Date().toISOString();

  if (isDemoMode) {
    const txs: ReceptionTransactionDoc[] = getDemoData("cssd_demo_reception_transactions", []);
    const idx = txs.findIndex(t => t.idPenerimaan === ticketId || t.id === ticketId);
    if (idx > -1) {
      txs[idx].status = "VOID";
      txs[idx].voidReason = reason;
      txs[idx].voidAt = nowISO;
      txs[idx].voidBy = user;
      saveDemoData("cssd_demo_reception_transactions", txs);
    }

    await writeAuditLog({
      action: "VOID_PENERIMAAN",
      module: "PENERIMAAN",
      entityType: "RECEIVING",
      entityId: ticketId,
      transactionId: ticketId,
      ticketId: ticketId,
      reason: `VOID Tiket Penerimaan ${ticketId}: ${reason}`,
      result: "SUCCESS",
      userName: user,
      tenantId
    });

    return { success: true };
  }

  // Firestore update
  const txRef = doc(db, "reception_transactions", ticketId);
  const ticketRef = doc(db, "tickets", ticketId);

  await runTransaction(db, async (transaction) => {
    // 1. READ
    const txSnap = await transaction.get(txRef);
    const ticketSnap = await transaction.get(ticketRef);

    // 2. VALIDATE ticket / tx existence
    if (!txSnap.exists() && !ticketSnap.exists()) {
      throw new Error("Tiket tidak ditemukan.");
    }

    // Validate Reception Transaction
    if (txSnap.exists()) {
      const data = txSnap.data();
      if (data.tenantId && data.tenantId !== tenantId) {
        throw new Error("TENANT_CONTEXT_MISMATCH");
      }
      if (data.status === "SELESAI" || data.status === "VOID" || data.status === "CANCELLED") {
        throw new Error(`Tidak dapat melakukan VOID pada tiket dengan status ${data.status}`);
      }
    }

    // Validate Ticket
    if (ticketSnap.exists()) {
      const data = ticketSnap.data();
      if (data.tenantId && data.tenantId !== tenantId) {
        throw new Error("TENANT_CONTEXT_MISMATCH");
      }
      if (data.status === "SELESAI" || data.status === "VOID" || data.status === "CANCELLED") {
        throw new Error(`Tidak dapat melakukan VOID pada tiket dengan status ${data.status}`);
      }
    }

    // 3. WRITE
    if (txSnap.exists()) {
      transaction.update(txRef, {
        status: "VOID",
        voidReason: reason,
        voidAt: nowISO,
        voidBy: user,
        updatedAt: nowISO
      });
    }

    if (ticketSnap.exists()) {
      transaction.update(ticketRef, {
        status: "VOID",
        voidReason: reason,
        updatedAt: nowISO
      });
    }
  });

  await writeAuditLog({
    action: "VOID_PENERIMAAN",
    module: "PENERIMAAN",
    entityType: "RECEIVING",
    entityId: ticketId,
    transactionId: ticketId,
    ticketId: ticketId,
    reason: `VOID Tiket Penerimaan ${ticketId}: ${reason}`,
    result: "SUCCESS",
    userName: user,
    tenantId
  });

  return { success: true };
}
