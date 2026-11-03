import { type FormEvent, useState } from 'react'
import { READ_ONLY } from '../lib/mode'
import { api, fileUrl } from '../api/client'
import { fmt, useLocale, useT } from '../i18n'
import { reload, useFamily } from '../store/family'
import { ask, attempt, toast } from '../store/ui'
import { IconTrash } from './Icons'

const EMPTY: never[] = []

/** «Голос поколений»: аудиорассказы родных — название, кто добавил, когда; прослушивание прямо в карточке. */
export function AudioMemories({ personId }: { personId: string }) {
  const t = useT()
  const locale = useLocale()
  const records = useFamily((s) => s.graph.audio.get(personId)) ?? EMPTY
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long' })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) return
    setBusy(true)
    toast(t.toast.uploading)
    const ok = await attempt(() => api.uploadFile(personId, file, 'audio', title.trim()))
    setBusy(false)
    if (ok === undefined) return
    setFile(null)
    setTitle('')
    await reload()
    toast(fmt(t.toast.uploaded, { n: 1 }))
  }
  const remove = async (id: string) => {
    const ok = await ask({ title: t.person.deletePhotoTitle, text: t.person.deletePhotoText, ok: t.common.delete, danger: true })
    if (!ok || (await attempt(() => api.deleteFile(id))) === undefined) return
    await reload()
  }

  return (
    <>
      {records.length ? (
        <ul className="audio-list">
          {records.map((a) => (
            <li key={a.id} className="audio-item">
              <div className="audio-item__head">
                <strong>{a.caption || t.person.audioUntitled}</strong>
                {!READ_ONLY && <button type="button" className="icon-btn icon-btn--small" aria-label={t.common.delete} onClick={() => remove(a.id)}><IconTrash /></button>}
              </div>
              <audio controls preload="metadata" src={fileUrl(a)} />
              <p className="muted small">
                {a.author && <span>{fmt(t.person.audioBy, { name: a.author })} · </span>}
                {fmt(t.person.audioAdded, { date: date.format(new Date(a.created_at)) })}
              </p>
            </li>
          ))}
        </ul>
      ) : <p className="muted">{t.person.noAudio}</p>}
      {!READ_ONLY && (
        <form className="audio-form" onSubmit={submit}>
          <label className="btn btn--small upload-btn">
            {t.person.audioPick}
            <input type="file" accept="audio/*,.mp3,.m4a,.ogg,.wav,.webm" className="visually-hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = '' }} />
          </label>
          {file && (
            <>
              <p className="small">{fmt(t.person.audioChosen, { name: file.name })}</p>
              <div className="field">
                <label htmlFor={`audio-title-${personId}`}>{t.person.audioTitle}</label>
                <input id={`audio-title-${personId}`} className="input" autoComplete="off" maxLength={300} placeholder={t.person.audioTitlePlaceholder} value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <button className="btn btn--small btn--primary" type="submit" disabled={busy}>{busy ? t.common.saving : t.person.audioUpload}</button>
            </>
          )}
        </form>
      )}
    </>
  )
}
