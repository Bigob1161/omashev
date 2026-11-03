import { create } from 'zustand'

export type Route = 'home' | 'history' | 'tree' | 'archive' | 'about'
const ROUTES: Route[] = ['home', 'history', 'tree', 'archive', 'about']

function parse(): Route {
  const name = location.hash.replace(/^#\/?/, '').split('?')[0]
  return (ROUTES as string[]).includes(name) ? (name as Route) : 'home'
}

interface RouterState {
  route: Route
  go: (route: Route) => void
}

export const useRouter = create<RouterState>((set) => ({
  route: parse(),
  go: (route) => {
    const hash = route === 'home' ? '#/' : `#/${route}`
    if (location.hash !== hash) location.hash = hash
    set({ route })
    if (route !== 'history') window.scrollTo({ top: 0 })
  },
}))

window.addEventListener('hashchange', () => {
  const route = parse()
  if (route !== useRouter.getState().route) {
    useRouter.setState({ route })
    if (route !== 'history') window.scrollTo({ top: 0 })
  }
})

export const hrefFor = (route: Route) => (route === 'home' ? '#/' : `#/${route}`)
