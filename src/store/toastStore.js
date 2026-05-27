import { create } from 'zustand';

let toastId = 0;

export const useToastStore = create((set) => ({
    toasts: [],

    addToast: (message, type = 'info', duration = 3000) => {
        const id = ++toastId;
        set((state) => ({
            toasts: [...state.toasts, { id, message, type }]
        }));
        setTimeout(() => {
            set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) }));
        }, duration);
        return id;
    },

    removeToast: (id) => set((state) => ({
        toasts: state.toasts.filter(t => t.id !== id)
    })),
}));

/** Convenience helpers */
export const toast = {
    success: (msg) => useToastStore.getState().addToast(msg, 'success'),
    error:   (msg) => useToastStore.getState().addToast(msg, 'error'),
    info:    (msg) => useToastStore.getState().addToast(msg, 'info'),
};

/** Compat shim: toast('msg', 'error') as a plain function */
export function toastFn(message, type = 'info') {
    return useToastStore.getState().addToast(message, type);
}
