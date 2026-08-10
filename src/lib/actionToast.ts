export interface ActionToastDetail {
  title: string;
  message?: string;
  type?: 'success' | 'info' | 'warning';
}

export function triggerActionConfirm(detail: ActionToastDetail) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cssd_action_confirmed', { detail }));
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([40, 60, 40]);
      } catch (e) {
        // ignore if not allowed
      }
    }
  }
}
