import { useEffect, useState } from 'react'

let webglCache: boolean | null = null
export function hasWebGL(): boolean {
  if (webglCache != null) return webglCache
  try {
    const canvas = document.createElement('canvas')
    webglCache = !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    webglCache = false
  }
  return webglCache
}

function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches)
  useEffect(() => {
    const mq = matchMedia(query)
    const on = () => setMatch(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

export const useReducedMotion = () => useMedia('(prefers-reduced-motion: reduce)')
/** Телефон или слабое устройство: меньше частиц, без теней. */
export const useIsCompact = () => useMedia('(max-width: 760px), (pointer: coarse)')

export const prefersReducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
