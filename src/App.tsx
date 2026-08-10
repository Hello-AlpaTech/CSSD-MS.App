import React, { useState, useEffect } from "react";
import { db, auth, handleFirestoreError, OperationType } from "./lib/firebase";
import { seedDatabaseIfEmpty } from "./lib/dbSeeder";
import { onAuthStateChanged, signOut, User as FirebaseUser } from "firebase/auth";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import Login from "./components/Login";
import InstallPWA from './components/InstallPWA';
import { FloatingMenuButton } from "./components/FloatingMenuButton";
import { UserProfile } from "./types";
import SettingsPanel from "./components/SettingsPanel";
import Dashboard from "./components/Dashboard";
import Penerimaan from "./components/Penerimaan";
import Decontamination from "./components/Decontamination";
import Packaging from "./components/Packaging";
import Sterilization from "./components/Sterilization";
import Storage from "./components/Storage";
import Distribution from "./components/Distribution";
import Inventory from "./components/Inventory";
import ActivityLog from "./components/ActivityLog";
import WebhookLog from "./components/WebhookLog";
import OnProcessCSSD from "./components/OnProcessCSSD";
import OriginUnitStock from "./components/OriginUnitStock";
import MachineTest from "./components/MachineTest";
import HoldKarantina from "./components/HoldKarantina";
import RecallModule from "./components/RecallModule";
import StockDiscrepancy from "./components/StockDiscrepancy";
import ReportingDashboard from "./components/ReportingDashboard";
import BmhpLinenModule from "./components/BmhpLinenModule";
import DemoTutorialModal from "./components/DemoTutorialModal";
import AdministrasiModule from "./components/AdministrasiModule";
import { DateTimeDisplay } from "./components/DateTimeDisplay";
import ActionConfirmationToast from "./components/ActionConfirmationToast";
import { BarChart2, RotateCcw, Database, AlertTriangle, LayoutDashboard, Droplets, Package, Flame, FolderClosed, Handshake, Sliders, Wifi, WifiOff, Menu, X, User, LogOut, ClipboardCheck, ClipboardList, Activity, Sparkles, BookOpen, Sun, Moon, ShieldCheck, Gauge, ArrowLeft, Webhook, PackageCheck } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { migrateUserProfile, normalizeRole, isUserActive } from "./lib/permissions";

export default function App() {
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [currentTab, setCurrentTab] = useState<string>("dashboard");

  const computedRole = userProfile?.role?.toLowerCase() || 'operator';
  let appRole = 'cssd';
  if (computedRole.includes('admin')) appRole = 'admin';
  else if (computedRole.includes('instalasi') || computedRole.includes('ruangan')) appRole = 'ruangan';
  else appRole = 'cssd';

  const navItems = [
    { id: 'dashboard', label: 'DASHBOARD', icon: LayoutDashboard, roles: ['admin', 'cssd', 'ruangan'] },
    { id: 'penerimaan', label: 'PENERIMAAN', icon: ClipboardCheck, roles: ['admin', 'cssd', 'ruangan'] },
    { id: 'proses_cssd', label: 'PROSES CSSD', icon: Droplets, roles: ['admin', 'cssd'] },
    { id: 'machine_test', label: 'UJI KELAYAKAN MESIN', icon: Gauge, roles: ['admin', 'cssd'] },
    { id: 'sterilization', label: 'STERILISASI', icon: Flame, roles: ['admin', 'cssd'] },
    { id: 'storage', label: 'RAK & STOK STERIL', icon: FolderClosed, roles: ['admin', 'cssd'] },
    { id: 'distribution', label: 'DISTRIBUSI / PENGAMBILAN', icon: Handshake, roles: ['admin', 'cssd', 'ruangan'] },
    { id: 'recall', label: 'RECALL', icon: RotateCcw, roles: ['admin', 'cssd'] },
    { id: 'hold', label: 'KARANTINA / HOLD', icon: AlertTriangle, roles: ['admin', 'cssd'] },
    { id: 'inventory', label: 'INVENTARIS', icon: Package, roles: ['admin', 'cssd', 'ruangan'] },
    { id: 'bmhp_linen', label: 'BMHP & LINEN', icon: PackageCheck, roles: ['admin', 'cssd', 'ruangan'] },
    { id: 'stock_opname', label: 'STOCK OPNAME', icon: ClipboardList, roles: ['admin', 'cssd'] },
    { id: 'reports', label: 'LAPORAN', icon: BarChart2, roles: ['admin', 'cssd', 'ruangan'] },
    { id: 'master_data', label: 'MASTER DATA', icon: Database, roles: ['admin'] },
    { id: 'activity_log', label: 'AUDIT LOG', icon: Activity, roles: ['admin'] },
    { id: 'administrasi', label: 'ADMINISTRASI', icon: ShieldCheck, roles: ['admin'] },
    { id: 'settings', label: 'PENGATURAN', icon: Sliders, roles: ['admin', 'cssd', 'ruangan'] }
  ];

  const visibleNavItems = navItems.filter(item => item.roles.includes(appRole));

  const [currentRole, setCurrentRole] = useState<'admin' | 'operator' | 'supervisor'>("operator");
  const [currentUsername, setCurrentUsername] = useState<string>("");
  const [isSimulatedOffline, setIsSimulatedOffline] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [showDemoTutorial, setShowDemoTutorial] = useState<boolean>(false);

  // MODE TAMPILAN: 'malam' (Dark Mode) / 'siang' (Day Mode - #0B5868 & #FFFFFF)
  const [themeMode, setThemeMode] = useState<'malam' | 'siang'>(() => {
    return (localStorage.getItem("cssd_theme_mode") as 'malam' | 'siang') || "malam";
  });

  useEffect(() => {
    localStorage.setItem("cssd_theme_mode", themeMode);
  }, [themeMode]);

  // GLOBAL STATE UNTUK ALUR CSSD (Mencegah data hilang saat pindah tab)
  const [decontamQueue, setDecontamQueue] = useState<any[]>([]);
  const [packagingQueue, setPackagingQueue] = useState<any[]>([]);

  const [appName, setAppName] = useState("CSSD.MS-by.AlpaTech");
  const [appIcon, setAppIcon] = useState("/IconNew.png");

  useEffect(() => {
    // Only subscribe to tenant-protected settings when user is authenticated and active
    if (!authUser || !userProfile || !isUserActive(userProfile)) return;

    const unsub = onSnapshot(
      doc(db, "settings", "general"),
      (d) => {
        if (d.exists()) {
          const data = d.data();
          if (data.appName) setAppName(data.appName);
          if (data.appIcon) setAppIcon(data.appIcon);
        }
      },
      (error) => {
        console.warn("[FirestoreListener] settings/general snapshot warning:", error?.message || error);
      }
    );
    return () => unsub();
  }, [authUser, userProfile]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        let email = user.email;
        if (!email && user.providerData) {
          for (const p of user.providerData) {
            if (p.email) {
              email = p.email;
              break;
            }
          }
        }
        const emailKey = email?.toLowerCase() || "";

        try {
          if (!emailKey) {
            await signOut(auth);
            setUserProfile(null);
            setLoadingAuth(false);
            return;
          }

          let profile: UserProfile | null = null;
          let fetchFailed = false;

          try {
            const snap = await getDoc(doc(db, "users", emailKey));
            if (snap.exists()) {
              profile = snap.data() as UserProfile;
            }
          } catch (fetchErr) {
            fetchFailed = true;
            // Attempt reading cached profile from localStorage
            const cached = localStorage.getItem(`cssd_user_profile_${emailKey}`);
            if (cached) {
              try {
                profile = JSON.parse(cached);
              } catch {
                profile = null;
              }
            }
          }

          if (profile) {
            let migrated: UserProfile;
            try {
              migrated = migrateUserProfile(profile, user.uid, emailKey);
            } catch (migrationError: any) {
              if (migrationError?.message === "USER_PROFILE_TENANT_REQUIRED") {
                console.error("[Auth] User profile has no tenantId:", emailKey);
                await signOut(auth);
                alert("Akun belum memiliki konfigurasi Rumah Sakit. Hubungi administrator sistem.");
                setUserProfile(null);
                setLoadingAuth(false);
                return;
              }
              throw migrationError;
            }

            if (!isUserActive(migrated)) {
              await signOut(auth);
              alert(`Akun Anda berstatus ${migrated.statusAkun || "NONAKTIF"}. Silakan hubungi Administrator.`);
              setUserProfile(null);
              setLoadingAuth(false);
              return;
            }

            if (profile.uid !== user.uid && !fetchFailed) {
              setDoc(doc(db, "users", emailKey), { uid: user.uid }, { merge: true }).catch(() => {});
            }

            localStorage.setItem(`cssd_user_profile_${emailKey}`, JSON.stringify(migrated));
            setUserProfile(migrated);
            setCurrentRole(migrated.role as any);
            setCurrentUsername(migrated.name);
          } else {
            if (emailKey === "cssdrsudbenda@gmail.com") {
              const fallbackProfile = migrateUserProfile({
                uid: user.uid,
                userId: user.uid,
                nip: "000000",
                name: user.displayName || "Administrator CSSD",
                email: emailKey,
                whatsapp: "-",
                role: "ADMIN",
                tenantId: "RSUD-BENDA",
                scope: "ALL",
                statusAkun: "AKTIF",
                active: true,
                photoUrl: user.photoURL || ""
              }, user.uid, emailKey);

              if (!fetchFailed) {
                setDoc(doc(db, "users", emailKey), fallbackProfile, { merge: true }).catch(() => {});
              }
              localStorage.setItem(`cssd_user_profile_${emailKey}`, JSON.stringify(fallbackProfile));
              setUserProfile(fallbackProfile);
              setCurrentRole("ADMIN" as any);
              setCurrentUsername(fallbackProfile.name);
            } else {
              await signOut(auth);
              alert(`Akun Google (${emailKey}) belum terdaftar di sistem. Silakan hubungi Administrator.`);
              setUserProfile(null);
            }
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${emailKey}`);
        }
      } else {
        setUserProfile(null);
      }
      setLoadingAuth(false);
    });
    return () => unsub();
  }, []);

  const handleLogout = async () => {
    setIsDemoMode(false);
    setUserProfile(null);
    if (authUser) {
      await signOut(auth);
    }
  };

  const handleResetDemoState = () => {
    setDecontamQueue([]);
    setPackagingQueue([]);
  };

  const handleStartDemo = () => {
    setIsDemoMode(true);
    setShowDemoTutorial(true);
    handleResetDemoState();
    setUserProfile({
      uid: "demo-user-001",
      nip: "DEMO-12345",
      name: "Pengguna Demo (Tamu)",
      email: "demo@rsudbenda.id",
      whatsapp: "-",
      role: "operator",
      active: true,
      photoUrl: ""
    });
    setCurrentRole("operator");
    setCurrentUsername("Pengguna Demo");
  };

  const handleExitDemo = async () => {
    setIsDemoMode(false);
    handleResetDemoState();
    setUserProfile(null);
    if (authUser) {
      await signOut(auth);
    }
  };

  useEffect(() => {
    if (!isDemoMode && authUser && userProfile && (userProfile.role === "admin" || userProfile.role === "supervisor")) {
      seedDatabaseIfEmpty();
    }
  }, [authUser, userProfile, isDemoMode]);

  // Sync browser history state for mobile/browser native back button
  useEffect(() => {
    const initialHash = window.location.hash.replace('#', '');
    if (initialHash) {
      setCurrentTab(initialHash);
    } else {
      window.history.replaceState({ tab: 'dashboard' }, '', '#dashboard');
    }

    const handlePopState = (e: PopStateEvent) => {
      const targetTab = e.state?.tab || window.location.hash.replace('#', '') || 'dashboard';
      setCurrentTab(targetTab);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (loadingAuth) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">Loading...</div>;
  }

  if (!isDemoMode && (!authUser || !userProfile)) {
    return (
      <div className="min-h-screen">
        <Login onDemoLogin={handleStartDemo} />
        <FloatingMenuButton mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
      </div>
    );
  }

  const handleRoleChange = (role: 'admin' | 'operator' | 'supervisor') => {
    setCurrentRole(role);
    if (role === 'admin' || role === 'supervisor') {
      setCurrentUsername(userProfile?.name || "Administrator");
      handleTabChange("dashboard");
    } else {
      setCurrentUsername("Ahmad Yani");
      handleTabChange("penerimaan");
    }
    setMobileMenuOpen(false);
  };

  const handleTabChange = (tab: string, pushHistory = true) => {
    if (tab !== currentTab) {
      if (pushHistory) {
        window.history.pushState({ tab }, '', '#' + tab);
      }
      setCurrentTab(tab);
    }
    setMobileMenuOpen(false);
  };

  const handleGoBack = () => {
    if (window.history.state && window.history.state.tab && window.history.state.tab !== 'dashboard') {
      window.history.back();
    } else {
      handleTabChange('dashboard');
    }
  };

  return (
    <div className={`min-h-screen flex font-sans selection:bg-sky-500/20 selection:text-sky-100 medical-grid ${themeMode === 'siang' ? 'theme-day bg-white text-slate-900' : 'bg-slate-950 text-slate-100'}`} id="cssd-app-root">
      <ActionConfirmationToast />
      <FloatingMenuButton mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
      {isSimulatedOffline && (
        <div className={`fixed inset-x-0 bg-rose-600 text-white py-1 px-4 text-center text-xs font-bold z-50 flex items-center justify-center gap-2 shadow-md animate-pulse ${isDemoMode ? 'top-8' : 'top-0'}`}>
          <WifiOff className="w-4 h-4" />
          <span>Mode Offline Teraktifkan (Simulasi). Data akan tersimpan di Cache lokal & sinkron otomatis saat online!</span>
        </div>
      )}

      {/* SIDEBAR */}
      <aside className={`hidden md:flex flex-col w-64 shrink-0 shadow-xl z-20 ${themeMode === 'siang' ? 'bg-[#0B5868] text-white border-r border-[#084552]' : 'bg-[#0A1921] text-slate-100 border-r border-[#122834]'} ${isDemoMode || isSimulatedOffline ? 'pt-8' : ''}`}>
        <div className="p-5 border-b border-[#084552] flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center">
            <img src={appIcon || "/IconNew.png"} alt={appName} className="w-full h-full object-cover rounded-full" onError={(e) => { (e.target as HTMLImageElement).src = "/IconNew.png"; }} />
          </div>
          <div className="min-w-0">
            <span className="font-black text-white text-sm font-sans tracking-tight block truncate">e-CSSD.ms</span>
            <span className="text-[10px] text-cyan-200 block tracking-wider font-mono font-bold">by.AlpaTech</span>
          </div>
        </div>

        <div className="p-4 bg-[#084552] border-b border-[#063540] flex items-center gap-3">
          <div className={`rounded-full bg-slate-900 border border-slate-700 text-white overflow-hidden flex items-center justify-center w-8 h-8 ${!userProfile?.photoUrl ? "p-1.5" : ""}`}>
            {userProfile?.photoUrl ? <img src={userProfile.photoUrl} alt="Foto" className="w-8 h-8 rounded-full object-cover" /> : <User className="w-4 h-4 text-cyan-300" />}
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-bold text-white block truncate">{userProfile?.name}</span>
            <span className="text-[9px] text-cyan-200 font-mono font-bold uppercase tracking-wider block">{userProfile?.role}</span>
          </div>
          <button onClick={handleLogout} className="p-1.5 text-slate-200 hover:text-rose-300 hover:bg-rose-500/20 rounded-md transition" title="Logout / Ganti Akun">
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {visibleNavItems.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.id} onClick={() => handleTabChange(item.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs transition ${currentTab === item.id ? "bg-white/20 text-white font-extrabold border-l-4 border-amber-300 shadow" : "hover:bg-white/10 text-slate-100 font-semibold"}`}>
                <Icon className="w-4 h-4 text-amber-300 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
          <div className="pt-3 pb-1 px-1">
            <InstallPWA isSidebarItem={true} />
          </div>
        </nav>
      </aside>

      {/* HEADER & MAIN */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className={`bg-slate-950/80 border-b border-slate-800/80 px-6 py-4 flex items-center justify-between shrink-0 backdrop-blur-md ${isDemoMode || isSimulatedOffline ? 'mt-7' : ''}`}>
          <div className="flex items-center gap-3">
            {isDemoMode && <span className="text-[10px] font-bold text-amber-300 bg-amber-950 px-2 py-0.5 rounded-full uppercase tracking-wider">VERSI DEMO</span>}
            <div className="hidden md:flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium">Instalasi Penunjang</span>
              <span className="text-slate-700">/</span>
              <span className="text-sky-400 font-bold uppercase tracking-wider font-mono">
                {currentTab === 'dashboard' ? 'Dashboard Utama' : 
                 currentTab === 'machine_test' ? 'Uji Kelayakan Mesin' :
                 currentTab === 'penerimaan' ? 'Loket Penerimaan Alat' : 
                 currentTab === 'decontamination' ? 'Ruang Dekontaminasi' : 
                 currentTab === 'packaging' ? 'Ruang Pengemasan' : 
                 currentTab === 'origin_unit_stock' ? 'Stok Di Unit Asal' : 'Aktivitas CSSD'}
              </span>
            </div>
          </div>

          <DateTimeDisplay />

          <div className="flex items-center gap-3">
            {/* TOGGLE MODE TAMPILAN (MALAM / SIANG) */}
            <button
              onClick={() => setThemeMode(themeMode === "malam" ? "siang" : "malam")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition cursor-pointer shadow-sm ${
                themeMode === "malam"
                  ? "bg-slate-900 hover:bg-slate-800 border-slate-800 text-amber-300"
                  : "bg-slate-100 hover:bg-slate-200 border-slate-300 text-[#0B5868]"
              }`}
              title={themeMode === "malam" ? "Beralih ke Mode Siang" : "Beralih ke Mode Malam"}
            >
              {themeMode === "malam" ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="hidden sm:inline">Mode Siang</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-[#0B5868] shrink-0" />
                  <span className="hidden sm:inline">Mode Malam</span>
                </>
              )}
            </button>

            <div className="hidden sm:flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-semibold text-slate-300">
              <span className="text-slate-500 pl-1.5 font-mono">Peran:</span>
              <select value={currentRole} onChange={(e) => handleRoleChange(e.target.value as any)} className="bg-transparent border-0 font-bold focus:ring-0 cursor-pointer text-slate-100 text-xs p-0 pr-6">
                <option value="admin" className="bg-slate-950">Administrator</option>
                <option value="operator" className="bg-slate-950">Operator CSSD</option>
                <option value="supervisor" className="bg-slate-950">Kepala CSSD</option>
              </select>
            </div>
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
          </div>
        </header>

        {/* MOBILE DRAWER */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div initial={{ opacity: 0, x: -100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -100 }} className={`md:hidden fixed inset-0 z-40 flex flex-col w-64 p-5 pt-16 shadow-2xl border-r ${themeMode === 'siang' ? 'bg-[#0B5868] text-white border-[#084552]' : 'bg-[#0A1921] text-slate-100 border-[#122834]'}`}>
              <button onClick={() => setMobileMenuOpen(false)} className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-900 text-slate-300"><X className="w-5 h-5" /></button>
              <div className="flex-1 overflow-y-auto space-y-1 mt-2">
                <div className="pb-3 px-1 border-b border-slate-800 mb-2">
                  <button
                    onClick={() => setThemeMode(themeMode === "malam" ? "siang" : "malam")}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-bold transition ${
                      themeMode === "malam"
                        ? "bg-slate-900 border-slate-800 text-amber-300"
                        : "bg-slate-100 border-slate-300 text-[#0B5868]"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {themeMode === "malam" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-[#0B5868]" />}
                      <span>{themeMode === "malam" ? "Mode Siang" : "Mode Malam"}</span>
                    </span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-300">Ubah</span>
                  </button>
                </div>
                
                {visibleNavItems.map(item => {
                  const Icon = item.icon;
                  return (
                    <button key={item.id} onClick={() => handleTabChange(item.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs transition ${currentTab === item.id ? "bg-white/20 text-white font-extrabold border-l-4 border-amber-300 shadow" : "hover:bg-white/10 text-slate-100 font-semibold"}`}>
                      <Icon className="w-4 h-4 text-amber-300 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
                <div className="pt-2">
                  <InstallPWA isSidebarItem={true} />
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-[#084552]">
                <div className="flex items-center gap-3 px-3 mb-4">
                  <div className={`rounded-full bg-slate-900 border border-slate-700 text-white overflow-hidden flex items-center justify-center w-8 h-8 ${!userProfile?.photoUrl ? "p-1.5" : ""}`}>
                    {userProfile?.photoUrl ? <img src={userProfile.photoUrl} alt="Foto" className="w-8 h-8 rounded-full object-cover" /> : <User className="w-4 h-4 text-cyan-300" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-bold text-white block truncate">{userProfile?.name}</span>
                    <span className="text-[9px] text-cyan-200 font-mono font-bold uppercase tracking-wider block">{userProfile?.role}</span>
                  </div>
                </div>
                <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs font-bold text-rose-200 transition hover:bg-rose-500/20 rounded-lg">
                  <LogOut className="w-4 h-4 text-rose-300" />
                  <span>Logout / Ganti Akun</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* MAIN VIEWPORT MENERUSKAN STATE GLOBAL */}
        <main className="flex-1 p-6 overflow-y-auto max-w-7xl mx-auto w-full">
          {currentTab !== "dashboard" && (
            <div className="mb-4 flex items-center justify-between bg-slate-900/80 border border-slate-800 p-2.5 rounded-xl backdrop-blur-sm shadow-md">
              <button
                onClick={handleGoBack}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition shadow-md active:scale-95 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <span className="text-xs font-mono font-bold text-sky-400 uppercase tracking-wider pr-2">
                {currentTab === 'dashboard' && 'Dashboard'}
                {currentTab === 'penerimaan' && 'Penerimaan'}
                {currentTab === 'proses_cssd' && 'Proses CSSD'}
                {currentTab === 'sterilization' && 'Sterilisasi'}
                {currentTab === 'storage' && 'Rak & Stok Steril'}
                {currentTab === 'distribution' && 'Distribusi / Pengambilan'}
                {currentTab === 'recall' && 'Recall'}
                {currentTab === 'hold' && 'Karantina / Hold'}
                {currentTab === 'inventory' && 'Inventaris'}
                {currentTab === 'stock_opname' && 'Stock Opname'}
                {currentTab === 'reports' && 'Laporan'}
                {currentTab === 'master_data' && 'Master Data'}
                {currentTab === 'activity_log' && 'Audit Log'}
                {currentTab === 'administrasi' && 'Administrasi Sistem'}
                {currentTab === 'settings' && 'Pengaturan'}
              </span>
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentTab}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              {!visibleNavItems.some(item => item.id === currentTab) ? (
                 <div className="p-8 text-center bg-white rounded-xl shadow-sm border border-slate-200">
                  <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-slate-800">Akses Ditolak</h3>
                  <p className="text-slate-500 mt-2">Anda tidak memiliki izin untuk melihat menu ini.</p>
                </div>
              ) : (
                <>
                  {currentTab === "dashboard" && <Dashboard onNavigate={handleTabChange} currentRole={currentRole} currentUserProfile={userProfile} isDemoMode={isDemoMode} />}
                  {currentTab === "penerimaan" && (
                    <Penerimaan 
                      currentUsername={currentUsername} 
                      currentUserProfile={userProfile}
                      onAddNewItem={(newItem: any) => setDecontamQueue(prev => [newItem, ...prev])}
                      isDemoMode={isDemoMode}
                    />
                  )}
                  {currentTab === "proses_cssd" && (
                    <div className="space-y-6">
                      <div className="flex flex-col md:flex-row gap-4 border-b border-slate-200 pb-4">
                         <h2 className="text-xl font-bold text-slate-800">Proses CSSD: Dekontaminasi & Packing</h2>
                      </div>
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <Decontamination 
                          currentUsername={currentUsername} 
                          currentUserProfile={userProfile}
                          decontamQueue={decontamQueue}
                          setDecontamQueue={setDecontamQueue}
                          setPackagingQueue={setPackagingQueue}
                          isDemoMode={isDemoMode}
                        />
                        <Packaging 
                          currentUsername={currentUsername} 
                          currentUserProfile={userProfile}
                          packagingQueue={packagingQueue}
                          setPackagingQueue={setPackagingQueue}
                          isDemoMode={isDemoMode}
                        />
                      </div>
                    </div>
                  )}
                  {currentTab === "machine_test" && <MachineTest currentUsername={currentUsername} currentRole={currentRole} currentUserProfile={userProfile} isDemoMode={isDemoMode} />}
                  {currentTab === "sterilization" && <Sterilization currentUsername={currentUsername} isDemoMode={isDemoMode} currentUserProfile={userProfile} />}
                  {currentTab === "storage" && <Storage currentUsername={currentUsername} currentRole={currentRole} isDemoMode={isDemoMode} currentUserProfile={userProfile} />}
                  {currentTab === "distribution" && <Distribution currentUsername={currentUsername} isDemoMode={isDemoMode} userProfile={userProfile} />}
                  
                  {currentTab === "recall" && <RecallModule currentUsername={currentUsername} currentRole={currentRole} currentUserProfile={userProfile} isDemoMode={isDemoMode} />}
                  
                  {currentTab === "hold" && <HoldKarantina currentUsername={currentUsername} currentRole={currentRole} currentUserProfile={userProfile} isDemoMode={isDemoMode} />}
                  
                  {currentTab === "inventory" && <Inventory currentUsername={currentUsername} currentUserProfile={userProfile} mode="inventory" initialTab="bmhp" />}
                  
                  {currentTab === "bmhp_linen" && <BmhpLinenModule currentUsername={currentUsername} currentUserProfile={userProfile} isDemoMode={isDemoMode} />}
                  
                  {(currentTab === "stock_opname" || currentTab === "stock_discrepancy") && (
                    <StockDiscrepancy currentUsername={currentUsername} currentRole={currentRole} isDemoMode={isDemoMode} currentUserProfile={userProfile} />
                  )}
                  
                  {currentTab === "reports" && (
                    <ReportingDashboard 
                      currentUsername={currentUsername} 
                      currentUserProfile={userProfile} 
                      isDemoMode={isDemoMode} 
                      onNavigate={handleTabChange} 
                    />
                  )}

                  {currentTab === "master_data" && <Inventory currentUsername={currentUsername} currentUserProfile={userProfile} mode="master" />}
                  {currentTab === "activity_log" && <ActivityLog currentUsername={currentUsername} isDemoMode={isDemoMode} defaultFilter="all" currentUserProfile={userProfile} />}
                  {currentTab === "administrasi" && <AdministrasiModule currentUser={userProfile} />}
                  {currentTab === "settings" && <SettingsPanel currentRole={currentRole} currentUser={userProfile} />}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* MODAL TUTORIAL / PANDUAN DEMO */}
      <DemoTutorialModal
        isOpen={showDemoTutorial}
        onClose={() => setShowDemoTutorial(false)}
        onNavigateTab={(tab) => handleTabChange(tab)}
      />
    </div>
  );
}