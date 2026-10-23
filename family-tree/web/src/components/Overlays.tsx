import { type FormEvent, useState } from 'react'
import { READ_ONLY } from '../lib/mode'
import { Modal } from './Modal'
import { useUi } from '../store/ui'
import { useFamily } from '../store/family'
import { LANGS, type Lang, useLang, useT } from '../i18n'
import { fullName } from '../lib/names'

/** Подтверждение опасных действий (удаление, отвязка). */
export function ConfirmDialog() {
  const t = useT()
  const req = useUi((s) => s.confirm)
  const answer = useUi((s) => s.answer)
  if (!req) return null
  return (
    <Modal title={req.title} onClose={() => answer(false)}>
      <p className="modal-text">{req.text}</p>
      <div className="modal-actions">
        <button className="btn btn--small" type="button" onClick={() => answer(false)}>{t.common.cancel}</button>
        <button className={`btn btn--small ${req.danger ? 'btn--danger-solid' : 'btn--primary'}`} type="button" onClick={() => answer(true)} autoFocus>
          {req.ok}
        </button>
      </div>
    </Modal>
  )
}

export function Toasts() {
  const toasts = useUi((s) => s.toasts)
  const dismiss = useUi((s) => s.dismissToast)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((x) => (
        <button key={x.id} type="button" className={`toast toast--${x.tone}`} onClick={() => dismiss(x.id)}>{x.text}</button>
      ))}
    </div>
  )
}

export function LoginDialog() {
  const t = useT()
  const open = useFamily((s) => s.loginOpen)
  const close = useFamily((s) => s.closeLogin)
  const login = useFamily((s) => s.login)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (!open) return null
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(code)
      setCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title={t.login.title} subtitle={t.login.text} onClose={close}>
      <form className="form-grid" onSubmit={submit}>
        <div className="field full">
          <label htmlFor="login-code">{t.login.code}</label>
          <input id="login-code" className="input" type="password" autoComplete="current-password" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} required />
        </div>
        {error && <p className="form-error full" role="alert">{error}</p>}
        <div className="modal-actions full">
          <button className="btn btn--primary" type="submit" disabled={busy}>{busy ? t.common.loading : t.login.submit}</button>
        </div>
      </form>
    </Modal>
  )
}

export function ProfileDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const { who, setWho, meId, setMe, graph, auth, logout } = useFamily()
  const lang = useLang((s) => s.lang)
  const setLang = useLang((s) => s.setLang)
  const [name, setName] = useState(who)
  const [me, setMeLocal] = useState(meId ?? '')
  const people = [...graph.people.values()].sort((a, b) => fullName(a, t).localeCompare(fullName(b, t)))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setWho(name.trim())
    setMe(me || null)
    useUi.getState().toast(t.profile.saved)
    onClose()
  }
  return (
    <Modal title={t.profile.title} onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        {!READ_ONLY && <div className="field full">
          <label htmlFor="profile-name">{t.profile.name}</label>
          <input id="profile-name" className="input" autoComplete="nickname" maxLength={60} placeholder={t.profile.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
          <p className="field-hint">{t.profile.nameHint}</p>
        </div>}
        {auth === 'open' && (
          <div className="field full">
            <label htmlFor="profile-me">{t.profile.me}</label>
            <select id="profile-me" className="input" value={me} onChange={(e) => setMeLocal(e.target.value)}>
              <option value="">{t.profile.meNone}</option>
              {people.map((p) => <option key={p.id} value={p.id}>{fullName(p, t)}</option>)}
            </select>
            <p className="field-hint">{t.profile.meHint}</p>
          </div>
        )}
        <fieldset className="field full lang-field">
          <legend className="field-label">{t.profile.language}</legend>
          <div className="segmented">
            {(Object.keys(LANGS) as Lang[]).map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} className={lang === l ? 'is-active' : ''} onClick={() => setLang(l)}>
                {l === 'ru' ? 'Русский' : 'O‘zbekcha'}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="modal-actions full">
          {auth === 'open' && !READ_ONLY && (
            <button className="btn btn--small btn--danger" type="button" onClick={() => { logout(); onClose() }}>{t.profile.logout}</button>
          )}
          <button className="btn btn--small btn--primary" type="submit">{t.common.save}</button>
        </div>
      </form>
    </Modal>
  )
}
