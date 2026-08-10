import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, Bluetooth, CheckCircle2, AlertCircle, X, Download, Copy, RefreshCw } from 'lucide-react';
import bluetoothPrinterService, { PrinterConnectionState } from '../lib/BluetoothPrinterService';
import { writeAuditLog } from '../lib/auditLogger';

export interface ReceptionTicketData {
  idPenerimaan: string;
  tanggalPenerimaan: string;
  asalInstalasi: string;
  namaPenyerah: string;
  namaPenerima: string;
  items: {
    instrumentId: string;
    name: string;
    qty: number;
    type?: string;
    condition?: string;
    components?: any[];
  }[];
  totalPcs?: number;
  status?: string;
  createdAt?: string;
}

interface ReceptionTicketProps {
  data: ReceptionTicketData;
  onClose?: () => void;
  currentUser?: string;
}

export default function ReceptionTicket({ data, onClose, currentUser = "Petugas CSSD" }: ReceptionTicketProps) {
  const [btState, setBtState] = useState<PrinterConnectionState>(bluetoothPrinterService.getState());
  const [isPrintingBt, setIsPrintingBt] = useState(false);
  const [btPrintSuccess, setBtPrintSuccess] = useState(false);
  const [btErrorMessage, setBtErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsub = bluetoothPrinterService.subscribe(setBtState);
    return () => unsub();
  }, []);

  const totalQty = data.items.reduce((acc, i) => acc + (i.qty || 1), 0);

  const logPrintAudit = async (method: string) => {
    await writeAuditLog({
      action: "PRINT_TICKET",
      module: "PENERIMAAN",
      entityType: "TICKET",
      entityId: data.idPenerimaan,
      transactionId: data.idPenerimaan,
      ticketId: data.idPenerimaan,
      reason: `Cetak tiket penerimaan 58mm via ${method}`,
      result: "SUCCESS",
      userName: currentUser
    });
  };

  const handleBrowserPrint = () => {
    logPrintAudit("Standard Browser Print");
    window.print();
  };

  const handleConnectBt = async () => {
    setBtErrorMessage(null);
    const ok = await bluetoothPrinterService.scanAndConnect();
    if (!ok) {
      setBtErrorMessage(btState.errorMessage || "Gagal menghubungkan ke Bluetooth Thermal Printer.");
    }
  };

  const handleBtPrint = async () => {
    setIsPrintingBt(true);
    setBtErrorMessage(null);
    try {
      if (!btState.isConnected) {
        const connected = await bluetoothPrinterService.scanAndConnect();
        if (!connected) {
          setIsPrintingBt(false);
          return;
        }
      }

      const receiptPayload = {
        title: "RSUD BENDA - e-CSSD",
        subtitle: "by.AlpaTech",
        typeHeader: "TIKET PENERIMAAN ALAT",
        id: data.idPenerimaan,
        unit: data.asalInstalasi,
        recipient: data.namaPenyerah || "-",
        operator: data.namaPenerima || currentUser,
        time: data.tanggalPenerimaan,
        items: data.items.map(i => ({ name: `${i.name} (${i.instrumentId})`, qty: i.qty })),
        qrCode: data.idPenerimaan
      };

      const receiptText = bluetoothPrinterService.buildReceiptTemplate(receiptPayload);
      const printed = await bluetoothPrinterService.printText(receiptText);
      if (printed) {
        setBtPrintSuccess(true);
        logPrintAudit("ESC/POS Bluetooth Printer");
        setTimeout(() => setBtPrintSuccess(false), 3000);
      } else {
        setBtErrorMessage("Gagal mengirim data ke Bluetooth Printer. Gunakan tombol Cetak Standar.");
      }
    } catch (err: any) {
      setBtErrorMessage(err.message || "Error saat mencetak via Bluetooth.");
    } finally {
      setIsPrintingBt(false);
    }
  };

  const handleCopyTextReceipt = () => {
    const textReceipt = `
================================
      RSUD BENDA - UNIT CSSD
         e-CSSD by.AlpaTech
================================
TIKET PENERIMAAN: ${data.idPenerimaan}
Tanggal   : ${data.tanggalPenerimaan}
Instalasi : ${data.asalInstalasi}
Penyerah  : ${data.namaPenyerah || '-'}
Penerima  : ${data.namaPenerima || currentUser}
--------------------------------
DAFTAR INSTRUMEN:
${data.items.map((it, idx) => `${idx + 1}. [${it.instrumentId}] ${it.name} x${it.qty}`).join('\n')}
--------------------------------
TOTAL     : ${data.items.length} jenis / ${data.totalPcs || totalQty} pcs
STATUS    : ${data.status || 'AKTIF'}
================================
* Harap simpan resi ini *
--- Terima Kasih ---
`.trim();

    navigator.clipboard.writeText(textReceipt);
    alert("Teks resi telah disalin ke clipboard!");
    logPrintAudit("Copy Text Payload");
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:p-0 print:bg-white print:inset-auto print:static">
      <div className="bg-slate-100 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col max-h-[90vh] print:max-h-none print:shadow-none print:w-auto print:rounded-none">
        
        {/* Modal Header */}
        <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between print:hidden">
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Tiket Penerimaan CSSD (58mm)</h3>
            <p className="text-[11px] text-slate-500">ID: {data.idPenerimaan}</p>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Printable Paper Area */}
        <div className="p-6 bg-slate-200 overflow-y-auto flex justify-center print:p-0 print:bg-white">
          <div id="thermal-ticket-58mm" className="bg-white p-4 shadow-md font-mono text-black text-[11px] leading-snug print:shadow-none print:p-0" style={{ width: '58mm', minHeight: '120mm' }}>
            
            {/* Header */}
            <div className="text-center pb-2 mb-2 border-b border-black border-dashed">
              <div className="text-[13px] font-bold">RSUD BENDA</div>
              <div className="text-[10px] uppercase font-bold tracking-wider">UNIT CSSD</div>
              <div className="text-[9px] text-gray-600">e-CSSD by.AlpaTech</div>
              <div className="text-[11px] font-bold mt-1.5 uppercase bg-black text-white px-1 py-0.5 inline-block">
                TIKET PENERIMAAN
              </div>
            </div>

            {/* QR Code */}
            <div className="my-2 flex flex-col items-center justify-center">
              <QRCodeSVG value={data.idPenerimaan} size={76} level="M" />
              <div className="text-[11px] font-bold font-mono tracking-wider mt-1">{data.idPenerimaan}</div>
            </div>

            {/* Details Table */}
            <div className="mb-2 text-[10px] border-t border-black border-dashed pt-2">
              <table className="w-full">
                <tbody>
                  <tr>
                    <td className="w-14 align-top text-gray-600">Tanggal</td>
                    <td className="w-2 align-top">:</td>
                    <td className="font-bold">{data.tanggalPenerimaan}</td>
                  </tr>
                  <tr>
                    <td className="align-top text-gray-600">Instalasi</td>
                    <td className="align-top">:</td>
                    <td className="font-bold">{data.asalInstalasi}</td>
                  </tr>
                  <tr>
                    <td className="align-top text-gray-600">Pengirim</td>
                    <td className="align-top">:</td>
                    <td>{data.namaPenyerah || '-'}</td>
                  </tr>
                  <tr>
                    <td className="align-top text-gray-600">Penerima</td>
                    <td className="align-top">:</td>
                    <td>{data.namaPenerima || currentUser}</td>
                  </tr>
                  <tr>
                    <td className="align-top text-gray-600">Status</td>
                    <td className="align-top">:</td>
                    <td className="font-bold uppercase text-blue-700">{data.status || 'AKTIF'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Items List */}
            <div className="border-t border-b border-black border-dashed py-1.5 my-2">
              <div className="font-bold mb-1 text-[10px] uppercase">Daftar Instrumen ({data.items.length} item):</div>
              <table className="w-full text-left text-[10px]">
                <thead>
                  <tr className="border-b border-black/30">
                    <th className="pb-0.5">ID / Nama</th>
                    <th className="pb-0.5 text-right w-8">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10">
                  {data.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-1 align-top pr-1 break-words">
                        <div className="font-bold font-mono text-[9px]">{item.instrumentId}</div>
                        <div>{item.name}</div>
                        {item.condition && <div className="text-[8px] text-gray-500">[{item.condition}]</div>}
                      </td>
                      <td className="py-1 align-top text-right font-bold">{item.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary */}
            <div className="flex justify-between font-bold text-[10px] mb-3">
              <span>Total Pcs / Komponen:</span>
              <span>{data.totalPcs || totalQty} Pcs</span>
            </div>

            {/* Footer */}
            <div className="text-center text-[9px] pt-2 border-t border-black border-dashed text-gray-700">
              <div>* Simpan tiket ini untuk verifikasi pengambilan *</div>
              <div className="mt-0.5 font-bold">--- e-CSSD RSUD BENDA ---</div>
            </div>

          </div>
        </div>

        {/* Action Toolbar */}
        <div className="p-4 bg-white border-t border-slate-200 space-y-2 print:hidden">
          
          {/* Bluetooth Status Alert */}
          {btErrorMessage && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="flex-1">{btErrorMessage}</span>
            </div>
          )}

          {btPrintSuccess && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-700">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Tiket berhasil dicetak via Bluetooth Thermal Printer!</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleBtPrint}
              disabled={isPrintingBt}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Bluetooth className="w-3.5 h-3.5" />
              {isPrintingBt ? "Mencetak..." : "Cetak Thermal BT"}
            </button>

            <button
              type="button"
              onClick={handleBrowserPrint}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              Cetak Standar (58mm)
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopyTextReceipt}
              className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
            >
              <Copy className="w-3 h-3" />
              Salin Teks Tiket
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-bold rounded-lg transition-colors"
              >
                Tutup
              </button>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
