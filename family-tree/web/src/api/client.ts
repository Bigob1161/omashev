import type { HistoryEntry, LinkAs, Memory, Person, PersonFields, Photo, Relation, TreeData } from './types'
import { currentDict, fmt } from '../i18n'
import { storage } from '../lib/storage'
import { READ_ONLY } from '../lib/mode'

/** Ошибка API с переводом сообщения на текущий язык по коду сервера. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(fn: () => void) { onUnauthorized = fn }

export function whoAmI(): string { return storage.get('who') || '' }

async function request<T>(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const init: RequestInit = { method, headers: { ...headers } }
  const who = whoAmI()
  if (who) (init.headers as Record<string, string>)['X-Who'] = encodeURIComponent(who)
  if (body instanceof Blob) init.body = body
  else if (body !== undefined) {
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const dict = currentDict()
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new ApiError(0, 'network', dict.errors.network)
  }
  let data: any = null
  try { data = await res.json() } catch { /* пустой ответ */ }
  if (!res.ok) {
    const code: string = data?.code || 'generic'
    if (res.status === 401 && url !== '/api/login') onUnauthorized()
    const template = (dict.errors as Record<string, string>)[code]
    throw new ApiError(res.status, code, template ? fmt(template, data?.params || {}) : data?.error || dict.errors.generic)
  }
  return data as T
}

/** Публичная версия: всё, что меняет данные, недоступно. */
function readOnly(): never {
  throw new ApiError(403, 'read_only', currentDict().errors.read_only)
}

const liveApi = {
  session: () => request<{ authed: boolean; codeRequired: boolean }>('GET', '/api/session'),
  login: (code: string) => request<{ ok: true }>('POST', '/api/login', { code }),
  logout: () => request<{ ok: true }>('POST', '/api/logout'),
  tree: () => request<TreeData>('GET', '/api/tree'),
  createPerson: (person: Partial<PersonFields>, link?: { to: string; as: LinkAs }) =>
    request<Person>('POST', '/api/people', { person, link }),
  updatePerson: (id: string, fields: Partial<PersonFields>) => request<Person>('PATCH', `/api/people/${id}`, fields),
  deletePerson: (id: string) => request('DELETE', `/api/people/${id}`),
  addRelation: (a: string, b: string, type: Relation['type']) => request<Relation>('POST', '/api/relations', { a, b, type }),
  deleteRelation: (id: string) => request('DELETE', `/api/relations/${id}`),
  uploadFile: (personId: string, blob: Blob, kind: Photo['kind'], caption = '') =>
    request<Photo>('POST', `/api/people/${personId}/photos`, blob, {
      'Content-Type': blob.type || 'application/octet-stream',
      'X-Kind': kind,
      'X-Caption': encodeURIComponent(caption),
    }),
  updateCaption: (id: string, caption: string) => request<Photo>('PATCH', `/api/photos/${id}`, { caption }),
  deleteFile: (id: string) => request('DELETE', `/api/photos/${id}`),
  addMemory: (personId: string, text: string) => request<Memory>('POST', `/api/people/${personId}/memories`, { text }),
  deleteMemory: (id: string) => request('DELETE', `/api/memories/${id}`),
  history: () => request<HistoryEntry[]>('GET', '/api/history'),
  revert: (id: number) => request('POST', `/api/history/${id}/revert`),
}

const staticApi: typeof liveApi = {
  ...(Object.fromEntries(Object.keys(liveApi).map((k) => [k, readOnly])) as unknown as typeof liveApi),
  session: async () => ({ authed: true, codeRequired: false }),
  logout: async () => ({ ok: true as const }),
  tree: async () => {
    const res = await fetch('./family.json', { cache: 'no-cache' })
    if (!res.ok) throw new ApiError(res.status, 'network', currentDict().errors.network)
    return (await res.json()) as TreeData
  },
  history: async () => [] as HistoryEntry[],
}

export const api = READ_ONLY ? staticApi : liveApi

export const fileUrl = (p: Photo) => (READ_ONLY ? `photos/${p.file}` : `/photos/${p.file}`)
