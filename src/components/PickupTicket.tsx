import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { Search, QrCode, CheckCircle2, Clock, AlertTriangle, RotateCcw, PackageCheck, Ban, Camera, CameraOff, Loader2 } from 'lucide-react';
import InlineScanner from './InlineScanner';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { executePickupTransaction, executeVoidTicket, ReceptionTransactionDoc } from '../lib/receptionTransaction';
import { getDemoData } from '../lib/demoStore';
import { triggerActionConfirm } from '../lib/actionToast';
import { writeAuditLog } from '../lib/auditLogger';

interface PickupTicketProps {
  currentUsername: string;
  currentUserProfile: UserProfile;
  isDemoMode?: boolean;
}

interface ItemLiveStatus {
  instrumentId: string;
  name: string;
  qty: number;
  type?: string;
  statusAlur: string;
  currentLocation: string;
  isReady: boolean;
  isDelivered: boolean;
}

export default function PickupTicket({ currentUsername, currentUserProfile, isDemoMode = false }: PickupTicketProps) {
  const [ticketSearchInput, setTicketSearchInput] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Loaded Ticket Data
  const [ticketData, setTicketData] = useState<ReceptionTransactionDoc | null>(null);
  const [itemStatuses, setItemStatuses] = useState<ItemLiveStatus[]>([]);
  const [selectedForPickup, setSelectedForPickup] = useState<string[]>([]);
  
  // Handover Form State
  const [namaPengambil, setNamaPengambil] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [showVoidModal, setShowVoidModal] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // List of Recent Tickets
  const [recentTickets, setRecentTickets] = useState<any[]>([]);

  // Real-time listener for recent tickets
  useEffect(() => {
    if (isDemoMode) {
      const demoTxs = getDemoData("cssd_demo_reception_transactions", []);
      setRecentTickets(demoTxs);
      return;
    }

    const q = query(collection(db, "reception_transactions"));
    const unsub = onSnapshot(q, (snap) => {
      const list: any[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setRecentTickets(list);
    }, (err) => handleFirestoreError(err, OperationType.GET, "reception_transactions"));

    return () => unsub();
  }, [isDemoMode]);

  // Load ticket details & live state when selectedTicketId changes
  useEffect(() => {
    if (!selectedTicketId) {
      setTicketData(null);
      setItemStatuses([]);
      return;
    }

    const loadTicketDetails = async () => {
      setIsLoading(true);
      try {
        let txDoc: ReceptionTransactionDoc | null = null;

        if (isDemoMode) {
          const demoTxs: ReceptionTransactionDoc[] = getDemoData("cssd_demo_reception_transactions", []);
          txDoc = demoTxs.find(t => t.idPenerimaan === selectedTicketId || t.id === selectedTicketId) || null;
        } else {
          const ref = doc(db, "reception_transactions", selectedTicketId);
          const snap = await getDoc(ref);
          if (snap.exists()) {
            txDoc = snap.data() as ReceptionTransactionDoc;
          }
        }

        if (!txDoc) {
          alert(`Tiket Penerimaan "${selectedTicketId}" tidak ditemukan.`);
          setTicketData(null);
          setItemStatuses([]);
          setIsLoading(false);
          return;
        }

        setTicketData(txDoc);

        // Audit log: SCAN_TICKET
        await writeAuditLog({
          action: "SCAN_TICKET",
          module: "PENERIMAAN",
          entityType: "TICKET",
          entityId: selectedTicketId,
          transactionId: selectedTicketId,
          ticketId: selectedTicketId,
          reason: `Pindai / cari Tiket Penerimaan ${selectedTicketId} untuk verifikasi status`,
          result: "SUCCESS",
          userName: currentUsername
        });

        // Fetch Live State for each item in the ticket
        const statusList: ItemLiveStatus[] = [];
        const initialSelected: string[] = [];

        for (const item of txDoc.items) {
          let stage = "DITERIMA";
          let loc = "CSSD";

          if (isDemoMode) {
            const demoLiveState = getDemoData<Record<string, any>>("cssd_demo_live_state", {});
            const live = demoLiveState[item.instrumentId];
            if (live) {
              stage = (live.statusAlur || live.currentState || "DITERIMA").toUpperCase();
              loc = (live.currentLocation || "CSSD").toUpperCase();
            }
          } else {
            const liveRef = doc(db, "instrument_live_state", item.instrumentId);
            const liveSnap = await getDoc(liveRef);
            if (liveSnap.exists()) {
              const liveData = liveSnap.data();
              stage = (liveData.statusAlur || liveData.currentState || "DITERIMA").toUpperCase();
              loc = (liveData.currentLocation || "CSSD").toUpperCase();
            }
          }

          const isReady = stage === "SIAP" || stage === "READY" || stage === "RAK" || stage === "STERILE_STORAGE";
          const isDelivered = stage === "DIDISTRIBUSIKAN" || stage === "INSTALASI";

          if (isReady && !isDelivered) {
            initialSelected.push(item.instrumentId);
          }

          statusList.push({
            instrumentId: item.instrumentId,
            name: item.name,
            qty: item.qty,
            type: item.type,
            statusAlur: stage,
            currentLocation: loc,
            isReady,
            isDelivered
          });
        }

        setItemStatuses(statusList);
        setSelectedForPickup(initialSelected);
      } catch (err) {
        console.error("Error loading ticket details:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadTicketDetails();
  }, [selectedTicketId, isDemoMode, currentUsername]);

  const handleScanSuccess = (code: string) => {
    if (!code) return;
    const cleanCode = code.trim();
    setTicketSearchInput(cleanCode);
    setSelectedTicketId(cleanCode);
    setIsScanning(false);
  };

  const handlePickupConfirm = async () => {
    if (!ticketData || selectedForPickup.length === 0) {
      alert("Pilih minimal satu instrumen yang sudah siap untuk diserahkan.");
      return;
    }
    if (!namaPengambil.trim()) {
      alert("Nama petugas pengambil / penerima instalasi wajib diisi.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await executePickupTransaction({
        ticketId: ticketData.idPenerimaan,
        deliveredInstrumentIds: selectedForPickup,
        recipientName: namaPengambil,
        operatorName: currentUsername,
        userProfile: currentUserProfile,
        isDemoMode
      });

      triggerActionConfirm({
        title: "Serah Terima Berhasil!",
        message: `${selectedForPickup.length} instrumen dari Tiket ${ticketData.idPenerimaan} telah diserahkan ke ${namaPengambil} (${ticketData.asalInstalasi}).`
      });

      // Reload ticket state
      setSelectedTicketId(null);
      setTimeout(() => {
        setSelectedTicketId(ticketData.idPenerimaan);
      }, 300);

      setNamaPengambil('');
    } catch (err: any) {
      alert(err.message || "Gagal memproses serah terima.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVoidConfirm = async () => {
    if (!ticketData) return;
    if (!voidReason.trim()) {
      alert("Alasan pembatalan (VOID) wajib diisi.");
      return;
    }

    setIsSubmitting(true);
    try {
      await executeVoidTicket(ticketData.idPenerimaan, voidReason, currentUserProfile, isDemoMode);

      triggerActionConfirm({
        title: "Tiket Dibatalkan (VOID)",
        message: `Tiket ${ticketData.idPenerimaan} telah diubah statusnya menjadi VOID.`
      });

      setShowVoidModal(false);
      setVoidReason('');
      
      // Refresh ticket view
      setSelectedTicketId(null);
      setTimeout(() => setSelectedTicketId(ticketData.idPenerimaan), 300);
    } catch (err: any) {
      alert(err.message || "Gagal membatalkan tiket.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Compute Overall Ticket Status Badge
  const allDelivered = itemStatuses.length > 0 && itemStatuses.every(i => i.isDelivered);
  const anyReady = itemStatuses.some(i => i.isReady);
  const isVoided = ticketData?.status === 'VOID';

  let ticketStatusBadge = {
    label: "AKTIF / PROSES",
    bgColor: "bg-blue-100 text-blue-700 border-blue-200",
    icon: Clock
  };

  if (isVoided) {
    ticketStatusBadge = {
      label: "VOID / DIBATALKAN",
      bgColor: "bg-rose-100 text-rose-700 border-rose-200",
      icon: Ban
    };
  } else if (allDelivered || ticketData?.status === 'SELESAI') {
    ticketStatusBadge = {
      label: "SELESAI (SUDAH DIAMBIL)",
      bgColor: "bg-slate-100 text-slate-700 border-slate-200",
      icon: CheckCircle2
    };
  } else if (anyReady) {
    const allReady = itemStatuses.every(i => i.isReady || i.isDelivered);
    if (allReady) {
      ticketStatusBadge = {
        label: "SIAP DIAMBIL LENGKAP",
        bgColor: "bg-emerald-100 text-emerald-800 border-emerald-300",
        icon: PackageCheck
      };
    } else {
      ticketStatusBadge = {
        label: "SEBAGIAN BELUM SIAP",
        bgColor: "bg-amber-100 text-amber-800 border-amber-300",
        icon: AlertTriangle
      };
    }
  }

  return (
    <div className="space-y-6">
      
      {/* Search & Scan Box */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="w-4 h-4 text-slate-400" />
            </div>
            <input
              type="text"
              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-slate-800 outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
              placeholder="Ketik atau Scan QR Tiket Penerimaan (e.g. TRM-20260804-0001)..."
              value={ticketSearchInput}
              onChange={(e) => setTicketSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && ticketSearchInput.trim()) {
                  setSelectedTicketId(ticketSearchInput.trim());
                }
              }}
            />
          </div>

          <button
            onClick={() => setIsScanning(!isScanning)}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
              isScanning ? 'bg-rose-500 text-white' : 'bg-sky-500 hover:bg-sky-600 text-white'
            }`}
          >
            {isScanning ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
            {isScanning ? 'Tutup Scanner' : 'Scan QR Tiket'}
          </button>

          <button
            onClick={() => {
              if (ticketSearchInput.trim()) {
                setSelectedTicketId(ticketSearchInput.trim());
              }
            }}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-colors"
          >
            Cari Tiket
          </button>
        </div>

        {/* Camera Scanner Container */}
        {isScanning && (
          <div className="mt-4 p-4 bg-slate-900 rounded-xl flex flex-col items-center">
            <div className="w-full max-w-sm aspect-square bg-black rounded-xl overflow-hidden relative shadow-inner">
              <InlineScanner onScan={handleScanSuccess} isScanning={isScanning} />
              <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-sky-400 rounded-xl m-6"></div>
            </div>
            <p className="text-xs text-slate-300 mt-2 font-medium">Arahkan kamera ke QR Code Tiket Penerimaan (TRM-...)</p>
          </div>
        )}
      </div>

      {/* Ticket Loading State */}
      {isLoading && (
        <div className="bg-white rounded-xl p-8 border border-slate-200 text-center flex flex-col items-center">
          <Loader2 className="w-8 h-8 text-sky-500 animate-spin mb-2" />
          <p className="text-sm font-semibold text-slate-600">Memuat status live instrumen tiket...</p>
        </div>
      )}

      {/* Selected Ticket Details View */}
      {ticketData && !isLoading && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          
          {/* Header */}
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">ID Penerimaan</span>
              <span className="text-lg font-black font-mono text-slate-800">{ticketData.idPenerimaan}</span>
            </div>

            <div className={`px-3 py-1 rounded-lg border text-xs font-bold uppercase flex items-center gap-1.5 ${ticketStatusBadge.bgColor}`}>
              <ticketStatusBadge.icon className="w-4 h-4" />
              {ticketStatusBadge.label}
            </div>
          </div>

          {/* Details Metadata */}
          <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50/50 border-b border-slate-100 text-xs">
            <div>
              <span className="text-slate-400 font-semibold block">Asal Instalasi</span>
              <span className="font-bold text-slate-800">{ticketData.asalInstalasi}</span>
            </div>
            <div>
              <span className="text-slate-400 font-semibold block">Tanggal Penerimaan</span>
              <span className="font-bold text-slate-800">{ticketData.tanggalPenerimaan}</span>
            </div>
            <div>
              <span className="text-slate-400 font-semibold block">Pengirim (Ruangan)</span>
              <span className="font-bold text-slate-800">{ticketData.namaPenyerah || '-'}</span>
            </div>
            <div>
              <span className="text-slate-400 font-semibold block">Penerima (CSSD)</span>
              <span className="font-bold text-slate-800">{ticketData.namaPenerima || '-'}</span>
            </div>
          </div>

          {/* Instruments List with Realtime Status */}
          <div className="p-4">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
              Daftar Status Instrumen Dalam TiketIni ({itemStatuses.length} Item)
            </h4>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {itemStatuses.map((item) => (
                <div key={item.instrumentId} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors">
                  <div className="flex items-start gap-3">
                    {!item.isDelivered && !isVoided && (
                      <input
                        type="checkbox"
                        checked={selectedForPickup.includes(item.instrumentId)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedForPickup(prev => [...prev, item.instrumentId]);
                          } else {
                            setSelectedForPickup(prev => prev.filter(id => id !== item.instrumentId));
                          }
                        }}
                        disabled={!item.isReady}
                        className="mt-1 w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500 disabled:opacity-40 cursor-pointer"
                      />
                    )}

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 text-sm">{item.name}</span>
                        <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                          {item.instrumentId}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-medium">Jumlah: {item.qty} Pcs</span>
                    </div>
                  </div>

                  {/* Stage Badge */}
                  <div>
                    {item.isDelivered ? (
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold uppercase inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                        Sudah Diserahkan
                      </span>
                    ) : item.isReady ? (
                      <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold uppercase inline-flex items-center gap-1">
                        <PackageCheck className="w-3.5 h-3.5 text-emerald-600" />
                        Siap Diamat / Diserahkan
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold uppercase inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                        Proses: {item.statusAlur} ({item.currentLocation})
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Form Serah Terima & Action Panel */}
          {!allDelivered && !isVoided && (
            <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Nama Petugas Pengambil (Instalasi {ticketData.asalInstalasi})</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                    placeholder="Nama perawat / petugas pengambil alat..."
                    value={namaPengambil}
                    onChange={(e) => setNamaPengambil(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Petugas CSSD (Yang Menyerahkan)</label>
                  <input
                    type="text"
                    readOnly
                    className="w-full px-3 py-2 bg-slate-200 border border-slate-300 rounded-xl text-sm text-slate-600 font-medium cursor-not-allowed"
                    value={currentUsername}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowVoidModal(true)}
                  className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5"
                >
                  <Ban className="w-4 h-4" />
                  Batalkan Tiket (VOID)
                </button>

                <button
                  type="button"
                  onClick={handlePickupConfirm}
                  disabled={selectedForPickup.length === 0 || isSubmitting}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Konfirmasi Serah Terima ({selectedForPickup.length} Selected)
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* List of Recent Reception Tickets */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Riwayat Tiket Penerimaan Terkini
          </h3>
        </div>

        <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
          {recentTickets.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs font-medium">
              Belum ada riwayat transaksi penerimaan.
            </div>
          ) : (
            recentTickets.map((tx) => (
              <div 
                key={tx.id || tx.idPenerimaan}
                onClick={() => {
                  setTicketSearchInput(tx.idPenerimaan || tx.id);
                  setSelectedTicketId(tx.idPenerimaan || tx.id);
                }}
                className={`p-3.5 flex items-center justify-between hover:bg-sky-50/50 cursor-pointer transition-colors ${
                  selectedTicketId === (tx.idPenerimaan || tx.id) ? 'bg-sky-50 border-l-4 border-sky-500' : ''
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-extrabold text-sm text-slate-800">{tx.idPenerimaan || tx.id}</span>
                    <span className="text-xs font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded">
                      {tx.asalInstalasi || tx.asal}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                    {tx.tanggalPenerimaan} &bull; {tx.items?.length || 0} Jenis Instrumen ({tx.totalPcs || 0} Pcs) &bull; Pengirim: {tx.namaPenyerah || tx.penyerah || '-'}
                  </div>
                </div>

                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                  tx.status === 'VOID' ? 'bg-rose-100 text-rose-700' :
                  tx.status === 'SELESAI' ? 'bg-slate-100 text-slate-600' :
                  'bg-emerald-100 text-emerald-800'
                }`}>
                  {tx.status || 'AKTIF'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* VOID Modal */}
      {showVoidModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <Ban className="w-5 h-5 text-rose-500" />
              Batalkan Tiket Penerimaan (VOID)
            </h3>
            <p className="text-xs text-slate-500">
              Membatalkan tiket {ticketData?.idPenerimaan} tidak akan menghapus histori audit. Masukkan alasan pembatalan:
            </p>

            <textarea
              rows={3}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              placeholder="Alasan VOID (misal: Salah input unit / barang tertukar)..."
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowVoidModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleVoidConfirm}
                disabled={isSubmitting || !voidReason.trim()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl disabled:opacity-50"
              >
                {isSubmitting ? "Memproses..." : "Konfirmasi VOID"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
