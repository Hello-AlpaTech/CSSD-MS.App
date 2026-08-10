import React, { useState, useEffect } from "react";
import { 
  bluetoothPrinterService, 
  PrinterConnectionState, 
  PrintReceiptData 
} from "../lib/BluetoothPrinterService";
import { 
  Printer, 
  Bluetooth, 
  BluetoothConnected, 
  WifiOff, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  FileText, 
  QrCode, 
  Sliders, 
  Info,
  ShieldCheck
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

export interface BluetoothPrinterServiceProps {
  onClose?: () => void;
  standalone?: boolean;
}

export const BluetoothPrinterServiceComponent: React.FC<BluetoothPrinterServiceProps> = ({ 
  onClose,
  standalone = false 
}) => {
  const [printerState, setPrinterState] = useState<PrinterConnectionState>(bluetoothPrinterService.getState());
  const [isTesting, setIsTesting] = useState(false);
  const [activeTab, setActiveTab] = useState<'status' | 'preview'>('status');

  // Sample data for preview and test print
  const sampleData: PrintReceiptData = {
    qrCode: "st-hec001-igd",
    barcode1D: "LOT-20260722-548-SP",
    subtitle: "CSSD - RSUD BENDA",
    typeHeader: "BUKTI SERAH",
    unit: "Instalasi Gawat Darurat (IGD)",
    packingType: "Packing Poch",
    packingDate: "22/07/2026",
    timeSteril: "30 Day",
    isSet: true,
    items: [
      { name: "Hecting Set", qty: 1 },
      { name: "Klem pean", qty: 3 },
      { name: "Scaple No. 3", qty: 1 },
      { name: "Pinset Anatomis", qty: 1 },
      { name: "Pinset Chirugis", qty: 1 },
      { name: "Neddle holder M", qty: 1 },
      { name: "Neddle holder S", qty: 1 },
      { name: "Gunting Benang", qty: 1 },
      { name: "Gunting Jaringan", qty: 1 },
      { name: "Bengkok", qty: 1 }
    ],
    operator: "Administrator"
  };

  useEffect(() => {
    const unsubscribe = bluetoothPrinterService.subscribe((state) => {
      setPrinterState(state);
    });
    return () => unsubscribe();
  }, []);

  const handleConnect = async () => {
    await bluetoothPrinterService.scanAndConnect();
  };

  const handleDisconnect = async () => {
    await bluetoothPrinterService.disconnect();
  };

  const handleTestPrint = async () => {
    setIsTesting(true);
    const template = bluetoothPrinterService.buildReceiptTemplate(sampleData);
    const success = await bluetoothPrinterService.printText(template);
    if (success) {
      alert("Halaman tes struk 57mm berhasil dikirim ke printer Bluetooth!");
    }
    setIsTesting(false);
  };

  const formattedPreviewText = bluetoothPrinterService.buildReceiptTemplate(sampleData);

  return (
    <div className={`bg-slate-900 border border-slate-800 text-slate-100 rounded-2xl p-5 shadow-2xl max-w-xl mx-auto ${standalone ? 'my-4' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
            <Printer className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-base text-white flex items-center gap-2">
              Layanan Printer Termal Bluetooth (57mm)
            </h3>
            <p className="text-xs text-slate-400">
              Web Bluetooth API & Protocol ESC/POS RSUD Benda
            </p>
          </div>
        </div>
        {onClose && (
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xs px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg transition"
          >
            Tutup
          </button>
        )}
      </div>

      {/* Connection Card Status */}
      <div className={`p-4 rounded-xl border mb-5 transition ${
        printerState.isConnected 
          ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200' 
          : 'bg-slate-800/60 border-slate-700 text-slate-300'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {printerState.isConnected ? (
              <BluetoothConnected className="w-6 h-6 text-emerald-400 animate-pulse" />
            ) : (
              <Bluetooth className="w-6 h-6 text-slate-400" />
            )}
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Status Perangkat Bluetooth
              </div>
              <div className="font-bold text-sm text-white flex items-center gap-2">
                {printerState.isConnected ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-ping"></span>
                    {printerState.deviceName || "Thermal Printer 57mm"} (Terhubung)
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
                    Belum Terhubung
                  </>
                )}
              </div>
            </div>
          </div>

          <div>
            {printerState.isConnected ? (
              <button
                onClick={handleDisconnect}
                className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 font-semibold rounded-lg text-xs transition"
              >
                Putuskan
              </button>
            ) : (
              <button
                onClick={handleConnect}
                disabled={printerState.status === 'connecting'}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs flex items-center gap-2 transition shadow-md disabled:opacity-50"
              >
                {printerState.status === 'connecting' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Mencari...
                  </>
                ) : (
                  <>
                    <Bluetooth className="w-3.5 h-3.5" />
                    Pindai & Hubungkan
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {printerState.errorMessage && (
          <div className="mt-3 p-2 bg-red-950/50 border border-red-500/30 rounded-lg text-xs text-red-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{printerState.errorMessage}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 mb-4 gap-2">
        <button
          onClick={() => setActiveTab('status')}
          className={`pb-2 px-3 text-xs font-bold border-b-2 transition ${
            activeTab === 'status' 
              ? 'border-emerald-500 text-emerald-400' 
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5 inline mr-1.5" />
          Info Service & Tes
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          className={`pb-2 px-3 text-xs font-bold border-b-2 transition ${
            activeTab === 'preview' 
              ? 'border-emerald-500 text-emerald-400' 
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5 inline mr-1.5" />
          Simulasi Format 57mm (32 Chars)
        </button>
      </div>

      {/* Tab Content 1: Service Status & Instructions */}
      {activeTab === 'status' && (
        <div className="space-y-4">
          <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-3 text-xs space-y-2 text-slate-300">
            <div className="font-bold text-white flex items-center gap-1.5">
              <Info className="w-4 h-4 text-sky-400" /> Spesifikasi Kertas Termal 57mm / 58mm:
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
              <li>Lebar Karakter: <strong>32 Karakter per baris</strong> (Standard Monospace).</li>
              <li>Perintah ESC/POS: Alignment Center, Barcode CODE128, dan QR Code 2D.</li>
              <li>Mendukung printer MPT-II, RPP02N, ZCS 103, VSC, Eppos, dll.</li>
            </ul>
          </div>

          <div className="pt-2">
            <button
              onClick={handleTestPrint}
              disabled={isTesting}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-lg disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              {isTesting ? "Sedang Mengirim ke Printer..." : "Cetak Halaman Tes Struk (57mm)"}
            </button>
          </div>
        </div>
      )}

      {/* Tab Content 2: Live Template Preview */}
      {activeTab === 'preview' && (
        <div>
          <p className="text-xs text-slate-400 mb-2">
            Tampilan persis yang akan dikirim ke head printer termal (32 karakter/baris):
          </p>
          <div className="bg-white text-black font-mono text-[11px] p-4 rounded-xl border border-slate-300 shadow-inner overflow-x-auto max-h-80 whitespace-pre leading-snug">
            {formattedPreviewText}
          </div>
        </div>
      )}
    </div>
  );
};

export default BluetoothPrinterServiceComponent;
