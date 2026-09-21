import { create } from "zustand";

export type ToastTone = "success" | "destructive" | "neutral";

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id">) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}

let nextId = 0;

/**
 * Where «salió bien» goes.
 *
 * The app had nowhere to say it: a publish cleared its form, an archive
 * changed a word in a header, and a save said nothing at all — so the only
 * way to know an action landed was to go looking for its effect. Errors were
 * inline and successes were invisible.
 *
 * Deliberately NOT part of the bound store: that one persists to
 * localStorage, and a notice about something that just happened has no
 * business surviving a reload.
 */
const useToasts = create<ToastState>()((set) => ({
  toasts: [],

  push: (toast) => {
    const id = ++nextId;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    return id;
  },

  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((one) => one.id !== id) })),

  clear: () => set({ toasts: [] }),
}));

/**
 * The call site's door, so a mutation callback does not have to be a hook:
 * `toast.success(t('Publicaste la v4'))`.
 */
export const toast = {
  success: (title: string, description?: string) =>
    useToasts.getState().push({ tone: "success", title, description }),
  error: (title: string, description?: string) =>
    useToasts.getState().push({ tone: "destructive", title, description }),
  info: (title: string, description?: string) =>
    useToasts.getState().push({ tone: "neutral", title, description }),
};

export default useToasts;
