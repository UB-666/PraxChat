import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';

type ToastType = 'error' | 'success' | 'info' | 'warning';

type Toast = {
    id: string;
    message: string;
    type: ToastType;
};

type ToastContextType = {
    showToast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        // Fallback to alert if context not available
        return {
            showToast: (message: string) => alert(message)
        };
    }
    return context;
}

const TOAST_DURATION = 4000;

const toastStyles: Record<ToastType, { bg: string; border: string; icon: typeof AlertCircle }> = {
    error: { bg: 'bg-red-500/10', border: 'border-red-500/30', icon: AlertCircle },
    success: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: CheckCircle },
    info: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: Info },
    warning: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: AlertTriangle },
};

const iconColors: Record<ToastType, string> = {
    error: 'text-red-400',
    success: 'text-emerald-400',
    info: 'text-blue-400',
    warning: 'text-amber-400',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType = 'error') => {
        const id = `toast-${Date.now()}`;
        setToasts(prev => [...prev, { id, message, type }]);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}

            {/* Toast Container */}
            <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
                {toasts.map(toast => (
                    <ToastItem
                        key={toast.id}
                        toast={toast}
                        onClose={() => removeToast(toast.id)}
                    />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
    const [isLeaving, setIsLeaving] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsLeaving(true);
            setTimeout(onClose, 300);
        }, TOAST_DURATION);

        return () => clearTimeout(timer);
    }, [onClose]);

    const handleClose = () => {
        setIsLeaving(true);
        setTimeout(onClose, 300);
    };

    const style = toastStyles[toast.type];
    const Icon = style.icon;

    return (
        <div
            className={`
                pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl 
                ${style.bg} ${style.border} border backdrop-blur-md shadow-2xl
                max-w-sm min-w-[280px]
                transition-all duration-300 ease-out
                ${isLeaving
                    ? 'opacity-0 translate-x-4'
                    : 'opacity-100 translate-x-0 animate-in slide-in-from-right-5'
                }
            `}
        >
            <Icon className={`w-5 h-5 ${iconColors[toast.type]} flex-shrink-0 mt-0.5`} />
            <p className="text-sm text-white flex-1">{toast.message}</p>
            <button
                onClick={handleClose}
                className="text-zinc-400 hover:text-white transition-colors flex-shrink-0"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}
