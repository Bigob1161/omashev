import type { Dict } from '../i18n/ru'
import { fmt } from '../i18n'
import { type FamilyGraph, childrenOf, parentsOf, siblingsOf, spousesOf } from './graph'
import { yearOf } from './names'

type KinKey = keyof Dict['kin']

/** Предки (или потомки) с расстоянием в поколениях. */
function walk(start: string, next: (id: string) => string[]): Map<string, number> {
  const depth = new Map<string, number>()
  let frontier = [start]
  for (let d = 1; frontier.length && d < 30; d++) {
    const nextFrontier: string[] = []
    for (const id of frontier) for (const n of next(id)) {
      if (!depth.has(n) && n !== start) { depth.set(n, d); nextFrontier.push(n) }
    }
    frontier = nextFrontier
  }
  return depth
}

const byGender = (gender: string, m: KinKey, f: KinKey, u: KinKey): KinKey => (gender === 'm' ? m : gender === 'f' ? f : u)

/**
 * Кем человек `target` приходится человеку `me`. Возвращает подпись на текущем языке
 * или null, если родство не удаётся определить по связям в древе.
 */
export function kinshipLabel(g: FamilyGraph, me: string, target: string, dict: Dict): string | null {
  const key = kinshipKey(g, me, target)
  if (!key) return null
  return fmt(dict.kin[key.key], { n: key.n ?? '' })
}

function kinshipKey(g: FamilyGraph, me: string, target: string): { key: KinKey; n?: number } | null {
  const t = g.people.get(target)
  if (!t || !g.people.has(me)) return null
  if (me === target) return { key: 'me' }
  const gender = t.gender

  const up = walk(me, (id) => parentsOf(g, id))
  const d = up.get(target)
  if (d === 1) return { key: byGender(gender, 'father', 'mother', 'parent') }
  if (d === 2) return { key: byGender(gender, 'grandfather', 'grandmother', 'grandparent') }
  if (d === 3) return { key: byGender(gender, 'greatGrandfather', 'greatGrandmother', 'greatGrandparent') }
  if (d) return { key: 'ancestor', n: d }

  const down = walk(me, (id) => childrenOf(g, id)).get(target)
  if (down === 1) return { key: byGender(gender, 'son', 'daughter', 'child') }
  if (down === 2) return { key: byGender(gender, 'grandson', 'granddaughter', 'grandchild') }
  if (down === 3) return { key: byGender(gender, 'greatGrandson', 'greatGranddaughter', 'greatGrandchild') }
  if (down) return { key: 'descendant', n: down }

  if (spousesOf(g, me).includes(target)) return { key: byGender(gender, 'husband', 'wife', 'spouse') }

  if (siblingsOf(g, me).includes(target)) {
    const mine = Number(yearOf(g.people.get(me)!.birth_date)), theirs = Number(yearOf(t.birth_date))
    const older = mine && theirs ? theirs < mine : null
    if (gender === 'm') return { key: older == null ? 'brother' : older ? 'brotherOlder' : 'brotherYounger' }
    if (gender === 'f') return { key: older == null ? 'sister' : older ? 'sisterOlder' : 'sisterYounger' }
    return { key: 'sibling' }
  }

  // Дядя/тётя: брат или сестра одного из родителей. Сторона важна для узбекских терминов.
  for (const parent of parentsOf(g, me)) {
    if (siblingsOf(g, parent).includes(target)) {
      const fatherSide = g.people.get(parent)?.gender !== 'f'
      if (gender === 'm') return { key: fatherSide ? 'uncleFather' : 'uncleMother' }
      if (gender === 'f') return { key: fatherSide ? 'auntFather' : 'auntMother' }
      return { key: 'uncleAunt' }
    }
  }
  for (const sib of siblingsOf(g, me)) {
    if (childrenOf(g, sib).includes(target)) return { key: byGender(gender, 'nephew', 'niece', 'nephewNiece') }
  }
  for (const parent of parentsOf(g, me)) {
    for (const auntUncle of siblingsOf(g, parent)) {
      if (childrenOf(g, auntUncle).includes(target)) return { key: byGender(gender, 'cousin', 'cousinF', 'cousinU') }
    }
  }
  for (const sp of spousesOf(g, me)) {
    if (parentsOf(g, sp).includes(target)) return { key: byGender(gender, 'fatherInLaw', 'motherInLaw', 'parentInLaw') }
  }
  for (const child of childrenOf(g, me)) {
    if (spousesOf(g, child).includes(target)) return { key: byGender(gender, 'sonInLaw', 'daughterInLaw', 'childInLaw') }
  }

  // Связаны ли вообще (через любые связи)?
  const seen = new Set([me])
  const queue = [me]
  while (queue.length) {
    const id = queue.shift()!
    for (const n of [...parentsOf(g, id), ...childrenOf(g, id), ...spousesOf(g, id)]) {
      if (n === target) return { key: 'relative' }
      if (!seen.has(n)) { seen.add(n); queue.push(n) }
    }
  }
  return null
}
