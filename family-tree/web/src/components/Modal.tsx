import { type ReactNode, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { IconClose } from './Icons'
import { useT } from '../i18n'

interface ModalProps {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}

// Открытые диалоги лежат стопкой: клавиши обрабатывает только верхний.
const stack: string[] = []

/** Диалог с ловушкой фокуса: Esc закрывает, фокус возвращается туда, откуда открыли. */
export function Modal({ title, subtitle, onClose, children, wide }: ModalProps) {
  const t = useT()
  const id = useId()
  const card = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const first = card.current?.querySelector<HTMLElement>('input, select, textarea, button.btn--primary') ?? card.current
    first?.focus()
    stack.push(id)
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current() }
      if (e.key === 'Tab' && card.current) {
        const items = card.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        if (!items.length) return
        const firstEl = items[0], lastEl = items[items.length - 1]
        if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus() }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus() }
      }
    }
    document.addEventListener('keydown', onKey, true)
    document.body.classList.add('modal-open')
    return () => {
      document.removeEventListener('keydown', onKey, true)
      stack.splice(stack.indexOf(id), 1)
      if (!stack.length) document.body.classList.remove('modal-open')
      previous?.focus?.()
    }
  }, [id])

  return createPortal(
    <div className="modal theme-app" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={card} className={`modal-card${wide ? ' modal-card--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
        <header className="modal-head">
          <div>
            <h2 id={id}>{title}</h2>
            {subtitle && <p className="modal-sub">{subtitle}</p>}
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={t.common.close}><IconClose /></button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  )
}
