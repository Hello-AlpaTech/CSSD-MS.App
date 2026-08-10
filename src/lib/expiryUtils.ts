/**
 * Expiry Utility Functions for e-CSSD
 * Implementing LOCKED specifications for packaging expiry & monitoring:
 * - Linen: 7 days, warning starts H-1
 * - Pouch: 30 days, warning starts H-2
 * - Plasma Pouch: 90 days, warning starts H-3
 */

export function calculateExpiryDate(sterilizationDate: Date | string | number, wrapType: string): Date {
  let baseDate: Date;
  if (sterilizationDate instanceof Date) {
    baseDate = new Date(sterilizationDate.getTime());
  } else if (typeof sterilizationDate === 'string' || typeof sterilizationDate === 'number') {
    baseDate = new Date(sterilizationDate);
  } else {
    baseDate = new Date();
  }

  if (isNaN(baseDate.getTime())) {
    baseDate = new Date();
  }

  const expDate = new Date(baseDate.getTime());
  const wrap = (wrapType || '').toLowerCase();

  if (wrap.includes('linen')) {
    expDate.setDate(expDate.getDate() + 7);
  } else if (wrap.includes('plasma')) {
    expDate.setDate(expDate.getDate() + 90);
  } else {
    // Pouch / Crepe Paper / Rigid Container default to 30 days
    expDate.setDate(expDate.getDate() + 30);
  }

  return expDate;
}

export interface ExpiryStatus {
  category: 'NORMAL' | 'PERINGATAN' | 'EXPIRED';
  remainingDays: number;
  formattedExpDate: string;
  badgeClass: string;
  label: string;
}

export function getExpiryStatus(expiresAt: any, wrapType?: string): ExpiryStatus {
  let expDate: Date | null = null;

  if (!expiresAt) {
    return {
      category: 'NORMAL',
      remainingDays: 999,
      formattedExpDate: '-',
      badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      label: 'NORMAL'
    };
  }

  if (typeof expiresAt?.toDate === 'function') {
    expDate = expiresAt.toDate();
  } else if (expiresAt instanceof Date) {
    expDate = expiresAt;
  } else if (typeof expiresAt === 'string' || typeof expiresAt === 'number') {
    const d = new Date(expiresAt);
    if (!isNaN(d.getTime())) expDate = d;
  }

  if (!expDate) {
    return {
      category: 'NORMAL',
      remainingDays: 999,
      formattedExpDate: '-',
      badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      label: 'NORMAL'
    };
  }

  const now = new Date();
  // Set both dates to midnight for clean day difference
  const expZero = new Date(expDate.getFullYear(), expDate.getMonth(), expDate.getDate());
  const nowZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const diffTime = expZero.getTime() - nowZero.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 3600 * 24));

  const formattedExpDate = expDate.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  if (diffDays <= 0) {
    return {
      category: 'EXPIRED',
      remainingDays: diffDays,
      formattedExpDate,
      badgeClass: 'bg-rose-500/20 text-rose-400 border-rose-500/40 font-black animate-pulse',
      label: 'EXPIRED'
    };
  }

  const wrap = (wrapType || '').toLowerCase();
  let warningThreshold = 2; // Pouch default H-2
  if (wrap.includes('linen')) {
    warningThreshold = 1; // Linen H-1
  } else if (wrap.includes('plasma')) {
    warningThreshold = 3; // Plasma H-3
  }

  if (diffDays <= warningThreshold) {
    return {
      category: 'PERINGATAN',
      remainingDays: diffDays,
      formattedExpDate,
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold',
      label: `MENDEKATI KADALUARSA (H-${diffDays})`
    };
  }

  return {
    category: 'NORMAL',
    remainingDays: diffDays,
    formattedExpDate,
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    label: `AMAN (${diffDays} hari)`
  };
}
