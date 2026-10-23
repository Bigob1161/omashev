import { create } from 'zustand'
import { api, setUnauthorizedHandler } from '../api/client'
import { EMPTY_GRAPH, type FamilyGraph, buildGraph } from '../lib/graph'
import { storage } from '../lib/storage'

type Auth = 'checking' | 'locked' | 'open'

interface FamilyState {
  auth: Auth
  graph: FamilyGraph
  loaded: boolean
  /** Открытая карточка человека. */
  selectedId: string | null
  /** Кто вы в древе — от него считается родство. */
  meId: string | null
  who: string
  loginOpen: boolean
  afterLogin: (() => void) | null

  init: () => Promise<void>
  load: () => Promise<void>
  login: (code: string) => Promise<void>
  logout: () => Promise<void>
  /** Выполнить действие, требующее входа: сразу или после ввода кода. */
  requireAuth: (then: () => void) => void
  closeLogin: () => void
  select: (id: string | null) => void
  setMe: (id: string | null) => void
  setWho: (name: string) => void
}

export const useFamily = create<FamilyState>((set, get) => ({
  auth: 'checking',
  graph: EMPTY_GRAPH,
  loaded: false,
  selectedId: null,
  meId: storage.get('me'),
  who: storage.get('who') || '',
  loginOpen: false,
  afterLogin: null,

  init: async () => {
    try {
      const s = await api.session()
      set({ auth: s.authed ? 'open' : 'locked' })
      if (s.authed) await get().load()
    } catch {
      set({ auth: 'locked' })
    }
  },
  load: async () => {
    const data = await api.tree()
    const graph = buildGraph(data)
    const { selectedId, meId } = get()
    set({
      graph,
      loaded: true,
      selectedId: selectedId && graph.people.has(selectedId) ? selectedId : null,
      meId: meId && graph.people.has(meId) ? meId : null,
    })
  },
  login: async (code) => {
    await api.login(code)
    set({ auth: 'open', loginOpen: false })
    await get().load()
    const then = get().afterLogin
    set({ afterLogin: null })
    then?.()
  },
  logout: async () => {
    await api.logout().catch(() => {})
    set({ auth: 'locked', graph: EMPTY_GRAPH, loaded: false, selectedId: null })
  },
  requireAuth: (then) => {
    if (get().auth === 'open') then()
    else set({ loginOpen: true, afterLogin: then })
  },
  closeLogin: () => set({ loginOpen: false, afterLogin: null }),
  select: (id) => set({ selectedId: id }),
  setMe: (id) => {
    if (id) storage.set('me', id)
    else storage.remove('me')
    set({ meId: id })
  },
  setWho: (name) => {
    storage.set('who', name)
    set({ who: name })
  },
}))

setUnauthorizedHandler(() => {
  useFamily.setState({ auth: 'locked', loginOpen: true })
})

/** Перечитать данные после изменения. */
export const reload = () => useFamily.getState().load()
