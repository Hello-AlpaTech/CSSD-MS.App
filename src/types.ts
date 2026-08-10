export type RoleType = 'ADMIN' | 'PETUGAS_CSSD' | 'PENGAWAS' | 'PETUGAS_INSTALASI' | 'VIEWER' | 'PLATFORM_ADMIN';
export type AccountStatus = 'AKTIF' | 'NONAKTIF' | 'DITANGGUHKAN';
export type UserRole = RoleType | 'admin' | 'operator' | 'supervisor' | 'cssd' | 'ruangan' | 'platform_admin';

export type TenantStatus = 'AKTIF' | 'NONAKTIF';

export interface Tenant {
  id: string;
  tenantId: string; // Permanent immutable ID, e.g. "RSUD-BENDA"
  kodeTenant: string;
  namaRumahSakit: string;
  namaSingkat: string;
  alamat?: string;
  kota?: string;
  telepon?: string;
  email?: string;
  logo?: string;
  statusTenant: TenantStatus;
  tanggalAktif?: any;
  tanggalNonaktif?: any;
  createdAt?: any;
  updatedAt?: any;
  namaCSSD?: string;
  pengaturanCetak?: {
    printerType?: string;
    paperWidth?: string;
    autoPrintQr?: boolean;
  };
  timezone?: string;
  formatTanggal?: string;
  nonactiveReason?: string;
}

export interface TenantInstallation {
  id: string;
  installationId: string;
  tenantId: string;
  kodeInstalasi: string;
  namaInstalasi: string;
  status: 'AKTIF' | 'NONAKTIF';
  createdAt?: any;
  updatedAt?: any;
}

export interface UserProfile {
  uid: string;
  userId?: string;
  nip: string;
  name: string;
  email: string;
  whatsapp?: string;
  role: UserRole;
  tenantId: string; // e.g. RSUD-BENDA
  scope: string[] | 'ALL'; // e.g. ["IGD", "OK"] or "ALL"
  statusAkun: AccountStatus; // AKTIF | NONAKTIF | DITANGGUHKAN
  active: boolean; // legacy compatibility (statusAkun === 'AKTIF')
  permissions: string[];
  photoUrl?: string;
  createdAt?: any;
  updatedAt?: any;
  lastLoginAt?: any;
}

export interface InstrumentCatalog {
  id: string;
  name: string;
  sku: string;
  type: 'single' | 'set'; // Instrumen tunggal atau satu set
  originUnit?: string; // Asal Instalasi
  description: string;
  items: { name: string; qty: number }[]; // List of individual items inside a set
  sterileDurationDays: number; // e.g. 30 days for pouch, 15 days for crepe paper
  totalStock: number;
}

export interface BMHPBatch {
  id: string;
  qty: number;
  expirationDate: string;
  receivedAt: string;
}

export interface BMHPCatalog {
  id: string;
  name: string;
  category: 'sterile' | 'non_sterile';
  imageUrl?: string;
  stockQty: number;
  minStockAlert: number;
  unit: string; // e.g. 'box', 'pcs', 'roll'
  expirationDate?: any; // Firestore Timestamp or string
  lastRestockedAt?: any;
  batches?: BMHPBatch[];
  isReturnable?: boolean; // false for single-use (gloves, kassa), true for returnable items
  tenantId?: string;
}

export interface BMHPLog {
  id: string;
  bmhpId: string;
  bmhpName: string;
  type: 'in' | 'out';
  qty: number;
  operator: string;
  timestamp: any;
  notes?: string;
  currentStock?: number;
  expDate?: string;
  tenantId?: string;
}

export interface BMHPRequestItem {
  bmhpId: string;
  bmhpName: string;
  qtyRequested: number;
  qtyFulfilled?: number;
  unit: string;
  batchNumber?: string;
  expirationDate?: string;
}

export type BMHPRequestStatus = 'DIAJUKAN' | 'DISETUJUI' | 'DITOLAK' | 'DIPROSES' | 'SELESAI' | 'DIBATALKAN';

export interface BMHPRequest {
  id: string; // e.g. REQ-BMHP-20260804-001
  tenantId: string;
  requestingUnit: string; // e.g. "IGD", "IBS_OK"
  requestedBy: string;
  requestedByUserId?: string;
  items: BMHPRequestItem[];
  status: BMHPRequestStatus;
  notes?: string;
  approverName?: string;
  approvedAt?: any;
  rejectionReason?: string;
  createdAt: any;
  updatedAt: any;
}

export interface BMHPDistributionItem {
  bmhpId: string;
  bmhpName: string;
  qty: number;
  unit: string;
  batchNumber?: string;
  expirationDate?: string;
}

export interface BMHPDistribution {
  id: string;
  requestId?: string;
  tenantId: string;
  targetUnit: string;
  dispatchBy: string;
  recipientName: string;
  items: BMHPDistributionItem[];
  notes?: string;
  createdAt: any;
}

export interface BMHPReturnItem {
  bmhpId: string;
  bmhpName: string;
  qty: number;
  unit: string;
  condition: 'NORMAL' | 'RUSAK' | 'KOTOR';
  notes?: string;
}

export interface BMHPReturn {
  id: string;
  tenantId: string;
  sourceUnit: string;
  returnedBy: string;
  items: BMHPReturnItem[];
  status: 'DIKEMBALIKAN' | 'DITAHAN' | 'DITOLAK';
  notes?: string;
  createdAt: any;
}

export type LinenStatus = 'TERSEDIA' | 'DIMINTA' | 'DISTRIBUSI' | 'DI_INSTALASI' | 'KOTOR' | 'DIKEMBALIKAN' | 'DIPROSES' | 'TERSEDIA_KEMBALI' | 'RUSAK' | 'HILANG';

export interface LinenItem {
  id: string;
  name: string; // e.g. 'Linen Operasi', 'Linen Set Operasi', 'Linen Cover', 'Linen Draping'
  category?: string;
  unit: string;
  stockQty: number;
  minStockAlert: number;
  tenantId?: string;
}

export interface LinenRequestItem {
  linenId: string;
  linenName: string;
  qtyRequested: number;
  qtyFulfilled?: number;
  unit: string;
}

export interface LinenRequest {
  id: string;
  tenantId: string;
  requestingUnit: string; // IBS/OK, VK, etc.
  requestedBy: string;
  items: LinenRequestItem[];
  status: 'DIAJUKAN' | 'DISETUJUI' | 'DITOLAK' | 'DIPROSES' | 'SELESAI' | 'DIBATALKAN';
  notes?: string;
  approverName?: string;
  createdAt: any;
  updatedAt: any;
}

export interface LinenReturnItem {
  linenId: string;
  linenName: string;
  qty: number;
  unit: string;
  condition: 'KOTOR' | 'RUSAK' | 'HILANG';
  notes?: string;
}

export interface LinenReturn {
  id: string;
  tenantId: string;
  sourceUnit: string;
  returnedBy: string;
  items: LinenReturnItem[];
  status: 'DIKEMBALIKAN' | 'DITAHAN' | 'PROSES_LAUNDRY';
  notes?: string;
  createdAt: any;
}

export type WorkflowStage = 'decontamination' | 'washing' | 'packaging' | 'sterilization' | 'sterile_storage' | 'distributed' | 'recalled';

export interface WorkflowLog {
  id: string; // usually lotNumber
  lotNumber: string;
  instrumentId: string;
  instrumentName: string;
  qty: number;
  currentStage: WorkflowStage;
  createdAt: any; // Firestore Timestamp
  updatedAt: any;
  history: {
    stage: WorkflowStage;
    timestamp: any;
    operatorName: string;
    notes?: string;
  }[];
  
  // 1. Decontamination details
  decontamination?: {
    receivedAt: any;
    receivedBy: string;
    sourceUnit: string;
    dirtyQty: number;
    hasBloodResidue: boolean;
    isCorroded: boolean;
    notes?: string;
  };

  // 2. Washing details
  washing?: {
    startedAt: any;
    completedAt: any;
    operator: string;
    method: 'manual' | 'ultrasonic' | 'washer_disinfector';
    machineId?: string;
    chemicalUsed: string; // e.g. enzymatic detergent
    tempCelsius?: number;
    isPassedVisualInspection: boolean;
  };

  // 3. Packaging details
  packaging?: {
    packagedAt: any;
    operator: string;
    wrapType:  'sterilization_pouch' | 'linen';
    indicatorInternalPlaced: boolean; // Chemical indicator strip inside
    lotLabelGenerated: boolean;
  };

  // 4. Sterilization details
  sterilization?: {
    startedAt: any;
    completedAt: any;
    startTimeStr?: string;
    endTimeStr?: string;
    operator: string;
    machineId: string;
    machineName: string;
    cycleNumber: number | string;
    batchNumber?: string;
    receiptImage?: string;
    method: 'steam_autoclave' | 'plasma_h2o2' | 'dry_heat';
    tempCelsius: number;
    pressureBar: number;
    durationMinutes: number;
    indicatorChemicalExternal: 'pass' | 'fail';
    indicatorBiological: 'pass' | 'fail' | 'pending';
    isPassed: boolean;
  };

  // 5. Storage details
  storage?: {
    storedAt: any;
    storedBy: string;
    shelfLocation: string; // e.g. "RAK-A1", "RAK-B3"
    expiresAt: any;
  };

  // 6. Distribution details
  distribution?: {
    distributedAt: any;
    distributedBy: string;
    recipientUnit: string;
    recipientName: string;
    requestId?: string;
    notes?: string;
  };
}

export interface SterileStock {
  originUnit?: string;
  id: string; // lotNumber
  lotNumber: string;
  instrumentId: string;
  instrumentName: string;
  qty: number;
  shelfLocation: string;
  sterilizedAt: any;
  expiresAt: any;
  status: 'sterile' | 'expired' | 'distributed' | 'recalled';
  machineName: string;
  cycleNumber: number;
}

export interface DistributionRecord {
  id: string;
  requestingUnit: string;
  requestedItems: {
    instrumentId: string;
    name: string;
    qty: number;
    fulfilledQty: number;
  }[];
  status: 'pending' | 'partially_fulfilled' | 'fulfilled' | 'rejected';
  createdAt: any;
  requiredAt?: any;
  fulfilledAt?: any;
  fulfilledLots?: {
    lotNumber: string;
    instrumentId: string;
    qty: number;
  }[];
  recipientName?: string;
  notes?: string;
}

export type MachineStatus = 'LOLOS_UJI_SIAP' | 'BELUM_UJI_KELAYAKAN' | 'PERBAIKAN' | 'TIDAK_AKTIF' | 'ready' | 'belum_uji' | 'perbaikan' | 'tidak_aktif';

export interface Machine {
  id: string;
  machineId?: string;
  tenantId?: string;
  name: string;
  namaMesin?: string;
  type: 'washer' | 'sterilizer_steam' | 'sterilizer_plasma' | string;
  jenisMesin?: string;
  method: string; // Metode Sterilisasi
  modes: string[]; // Program Mode
  temperature: string; // Suhu
  duration: string; // Waktu
  status: MachineStatus; // Status Kelayakan
  statusMesin?: MachineStatus;
  serialNumber: string;
  nomorSeri?: string;
  merk?: string;
  model?: string;
  lokasi?: string;
  capacity?: string;
  temperatureRange?: string;
  cycleTimes?: string;
  specs?: string;
  lastMaintenanceDate?: any;
  aktif?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface EnvironmentalLog {
  id: string;
  timestamp: any;
  temperatureCelsius: number;
  humidityPercent: number;
  operatorName: string;
  status: 'normal' | 'alert_temp' | 'alert_humidity' | 'alert_both';
}

export interface Unit {
  id: string;
  name: string;
}

export interface MachineTestLog {
  id: string;
  bowieDickTestId?: string;
  tenantId?: string;
  machineId?: string;
  testDateStr: string; // "DD/MM/YYYY, HH:mm" or "YYYY-MM-DDTHH:mm"
  tanggalWaktu?: any;
  periodeUji?: string; // e.g. "2026-08-04"
  machineName: string;
  mode: 'Bowie-Dick' | 'Vacuum Test' | string;
  indicatorResult: 'Valid' | 'Invalid' | 'LULUS' | 'GAGAL';
  hasil?: 'LULUS' | 'GAGAL' | 'Valid' | 'Invalid';
  receiptImage?: string; // photo base64 or URL
  fotoBukti?: string;
  operatorName: string;
  petugasId?: string;
  petugasNama?: string;
  nomorBatch?: string;
  createdAt?: any;
  notes?: string;
  catatan?: string;
}

export type AuditActionResult = 'SUCCESS' | 'WARNING' | 'REJECTED' | 'FAILED' | 'CANCELLED';

export interface AuditLog {
  id: string; // ID_LOG, e.g. LOG-20260804-000001
  timestamp: any; // Server or ISO timestamp
  timestampStr?: string; // Formatted "DD/MM/YYYY HH:mm:ss"
  tenantId: string; // TENANT_ID e.g. RSUD-BENDA
  installationId?: string; // INSTALLATION_ID e.g. IGD, IBS, OK, CSSD
  userId: string; // USER_ID e.g. USR-0021
  userName: string; // USER_NAME e.g. Budi
  userRole: string; // USER_ROLE e.g. PETUGAS_CSSD, ADMIN, PETUGAS_INSTALASI
  action: string; // ACTION e.g. CONFIRM_RECEIVING, SCAN_REJECTED, etc.
  module: string; // MODULE e.g. PENERIMAAN, DEKONTAMINASI, PACKING, STERILISASI, RAK, DISTRIBUSI, etc.
  entityType: string; // ENTITY_TYPE e.g. INSTRUMENT, INVENTORY, RECEIVING, STERILIZATION, TICKET, RECALL, HOLD
  entityId?: string; // ENTITY_ID
  instrumentId?: string; // INSTRUMENT_ID e.g. ST-HECST01-IGD1 (CRITICAL FOR FULL LIFE TRACEABILITY)
  transactionId?: string; // TRANSACTION_ID
  ticketId?: string; // TICKET_ID
  beforeState?: string; // BEFORE_STATE
  afterState?: string; // AFTER_STATE
  beforeLocation?: string; // BEFORE_LOCATION
  afterLocation?: string; // AFTER_LOCATION
  beforeHolder?: string; // BEFORE_HOLDER
  afterHolder?: string; // AFTER_HOLDER
  reason?: string; // REASON
  referenceId?: string; // REFERENCE_ID (e.g. referenced log ID or ticket/transaction)
  result: AuditActionResult; // RESULT
  deviceInfo?: string; // DEVICE_INFO
}

export type SetCompletenessStatus = 'LENGKAP' | 'BELUM_LENGKAP_PENYEDIAAN';

export interface MasterSet {
  id: string; // setId, e.g. "SET-HECST-IGD1"
  setId: string;
  namaSet: string;
  kodeSet: string; // e.g. "HECST"
  instalasiPemilik: string; // e.g. "IGD"
  jumlahKomponenStandar: number; // e.g. 10
  statusAktif: boolean;
  tenantId: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface MasterSetKomponen {
  id: string; // e.g. "SET-HECST-IGD1-01"
  setId: string;
  komponenId: string;
  namaInstrumen: string;
  kategori?: string;
  jumlahStandar: number;
  wajib: boolean;
  tenantId: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface SetCompositionSummary {
  setId: string;
  namaSet: string;
  kodeSet: string;
  instalasiPemilik: string;
  jumlahKomponenStandar: number;
  jumlahFisikTersedia: number;
  kekuranganPenyediaan: number;
  kelengkapanPercent: number;
  status: SetCompletenessStatus;
  components: {
    komponenId: string;
    namaInstrumen: string;
    jumlahStandar: number;
    jumlahFisik: number;
    kekurangan: number;
  }[];
}

export interface ImportRowValidation {
  rowNumber: number;
  rawId: string;
  formattedId: string;
  name: string;
  type: 'single' | 'set';
  originUnit: string;
  stockQty: number;
  itemsRaw?: string;
  setId?: string;
  components?: { name: string; qty: number }[];
  status: 'VALID' | 'REJECTED_DUPLICATE_FILE' | 'REJECTED_EXISTS_DB' | 'REJECTED_INVALID_FORMAT' | 'REJECTED_TENANT_MISMATCH';
  rejectReason?: string;
  setCompletenessStatus?: SetCompletenessStatus;
  physicalComponentCount?: number;
  standardComponentCount?: number;
  shortageCount?: number;
}

