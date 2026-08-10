import React, { useState, useEffect } from "react";
import { signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { AlertTriangle, Star } from "lucide-react";

const DEFAULT_APP_NAME = "e-CSSD.ms";
const DEFAULT_APP_ICON = "/Icon-v1.10.png";

interface LoginProps {
  onDemoLogin?: () => void;
}

export default function Login({ onDemoLogin }: LoginProps) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [appName, setAppName] = useState(DEFAULT_APP_NAME);
  const [appIcon, setAppIcon] = useState(DEFAULT_APP_ICON);

  useEffect(() => {
    const loadAppSettings = async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "general"));
        if (snap.exists()) {
          const data = snap.data();
          if (data.appName) setAppName(data.appName);
          if (data.appIcon) setAppIcon(data.appIcon);
        }
      } catch {
        // Kalau gagal (mis. offline / demo), tetap pakai nama & logo default.
      }
    };
    loadAppSettings();
  }, []);

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope("email");
      provider.addScope("profile");
      provider.setCustomParameters({
        prompt: "select_account"
      });

      const res = await signInWithPopup(auth, provider);
      const user = res.user;

      let email = user.email;
      if (!email && user.providerData) {
        for (const p of user.providerData) {
          if (p.email) {
            email = p.email;
            break;
          }
        }
      }

      if (!email) {
        throw new Error("Gagal mengambil informasi email dari Akun Google Anda.");
      }

      const emailKey = email.toLowerCase();

      // Check if user is registered in Firestore users collection
      let snapExists = false;
      let snapData: any = null;
      let isOfflineErr = false;

      try {
        const snap = await getDoc(doc(db, "users", emailKey));
        snapExists = snap.exists();
        if (snapExists) snapData = snap.data();
      } catch (errSnap) {
        console.warn("Could not reach Firestore during login, allowing offline/admin fallback:", errSnap);
        isOfflineErr = true;
      }

      if (!snapExists && !isOfflineErr) {
        // Fetch registered user emails as a diagnostic helper
        let registeredList: string[] = [];
        try {
          const usersSnap = await getDocs(collection(db, "users"));
          usersSnap.forEach(d => {
            const data = d.data();
            if (data && data.email) {
              registeredList.push(data.email);
            } else {
              registeredList.push(d.id);
            }
          });
        } catch (errSnap) {
          console.warn("Gagal mengambil daftar email terdaftar:", errSnap);
        }

        // First admin auto-bootstrap exception:
        if (emailKey === "cssdrsudbenda@gmail.com") {
          // Allowed to proceed, App.tsx will auto-create the profile.
          return;
        }

        // Unregistered user: sign out and block access
        await signOut(auth);
        
        let errorMsg = `Akun Google (${user.email}) belum terdaftar di sistem. Silakan hubungi Administrator untuk mendaftarkan email Anda.`;
        if (registeredList.length > 0) {
          errorMsg += `\n\nPetugas yang terdaftar:\n` + registeredList.map(e => `• ${e}`).join("\n");
        } else {
          errorMsg += `\n\n(Tidak ada email petugas yang terdaftar di database)`;
        }
        setError(errorMsg);
      } else if (snapData) {
        if (!snapData.active) {
          await signOut(auth);
          setError("Akun Anda telah dinonaktifkan oleh Administrator.");
        }
      }
    } catch (err: any) {
      console.error("Google login error:", err);
      const errCode = err.code || "";
      if (errCode === "auth/popup-blocked") {
        setError("Popup masuk diblokir oleh browser Anda. Silakan aktifkan izin popup untuk melanjutkan.");
      } else if (errCode === "auth/popup-closed-by-user") {
        setError("Proses login dibatalkan oleh pengguna.");
      } else if (errCode === "auth/unauthorized-domain") {
        setError(`Domain ini (${window.location.hostname}) belum diizinkan untuk otentikasi.\n\nSilakan buka Firebase Console > Authentication > Settings > Authorized domains, lalu tambahkan domain ini ke daftar yang diizinkan.`);
      } else {
        setError(err.message || "Gagal masuk menggunakan Google.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex flex-col relative overflow-hidden font-sans bg-[#F5F7F9]"
      style={{
        backgroundImage: 'url("/Asset/Master Background.png")',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      <div className="flex-1 flex items-center justify-center p-4 z-10 relative mt-4">
        <div className="w-full max-w-[400px] bg-[#EEF2F6] rounded-[24px] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] border border-white/50 p-8 pb-10 relative overflow-hidden backdrop-blur-sm">
          {/* Logo Section */}
          <div className="flex justify-center mb-4">
            <img 
              src={appIcon || "/Icon-v1.10.png"} 
              alt="Logo" 
              className="w-32 h-auto object-contain drop-shadow-sm"
              onError={(e) => { (e.target as HTMLImageElement).src = '/Icon-v1.10.png'; }}
            />
          </div>

          <div className="text-center mb-6">
            <h1 className="text-4xl font-extrabold text-[#084A5C] tracking-tight mb-1">
              e-CSSD.ms
            </h1>
            <p className="text-[#084A5C] text-[10px] font-bold uppercase tracking-[0.2em] mb-1">
              BY.ALPATECH
            </p>
            <p className="text-[#597486] text-sm font-medium">
              Sistem Manajemen & Pelacakan Sterilisasi
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs font-medium flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="whitespace-pre-wrap">{error}</span>
            </div>
          )}

          <div className="space-y-3.5 relative z-20">
            <div className="flex justify-end">
              <a href="#" onClick={(e) => e.preventDefault()} className="text-xs font-bold text-[#084A5C] hover:text-[#15778B] transition-colors">
                Lupa password?
              </a>
            </div>
            
            <input 
              type="text" 
              placeholder="User ID" 
              className="w-full px-4 py-3 rounded-lg border border-[#D8DFE4] bg-white text-[#084A5C] placeholder-[#8698A6] focus:outline-none focus:ring-2 focus:ring-[#259EB4] focus:border-transparent transition-all shadow-sm"
            />
            
            <input 
              type="password" 
              placeholder="Password" 
              className="w-full px-4 py-3 rounded-lg border border-[#D8DFE4] bg-white text-[#084A5C] placeholder-[#8698A6] focus:outline-none focus:ring-2 focus:ring-[#259EB4] focus:border-transparent transition-all shadow-sm"
            />

            <button 
              type="button"
              className="w-full bg-[#15778B] hover:bg-[#084A5C] text-white font-semibold py-3 px-4 rounded-lg transition-all shadow-md mt-1"
            >
              Login
            </button>

            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              type="button"
              className="w-full bg-white hover:bg-slate-50 text-slate-700 font-medium py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-3 shadow-md border border-[#D8DFE4] disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
              </svg>
              <span>{loading ? "Menghubungkan..." : "Masuk dengan Google (Gmail)"}</span>
            </button>

            {onDemoLogin && (
              <button
                onClick={onDemoLogin}
                type="button"
                className="w-full bg-[#084A5C] hover:bg-[#063948] text-white font-medium py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2 shadow-md"
              >
                <Star className="w-4 h-4" />
                <span>Masuk Versi Demo (Akses Bebas)</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Footer / Ownership Marking */}
      <div className="relative z-10 w-full bg-[#EEF2F6] border-t-2 border-[#D8DFE4] py-4 mt-auto">
        <div className="w-full max-w-sm mx-auto px-4 flex flex-col items-center">
          <div className="w-full flex items-center justify-center gap-4 mb-2">
            <div className="h-[2px] bg-[#8698A6] flex-1"></div>
            <img src="/icon marking Alpatech.png" alt="AlpaTech Logo" className="h-8 w-auto object-contain" />
            <div className="h-[2px] bg-[#8698A6] flex-1"></div>
          </div>
          <div className="text-xs text-[#084A5C] font-medium tracking-wide">
            © AlpaTech • Developed by Adha Pascal • v1.10
          </div>
        </div>
      </div>
    </div>
  );
}
