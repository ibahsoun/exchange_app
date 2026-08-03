import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
  exiting?: boolean;
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void;
}

// ─── Context ────────────────────────────────────────────────
const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.toast;
}

// ─── Provider ───────────────────────────────────────────────
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((type: ToastType, message: string) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, type, message }]);

    // Auto-dismiss after 4s
    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
      );
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 300);
    }, 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      <div
        className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ─── Single toast ───────────────────────────────────────────
const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 text-status-green" />,
  error: <XCircle className="w-4 h-4 text-status-red" />,
  warning: <AlertTriangle className="w-4 h-4 text-status-yellow" />,
  info: <Info className="w-4 h-4 text-primary" />,
};

const BORDER_COLORS: Record<ToastType, string> = {
  success: 'border-l-status-green',
  error: 'border-l-status-red',
  warning: 'border-l-status-yellow',
  info: 'border-l-primary',
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => {
      ref.current?.classList.remove('translate-x-full', 'opacity-0');
    });
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border border-terminal-border border-l-[3px] bg-terminal-card shadow-terminal-lg min-w-[300px] max-w-[420px] transition-all duration-300 translate-x-full opacity-0',
        BORDER_COLORS[toast.type],
        toast.exiting && 'translate-x-full opacity-0',
      )}
      role="alert"
    >
      {ICONS[toast.type]}
      <span className="text-sm text-text-primary flex-1">{toast.message}</span>
      <button
        onClick={onDismiss}
        className="text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
        aria-label="Dismiss notification"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
