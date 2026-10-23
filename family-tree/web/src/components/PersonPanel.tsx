import { type FormEvent, useEffect, useRef, useState } from 'react'
import { READ_ONLY } from '../lib/mode'
import { api, fileUrl } from '../api/client'
import type { Person, PersonFields, Photo } from '../api/types'
import { fmt, useLocale, useT } from '../i18n'
import { childrenOf, findRelation, parentsOf, portraitOf, siblingsOf, spousesOf } from '../lib/graph'
import { prepareUpload } from '../lib/image'
import { kinshipLabel } from '../lib/kinship'
import { fullName, initials, lifeYears } from '../lib/names'
import { chartLayout } from '../lib/view'
import { roman } from '../i18n'
import { reload, useFamily } from '../store/family'
import { useRouter } from '../store/router'
import { ask, attempt, toast } from '../store/ui'
import { AddPersonDialog, type AddMode } from './AddPersonDialog'
import { IconCamera, IconClose, IconDocument, IconEdit, IconTrash } from './Icons'
import { Modal } from './Modal'
import { ArchPortrait, OrnamentRule } from './Ornament'

/** Подробная карточка человека — выезжающая справа панель. */
export function PersonPanel() {
  const t = useT()
  const id = useFamily((s) => s.selectedId)
  const graph = useFamily((s) => s.graph)
  const meId = useFamily((s) => s.meId)
  const select = useFamily((s) => s.select)
  const panel = useRef<HTMLElement>(null)
  const [adding, setAdding] = useState<AddMode | null>(null)
  const [editing, setEditing] = useState(false)
  const [lightbox, setLightbox] = useState<Photo | null>(null)
  const person = id ? graph.people.get(id) : undefined

  useEffect(() => {
    if (!person) return
    panel.current?.scrollTo({ top: 0 })
    panel.current?.focus()
  }, [person?.id])

  useEffect(() => {
    if (!person) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.body.classList.contains('modal-open')) select(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [person, select])

  if (!person) return null
  const portrait = portraitOf(graph, person.id)
  const kin = meId ? kinshipLabel(graph, meId, person.id, t) : null
  const row = chartLayout(graph).row.get(person.id)
  const generation = row != null ? fmt(t.person.generationOf, { n: roman(row + 1) }) : ''
  const photos = graph.photos.get(person.id) ?? []
  const documents = graph.documents.get(person.id) ?? []
  const spouseTitle = person.gender === 'm' ? t.person.wife : person.gender === 'f' ? t.person.husband : t.person.spouse
  const name = fullName(person, t)

  const removeRelation = async (otherId: string, type: 'parent' | 'spouse', parentFirst: boolean) => {
    const other = graph.people.get(otherId)!
    const rel = type === 'spouse' ? findRelation(graph, person.id, otherId, 'spouse') : parentFirst ? findRelation(graph, otherId, person.id, 'parent') : findRelation(graph, person.id, otherId, 'parent')
    if (!rel) return
    const ok = await ask({ title: t.person.removeRelationTitle, text: fmt(t.person.removeRelationText, { a: name, b: fullName(other, t) }), ok: t.person.removeRelation, danger: true })
    if (!ok) return
    if (await attempt(() => api.deleteRelation(rel.id)) === undefined) return
    await reload()
    toast(t.toast.relationRemoved)
  }

  const deletePerson = async () => {
    const ok = await ask({ title: fmt(t.person.deleteTitle, { name }), text: t.person.deleteText, ok: t.common.delete, danger: true })
    if (!ok) return
    if (await attempt(() => api.deletePerson(person.id)) === undefined) return
    select(null)
    await reload()
    toast(t.toast.deleted)
  }

  const upload = async (files: FileList | null, kind: Photo['kind']) => {
    if (!files?.length) return
    toast(t.toast.uploading)
    let done = 0
    for (const file of Array.from(files)) {
      const blob = await prepareUpload(file)
      if (await attempt(() => api.uploadFile(person.id, blob, kind)) !== undefined) done++
    }
    if (done) {
      await reload()
      toast(fmt(t.toast.uploaded, { n: done }))
    }
  }

  const group = (title: string, ids: string[], removable?: { type: 'parent' | 'spouse'; parentFirst: boolean }) => (
    <div className="rel-group">
      <h4>{title}</h4>
      {ids.length ? (
        <ul>
          {ids.map((oid) => {
            const o = graph.people.get(oid)!
            const ph = portraitOf(graph, oid)
            return (
              <li key={oid} className="rel-row">
                <button type="button" className="rel-row__person" onClick={() => select(oid)}>
                  <ArchPortrait className="rel-row__portrait" src={ph ? fileUrl(ph) : undefined} alt="" initials={initials(o)} />
                  <span>
                    <span className="rel-row__name">{fullName(o, t)}</span>
                    <span className="rel-row__years">{lifeYears(o, t) || t.common.yearsUnknown}</span>
                  </span>
                </button>
                {removable && !READ_ONLY && (
                  <button type="button" className="icon-btn icon-btn--small" aria-label={`${t.person.removeRelation}: ${fullName(o, t)}`} title={t.person.removeRelation} onClick={() => removeRelation(oid, removable.type, removable.parentFirst)}>
                    <IconClose />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      ) : <p className="muted small">{t.person.nobody}</p>}
    </div>
  )

  return (
    <>
      <div className="panel-scrim" onClick={() => select(null)} aria-hidden="true" />
      <aside ref={panel} className="person-panel theme-app" aria-label={name} tabIndex={-1}>
        <div className="person-panel__bar">
          {(kin || generation) && <span className="person-panel__kin">{kin ?? generation}</span>}
          <button className="icon-btn" type="button" onClick={() => select(null)} aria-label={t.common.close}><IconClose /></button>
        </div>

        <header className="person-hero">
          <button type="button" className="person-hero__portrait" onClick={() => portrait && setLightbox(portrait)} disabled={!portrait} aria-label={portrait ? t.person.openPhoto : undefined}>
            <ArchPortrait src={portrait ? fileUrl(portrait) : undefined} alt={fmt(t.person.portraitOf, { name })} initials={initials(person)} />
          </button>
          <h2 className="person-hero__name">
            <span>{person.first_name || t.common.noName}{person.middle_name ? ` ${person.middle_name}` : ''}</span>
            {person.last_name && <span className="person-hero__last">{person.last_name}</span>}
          </h2>
          {person.maiden_name && <p className="person-hero__maiden">{fmt(t.person.maidenName, { name: person.maiden_name })}</p>}
          <p className="person-hero__years">{lifeYears(person, t) || t.common.yearsUnknown}</p>
        </header>

        <dl className="facts">
          <div><dt>{t.person.birth}</dt><dd>{person.birth_date || <span className="muted">{t.common.dateUnknown}</span>}</dd></div>
          <div><dt>{t.person.birthPlace}</dt><dd>{person.birth_place || <span className="muted">{t.common.placeUnknown}</span>}</dd></div>
          {(person.death_date || person.death_place) && (
            <>
              <div><dt>{t.person.death}</dt><dd>{person.death_date || <span className="muted">{t.common.dateUnknown}</span>}</dd></div>
              <div><dt>{t.person.deathPlace}</dt><dd>{person.death_place || <span className="muted">{t.common.placeUnknown}</span>}</dd></div>
            </>
          )}
        </dl>

        <div className="panel-actions">
          {!READ_ONLY && <button className="btn btn--small" type="button" onClick={() => setEditing(true)}><IconEdit />{t.person.editTitle}</button>}
          {useRouter.getState().route !== 'tree' && (
            <button className="btn btn--small" type="button" onClick={() => { useRouter.getState().go('tree'); select(person.id) }}>{t.person.showOnTree}</button>
          )}
        </div>

        <section className="panel-section">
          <h3>{t.person.about}</h3>
          {person.bio ? <p className="bio">{person.bio}</p> : <p className="muted">{t.person.noBio}</p>}
          {person.notes && (
            <div className="notes">
              <h4 className="field-label">{t.person.notes}</h4>
              <p>{person.notes}</p>
            </div>
          )}
        </section>

        <OrnamentRule />

        <section className="panel-section">
          <h3>{t.person.relatives}</h3>
          {group(t.person.parents, parentsOf(graph, person.id), { type: 'parent', parentFirst: true })}
          {group(spouseTitle, spousesOf(graph, person.id), { type: 'spouse', parentFirst: false })}
          {group(t.person.children, childrenOf(graph, person.id), { type: 'parent', parentFirst: false })}
          {group(t.person.siblings, siblingsOf(graph, person.id))}
          {!READ_ONLY && <div className="add-relative">
            <span className="field-label">{t.person.addRelative}</span>
            <div className="add-relative__buttons">
              <button className="btn btn--small" type="button" disabled={parentsOf(graph, person.id).length >= 2} onClick={() => setAdding('parent')}>{t.person.addParent}</button>
              <button className="btn btn--small" type="button" onClick={() => setAdding('spouse')}>{t.person.addSpouse}</button>
              <button className="btn btn--small" type="button" onClick={() => setAdding('child')}>{t.person.addChild}</button>
              <button className="btn btn--small" type="button" onClick={() => parentsOf(graph, person.id).length ? setAdding('sibling') : toast(t.person.siblingNeedsParent)}>{t.person.addSibling}</button>
            </div>
          </div>}
        </section>

        <OrnamentRule />

        <section className="panel-section">
          <div className="panel-section__head">
            <h3>{t.person.photos}</h3>
            {!READ_ONLY && <label className="btn btn--small upload-btn">
              <IconCamera />{t.person.addPhoto}
              <input type="file" accept="image/*" multiple className="visually-hidden" onChange={(e) => { upload(e.target.files, 'photo'); e.target.value = '' }} />
            </label>}
          </div>
          {photos.length ? (
            <div className="gallery">
              {photos.map((ph) => (
                <button key={ph.id} type="button" className="gallery__item" onClick={() => setLightbox(ph)} aria-label={ph.caption || t.person.openPhoto}>
                  <img src={fileUrl(ph)} alt="" loading="lazy" width="160" height="160" />
                </button>
              ))}
            </div>
          ) : <p className="muted">{t.person.noPhotos}</p>}
        </section>

        <section className="panel-section">
          <div className="panel-section__head">
            <h3>{t.person.documents}</h3>
            {!READ_ONLY && <label className="btn btn--small upload-btn">
              <IconDocument />{t.person.addDocument}
              <input type="file" accept="image/*,application/pdf" multiple className="visually-hidden" onChange={(e) => { upload(e.target.files, 'document'); e.target.value = '' }} />
            </label>}
          </div>
          {documents.length ? (
            <ul className="doc-list">
              {documents.map((d) => <DocumentRow key={d.id} doc={d} onOpen={() => (d.file.endsWith('.pdf') ? window.open(fileUrl(d), '_blank', 'noopener') : setLightbox(d))} />)}
            </ul>
          ) : <p className="muted">{t.person.noDocuments}</p>}
        </section>

        <section className="panel-section">
          <h3>{t.person.memories}</h3>
          <Memories personId={person.id} />
        </section>

        {!READ_ONLY && <div className="panel-danger">
          <button className="btn btn--small btn--danger" type="button" onClick={deletePerson}><IconTrash />{t.person.deletePerson}</button>
        </div>}
      </aside>

      {adding && <AddPersonDialog mode={adding} person={person} onClose={() => setAdding(null)} />}
      {editing && <EditPersonDialog person={person} onClose={() => setEditing(false)} />}
      {lightbox && <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />}
    </>
  )
}

function DocumentRow({ doc, onOpen }: { doc: Photo; onOpen: () => void }) {
  const t = useT()
  const locale = useLocale()
  const remove = async () => {
    const ok = await ask({ title: t.person.deletePhotoTitle, text: t.person.deletePhotoText, ok: t.common.delete, danger: true })
    if (!ok || (await attempt(() => api.deleteFile(doc.id))) === undefined) return
    await reload()
  }
  return (
    <li className="doc-row">
      <button type="button" className="doc-row__open" onClick={onOpen}>
        <IconDocument />
        <span>{doc.caption || (doc.file.endsWith('.pdf') ? 'PDF' : t.person.documents)}</span>
        <span className="muted small">{new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(doc.created_at))}</span>
      </button>
      {!READ_ONLY && <button type="button" className="icon-btn icon-btn--small" aria-label={t.common.delete} onClick={remove}><IconTrash /></button>}
    </li>
  )
}

function Memories({ personId }: { personId: string }) {
  const t = useT()
  const locale = useLocale()
  const memories = useFamily((s) => s.graph.memories.get(personId)) ?? []
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) { toast(t.errors.empty_memory, 'error'); return }
    setBusy(true)
    const ok = await attempt(() => api.addMemory(personId, text))
    setBusy(false)
    if (ok === undefined) return
    setText('')
    await reload()
    toast(t.toast.memoryAdded)
  }
  const remove = async (id: string) => {
    const ok = await ask({ title: t.person.deleteMemoryTitle, text: t.person.deletePhotoText, ok: t.common.delete, danger: true })
    if (!ok || (await attempt(() => api.deleteMemory(id))) === undefined) return
    await reload()
  }
  return (
    <>
      {memories.length ? (
        <ul className="memories">
          {memories.map((m) => (
            <li key={m.id} className="memory">
              <blockquote>{m.text}</blockquote>
              <footer>
                <span>{m.author ? fmt(t.person.memoryAuthor, { name: m.author }) : t.person.memoryAnonymous}</span>
                <span className="muted">{new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(m.created_at))}</span>
                {!READ_ONLY && <button type="button" className="link-btn link-btn--danger" onClick={() => remove(m.id)}>{t.common.delete}</button>}
              </footer>
            </li>
          ))}
        </ul>
      ) : <p className="muted">{t.person.noMemories}</p>}
      {!READ_ONLY && <form className="memory-form" onSubmit={submit}>
        <label htmlFor={`memory-${personId}`} className="field-label">{t.person.memoryLabel}</label>
        <textarea id={`memory-${personId}`} className="input" name="memory" autoComplete="off" maxLength={5000} placeholder={t.person.memoryPlaceholder} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn btn--small btn--primary" type="submit" disabled={busy}>{busy ? t.common.saving : t.person.addMemory}</button>
      </form>}
    </>
  )
}

const EDIT_FIELDS: { key: keyof PersonFields; label: keyof ReturnType<typeof useT>['fields']; placeholder?: keyof ReturnType<typeof useT>['fields']; full?: boolean }[] = [
  { key: 'last_name', label: 'lastName' },
  { key: 'first_name', label: 'firstName' },
  { key: 'middle_name', label: 'middleName' },
  { key: 'maiden_name', label: 'maidenName' },
  { key: 'gender', label: 'gender' },
  { key: 'birth_date', label: 'birthDate', placeholder: 'datePlaceholder' },
  { key: 'birth_place', label: 'birthPlace', placeholder: 'placePlaceholder' },
  { key: 'death_date', label: 'deathDate', placeholder: 'datePlaceholder' },
  { key: 'death_place', label: 'deathPlace', placeholder: 'placePlaceholder' },
  { key: 'bio', label: 'bio', placeholder: 'bioPlaceholder', full: true },
  { key: 'notes', label: 'notes', placeholder: 'notesPlaceholder', full: true },
]

function EditPersonDialog({ person, onClose }: { person: Person; onClose: () => void }) {
  const t = useT()
  const [draft, setDraft] = useState<PersonFields>(() => {
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = person
    return rest
  })
  const [busy, setBusy] = useState(false)
  const dirty = useRef(false)

  useEffect(() => {
    // Предупреждаем о несохранённых изменениях при закрытии вкладки.
    const onUnload = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault() }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  const close = async () => {
    if (dirty.current && !(await ask({ title: t.person.unsavedTitle, text: t.person.unsavedText, ok: t.person.unsavedOk, danger: true }))) return
    onClose()
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const ok = await attempt(() => api.updatePerson(person.id, draft))
    setBusy(false)
    if (ok === undefined) return
    dirty.current = false
    await reload()
    toast(t.toast.saved)
    onClose()
  }
  return (
    <Modal title={t.person.editTitle} subtitle={fullName(person, t)} onClose={close} wide>
      <form className="form-grid" onSubmit={submit} autoComplete="off">
        {EDIT_FIELDS.map(({ key, label, placeholder, full }) => {
          const id = `edit-${key}`
          const onChange = (e: { target: { value: string } }) => { dirty.current = true; setDraft((d) => ({ ...d, [key]: e.target.value })) }
          return (
            <div key={key} className={`field${full ? ' full' : ''}`}>
              <label htmlFor={id}>{t.fields[label]}</label>
              {key === 'gender' ? (
                <select id={id} name={key} className="input" value={draft.gender} onChange={onChange}>
                  <option value="">{t.fields.genderUnknown}</option>
                  <option value="f">{t.fields.genderFemale}</option>
                  <option value="m">{t.fields.genderMale}</option>
                </select>
              ) : key === 'bio' || key === 'notes' ? (
                <textarea id={id} name={key} className="input" rows={key === 'bio' ? 6 : 3} maxLength={key === 'bio' ? 10000 : 5000} placeholder={placeholder ? t.fields[placeholder] : undefined} value={draft[key]} onChange={onChange} />
              ) : (
                <input id={id} name={key} className="input" autoComplete="off" maxLength={key.endsWith('_date') ? 40 : key.endsWith('_place') ? 200 : 100} placeholder={placeholder ? t.fields[placeholder] : undefined} value={draft[key]} onChange={onChange} />
              )}
            </div>
          )
        })}
        <div className="modal-actions full">
          <button className="btn btn--small" type="button" onClick={close}>{t.common.cancel}</button>
          <button className="btn btn--small btn--primary" type="submit" disabled={busy}>{busy ? t.common.saving : t.common.save}</button>
        </div>
      </form>
    </Modal>
  )
}

function Lightbox({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  const t = useT()
  const [caption, setCaption] = useState(photo.caption)
  const [busy, setBusy] = useState(false)
  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const ok = await attempt(() => api.updateCaption(photo.id, caption))
    setBusy(false)
    if (ok === undefined) return
    await reload()
    toast(t.toast.saved)
  }
  const remove = async () => {
    const ok = await ask({ title: t.person.deletePhotoTitle, text: t.person.deletePhotoText, ok: t.common.delete, danger: true })
    if (!ok || (await attempt(() => api.deleteFile(photo.id))) === undefined) return
    await reload()
    onClose()
  }
  return (
    <Modal title={photo.caption || t.person.photos} onClose={onClose} wide>
      <div className="lightbox">
        <img src={fileUrl(photo)} alt={photo.caption} />
      </div>
      {READ_ONLY ? (photo.caption && <p className="muted">{photo.caption}</p>) : <form className="lightbox__form" onSubmit={save}>
        <div className="field">
          <label htmlFor="caption-edit">{t.fields.caption}</label>
          <input id="caption-edit" className="input" autoComplete="off" maxLength={300} placeholder={t.fields.captionPlaceholder} value={caption} onChange={(e) => setCaption(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="btn btn--small btn--danger" type="button" onClick={remove}><IconTrash />{t.common.delete}</button>
          <button className="btn btn--small btn--primary" type="submit" disabled={busy}>{busy ? t.common.saving : t.common.save}</button>
        </div>
      </form>}
    </Modal>
  )
}
