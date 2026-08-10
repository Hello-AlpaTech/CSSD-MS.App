// Dedicated isolated storage for DEMO MODE
// Ensures zero interaction or pollution with production Firestore database.

export const DEMO_KEYS = {
  WORKFLOW_LOGS: "cssd_demo_workflow_logs",
  ACTIVITY_LOGS: "cssd_demo_activity_logs",
  AUDIT_LOGS: "cssd_demo_audit_logs",
  STERILE_STOCK: "cssd_demo_sterile_stock",
  DISTRIBUTIONS: "cssd_demo_distributions",
  INSTRUMENTS: "cssd_demo_instruments",
  UNITS: "cssd_demo_units",
  MACHINES: "cssd_demo_machines",
  SETTINGS: "cssd_demo_settings",
  USERS: "cssd_demo_users",
  UNIT_STOCK: "cssd_demo_unit_stock",
  MACHINE_TESTS: "cssd_demo_machine_tests",
  DISCREPANCY_CASES: "cssd_demo_discrepancy_cases"
};

export const INITIAL_DEMO_WORKFLOW_LOGS = [
  {
    firestoreDocId: "demo-wf-001",
    idTerima: "RCV-DEMO-01",
    instrumentId: "INST-001",
    instrumentName: "Set Bedah Mayor (Major Surgery Set)",
    asal: "IBS/OK",
    penyerah: "Siti Rahma (IBS)",
    penerima: "Pengguna Demo (CSSD)",
    currentStage: "decontamination",
    items: [
      { 
        id: "demo-item-001",
        instrumentId: "INST-001",
        name: "Set Bedah Mayor (Major Surgery Set)", 
        type: "set", 
        qty: 1,
        condition: "Bekas Pakai",
        receivedComponents: [
          { name: "Klem Pean 14cm", standardQty: 4, receivedQty: 4 }, 
          { name: "Gunting Jaringan", standardQty: 2, receivedQty: 2 },
          { name: "Pinset Anatomis", standardQty: 2, receivedQty: 2 }
        ] 
      }
    ],
    setCount: 1,
    singleCount: 0,
    totalPcs: 8,
    qty: 1,
    itemSummary: "1 Set (8 Pcs)",
    status: "Di Ruang Dekontaminasi",
    createdAtStr: new Date(Date.now() - 3600000).toISOString(),
    updatedAtStr: new Date(Date.now() - 3600000).toISOString(),
    history: [
      {
        stage: "penerimaan",
        timestampStr: new Date(Date.now() - 3600000).toISOString(),
        operatorName: "Pengguna Demo (CSSD)",
        notes: "Diterima dari IBS/OK oleh Siti Rahma (IBS)"
      }
    ]
  },
  {
    firestoreDocId: "demo-wf-002",
    idTerima: "RCV-DEMO-02",
    instrumentId: "INST-002",
    instrumentName: "Set Partus Kebidanan",
    asal: "KEBIDANAN",
    penyerah: "Bidan Nur",
    penerima: "Pengguna Demo (CSSD)",
    currentStage: "packaging",
    items: [
      { 
        id: "demo-item-002",
        instrumentId: "INST-002",
        name: "Set Partus Kebidanan", 
        type: "set",
        qty: 1,
        condition: "Bekas Pakai",
        receivedComponents: [
          { name: "Gunting Tali Pusat", standardQty: 1, receivedQty: 1 },
          { name: "Klem Umbilikal", standardQty: 2, receivedQty: 2 },
          { name: " setengah Kocher", standardQty: 1, receivedQty: 1 }
        ]
      }
    ],
    setCount: 1,
    singleCount: 0,
    totalPcs: 4,
    qty: 1,
    itemSummary: "1 Set (4 Pcs)",
    status: "Menunggu Pengemasan",
    decontaminationFinishedAtStr: new Date(Date.now() - 5400000).toISOString(),
    createdAtStr: new Date(Date.now() - 7200000).toISOString(),
    updatedAtStr: new Date(Date.now() - 5400000).toISOString()
  },
  {
    firestoreDocId: "demo-wf-003",
    idTerima: "RCV-DEMO-03",
    instrumentId: "INST-003",
    instrumentName: "Klem Hemostat Pean 14cm Curved",
    asal: "IGD",
    penyerah: "dr. Andi",
    penerima: "Pengguna Demo (CSSD)",
    currentStage: "sterilization",
    items: [
      {
        id: "demo-item-003",
        instrumentId: "INST-003",
        name: "Klem Hemostat Pean 14cm Curved",
        type: "single",
        qty: 10,
        condition: "Bekas Pakai",
        receivedComponents: []
      }
    ],
    setCount: 0,
    singleCount: 10,
    totalPcs: 10,
    qty: 10,
    itemSummary: "10 Pcs Single",
    status: "Sterilisasi Berjalan (BES Autoklaf)",
    createdAtStr: new Date(Date.now() - 10800000).toISOString(),
    updatedAtStr: new Date(Date.now() - 1800000).toISOString()
  }
];

export const INITIAL_DEMO_ACTIVITY_LOGS = [
  {
    id: "demo-act-001",
    timestampStr: new Date(Date.now() - 3600000).toISOString(),
    dateStr: new Date(Date.now() - 3600000).toLocaleString("id-ID"),
    instrumentName: "Set Bedah Mayor (Major Surgery Set)",
    installation: "IBS/OK",
    qty: 8,
    type: "Set",
    status: "Di Terima",
    operator: "Pengguna Demo (CSSD)"
  },
  {
    id: "demo-act-002",
    timestampStr: new Date(Date.now() - 5400000).toISOString(),
    dateStr: new Date(Date.now() - 5400000).toLocaleString("id-ID"),
    instrumentName: "Set Partus Kebidanan",
    installation: "KEBIDANAN",
    qty: 4,
    type: "Set",
    status: "Pencucian",
    operator: "Pengguna Demo (CSSD)"
  },
  {
    id: "demo-act-003",
    timestampStr: new Date(Date.now() - 10800000).toISOString(),
    dateStr: new Date(Date.now() - 10800000).toLocaleString("id-ID"),
    instrumentName: "Klem Hemostat Pean 14cm Curved",
    installation: "IGD",
    qty: 10,
    type: "Single",
    status: "Packaging",
    operator: "Pengguna Demo (CSSD)"
  }
];

export const INITIAL_DEMO_STERILE_STOCK = [
  {
    id: "demo-stock-001",
    lotNumber: "LOT-DEMO-2026-001",
    instrumentName: "Set Bedah Minor (Minor Surgery Set)",
    targetUnit: "IGD",
    qty: 2,
    rackLocation: "RAK-A1-S1",
    expiryDateStr: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    status: "Aman",
    machineUsed: "BUMA STERILIZER VACUM",
    indicatorPass: true,
    packType: "Pouch Steril",
    operator: "Pengguna Demo (CSSD)",
    createdAtStr: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: "demo-stock-002",
    lotNumber: "LOT-DEMO-2026-002",
    instrumentName: "Set Vena Sectie",
    targetUnit: "ICU",
    qty: 1,
    rackLocation: "RAK-B2-S3",
    expiryDateStr: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
    status: "Aman",
    machineUsed: "PLASMA STERA 120 (H2O2)",
    indicatorPass: true,
    packType: "Container Steril",
    operator: "Pengguna Demo (CSSD)",
    createdAtStr: new Date(Date.now() - 172800000).toISOString()
  }
];

export const INITIAL_DEMO_DISTRIBUTIONS = [
  {
    id: "demo-dist-001",
    distNumber: "DIST-DEMO-001",
    lotNumber: "LOT-DEMO-2026-000",
    instrumentName: "Set Histerektomi",
    targetUnit: "IBS/OK",
    recipientName: "Suster Anna",
    courierName: "Budi (Logistik CSSD)",
    qty: 1,
    status: "Telah Diterima Unit",
    distributedAtStr: new Date(Date.now() - 43200000).toISOString(),
    operator: "Pengguna Demo (CSSD)"
  }
];

export const INITIAL_DEMO_UNIT_STOCK = [
  {
    id: "demo-unit-stock-001",
    unit: "IGD",
    instrumentId: "INST-001",
    instrumentName: "Gunting Jaringan",
    qty: 3,
    type: "single",
    sterilizedAtStr: new Date(Date.now() - 3 * 86400000).toISOString(),
    expiresAtStr: new Date(Date.now() + 27 * 86400000).toISOString(),
    wrapType: "Pouch Steril",
    lastDistributedAtStr: new Date(Date.now() - 3 * 86400000).toISOString(),
    lotNumber: "LOT-IGD-001"
  },
  {
    id: "demo-unit-stock-002",
    unit: "IBS/OK",
    instrumentId: "INST-004",
    instrumentName: "Hecting Set",
    qty: 2,
    type: "set",
    sterilizedAtStr: new Date(Date.now() - 5 * 86400000).toISOString(),
    expiresAtStr: new Date(Date.now() + 25 * 86400000).toISOString(),
    wrapType: "Container Steril",
    lastDistributedAtStr: new Date(Date.now() - 5 * 86400000).toISOString(),
    lotNumber: "LOT-IBS-004"
  }
];

export const INITIAL_DEMO_MACHINE_TESTS = [
  {
    id: "test-demo-001",
    testDateStr: "28/07/2026, 07:30",
    machineName: "BUMA STERILIZER VACUM",
    mode: "Bowie-Dick",
    indicatorResult: "Valid",
    receiptImage: "",
    operatorName: "Ahmad Yani",
    createdAtStr: new Date(Date.now() - 7200000).toISOString(),
    notes: "Uji harian Bowie-Dick sebelum operasional - Perubahan warna indikator homogen (PASS)."
  },
  {
    id: "test-demo-002",
    testDateStr: "28/07/2026, 08:00",
    machineName: "BES AUTOCLAVE",
    mode: "Vacuum Test",
    indicatorResult: "Valid",
    receiptImage: "",
    operatorName: "Siti Rahma",
    createdAtStr: new Date(Date.now() - 3600000).toISOString(),
    notes: "Uji kebocoran vakum harian - Kebocoran < 1.3 mbar/min (LULUS)."
  }
];

export function getDemoData<T>(key: string, initialValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(initialValue));
      return initialValue;
    }
    return JSON.parse(raw);
  } catch (e) {
    return initialValue;
  }
}

export function saveDemoData<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent("cssd_demo_store_change", { detail: { key, data } }));
  } catch (e) {
    console.error("Error saving demo data:", e);
  }
}

export function resetDemoStore(): void {
  localStorage.setItem(DEMO_KEYS.WORKFLOW_LOGS, JSON.stringify(INITIAL_DEMO_WORKFLOW_LOGS));
  localStorage.setItem(DEMO_KEYS.ACTIVITY_LOGS, JSON.stringify(INITIAL_DEMO_ACTIVITY_LOGS));
  localStorage.setItem(DEMO_KEYS.STERILE_STOCK, JSON.stringify(INITIAL_DEMO_STERILE_STOCK));
  localStorage.setItem(DEMO_KEYS.DISTRIBUTIONS, JSON.stringify(INITIAL_DEMO_DISTRIBUTIONS));
  localStorage.setItem(DEMO_KEYS.UNIT_STOCK, JSON.stringify(INITIAL_DEMO_UNIT_STOCK));
  localStorage.setItem(DEMO_KEYS.MACHINE_TESTS, JSON.stringify(INITIAL_DEMO_MACHINE_TESTS));
  window.dispatchEvent(new CustomEvent("cssd_demo_store_change", { detail: { key: "all" } }));
}
