// localStorage может быть недоступен (приватный режим, запрет сайтов) — тогда просто ничего не помним.
export const storage = {
  get(key: string): string | null {
    try { return localStorage.getItem('nasl:' + key) } catch { return null }
  },
  set(key: string, value: string) {
    try { localStorage.setItem('nasl:' + key, value) } catch { /* недоступно */ }
  },
  remove(key: string) {
    try { localStorage.removeItem('nasl:' + key) } catch { /* недоступно */ }
  },
}
