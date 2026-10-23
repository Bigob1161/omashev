export type Gender = '' | 'm' | 'f'

export interface Person {
  id: string
  last_name: string
  first_name: string
  middle_name: string
  maiden_name: string
  gender: Gender
  birth_date: string
  birth_place: string
  death_date: string
  death_place: string
  bio: string
  notes: string
  created_at: string
  updated_at: string
}

export type PersonFields = Omit<Person, 'id' | 'created_at' | 'updated_at'>

/**
 * Удобное представление человека для интерфейса: поля из брифа (firstName, parentIds…)
 * поверх записи сервера. Родственные id вычисляются из таблицы связей, а не хранятся в человеке.
 */
export interface PersonModel {
  id: string
  firstName: string
  lastName: string
  birthSurname: string
  birthDate: string | null
  deathDate: string | null
  birthPlace: string | null
  biography: string
  photo: string | null
  notes: string
  parentIds: string[]
  spouseIds: string[]
  childIds: string[]
}

export interface Relation {
  id: string
  a: string
  b: string
  /** parent: a — родитель b; spouse: a и b — супруги */
  type: 'parent' | 'spouse'
}

export interface Photo {
  id: string
  person_id: string
  file: string
  caption: string
  kind: 'photo' | 'document'
  created_at: string
}

export interface Memory {
  id: string
  person_id: string
  text: string
  author: string
  created_at: string
}

export interface TreeData {
  people: Person[]
  relations: Relation[]
  photos: Photo[]
  memories: Memory[]
}

export interface HistoryEntry {
  id: number
  at: string
  who: string
  action: 'create' | 'update' | 'delete' | 'revert'
  entity: string
  summary: string
  reverted_by: number | null
}

export type LinkAs = 'parent' | 'child' | 'spouse'
