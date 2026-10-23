import type { Memory, Person, PersonModel, Photo, Relation, TreeData } from '../api/types'

/** Индексы поверх «сырых» данных: кто чей родитель, супруг, какие у кого фото. */
export interface FamilyGraph {
  people: Map<string, Person>
  relations: Relation[]
  parents: Map<string, string[]>
  children: Map<string, string[]>
  spouses: Map<string, string[]>
  photos: Map<string, Photo[]>
  documents: Map<string, Photo[]>
  memories: Map<string, Memory[]>
  allPhotos: Photo[]
  allMemories: Memory[]
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const list = m.get(k)
  if (list) list.push(v)
  else m.set(k, [v])
}

export function buildGraph(data: TreeData): FamilyGraph {
  const g: FamilyGraph = {
    people: new Map(data.people.map((p) => [p.id, p])),
    relations: data.relations,
    parents: new Map(),
    children: new Map(),
    spouses: new Map(),
    photos: new Map(),
    documents: new Map(),
    memories: new Map(),
    allPhotos: data.photos,
    allMemories: data.memories,
  }
  for (const r of data.relations) {
    if (r.type === 'parent') { push(g.parents, r.b, r.a); push(g.children, r.a, r.b) }
    else { push(g.spouses, r.a, r.b); push(g.spouses, r.b, r.a) }
  }
  for (const p of data.photos) push(p.kind === 'document' ? g.documents : g.photos, p.person_id, p)
  for (const m of data.memories) push(g.memories, m.person_id, m)
  return g
}

export const EMPTY_GRAPH = buildGraph({ people: [], relations: [], photos: [], memories: [] })

export const parentsOf = (g: FamilyGraph, id: string) => g.parents.get(id) ?? []
export const childrenOf = (g: FamilyGraph, id: string) => g.children.get(id) ?? []
export const spousesOf = (g: FamilyGraph, id: string) => g.spouses.get(id) ?? []

export function siblingsOf(g: FamilyGraph, id: string): string[] {
  const out = new Set<string>()
  for (const p of parentsOf(g, id)) for (const c of childrenOf(g, p)) if (c !== id) out.add(c)
  return [...out]
}

export function findRelation(g: FamilyGraph, a: string, b: string, type: Relation['type']) {
  return g.relations.find((r) => r.type === type && ((r.a === a && r.b === b) || (type === 'spouse' && r.a === b && r.b === a)))
}

function reach(start: string, next: (id: string) => string[]): Set<string> {
  const seen = new Set<string>()
  const stack = [start]
  while (stack.length) for (const n of next(stack.pop()!)) if (!seen.has(n)) { seen.add(n); stack.push(n) }
  return seen
}
export const ancestorsOf = (g: FamilyGraph, id: string) => reach(id, (x) => parentsOf(g, x))
export const descendantsOf = (g: FamilyGraph, id: string) => reach(id, (x) => childrenOf(g, x))

/** Ближайшая семья человека — для подсветки на схеме. */
export function immediateFamily(g: FamilyGraph, id: string): Set<string> {
  return new Set([id, ...parentsOf(g, id), ...childrenOf(g, id), ...spousesOf(g, id), ...siblingsOf(g, id)])
}

export function portraitOf(g: FamilyGraph, id: string): Photo | undefined {
  return g.photos.get(id)?.[0]
}

/** Человек в виде модели из брифа (firstName, parentIds…): неизвестные даты — null, а не пустые строки. */
export function toPersonModel(g: FamilyGraph, id: string): PersonModel | null {
  const p = g.people.get(id)
  if (!p) return null
  const photo = portraitOf(g, id)
  return {
    id,
    firstName: p.first_name,
    lastName: p.last_name,
    birthSurname: p.maiden_name,
    birthDate: p.birth_date || null,
    deathDate: p.death_date || null,
    birthPlace: p.birth_place || null,
    biography: p.bio,
    photo: photo ? `/photos/${photo.file}` : null,
    notes: p.notes,
    parentIds: parentsOf(g, id),
    spouseIds: spousesOf(g, id),
    childIds: childrenOf(g, id),
  }
}
