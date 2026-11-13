import { useEffect } from 'react';
import { toast as sonner } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { usePlayer } from '../state/store';

const ID = 'vinyl-toast';

/**
 * Bridges the store's single `notify()` channel to shadcn's Sonner toaster.
 * A fixed id means a new message replaces the old one: one toast at a time.
 */
export function Toast() {
  const toast = usePlayer(s => s.toast);
  useEffect(() => {
    if (!toast) { sonner.dismiss(ID); return; }
    const action = toast.action
      ? { label: toast.action.label, onClick: () => { toast.action!.run(); usePlayer.getState().dismissToast(); } }
      : toast.link ? { label: `${toast.link.label} ↗`, onClick: () => window.open(toast.link!.href, '_blank', 'noopener') } : undefined;
    const clear = () => { if (usePlayer.getState().toast?.id === toast.id) usePlayer.getState().dismissToast(); };
    sonner(toast.message, { id: ID, action, closeButton: true, onDismiss: clear, onAutoClose: clear });
  }, [toast]);
  return <Toaster />;
}
