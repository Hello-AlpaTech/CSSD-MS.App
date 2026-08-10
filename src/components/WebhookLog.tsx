import React, { useState, useEffect } from "react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { Search, Trash2, Webhook, Activity, Clock, CheckCircle, XCircle, Code, X } from "lucide-react";
import { ConfirmDialog } from "./ConfirmDialog";

interface WebhookLogProps {
  currentUsername: string;
  isDemoMode?: boolean;
}

export default function WebhookLog({ currentUsername, isDemoMode = false }: WebhookLogProps) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRetrying, setIsRetrying] = useState<string | null>(null);
  const [payloadModal, setPayloadModal] = useState<{isOpen: boolean, data: any, title: string}>({ isOpen: false, data: null, title: "" });

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: (() => void) | null;
  }>({
    isOpen: false,
    title: "",
    message: "",
    action: null
  });

  const closeConfirm = () => setConfirmState(prev => ({ ...prev, isOpen: false }));

  useEffect(() => {
    if (isDemoMode) {
      // Mock data for demo mode
      setLogs([
        {
          id: "mock1",
          timestamp: new Date().toISOString(),
          event: "whatsapp_message_sent",
          payload: { to: "Pak Ferry", status: "delivered" },
          status: "success",
          notes: "Laporan harian berhasil dikirim."
        }
      ]);
      setLoading(false);
      return;
    }

    const colRef = collection(db, "webhooks");
    const q = query(colRef, orderBy("timestamp", "desc"));

    const unsub = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setLogs(list);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, "webhooks");
      setLoading(false);
    });

    return () => unsub();
  }, [isDemoMode]);

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredLogs.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredLogs.map(l => l.id));
    }
  };

  const handleDeleteSelected = async () => {
    if (isDemoMode) {
      alert("Mode Demo: Fitur hapus data disimulasikan.");
      setLogs(prev => prev.filter(l => !selectedIds.includes(l.id)));
      setSelectedIds([]);
      closeConfirm();
      return;
    }
    
    setIsDeleting(true);
    try {
      const promises = selectedIds.map(id => deleteDoc(doc(db, "webhooks", id)));
      await Promise.all(promises);
      setSelectedIds([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "webhooks");
    } finally {
      setIsDeleting(false);
      closeConfirm();
    }
  };

  const confirmDelete = () => {
    if (selectedIds.length === 0) return;
    setConfirmState({
      isOpen: true,
      title: "Hapus Log Webhook",
      message: `Anda yakin ingin menghapus ${selectedIds.length} log ini secara permanen?`,
      action: handleDeleteSelected
    });
  };

  
  const handleRetry = async (log: any) => {
    if (isDemoMode) {
      alert("Mode Demo: Fitur retry disimulasikan.");
      return;
    }
    
    setIsRetrying(log.id);
    try {
      await updateDoc(doc(db, "webhooks", log.id), {
        status: "pending",
        notes: "Mencoba ulang...",
        timestamp: new Date()
      });
      
      if (log.url) {
        const response = await fetch(log.url, {
          method: log.method || 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(log.headers || {})
          },
          body: JSON.stringify(log.payload || {})
        });
        
        if (!response.ok) {
           throw new Error(`HTTP error! status: ${response.status}`);
        }
      } else {
        // Simulate network request or API retry if no URL is provided
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      
      await updateDoc(doc(db, "webhooks", log.id), {
        status: "success",
        notes: "Berhasil dikirim ulang.",
        timestamp: new Date()
      });
    } catch (error) {
      console.error("Retry failed", error);
      await updateDoc(doc(db, "webhooks", log.id), {
        status: "error",
        notes: "Gagal dikirim ulang: " + (error instanceof Error ? error.message : "Unknown error"),
        timestamp: new Date()
      });
    } finally {
      setIsRetrying(null);
    }
  };

  const filteredLogs = logs.filter(log => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const event = log.event?.toLowerCase() || "";
    const notes = log.notes?.toLowerCase() || "";
    return event.includes(q) || notes.includes(q);
  });

  return (
    <div className="space-y-4 max-w-7xl mx-auto w-full pb-20">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden p-4 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Webhook className="w-6 h-6 text-sky-400" />
              Log Webhook & API
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Riwayat pengiriman webhook eksternal, integrasi WhatsApp, dan sinkronisasi API.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              placeholder="Cari event atau catatan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
            />
          </div>
          
          {selectedIds.length > 0 && (
            <button
              onClick={confirmDelete}
              disabled={isDeleting}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Hapus Terpilih ({selectedIds.length})</span>
            </button>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-950/50 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.length > 0 && selectedIds.length === filteredLogs.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-sky-500"
                  />
                </th>
                <th className="p-3 font-semibold">Waktu</th>
                <th className="p-3 font-semibold">Event</th>
                <th className="p-3 font-semibold">Status</th>
                <th className="p-3 font-semibold">Payload / Catatan</th>
                <th className="p-3 font-semibold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    <Activity className="w-6 h-6 animate-spin mx-auto mb-2 text-sky-500" />
                    Memuat log webhook...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    Tidak ada log webhook yang ditemukan.
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => {
                  let logDate = "Invalid Date";
                  let logTime = "";
                  if (log.timestamp) {
                    try {
                      const dt = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
                      logDate = dt.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
                      logTime = dt.toLocaleTimeString("id-ID", { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    } catch (e) {}
                  }

                  return (
                    <tr key={log.id} className={`hover:bg-slate-800/30 transition-colors ${selectedIds.includes(log.id) ? 'bg-sky-500/5' : ''}`}>
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(log.id)}
                          onChange={() => toggleSelect(log.id)}
                          className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-sky-500"
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-300 text-xs">{logDate}</span>
                          <span className="text-slate-500 text-[10px] flex items-center gap-1 mt-0.5"><Clock className="w-3 h-3"/>{logTime}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-1 bg-slate-800 text-slate-300 rounded-md text-xs font-mono border border-slate-700">
                          {log.event || "unknown_event"}
                        </span>
                      </td>
                      <td className="p-3">
                        {log.status === 'success' || log.status === 'ok' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold">
                            <CheckCircle className="w-3.5 h-3.5" /> Berhasil
                          </span>
                        ) : log.status === 'pending' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold">
                            <Clock className="w-3.5 h-3.5" /> Tertunda
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-bold">
                            <XCircle className="w-3.5 h-3.5" /> Gagal
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="max-w-xs sm:max-w-sm md:max-w-md truncate text-xs text-slate-400">
                          {log.notes && <p className="text-slate-300 font-semibold truncate mb-0.5">{log.notes}</p>}
                          {log.payload && (
                            <button
                              onClick={() => setPayloadModal({ isOpen: true, data: log.payload, title: `Payload - ${log.event}` })}
                              className="mt-1 flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300 font-semibold bg-sky-500/10 hover:bg-sky-500/20 px-2 py-1 rounded transition-colors w-max"
                            >
                              <Code className="w-3 h-3" /> Lihat Payload JSON
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        {log.status === 'failed' || log.status === 'error' ? (
                          <button
                            onClick={() => handleRetry(log)}
                            disabled={isRetrying === log.id}
                            className="px-3 py-1.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 border border-sky-500/30 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                          >
                            {isRetrying === log.id ? "Memproses..." : "Coba Lagi"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {payloadModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Code className="w-5 h-5 text-sky-400" />
                {payloadModal.title}
              </h3>
              <button
                onClick={() => setPayloadModal({ isOpen: false, data: null, title: "" })}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto bg-slate-950/30">
              <pre className="text-xs font-mono text-slate-300 bg-slate-950 p-4 rounded-xl border border-slate-800 overflow-x-auto">
                {JSON.stringify(payloadModal.data, null, 2)}
              </pre>
            </div>
            <div className="px-5 py-4 border-t border-slate-800 bg-slate-950/50 flex justify-end">
              <button
                onClick={() => setPayloadModal({ isOpen: false, data: null, title: "" })}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-semibold transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={() => confirmState.action && confirmState.action()}
        onCancel={closeConfirm}
      />
    </div>
  );
}
