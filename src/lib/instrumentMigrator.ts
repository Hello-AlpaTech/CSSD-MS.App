import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";
import { formatToStandardSerialNumber, SERIAL_NUMBER_REGEX } from "./serialNumberUtils";

let isMigrating = false;

/**
 * Migration task: Scans Firestore collections for instruments or unit_stock records 
 * with legacy or non-conforming Serial Numbers (e.g. 'st-bedah-minor1/ibs') 
 * and migrates them to standard format 'ST/SG-[5 Karakter]-[3 Digit Angka]' (e.g. 'ST-BEDAH-001').
 */
export async function migrateUploadedInstruments(): Promise<{ migratedCount: number; errors: number }> {
  if (isMigrating) return { migratedCount: 0, errors: 0 };
  isMigrating = true;

  let migratedCount = 0;
  let errors = 0;

  try {
    // 1. Fetch instruments collection
    const instSnap = await getDocs(collection(db, "instruments"));
    const existingIds = new Set<string>();

    // Collect existing standard IDs first to avoid collisions
    instSnap.forEach(d => {
      if (SERIAL_NUMBER_REGEX.test(d.id)) {
        existingIds.add(d.id);
      }
    });

    const migrationMap = new Map<string, string>(); // oldId -> newId

    for (const docSnap of instSnap.docs) {
      const oldId = docSnap.id;
      const data = docSnap.data();
      const rawName = data.name || "Instrumen";
      const rawType = data.type === "set" ? "set" : "single";

      if (!SERIAL_NUMBER_REGEX.test(oldId) || (data.serialNumber && !SERIAL_NUMBER_REGEX.test(data.serialNumber))) {
        // Calculate standard serial number
        let seq = 1;
        let newId = formatToStandardSerialNumber(oldId, rawName, rawType, seq);
        while (existingIds.has(newId) && newId !== oldId) {
          seq++;
          newId = formatToStandardSerialNumber(oldId, rawName, rawType, seq);
        }

        existingIds.add(newId);
        migrationMap.set(oldId, newId);

        // Save new document with normalized ID
        const newDocRef = doc(db, "instruments", newId);
        await setDoc(newDocRef, {
          ...data,
          id: newId,
          serialNumber: newId,
          sku: `SKU-${rawType.toUpperCase()}-${newId}`,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        // Delete old document if ID changed
        if (oldId !== newId) {
          await deleteDoc(doc(db, "instruments", oldId));
        }

        migratedCount++;
      }
    }

    // 2. Fetch unit_stock collection and update references
    if (migrationMap.size > 0) {
      const stockSnap = await getDocs(collection(db, "unit_stock"));
      for (const stockDoc of stockSnap.docs) {
        const stockData = stockDoc.data();
        const oldInstId = stockData.instrumentId || "";

        if (migrationMap.has(oldInstId)) {
          const newInstId = migrationMap.get(oldInstId)!;
          const unit = stockData.unit || "Global";
          const safeUnitDocId = `${unit.replace(/[\/\s\\]+/g, "_")}_${newInstId}`;

          const newStockRef = doc(db, "unit_stock", safeUnitDocId);
          await setDoc(newStockRef, {
            ...stockData,
            instrumentId: newInstId,
            lotNumber: stockData.lotNumber && stockData.lotNumber.includes(oldInstId) 
              ? stockData.lotNumber.replace(oldInstId, newInstId) 
              : `LOT-${newInstId}`
          }, { merge: true });

          if (stockDoc.id !== safeUnitDocId) {
            await deleteDoc(doc(db, "unit_stock", stockDoc.id));
          }
        }
      }
    }

  } catch (err) {
    console.error("Error migrating uploaded instruments:", err);
    errors++;
  } finally {
    isMigrating = false;
  }

  return { migratedCount, errors };
}
