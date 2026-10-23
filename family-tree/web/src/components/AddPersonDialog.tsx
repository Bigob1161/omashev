import { type FormEvent, useMemo, useState } from 'react'
import { Modal } from './Modal'
import { api } from '../api/client'
import type { Gender, Person, PersonFields } from '../api/types'
import { fmt, useT } from '../i18n'
import { ancestorsOf, childrenOf, descendantsOf, parentsOf, siblingsOf, spousesOf } from '../lib/graph'
import { fullName, lifeYears, matches, yearOf } from '../lib/names'
import { reload, useFamily } from '../store/family'
import { prepareUpload } from '../lib/image'
import { ask, attempt, toast } from '../store/ui'

export type AddMode = 'new' | 'parent' | 'spouse' | 'child' | 'sibling'

interface Props {
  mode: AddMode
  /** Для кого добавляем родственника. */
  person?: Person
  onClose: () => void
  onCreated?: (id: string) => void
}

type Draft = Pick<PersonFields, 'last_name' | 'first_name' | 'middle_name' | 'maiden_name' | 'gender' | 'birth_date' | 'birth_place' | 'death_date' | 'bio' | 'notes'>

export function AddPersonDialog({ mode, person, onClose, onCreated }: Props) {
  const t = useT()
  const graph = useFamily((s) => s.graph)
  const [tab, setTab] = useState<'new' | 'existing'>('new')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<Draft>(() => ({
    last_name: mode === 'child' || mode === 'sibling' ? (person?.gender === 'f' ? '' : person?.last_name ?? '') : '',
    first_name: '',
    middle_name: '',
    gender: (mode === 'spouse' && person?.gender ? (person.gender === 'm' ? 'f' : 'm') : '') as Gender,
    birth_date: '',
    birth_place: '',
    maiden_name: '',
    death_date: '',
    bio: '',
    notes: '',
  }))
  const [photo, setPhoto] = useState<File | null>(null)
  const [parentId, setParentId] = useState('')
  const [spouseId, setSpouseId] = useState('')
  const everyone = useMemo(() => [...graph.people.values()].sort((a, b) => fullName(a, t).localeCompare(fullName(b, t))), [graph, t])
  const name = person ? fullName(person, t) : ''
  const title = {
    new: t.add.titleNew,
    parent: fmt(t.add.titleParent, { name }),
    spouse: fmt(t.add.titleSpouse, { name }),
    child: fmt(t.add.titleChild, { name }),
    sibling: fmt(t.add.titleSibling, { name }),
  }[mode]

  const excluded = useMemo(() => {
    if (!person) return new Set<string>()
    const id = person.id
    const related = mode === 'parent' ? parentsOf(graph, id) : mode === 'child' ? childrenOf(graph, id) : mode === 'spouse' ? spousesOf(graph, id) : siblingsOf(graph, id)
    // Не предлагаем невозможное: потомка в родители, предка в дети, кровную родню в супруги.
    const impossible = mode === 'parent' ? descendantsOf(graph, id)
      : mode === 'child' || mode === 'sibling' ? ancestorsOf(graph, id)
      : mode === 'spouse' ? new Set([...ancestorsOf(graph, id), ...descendantsOf(graph, id), ...siblingsOf(graph, id)])
      : new Set<string>()
    return new Set([id, ...related, ...impossible])
  }, [graph, person, mode])
  const candidates = useMemo(
    () => [...graph.people.values()].filter((p) => !excluded.has(p.id) && matches(p, query)).slice(0, 40),
    [graph, excluded, query],
  )

  /** Ищет человека с тем же именем и годом рождения. */
  const findDuplicate = (d: Draft) => {
    const key = (p: Pick<Person, 'first_name' | 'last_name'>) => `${p.first_name} ${p.last_name}`.trim().toLowerCase()
    const k = key(d)
    const year = yearOf(d.birth_date)
    return [...graph.people.values()].find((p) => key(p) === k && (!year || !yearOf(p.birth_date) || yearOf(p.birth_date) === year))
  }

  const linkFor = (newId: string) => {
    if (!person) return []
    const id = person.id
    if (mode === 'parent') return [() => api.addRelation(newId, id, 'parent')]
    if (mode === 'child') return [() => api.addRelation(id, newId, 'parent')]
    if (mode === 'spouse') return [() => api.addRelation(id, newId, 'spouse')]
    // брат или сестра: общие родители
    return parentsOf(graph, id).map((pid) => () => api.addRelation(pid, newId, 'parent'))
  }

  const submitNew = async (e: FormEvent) => {
    e.preventDefault()
    if (!draft.first_name.trim() && !draft.last_name.trim()) { toast(t.add.needName, 'error'); return }
    const dup = findDuplicate(draft)
    if (dup) {
      const ok = await ask({ title: t.add.duplicateTitle, text: fmt(t.add.duplicateText, { name: `${fullName(dup, t)}${lifeYears(dup, t) ? ` (${lifeYears(dup, t)})` : ''}` }), ok: t.add.duplicateConfirm })
      if (!ok) return
    }
    setBusy(true)
    const created = await attempt(async () => {
      const directLink = person && mode !== 'sibling' ? { to: person.id, as: mode === 'parent' ? 'parent' as const : mode === 'child' ? 'child' as const : 'spouse' as const } : undefined
      const p = await api.createPerson(draft, directLink)
      if (mode === 'sibling') for (const link of linkFor(p.id)) await link()
      // Для нового человека без готовой связи — родитель и супруг из списка уже существующих.
      if (mode === 'new' && parentId) await api.addRelation(parentId, p.id, 'parent')
      if (mode === 'new' && spouseId) await api.addRelation(p.id, spouseId, 'spouse')
      if (photo) await api.uploadFile(p.id, await prepareUpload(photo), 'photo')
      return p
    })
    setBusy(false)
    if (!created) { await reload().catch(() => {}); return }
    await reload()
    toast(t.toast.added)
    onCreated?.(created.id)
    onClose()
    await offerChildren(created.id, fullName(created, t))
  }

  /** После добавления супруга: предложить сделать его вторым родителем детей с одним родителем. */
  const offerChildren = async (spouseId: string, spouseName: string) => {
    if (!person || mode !== 'spouse') return
    const fresh = useFamily.getState().graph
    const kids = childrenOf(fresh, person.id).filter((c) => parentsOf(fresh, c).length < 2 && !parentsOf(fresh, c).includes(spouseId))
    if (!kids.length) return
    const ok = await ask({
      title: t.add.linkChildrenTitle,
      text: fmt(t.add.linkChildrenText, { person: fullName(person, t), spouse: spouseName, children: kids.map((k) => fullName(fresh.people.get(k)!, t)).join(', ') }),
      ok: t.add.linkChildrenOk,
    })
    if (!ok) return
    for (const k of kids) await attempt(() => api.addRelation(spouseId, k, 'parent'))
    await reload()
  }

  const pickExisting = async (other: Person) => {
    setBusy(true)
    const ok = await attempt(async () => { for (const link of linkFor(other.id)) await link() })
    setBusy(false)
    if (ok === undefined) return
    await reload()
    toast(t.toast.relationAdded)
    onClose()
    await offerChildren(other.id, fullName(other, t))
  }

  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }))

  return (
    <Modal title={title} subtitle={t.add.hint} onClose={onClose}>
      {mode !== 'new' && (
        <div className="segmented segmented--tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'new'} className={tab === 'new' ? 'is-active' : ''} onClick={() => setTab('new')}>{t.add.tabNew}</button>
          <button type="button" role="tab" aria-selected={tab === 'existing'} className={tab === 'existing' ? 'is-active' : ''} onClick={() => setTab('existing')}>{t.add.tabExisting}</button>
        </div>
      )}
      {tab === 'new' ? (
        <form className="form-grid" onSubmit={submitNew} autoComplete="off">
          <div className="field"><label htmlFor="np-last">{t.fields.lastName}</label><input id="np-last" name="last_name" className="input" autoComplete="off" maxLength={100} value={draft.last_name} onChange={set('last_name')} /></div>
          <div className="field"><label htmlFor="np-first">{t.fields.firstName}</label><input id="np-first" name="first_name" className="input" autoComplete="off" maxLength={100} value={draft.first_name} onChange={set('first_name')} /></div>
          <div className="field"><label htmlFor="np-middle">{t.fields.middleName}</label><input id="np-middle" name="middle_name" className="input" autoComplete="off" maxLength={100} value={draft.middle_name} onChange={set('middle_name')} /></div>
          <div className="field">
            <label htmlFor="np-gender">{t.fields.gender}</label>
            <select id="np-gender" name="gender" className="input" value={draft.gender} onChange={set('gender')}>
              <option value="">{t.fields.genderUnknown}</option>
              <option value="f">{t.fields.genderFemale}</option>
              <option value="m">{t.fields.genderMale}</option>
            </select>
          </div>
          <div className="field"><label htmlFor="np-birth">{t.fields.birthDate}</label><input id="np-birth" name="birth_date" className="input" autoComplete="off" maxLength={40} placeholder={t.fields.datePlaceholder} value={draft.birth_date} onChange={set('birth_date')} /></div>
          <div className="field"><label htmlFor="np-place">{t.fields.birthPlace}</label><input id="np-place" name="birth_place" className="input" autoComplete="off" maxLength={200} placeholder={t.fields.placePlaceholder} value={draft.birth_place} onChange={set('birth_place')} /></div>
          <div className="field"><label htmlFor="np-maiden">{t.fields.maidenName}</label><input id="np-maiden" name="maiden_name" className="input" autoComplete="off" maxLength={100} value={draft.maiden_name} onChange={set('maiden_name')} /></div>
          <div className="field"><label htmlFor="np-death">{t.fields.deathDate}</label><input id="np-death" name="death_date" className="input" autoComplete="off" maxLength={40} placeholder={t.fields.datePlaceholder} value={draft.death_date} onChange={set('death_date')} /></div>
          <div className="field full"><label htmlFor="np-bio">{t.fields.bio}</label><textarea id="np-bio" name="bio" className="input" rows={3} maxLength={10000} placeholder={t.fields.bioPlaceholder} value={draft.bio} onChange={set('bio')} /></div>
          <div className="field full"><label htmlFor="np-notes">{t.fields.notes}</label><textarea id="np-notes" name="notes" className="input" rows={2} maxLength={5000} placeholder={t.fields.notesPlaceholder} value={draft.notes} onChange={set('notes')} /></div>
          {mode === 'new' && everyone.length > 0 && (
            <>
              <div className="field">
                <label htmlFor="np-parent">{t.fields.parent}</label>
                <select id="np-parent" className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                  <option value="">{t.fields.noneSelected}</option>
                  {everyone.map((p) => <option key={p.id} value={p.id}>{fullName(p, t)}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="np-spouse">{t.fields.spouse}</label>
                <select id="np-spouse" className="input" value={spouseId} onChange={(e) => setSpouseId(e.target.value)}>
                  <option value="">{t.fields.noneSelected}</option>
                  {everyone.filter((p) => p.id !== parentId).map((p) => <option key={p.id} value={p.id}>{fullName(p, t)}</option>)}
                </select>
              </div>
            </>
          )}
          <div className="field full">
            <label htmlFor="np-photo">{t.fields.photo}</label>
            <input id="np-photo" className="input input--file" type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            <p className="field-hint">{t.fields.photoHint}</p>
          </div>
          <p className="field-hint full">{t.fields.optional}</p>
          <div className="modal-actions full">
            <button className="btn btn--small" type="button" onClick={onClose}>{t.common.cancel}</button>
            <button className="btn btn--small btn--primary" type="submit" disabled={busy}>{busy ? t.common.saving : t.add.submit}</button>
          </div>
        </form>
      ) : (
        <div className="form-grid">
          <div className="field full">
            <label htmlFor="pick-search">{t.add.pickLabel}</label>
            <input id="pick-search" className="input" type="search" autoComplete="off" placeholder={t.add.pickPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <ul className="pick-list full">
            {candidates.length ? candidates.map((p) => (
              <li key={p.id}>
                <button type="button" className="pick-item" disabled={busy} onClick={() => pickExisting(p)}>
                  <span className="pick-item__name">{fullName(p, t)}</span>
                  <span className="pick-item__years">{lifeYears(p, t)}</span>
                </button>
              </li>
            )) : <li className="muted">{t.tree.nothingFound}</li>}
          </ul>
        </div>
      )}
    </Modal>
  )
}
