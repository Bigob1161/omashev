import { Story } from './home/Story'
import { ArchiveSection, Finale, Footer, Generations, Heritage, Names } from './home/Sections'

export function HomePage() {
  return (
    <main id="main" className="home">
      <Story />
      <Heritage />
      <Generations />
      <Names />
      <ArchiveSection />
      <Finale />
      <Footer />
    </main>
  )
}
