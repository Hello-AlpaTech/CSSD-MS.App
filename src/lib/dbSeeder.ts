import { db, handleFirestoreError, OperationType } from "./firebase";
import { 
  collection, 
  getDocs, 
  getDoc,
  setDoc, 
  doc, 
  query, 
  limit, 
  Timestamp 
} from "firebase/firestore";
import { InstrumentCatalog, Machine, WorkflowLog, SterileStock, DistributionRecord, EnvironmentalLog } from "../types";

// Seed data definition
export const DEFAULT_INSTRUMENTS: InstrumentCatalog[] = [
  {
    id: "ST-MINOR-001",
    name: "Surgical Minor Set (Set Bedah Minor)",
    sku: "SKU-MED-MIN-001",
    description: "Surgical kit used for minor skin surgeries, wound suture, and small incisions. Highly demanded in Emergency Room and Polyclinic.",
    type: "set",
    originUnit: "IGD",
    sterileDurationDays: 30,
    totalStock: 25,
    items: [
      { name: "Needle Holder 14cm", qty: 1 },
      { name: "Scalpel Handle No. 3", qty: 1 },
      { name: "Surgical Scissors Blunt/Sharp 14cm", qty: 1 },
      { name: "Anatomical Tweezers (Pinset Anatomis) 14cm", qty: 1 },
      { name: "Surgical Tweezers (Pinset Sirurgis) 14cm", qty: 1 },
      { name: "Mosquito Forceps Curved 12.5cm", qty: 2 },
      { name: "Backhaus Towel Clamp 11cm", qty: 2 }
    ]
  },
  {
    id: "ST-MAJOR-001",
    name: "Surgical Major Set (Set Bedah Mayor)",
    sku: "SKU-MED-MAJ-002",
    description: "Heavy surgical kit utilized for open abdominal, thoracic, and other major general surgical procedures. Primarily used in Operating Theater.",
    type: "set",
    originUnit: "OK Sentral",
    sterileDurationDays: 30,
    totalStock: 12,
    items: [
      { name: "Mayo Scissors Straight 17cm", qty: 1 },
      { name: "Metzenbaum Scissors Curved 18cm", qty: 1 },
      { name: "Tissue Forceps 1:2 Teeth 16cm", qty: 2 },
      { name: "Halsted Mosquito Forceps Straight", qty: 4 },
      { name: "Kelly Forceps Curved 14cm", qty: 4 },
      { name: "Rochester-Pean Forceps Curved 18cm", qty: 2 },
      { name: "Allis Tissue Forceps 15cm", qty: 2 },
      { name: "Babcock Tissue Forceps 16cm", qty: 2 },
      { name: "Sponge Forceps (Foerster) 25cm", qty: 2 },
      { name: "Balfour Abdominal Retractor", qty: 1 }
    ]
  },
  {
    id: "ST-SECTI-001",
    name: "Sectio Caesarea Set (Set Bedah SC)",
    sku: "SKU-MED-OBS-003",
    description: "Standard set for obstetrics & gynecological cesarean section surgeries. High turnover rate.",
    type: "set",
    originUnit: "VK Kebidanan",
    sterileDurationDays: 30,
    totalStock: 8,
    items: [
      { name: "Green-Armytage Clamp (Uterine)", qty: 4 },
      { name: "Fritsch Retractor 250 x 60mm", qty: 1 },
      { name: "Bladder Retractor (Doyen) 250mm", qty: 1 },
      { name: "Surgical Scissors Curved 18cm", qty: 1 },
      { name: "Pinset Sirurgis Panjang 20cm", qty: 2 },
      { name: "Heaney Hysterectomy Forceps", qty: 2 }
    ]
  },
  {
    id: "ST-DENTA-001",
    name: "Dental Extraction Set (Set Cabut Gigi)",
    sku: "SKU-MED-DEN-004",
    description: "Instruments for standard adult tooth extractions, including forceps and elevators. Standard Polyclinic inventory.",
    type: "set",
    originUnit: "Poli Rawat Jalan",
    sterileDurationDays: 30,
    totalStock: 15,
    items: [
      { name: "Upper Anterior Forceps No. 1", qty: 1 },
      { name: "Upper Molar Forceps No. 18", qty: 1 },
      { name: "Lower Universal Forceps No. 151", qty: 1 },
      { name: "Straight Bein Elevator 3mm", qty: 1 },
      { name: "Cryer Elevator Left & Right", qty: 2 },
      { name: "Dental Mouth Mirror with Handle", qty: 2 }
    ]
  },
  {
    id: "ST-LAPAR-001",
    name: "Laparoscopic Endosurgery Set (Set Laparoskopi)",
    sku: "SKU-MED-LAP-005",
    description: "High-tech, heat-sensitive micro instruments for laparoscopic keyhole surgeries. Requires low-temperature Hydrogen Peroxide Plasma sterilization.",
    type: "set",
    sterileDurationDays: 30,
    totalStock: 6,
    items: [
      { name: "Laparoscopic Camera Light Guide Cable", qty: 1 },
      { name: "Maryland Dissector Curved 5mm", qty: 1 },
      { name: "Metzenbaum Scissors Monopolar 5mm", qty: 1 },
      { name: "Babcock Grasper 5mm x 330mm", qty: 1 },
      { name: "Trocar & Cannula 5mm and 10mm", qty: 2 },
      { name: "Suction-Irrigation Cannula 5mm", qty: 1 }
    ]
  }
];

export const DEFAULT_MACHINES: Machine[] = [
  {
    id: "mach-steam-buma",
    name: "Vacuum Pulse Sterilizer Buma",
    type: "sterilizer_steam",
    method: "steam_autoclave",
    temperature: "134",
    duration: "30",
    status: "ready",
    lastMaintenanceDate: Timestamp.fromDate(new Date("2026-06-15")),
    serialNumber: "SN-BUMA-V900",
    capacity: "300 Liters",
    modes: ["Standard 134°C", "Gentle 121°C", "Liquid Mode", "BD Test"],
    temperatureRange: "105°C - 138°C",
    cycleTimes: "30 - 55 mins",
    specs: "High-grade vacuum pulsing sterilizer, perfect for large batch loads and multi-lumen tubular surgical instruments."
  },
  {
    id: "mach-steam-as25",
    name: "BES Autoklaf Portable AS-25L",
    type: "sterilizer_steam",
    method: "steam_autoclave",
    temperature: "121",
    duration: "30",
    status: "ready",
    lastMaintenanceDate: Timestamp.fromDate(new Date("2026-07-01")),
    serialNumber: "SN-BES-AS25",
    capacity: "24 Liters",
    modes: ["Quick Autoclave", "Instrument Pack"],
    temperatureRange: "121°C - 126°C",
    cycleTimes: "20 - 40 mins",
    specs: "Compact and portable vertical autoclave, suitable for rapid sterilization of solid instruments."
  },
  {
    id: "mach-plasma-stera120",
    name: "Antiku Plasma Stera 120",
    type: "sterilizer_plasma",
    method: "plasma_h2o2",
    temperature: "50",
    duration: "45",
    status: "ready",
    lastMaintenanceDate: Timestamp.fromDate(new Date("2026-05-20")),
    serialNumber: "SN-ANTIKU-S120",
    capacity: "120 Liters",
    modes: ["Fast Cycle", "Standard Cycle", "Advanced Cycle"],
    temperatureRange: "45°C - 55°C",
    cycleTimes: "25 - 45 mins",
    specs: "Low-temperature hydrogen peroxide gas plasma sterilizer. Safely sterilizes heat and moisture sensitive tools like scopes and fiber optic cables."
  },
  {
    id: "mach-washer-01",
    name: "Miele PG 8582 Washer Disinfector",
    type: "washer",
    method: "washer_thermal",
    temperature: "93",
    duration: "50",
    status: "ready",
    lastMaintenanceDate: Timestamp.fromDate(new Date("2026-06-10")),
    serialNumber: "SN-MIE-8582",
    capacity: "150 Liters",
    modes: ["Standard Wash", "Thermal Disinfection 93°C", "Enzymatic Soak"],
    temperatureRange: "30°C - 95°C",
    cycleTimes: "45 - 60 mins",
    specs: "Automated undercounter washer-disinfector providing certified medical thermal disinfection."
  }
];

export async function seedDatabaseIfEmpty() {
  try {
    // Check if initial seeding was already completed previously
    const seedFlagRef = doc(db, "settings", "db_seed_flag");
    const seedFlagSnap = await getDoc(seedFlagRef);

    if (seedFlagSnap.exists()) {
      console.log("Database seed flag found. Skipping automatic re-seeding.");
      return;
    }

    console.log("First time initialization: Seeding default CSSD data...");

    const instCol = collection(db, "instruments");
    const instSnap = await getDocs(query(instCol, limit(1)));
    
    if (instSnap.empty) {
      console.log("Seeding CSSD Database collections: Instruments...");
      // 1. Seed Instruments
      for (const inst of DEFAULT_INSTRUMENTS) {
        await setDoc(doc(db, "instruments", inst.id), inst);
      }
    }

    const machCol = collection(db, "machines");
    const machSnap = await getDocs(query(machCol, limit(1)));
    
    if (machSnap.empty) {
      console.log("Seeding CSSD Database collections: Machines...");
      // 2. Seed Machines
      for (const mach of DEFAULT_MACHINES) {
        await setDoc(doc(db, "machines", mach.id), mach);
      }
    }
    
    if (instSnap.empty && machSnap.empty) {
      console.log("Seeding CSSD Database collections with historical data...");
      const now = new Date();
      const sterileStock: SterileStock[] = [
        {
          id: "LOT-20260716-001",
          lotNumber: "LOT-20260716-001",
          instrumentId: "ST-MINOR-001",
          instrumentName: "Surgical Minor Set (Set Bedah Minor)",
          qty: 5,
          shelfLocation: "RAK-A1-POUCH",
          sterilizedAt: Timestamp.fromDate(new Date(now.getTime() - 24 * 3600 * 1000)), // yesterday
          expiresAt: Timestamp.fromDate(new Date(now.getTime() + 29 * 24 * 3600 * 1000)), // expiry 30 days
          status: "sterile",
          machineName: "Vacuum Pulse Sterilizer Buma",
          cycleNumber: 114
        },
        {
          id: "LOT-20260716-002",
          lotNumber: "LOT-20260716-002",
          instrumentId: "ST-MAJOR-001",
          instrumentName: "Surgical Major Set (Set Bedah Mayor)",
          qty: 2,
          shelfLocation: "RAK-C1-RIGID",
          sterilizedAt: Timestamp.fromDate(new Date(now.getTime() - 20 * 3600 * 1000)),
          expiresAt: Timestamp.fromDate(new Date(now.getTime() + 29 * 24 * 3600 * 1000)),
          status: "sterile",
          machineName: "Vacuum Pulse Sterilizer Buma",
          cycleNumber: 115
        },
        {
          id: "LOT-20260715-001",
          lotNumber: "LOT-20260715-001",
          instrumentId: "ST-LAPAR-001",
          instrumentName: "Laparoscopic Endosurgery Set (Set Laparoskopi)",
          qty: 2,
          shelfLocation: "RAK-A1-POUCH",
          sterilizedAt: Timestamp.fromDate(new Date(now.getTime() - 48 * 3600 * 1000)),
          expiresAt: Timestamp.fromDate(new Date(now.getTime() + 88 * 24 * 3600 * 1000)), // 90 days for plasma
          status: "sterile",
          machineName: "Antiku Plasma Stera 120",
          cycleNumber: 42
        }
      ];

      for (const stock of sterileStock) {
        await setDoc(doc(db, "sterile_stock", stock.id), stock);
      }

      // 4. Seed some sample clinical requests
      const clinicalRequests: DistributionRecord[] = [
        {
          id: "REQ-1001",
          requestingUnit: "Kamar Operasi (OK) Sentral",
          requestedItems: [
            { instrumentId: "ST-MAJOR-001", name: "Surgical Major Set (Set Bedah Mayor)", qty: 2, fulfilledQty: 1 },
            { instrumentId: "ST-SECTI-001", name: "Sectio Caesarea Set (Set Bedah SC)", qty: 1, fulfilledQty: 0 }
          ],
          status: "partially_fulfilled",
          createdAt: Timestamp.fromDate(new Date(now.getTime() - 4 * 3600 * 1000)),
          notes: "Cito! Diperlukan segera untuk operasi darurat abdomen dan SC jam 08:00 besok."
        },
        {
          id: "REQ-1002",
          requestingUnit: "UGD / IGD Lantai 1",
          requestedItems: [
            { instrumentId: "ST-MINOR-001", name: "Surgical Minor Set (Set Bedah Minor)", qty: 3, fulfilledQty: 0 }
          ],
          status: "pending",
          createdAt: Timestamp.fromDate(new Date(now.getTime() - 1.5 * 3600 * 1000)),
          notes: "Ketersediaan stok IGD menipis karena lonjakan kecelakaan lalu lintas malam ini."
        }
      ];

      for (const req of clinicalRequests) {
        await setDoc(doc(db, "distribution_logs", req.id), req);
      }

      // 5. Seed some sample environmental logs (Sterile Room Temperature & Humidity check)
      const envLogs: EnvironmentalLog[] = [
        {
          id: "ENV-20260717-01",
          timestamp: Timestamp.fromDate(new Date(now.getTime() - 12 * 3600 * 1000)),
          temperatureCelsius: 21.4,
          humidityPercent: 48.5,
          operatorName: "Zaka (CSSD)",
          status: "normal"
        },
        {
          id: "ENV-20260717-02",
          timestamp: Timestamp.fromDate(new Date(now.getTime() - 4 * 3600 * 1000)),
          temperatureCelsius: 22.1,
          humidityPercent: 52.0,
          operatorName: "Aris (CSSD)",
          status: "normal"
        }
      ];

      for (const log of envLogs) {
        await setDoc(doc(db, "environmental_logs", log.id), log);
      }

      // 6. Seed some historical workflows in workflow_logs
      const workflowLogs: WorkflowLog[] = [
        {
          id: "LOT-20260716-001",
          lotNumber: "LOT-20260716-001",
          instrumentId: "ST-MINOR-001",
          instrumentName: "Surgical Minor Set (Set Bedah Minor)",
          qty: 5,
          currentStage: "sterile_storage",
          createdAt: Timestamp.fromDate(new Date(now.getTime() - 36 * 3600 * 1000)),
          updatedAt: Timestamp.fromDate(new Date(now.getTime() - 24 * 3600 * 1000)),
          history: [
            { stage: "decontamination", timestamp: Timestamp.fromDate(new Date(now.getTime() - 36 * 3600 * 1000)), operatorName: "Zaka (CSSD)", notes: "Menerima 5 set kotor dari Kamar Operasi." },
            { stage: "washing", timestamp: Timestamp.fromDate(new Date(now.getTime() - 34 * 3600 * 1000)), operatorName: "Aris (CSSD)", notes: "Melalui pencucian mesin Miele PG 8582, lulus uji visual." },
            { stage: "packaging", timestamp: Timestamp.fromDate(new Date(now.getTime() - 30 * 3600 * 1000)), operatorName: "Zaka (CSSD)", notes: "Dikemas dengan pouch dan dipasang indikator kimia internal." },
            { stage: "sterilization", timestamp: Timestamp.fromDate(new Date(now.getTime() - 26 * 3600 * 1000)), operatorName: "Zaka (CSSD)", notes: "Disterilisasi Autoclave HS66 Siklus #114. Suhu 134C, Tekanan 2.1 bar, lolos sensor kimia luar." },
            { stage: "sterile_storage", timestamp: Timestamp.fromDate(new Date(now.getTime() - 24 * 3600 * 1000)), operatorName: "Aris (CSSD)", notes: "Disimpan di RAK-A1-STABIL." }
          ],
          decontamination: {
            receivedAt: Timestamp.fromDate(new Date(now.getTime() - 36 * 3600 * 1000)),
            receivedBy: "Zaka (CSSD)",
            sourceUnit: "Kamar Operasi (OK) Sentral",
            dirtyQty: 5,
            hasBloodResidue: true,
            isCorroded: false
          },
          washing: {
            startedAt: Timestamp.fromDate(new Date(now.getTime() - 35 * 3600 * 1000)),
            completedAt: Timestamp.fromDate(new Date(now.getTime() - 34 * 3600 * 1000)),
            operator: "Aris (CSSD)",
            method: "washer_disinfector",
            machineId: "mach-washer-01",
            chemicalUsed: "Secusept enzymatic",
            tempCelsius: 93,
            isPassedVisualInspection: true
          },
          packaging: {
            packagedAt: Timestamp.fromDate(new Date(now.getTime() - 30 * 3600 * 1000)),
            operator: "Zaka (CSSD)",
            wrapType: "sterilization_pouch",
            indicatorInternalPlaced: true,
            lotLabelGenerated: true
          },
          sterilization: {
            startedAt: Timestamp.fromDate(new Date(now.getTime() - 27 * 3600 * 1000)),
            completedAt: Timestamp.fromDate(new Date(now.getTime() - 26 * 3600 * 1000)),
            operator: "Zaka (CSSD)",
            machineId: "mach-steam-buma",
            machineName: "Vacuum Pulse Sterilizer Buma",
            cycleNumber: 114,
            method: "steam_autoclave",
            tempCelsius: 134,
            pressureBar: 2.1,
            durationMinutes: 30,
            indicatorChemicalExternal: "pass",
            indicatorBiological: "pass",
            isPassed: true
          },
          storage: {
            storedAt: Timestamp.fromDate(new Date(now.getTime() - 24 * 3600 * 1000)),
            storedBy: "Aris (CSSD)",
            shelfLocation: "RAK-A1-POUCH",
            expiresAt: Timestamp.fromDate(new Date(now.getTime() + 29 * 24 * 3600 * 1000))
          }
        }
      ];

      for (const log of workflowLogs) {
        await setDoc(doc(db, "workflow_logs", log.id), log);
      }

      console.log("CSSD Database seeded successfully!");
    } else {
      console.log("Database already initialized, skipping seed.");
    }

    // Set flag so seeding never runs again automatically
    await setDoc(doc(db, "settings", "db_seed_flag"), { 
      seeded: true, 
      initializedAt: Timestamp.now() 
    });
  } catch (error) {
    console.error("Error seeding database: ", error);
    handleFirestoreError(error, OperationType.WRITE, "seeding");
  }
}
