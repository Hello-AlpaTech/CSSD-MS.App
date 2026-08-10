import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, Sparkles, X } from 'lucide-react';
import { ActionToastDetail } from '../lib/actionToast';

export default function ActionConfirmationToast() {
  const [toast, setToast] = useState<ActionToastDetail | null>(null);

  useEffect(() => {
    const handleEvent = (e: any) => {
      if (e.detail) {
        setToast({
          title: e.detail.title || 'Proses Terkonfirmasi',
          message: e.detail.message || 'Data berhasil disubmit & tersimpan ke sistem.',
          type: e.detail.type || 'success'
        });
      }
    };

    window.addEventListener('cssd_action_confirmed', handleEvent);
    return () => window.removeEventListener('cssd_action_confirmed', handleEvent);
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  return (
    <AnimatePresence>
      {toast && (
        <div className="fixed inset-x-0 top-16 z-[9999] flex justify-center items-center pointer-events-none px-4">
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="pointer-events-auto max-w-md w-full bg-slate-900/95 border-2 border-emerald-500/80 rounded-2xl shadow-2xl shadow-emerald-950/60 p-4 text-slate-100 backdrop-blur-xl flex items-start gap-3.5 relative overflow-hidden"
          >
            {/* Ambient Background Glow Effect */}
            <div className="absolute -left-10 -top-10 w-32 h-32 bg-emerald-500/20 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-sky-500/20 rounded-full blur-2xl pointer-events-none" />

            {/* Icon Container with Spring Scaling Animation */}
            <motion.div
              initial={{ scale: 0, rotate: -45 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 20, delay: 0.1 }}
              className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-600/40 text-white mt-0.5"
            >
              {toast.type === 'warning' ? (
                <AlertCircle className="w-6 h-6" />
              ) : toast.type === 'info' ? (
                <Info className="w-6 h-6" />
              ) : (
                <CheckCircle2 className="w-6 h-6" />
              )}
            </motion.div>

            {/* Text Details */}
            <div className="flex-1 min-w-0 pr-6">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 font-mono flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Action Confirmed
                </span>
              </div>
              <h4 className="text-sm font-bold text-white tracking-tight leading-snug">{toast.title}</h4>
              {toast.message && (
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">{toast.message}</p>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={() => setToast(null)}
              className="absolute top-3.5 right-3.5 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Bottom Progress Bar Timer Animation */}
            <motion.div
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: 3, ease: "linear" }}
              className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-300"
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
