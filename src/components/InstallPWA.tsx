import React, { useEffect, useState } from 'react';
import { Download, Smartphone, X, Share, MoreVertical, PlusSquare, CheckCircle2, ExternalLink, Copy, QrCode } from 'lucide-react';

interface InstallPWAProps {
  isSidebarItem?: boolean;
}

export default function InstallPWA({ isSidebarItem = false }: InstallPWAProps) {
  const [promptInstall, setPromptInstall] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'android' | 'ios'>('android');

  const VERCEL_URL = "https://ais-pre-gcxcwmxgdhdn4qwfzouat5-122567460312.asia-east1.run.app";

  useEffect(() => {
    // Check if running in PWA standalone mode
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches 
      || (navigator as any).standalone 
      || document.referrer.includes('android-app://');
    setIsStandalone(isStandaloneMode);

    // Check iOS / Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);
    if (isIosDevice) {
      setActiveTab('ios');
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setPromptInstall(e);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (promptInstall) {
      promptInstall.prompt();
      promptInstall.userChoice.then((choiceResult: { outcome: string }) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted install prompt');
        }
        setPromptInstall(null);
      });
    } else {
      setShowGuideModal(true);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(VERCEL_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isStandalone && !showGuideModal) {
    if (isSidebarItem) {
      return (
        <button
          onClick={() => setShowGuideModal(true)}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Aplikasi PWA Aktif</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/60 px-1.5 py-0.5 rounded">Vercel</span>
        </button>
      );
    }

    return (
      <button
        onClick={() => setShowGuideModal(true)}
        className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold rounded-lg hover:bg-emerald-500/20 transition cursor-pointer"
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>PWA Aktif</span>
      </button>
    );
  }

  return (
    <>
      {isSidebarItem ? (
        <button
          onClick={handleInstallClick}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold text-slate-200 bg-gradient-to-r from-sky-600/30 to-emerald-600/30 border border-sky-500/30 hover:from-sky-500/40 hover:to-emerald-500/40 hover:text-white transition shadow-sm cursor-pointer"
        >
          <Download className="w-4 h-4 text-sky-400 animate-bounce" />
          <span>Install App / APK</span>
        </button>
      ) : (
        <button
          onClick={handleInstallClick}
          className="flex items-center gap-2 bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 text-white text-xs font-bold py-1.5 px-3 rounded-lg transition-all shadow-lg shadow-sky-500/20 active:scale-95 cursor-pointer"
          title="Install e-CSSD sebagai Aplikasi (PWA / APK)"
        >
          <Download className="w-4 h-4 animate-bounce" />
          <span>Install App / APK</span>
        </button>
      )}

      {/* MODAL INSTALLATION GUIDE & LINK */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 text-slate-100 shadow-2xl relative animate-in fade-in zoom-in duration-200 my-auto">
            <button
              onClick={() => setShowGuideModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-1.5 bg-slate-800/90 border border-slate-700 rounded-xl overflow-hidden shrink-0 w-12 h-12 flex items-center justify-center shadow-inner">
                <img src="/IconNew.png" alt="e-CSSD Logo" className="w-full h-full object-contain" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-white">Menu Instalasi Aplikasi e-CSSD</h3>
                <p className="text-xs text-slate-400">RSUD Benda - PWA & APK Web App</p>
              </div>
            </div>

            {/* DIRECT VERCEL LINK CARD */}
            <div className="bg-slate-950/80 border border-sky-500/30 rounded-xl p-4 mb-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Link Resmi Aplikasi Vercel:
                </span>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                  HTTPS / SSL Ready
                </span>
              </div>

              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg p-2 font-mono text-xs text-slate-200 select-all overflow-x-auto">
                <span className="truncate">{VERCEL_URL}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <a
                  href={VERCEL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold py-2 px-3 rounded-lg transition-all shadow-md cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Buka di Vercel</span>
                </a>

                <button
                  onClick={handleCopyLink}
                  className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold py-2 px-3 rounded-lg transition-all border border-slate-700 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-slate-400" />
                      <span>Salin Link</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* QR CODE SCAN SECTION */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 mb-4 flex items-center gap-4">
              <div className="w-20 h-20 bg-white p-1 rounded-lg shrink-0 flex items-center justify-center">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(VERCEL_URL)}`} 
                  alt="QR Code Install e-CSSD"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="space-y-1 text-xs">
                <div className="font-bold text-slate-200 flex items-center gap-1.5">
                  <QrCode className="w-4 h-4 text-emerald-400" />
                  <span>Scan QR Code dari HP</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Arahkan kamera HP Android / iPhone Anda ke QR Code ini untuk membuka & meng-install aplikasi secara instan.
                </p>
              </div>
            </div>

            {/* PLATFORM TABS */}
            <div className="flex items-center gap-2 mb-3 p-1 bg-slate-950/80 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveTab('android')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'android'
                    ? 'bg-sky-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Android / Windows</span>
              </button>
              <button
                onClick={() => setActiveTab('ios')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'ios'
                    ? 'bg-emerald-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Share className="w-3.5 h-3.5" />
                <span>iPhone / iPad (iOS)</span>
              </button>
            </div>

            {/* INSTRUCTIONS BY PLATFORM */}
            {activeTab === 'ios' ? (
              <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-emerald-500/20 text-xs animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <Share className="w-4 h-4" />
                    <span>Langkah Instalasi di iPhone / iPad (Safari):</span>
                  </p>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium">
                    iOS Web App
                  </span>
                </div>
                <ol className="list-decimal list-inside space-y-2 text-slate-300">
                  <li className="flex items-start gap-2.5 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                    <span className="p-1 bg-sky-500/20 rounded text-sky-400 shrink-0 mt-0.5">1</span>
                    <span>Buka link <strong className="text-sky-300">https://e-cssd-rsudbenda.vercel.app/</strong> menggunakan browser <strong>Safari</strong> di iPhone/iPad Anda.</span>
                  </li>
                  <li className="flex items-start gap-2.5 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                    <Share className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <span>Ketuk tombol <strong>'Bagikan' (Share)</strong> (ikon kotak dengan panah ke atas) di bagian bawah layar Safari.</span>
                  </li>
                  <li className="flex items-start gap-2.5 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                    <PlusSquare className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Gulir ke bawah pada menu pilihan, lalu ketuk <strong>'Tambahkan ke Layar Utama' (Add to Home Screen)</strong>.</span>
                  </li>
                  <li className="flex items-start gap-2.5 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Ketuk <strong>'Tambah' (Add)</strong> di sudut kanan atas. Ikon aplikasi e-CSSD akan muncul di layar utama iPhone Anda seperti aplikasi App Store!</span>
                  </li>
                </ol>
              </div>
            ) : (
              <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-sky-500/20 text-xs animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-sky-400 flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4" />
                    <span>Langkah Instalasi di Android / Chrome / PC:</span>
                  </p>
                  <span className="text-[10px] bg-sky-500/10 text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded-full font-medium">
                    PWA / APK
                  </span>
                </div>
                <ol className="list-decimal list-inside space-y-2 text-slate-300">
                  <li className="flex items-start gap-2.5 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                    <span className="p-1 bg-sky-500/20 rounded text-sky-400 shrink-0 mt-0.5">1</span>
                    <span>Buka link <strong className="text-sky-300">https://e-cssd-rsudbenda.vercel.app/</strong> di browser Chrome/Edge.</span>
                  </li>
                  <li className="flex items-start gap-2.5 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                    <MoreVertical className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <span>Ketuk ikon <strong>Titik Tiga (⋮)</strong> di sudut kanan atas browser.</span>
                  </li>
                  <li className="flex items-start gap-2.5 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                    <Download className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Pilih menu <strong>'Install Aplikasi'</strong> atau <strong>'Tambahkan ke Layar Utama'</strong>.</span>
                  </li>
                  <li className="flex items-start gap-2.5 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Konfirmasi pemasangan. Aplikasi e-CSSD akan terinstall langsung di HP Android / PC Anda.</span>
                  </li>
                </ol>
              </div>
            )}

            <div className="mt-5 pt-3 border-t border-slate-800/80 flex justify-end gap-2">
              {promptInstall && (
                <button
                  onClick={handleInstallClick}
                  className="px-4 py-2 bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 text-slate-950 font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>Install Sekarang</span>
                </button>
              )}
              <button
                onClick={() => setShowGuideModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
