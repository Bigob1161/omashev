import type { Person } from '../api/types'
import type { Dict } from '../i18n/ru'

export const yearOf = (s: string | undefined) => (s || '').match(/\d{4}/)?.[0] || ''

export function fullName(p: Person, dict: Dict): string {
  return [p.last_name, p.first_name, p.middle_name].filter(Boolean).join(' ') || dict.common.noName
}

export function displayName(p: Person, dict: Dict): string {
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || dict.common.noName
}

/** «1942–2010», «род. 1971» — только то, что известно; иначе пусто. */
export function lifeYears(p: Person, dict: Dict): string {
  const b = yearOf(p.birth_date), d = yearOf(p.death_date)
  if (p.death_date) return `${b || '?'} – ${d || '?'}`
  return b ? `${dict.common.bornShort} ${b}` : ''
}

export function initials(p: Person): string {
  return (((p.first_name || '')[0] || '') + ((p.last_name || '')[0] || '')).toUpperCase() || '·'
}

export function matches(p: Person, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [p.last_name, p.first_name, p.middle_name, p.maiden_name].join(' ').toLowerCase().includes(q)
}
