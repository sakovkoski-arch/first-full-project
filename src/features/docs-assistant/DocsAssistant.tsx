import { useState, type FormEvent } from 'react'
import { Check, Clipboard, Sparkles } from 'lucide-react'

interface AssistantResponse {
  documentation: string
}

type ApiRequest = <T>(path: string, options?: RequestInit) => Promise<T>

const taskLimit = 4000
const contextLimit = 16000

export default function DocsAssistant({ request }: { request: ApiRequest }) {
  const [task, setTask] = useState('')
  const [context, setContext] = useState('')
  const [documentation, setDocumentation] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!task.trim()) {
      setError('Опишите задачу, чтобы создать документацию.')
      return
    }
    setLoading(true)
    setError('')
    setDocumentation('')
    setCopied(false)
    try {
      const result = await request<AssistantResponse>('/docs-assistant', {
        method: 'POST',
        body: JSON.stringify({ task: task.trim(), ...(context.trim() ? { context: context.trim() } : {}) }),
      })
      setDocumentation(result.documentation)
    } catch (err) {
      const status = err instanceof Error ? (err as Error & { status?: number }).status : undefined
      setError(status === 503
        ? 'Помощник пока не настроен на сервере. Для его работы администратору нужно настроить API-ключ и модель.'
        : err instanceof Error ? err.message : 'Не удалось создать документацию. Попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(documentation)
      setCopied(true)
      setError('')
    } catch {
      setError('Не удалось скопировать текст. Проверьте разрешения браузера.')
    }
  }

  return <section className="page-column docs-assistant-page">
    <span className="page-kicker"><Sparkles size={15} /> ИНСТРУМЕНТ ДЛЯ РАЗРАБОТЧИКОВ</span>
    <h1 className="page-title">Помощник по документации</h1>
    <p className="page-subtitle">Опишите, что нужно задокументировать. Контекст и фрагмент кода можно добавить вручную.</p>

    <form className="docs-form" onSubmit={submit}>
      <label htmlFor="docs-task">Задача <span>{task.length}/{taskLimit}</span></label>
      <textarea id="docs-task" value={task} onChange={event => setTask(event.target.value)} maxLength={taskLimit} rows={4} required placeholder="Например: опиши назначение и параметры этой функции для README..." />
      <label htmlFor="docs-context">Контекст или фрагмент кода <span>необязательно · {context.length}/{contextLimit}</span></label>
      <textarea id="docs-context" value={context} onChange={event => setContext(event.target.value)} maxLength={contextLimit} rows={8} placeholder="Вставьте сюда фрагмент вручную. Файлы проекта автоматически не отправляются." />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="docs-form-footer">
        <p>Отправляются только текст задачи и введённый вами контекст.</p>
        <button className="button button-dark" type="submit" disabled={loading || !task.trim()}>
          <Sparkles size={15} /> {loading ? 'Создаём документацию…' : 'Создать документацию'}
        </button>
      </div>
    </form>

    {loading && <div className="loading-state" role="status"><span className="spinner" /> Подготавливаем результат...</div>}
    {documentation && <section className="docs-result" aria-labelledby="docs-result-title">
      <div className="docs-result-heading"><div><span className="page-kicker">РЕЗУЛЬТАТ</span><h2 id="docs-result-title">Документация</h2></div>
        <button type="button" className="button button-quiet" onClick={copyResult}><Clipboard size={15} /> {copied ? <><Check size={15} /> Скопировано</> : 'Копировать'}</button>
      </div>
      <pre className="docs-result-content">{documentation}</pre>
    </section>}
  </section>
}
