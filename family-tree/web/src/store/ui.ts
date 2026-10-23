import { create } from 'zustand'

export interface Toast { id: number; text: string; tone: 'info' | 'error' }

interface ConfirmRequest {
  title: string
  text: string
  ok: string
  danger?: boolean
  resolve: (ok: boolean) => void
}

interface UiState {
  toasts: Toast[]
  confirm: ConfirmRequest | null
  /** Кнопка «Создать древо»: страница древа откроет форму нового человека. */
  createPending: boolean
  requestCreate: () => void
  takeCreate: () => boolean
  toast: (text: string, tone?: Toast['tone']) => void
  dismissToast: (id: number) => void
  ask: (req: Omit<ConfirmRequest, 'resolve'>) => Promise<boolean>
  answer: (ok: boolean) => void
}

let nextId = 1

export const useUi = create<UiState>((set, get) => ({
  toasts: [],
  confirm: null,
  createPending: false,
  requestCreate: () => set({ createPending: true }),
  takeCreate: () => {
    const pending = get().createPending
    if (pending) set({ createPending: false })
    return pending
  },
  toast: (text, tone = 'info') => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, tone }] }))
    setTimeout(() => get().dismissToast(id), tone === 'error' ? 6000 : 3500)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  ask: (req) => new Promise((resolve) => {
    get().confirm?.resolve(false)
    set({ confirm: { ...req, resolve } })
  }),
  answer: (ok) => {
    const req = get().confirm
    set({ confirm: null })
    req?.resolve(ok)
  },
}))

export const toast = (text: string, tone?: Toast['tone']) => useUi.getState().toast(text, tone)
export const ask = (req: Omit<ConfirmRequest, 'resolve'>) => useUi.getState().ask(req)

/** Выполняет действие и показывает ошибку уведомлением, если оно не удалось. */
export async function attempt<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn()
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), 'error')
    return undefined
  }
}
