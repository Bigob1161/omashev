import { create } from 'zustand'
import { ru, type Dict } from './ru'
import { uz } from './uz'
import { storage } from '../lib/storage'

// Чтобы добавить узбекскую кириллицу: создать uz-cyrl.ts с типом Dict и дописать его сюда.
export const LANGS = {
  ru: { dict: ru, label: 'RU', htmlLang: 'ru', locale: 'ru-RU' },
  uz: { dict: uz, label: 'UZ', htmlLang: 'uz-Latn', locale: 'uz-Latn-UZ' },
} satisfies Record<string, { dict: Dict; label: string; htmlLang: string; locale: string }>

export type Lang = keyof typeof LANGS

function initialLang(): Lang {
  const saved = storage.get('lang')
  return saved && saved in LANGS ? (saved as Lang) : 'ru'
}

interface LangState {
  lang: Lang
  setLang: (lang: Lang) => void
}

export const useLang = create<LangState>((set) => ({
  lang: initialLang(),
  setLang: (lang) => {
    storage.set('lang', lang)
    document.documentElement.lang = LANGS[lang].htmlLang
    set({ lang })
  },
}))

document.documentElement.lang = LANGS[useLang.getState().lang].htmlLang

/** Подставляет {name} в строку. */
export function fmt(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => (key in params ? String(params[key]) : `{${key}}`))
}

export function useT(): Dict {
  const lang = useLang((s) => s.lang)
  return LANGS[lang].dict
}

export function useLocale(): string {
  const lang = useLang((s) => s.lang)
  return LANGS[lang].locale
}

/** Словарь вне React (например, для сообщений об ошибках из стора). */
export function currentDict(): Dict {
  return LANGS[useLang.getState().lang].dict
}

const ROMAN: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
export function roman(n: number): string {
  let out = ''
  for (const [value, sym] of ROMAN) while (n >= value) { out += sym; n -= value }
  return out
}
