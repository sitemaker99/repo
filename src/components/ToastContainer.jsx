import { useToastStore } from '../store/toastStore';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ICONS = {
    success: <CheckCircle2 size={18} />,
    error:   <AlertCircle size={18} />,
    info:    <Info size={18} />,
};

export default function ToastContainer() {
    const { toasts, removeToast } = useToastStore();

    return (
        <div className="toast-container">
            {toasts.map(t => (
                <div key={t.id} className={`toast toast-${t.type}`}>
                    <span className="toast-icon">{ICONS[t.type]}</span>
                    <span className="toast-msg">{t.message}</span>
                    <button className="toast-close" onClick={() => removeToast(t.id)}>
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
    );
}
