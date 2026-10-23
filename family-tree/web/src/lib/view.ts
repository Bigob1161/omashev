import type { Person } from '../api/types'
import { fileUrl } from '../api/client'
import type { Dict } from '../i18n/ru'
import { fmt, roman } from '../i18n'
import type { PersonCardProps } from '../components/PersonCard'
import { type FamilyGraph, portraitOf } from './graph'
import { type TreeLayout, computeLayout } from './layout'
import { kinshipLabel } from './kinship'
import { initials, lifeYears } from './names'

/** Размеры карточек на схеме. */
export const CHART = { cardW: 176, cardH: 248, gapX: 30, gapY: 96, pad: 120 }

const layoutCache = new WeakMap<FamilyGraph, TreeLayout>()
export function chartLayout(g: FamilyGraph): TreeLayout {
  let l = layoutCache.get(g)
  if (!l) {
    l = computeLayout(g, CHART)
    layoutCache.set(g, l)
  }
  return l
}

/** Первое предложение биографии — для краткой истории на карточке. */
export function shortStory(bio: string): string {
  const text = bio.trim().replace(/\s+/g, ' ')
  if (!text) return ''
  const first = text.split(/(?<=[.!?…])\s/)[0]
  return first.length > 110 ? first.slice(0, 107).trimEnd() + '…' : first
}

export function cardPropsFor(p: Person, g: FamilyGraph, meId: string | null, dict: Dict): PersonCardProps {
  const layout = chartLayout(g)
  const row = layout.row.get(p.id)
  const kin = meId ? kinshipLabel(g, meId, p.id, dict) : null
  const photo = portraitOf(g, p.id)
  return {
    first: p.first_name,
    last: p.last_name,
    years: lifeYears(p, dict),
    place: p.birth_place,
    kin: kin ?? (row != null ? fmt(dict.person.generationOf, { n: roman(row + 1) }) : undefined),
    story: shortStory(p.bio),
    portrait: photo ? fileUrl(photo) : undefined,
    initials: initials(p),
    dataId: p.id,
  }
}
