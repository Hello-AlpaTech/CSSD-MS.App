import React, { useState, useEffect } from "react";
import { UserProfile } from "../types";
import { db, auth, storage } from "../lib/firebase";
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDoc, getDocs, query, where } from "firebase/firestore";
import { createUserWithEmailAndPassword, sendPasswordResetEmail, getAuth } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Settings, Users, Image as ImageIcon, Trash2, Plus, ShieldCheck, User, Printer, Download, HardDrive } from "lucide-react";
import { motion } from "motion/react";
import { initializeApp, deleteApp } from "firebase/app";
import firebaseConfig from "../../firebase-applet-config.json";
import { BluetoothPrinterServiceComponent } from "./BluetoothPrinterService";
import { triggerActionConfirm } from "../lib/actionToast";
import UserManagement from "./UserManagement";

interface Props {
  currentRole: string;
  currentUser?: UserProfile | null;
}

export default function SettingsPanel({ currentRole, currentUser }: Props) {
  const [activeTab, setActiveTab] = useState<'users' | 'app' | 'printer' | 'backup'>('users');
  
  // App Settings
  const [appName, setAppName] = useState("");
  const [appIconUrl, setAppIconUrl] = useState("");
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [isSavingApp, setIsSavingApp] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Users
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userForm, setUserForm] = useState<Partial<UserProfile> & { password?: string }>({
    nip: "", name: "", email: "", whatsapp: "", role: "operator", password: ""
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [deleteDate, setDeleteDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    // Load users
    const tenantId = currentUser?.tenantId || "RSUD-BENDA";
    const unsubUsers = onSnapshot(query(collection(db, "users"), where("tenantId", "==", tenantId)), (snap) => {
      const list: UserProfile[] = [];
      snap.forEach(d => list.push(d.data() as UserProfile));
      setUsers(list);
    });

    // Load App settings
    const loadAppSettings = async () => {
      const snap = await getDoc(doc(db, "settings", "general"));
      if (snap.exists()) {
        const data = snap.data();
        if (data.appName) setAppName(data.appName);
        if (data.appIcon) setAppIconUrl(data.appIcon);
      }
    };
    loadAppSettings();

    return () => unsubUsers();
  }, []);

  const handleExportDatabase = async () => {
    setIsExporting(true);
    try {
      const collectionsToExport = ['workflow_logs', 'instruments', 'machines', 'users', 'distribution', 'sterile_stock', 'environmental_logs'];
      const exportData: Record<string, any[]> = {};

      for (const colName of collectionsToExport) {
        const snap = await getDocs(collection(db, colName));
        const docsList: any[] = [];
        snap.forEach(d => {
          docsList.push({ id: d.id, ...d.data() });
        });
        exportData[colName] = docsList;
      }

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `CSSD_RSUD_Benda_Backup_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      alert("Backup data berhasil diexport ke format JSON!");
    } catch (err: any) {
      alert("Gagal melakukan export data: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportLogsToCSV = async () => {
    setIsExporting(true);
    try {
      const snap = await getDocs(collection(db, 'workflow_logs'));
      const rows = [['Lot Number', 'Instrument', 'Qty', 'Stage', 'Created At', 'Updated At', 'Source Unit', 'Recipient Unit']];
      
      snap.forEach(d => {
        const data = d.data() as any;
        rows.push([
          data.lotNumber || '-',
          data.instrumentName || '-',
          data.qty || '0',
          data.currentStage || '-',
          data.createdAt?.toDate().toLocaleString('id-ID') || '-',
          data.updatedAt?.toDate().toLocaleString('id-ID') || '-',
          data.decontamination?.sourceUnit || '-',
          data.distribution?.recipientUnit || '-'
        ]);
      });

      const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Audit_Log_CSSD_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      alert("Log operasional berhasil diexport ke CSV (Spreadsheet)!");
    } catch (err: any) {
      alert("Gagal export log: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleResetAllLogs = async () => {
    if (currentRole !== 'admin') return alert("Hanya admin yang dapat melakukan reset.");
    if (false) return;
    
    setIsResetting(true);
    try {
      const collectionsToReset = ['workflow_logs', 'distribution', 'environmental_logs', 'activity_logs'];
      for (const colName of collectionsToReset) {
        const snap = await getDocs(collection(db, colName));
        for (const docSnap of snap.docs) {
          await deleteDoc(doc(db, colName, docSnap.id));
        }
      }
      alert("Semua data log berhasil direset.");
    } catch (err: any) {
      alert("Gagal reset: " + err.message);
    } finally {
      setIsResetting(false);
    }
  };

  const handleDeleteLogsByDate = async () => {
    if (currentRole !== 'admin') return alert("Hanya admin.");
    if (false) return;
    
    setIsResetting(true);
    try {
      const collections = ['workflow_logs', 'distribution', 'environmental_logs', 'activity_logs'];
      for (const colName of collections) {
         const snap = await getDocs(collection(db, colName));
         for (const d of snap.docs) {
             const data = d.data();
             const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toISOString().slice(0, 10) : "";
             if (createdAt === deleteDate) {
                 await deleteDoc(doc(db, colName, d.id));
             }
         }
      }
      alert("Logs untuk tanggal " + deleteDate + " berhasil dihapus.");
    } catch (err: any) {
        alert("Gagal: " + err.message);
    } finally {
        setIsResetting(false);
    }
  };

  const handleSaveApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentRole !== 'admin') return alert("Hanya admin yang dapat merubah pengaturan.");
    setIsSavingApp(true);
    let finalIcon = appIconUrl;

    try {
      if (iconFile) {
        const storageRef = ref(storage, `app_icons/${Date.now()}_${iconFile.name}`);
        await uploadBytes(storageRef, iconFile);
        finalIcon = await getDownloadURL(storageRef);
        setAppIconUrl(finalIcon);
      }
      await setDoc(doc(db, "settings", "general"), { appName, appIcon: finalIcon }, { merge: true });
      triggerActionConfirm({
        title: "Pengaturan Disimpan!",
        message: "Nama dan logo aplikasi berhasil diperbarui."
      });
      setIconFile(null);
    } catch (err: any) {
      alert("Gagal menyimpan: " + err.message);
    } finally {
      setIsSavingApp(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentRole !== 'admin') return alert("Hanya admin yang dapat mendaftarkan akun.");
    if (!userForm.email) return alert("Email Gmail wajib diisi.");
    
    setIsSavingUser(true);
    let photoUrl = "";

    try {
      if (photoFile) {
        const storageRef = ref(storage, `user_photos/${Date.now()}_${photoFile.name}`);
        await uploadBytes(storageRef, photoFile);
        photoUrl = await getDownloadURL(storageRef);
      }

      const emailKey = userForm.email.trim().toLowerCase();

      // Check if user already exists
      const docSnap = await getDoc(doc(db, "users", emailKey));
      if (docSnap.exists()) {
        throw new Error("Email Gmail tersebut sudah terdaftar di sistem.");
      }
      
      // Save user profile in Firestore
      await setDoc(doc(db, "users", emailKey), {
        uid: "", // Will be linked when the user logs in for the first time
        nip: userForm.nip || "",
        name: userForm.name || "",
        email: emailKey,
        whatsapp: userForm.whatsapp || "",
        role: userForm.role || "operator",
        photoUrl,
        active: true
      });

      alert("Petugas berhasil didaftarkan! Petugas sekarang dapat masuk menggunakan akun Gmail tersebut.");
      setIsUserModalOpen(false);
      setUserForm({
        nip: "", name: "", email: "", whatsapp: "", role: "operator"
      });
      setPhotoFile(null);
    } catch (err: any) {
      console.error("User registration error:", err);
      alert("Gagal mendaftarkan akun: " + (err.message || "Terjadi kesalahan tidak diketahui."));
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleDeleteUser = async (email: string) => {
    if (currentRole !== 'admin') return alert("Hanya admin yang dapat menghapus akun.");
    if (true) {
      try {
        await deleteDoc(doc(db, "users", email.toLowerCase()));
        alert("Petugas berhasil dihapus.");
      } catch (err: any) {
        alert("Gagal menghapus: " + err.message);
      }
    }
  };

  if (currentRole !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center text-center h-full text-slate-500 p-8 space-y-3">
        <ShieldCheck className="w-16 h-16 text-slate-700" />
        <h2 className="text-xl font-bold text-slate-400">Akses Ditolak</h2>
        <p className="max-w-sm">Hanya akun dengan role Admin yang dapat mengakses menu Pengaturan dan Manajemen Akun.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-slate-800 rounded-xl border border-slate-700">
          <Settings className="w-6 h-6 text-sky-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-100">Pengaturan Sistem</h1>
          <p className="text-xs text-slate-400">Manajemen Aplikasi & Akun Pengguna</p>
        </div>
      </div>

      <div className="flex gap-2 p-1 bg-slate-900 rounded-lg max-w-md border border-slate-800">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex-1 py-2 text-xs font-bold rounded-md transition ${activeTab === 'users' ? 'bg-slate-800 text-sky-400 shadow' : 'text-slate-400 hover:text-slate-200'}`}
        >
          Manajemen Akun
        </button>
        <button
          onClick={() => setActiveTab('app')}
          className={`flex-1 py-2 text-xs font-bold rounded-md transition ${activeTab === 'app' ? 'bg-slate-800 text-sky-400 shadow' : 'text-slate-400 hover:text-slate-200'}`}
        >
          Aplikasi
        </button>
        <button
          onClick={() => setActiveTab('printer')}
          className={`flex-1 py-2 text-xs font-bold rounded-md transition flex items-center justify-center gap-1.5 ${activeTab === 'printer' ? 'bg-slate-800 text-emerald-400 shadow' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Printer className="w-3.5 h-3.5" />
          Printer 57mm
        </button>
        <button
          onClick={() => setActiveTab('backup')}
          className={`flex-1 py-2 text-xs font-bold rounded-md transition flex items-center justify-center gap-1.5 ${activeTab === 'backup' ? 'bg-slate-800 text-sky-400 shadow' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <HardDrive className="w-3.5 h-3.5" />
          Backup & Drive
        </button>
      </div>

      <div className="mt-8 p-4 bg-slate-950 rounded-xl border border-slate-800 flex items-center gap-4 text-slate-400">
        <img src="https://raw.githubusercontent.com/AlpaTech/assets/main/logo.png" alt="AlpaTech Logo" className="w-12 h-12 rounded-full" onError={(e) => (e.currentTarget.src = "https://placehold.co/100x100?text=AlpaTech")} />
        <div className="text-xs">
          <p className="font-bold text-slate-200">Support:</p>
          <p>AlpaTech</p>
          <p>Email: halo.alpatech@gmail.com</p>
          <p>WhatsApp: 085122734233</p>
        </div>
      </div>

      {activeTab === 'printer' && (
        <BluetoothPrinterServiceComponent />
      )}

      {activeTab === 'backup' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg max-w-2xl space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="p-3 bg-sky-500/10 text-sky-400 rounded-xl">
              <HardDrive className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-200">Backup & Export Data CSSD</h3>
              <p className="text-xs text-slate-400">Unduh seluruh catatan database (Log Workflow, Stok, Distribusi, Akun) ke format JSON</p>
            </div>
          </div>

          <div className="space-y-4 text-xs text-slate-300">
            <p>
              Fitur ini mengekspor seluruh basis data aplikasi secara instan ke file <code className="bg-slate-950 px-2 py-1 rounded text-sky-400 font-mono">.json</code>. 
              File backup ini sangat ringan, aman, dan dapat langsung diunggah ke <strong>Google Drive RSUD Benda</strong> Anda untuk penyimpanan jangka panjang secara gratis.
            </p>

            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
              <h4 className="font-bold text-slate-200">Langkah Penyimpanan ke Google Drive:</h4>
              <ol className="list-decimal list-inside space-y-1 text-slate-400">
                <li>Klik tombol <strong>"Ekspor Database ke JSON"</strong> di bawah.</li>
                <li>Simpan file hasil unduhan ke komputer atau smartphone Anda.</li>
                <li>Buka <a href="https://drive.google.com" target="_blank" rel="noreferrer" className="text-sky-400 underline">Google Drive RSUD Benda</a> dan unggah file cadangan tersebut ke folder khusus CSSD.</li>
              </ol>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleExportDatabase}
                disabled={isExporting}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 p-3 rounded-lg text-xs font-bold flex justify-center items-center gap-2 transition disabled:opacity-50"
              >
                <HardDrive className="w-4 h-4" />
                Backup Seluruh Database (JSON)
              </button>
              <button
                onClick={handleExportLogsToCSV}
                disabled={isExporting}
                className="w-full bg-sky-600 hover:bg-sky-500 text-white p-3 rounded-lg text-xs font-bold flex justify-center items-center gap-2 shadow-lg transition disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {isExporting ? 'Mengekspor...' : 'Ekspor Log Audit ke CSV (Spreadsheet)'}
              </button>
              
              <div className="pt-4 mt-4 border-t border-slate-800 space-y-3">
                  <h4 className="font-bold text-slate-300 text-xs">Manajemen Pembersihan Log:</h4>
                  <div className="flex gap-2">
                    <input type="date" value={deleteDate} onChange={e => setDeleteDate(e.target.value)} className="bg-slate-950 border border-slate-700 p-2 rounded text-slate-200 text-xs flex-1" />
                    <button onClick={handleDeleteLogsByDate} disabled={isResetting} className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded text-xs font-bold disabled:opacity-50">Hapus Harian</button>
                  </div>
                  <button onClick={handleResetAllLogs} disabled={isResetting} className="w-full bg-rose-600 hover:bg-rose-500 text-white p-3 rounded-lg text-xs font-bold transition disabled:opacity-50">
                    {isResetting ? 'Mereset...' : 'RESET SEMUA LOG (Peringatan!)'}
                  </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <UserManagement currentUser={currentUser || null} />
      )}

      {activeTab === 'app' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg max-w-2xl">
          <h3 className="text-base font-bold text-slate-200 mb-6 border-b border-slate-800 pb-4">Pengaturan Identitas Aplikasi</h3>
          
          <form onSubmit={handleSaveApp} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Nama Aplikasi</label>
              <input 
                type="text" 
                value={appName} 
                onChange={e => setAppName(e.target.value)} 
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-100 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition outline-none"
                placeholder="Sistem Manajemen CSSD"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Icon Aplikasi</label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-slate-950 border border-slate-700 flex items-center justify-center overflow-hidden">
                  {appIconUrl ? (
                    <img src={appIconUrl} alt="Icon" className="w-full h-full object-contain" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-slate-600" />
                  )}
                </div>
                <div className="flex-1">
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={e => setIconFile(e.target.files ? e.target.files[0] : null)}
                    className="w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700 transition cursor-pointer"
                  />
                  <p className="text-[10px] text-slate-500 mt-2">Format yang didukung: JPG, PNG. Rekomendasi rasio 1:1.</p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800">
              <button 
                type="submit" 
                disabled={isSavingApp}
                className="bg-sky-600 hover:bg-sky-500 text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow-lg transition disabled:opacity-50"
              >
                {isSavingApp ? 'Menyimpan...' : 'Simpan Pengaturan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Tambah User */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 mb-4">Daftarkan Petugas Baru</h3>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">NIB / NIP</label>
                  <input type="text" required value={userForm.nip} onChange={e => setUserForm({...userForm, nip: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:border-sky-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Nama Lengkap</label>
                  <input type="text" required value={userForm.name} onChange={e => setUserForm({...userForm, name: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:border-sky-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Gmail (Akun Login)</label>
                  <input type="email" required value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:border-sky-500" placeholder="contoh: petugas@gmail.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">No. WhatsApp</label>
                  <input type="text" value={userForm.whatsapp} onChange={e => setUserForm({...userForm, whatsapp: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:border-sky-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Role Akun</label>
                  <select value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value as any})} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:border-sky-500">
                    <option value="operator">Operator CSSD</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Foto Profil</label>
                  <input type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files ? e.target.files[0] : null)} className="w-full text-xs text-slate-400 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:bg-slate-800 file:text-slate-300" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800 mt-4">
                <button type="button" onClick={() => setIsUserModalOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200">Batal</button>
                <button type="submit" disabled={isSavingUser} className="bg-sky-600 hover:bg-sky-500 px-4 py-2 rounded text-xs font-bold text-white shadow-lg disabled:opacity-50">
                  {isSavingUser ? 'Memproses...' : 'Daftarkan Petugas'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
