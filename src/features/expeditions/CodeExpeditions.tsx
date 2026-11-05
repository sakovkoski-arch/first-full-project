import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, Check, Code2, Compass, Flame, Pencil, Send, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { PaginatedResponse, User } from '../../types/api'

interface Challenge {
  title: string
  scenario: string
  task: string
  starterCode: string
  expectedComplexity: string
}

interface ExpeditionSolution {
  id: number
  username: string
  language: string
  solution: string
  approach: string
  created_at: string
  updated_at: string
}

interface ExpeditionPage extends PaginatedResponse<ExpeditionSolution> {
  date: string
  challenge: Challenge
  streak: number
  completedToday: boolean
  mySolution: (Omit<ExpeditionSolution, 'username'>) | null
}

type ApiRequest = <T>(path: string, options?: RequestInit) => Promise<T>

const pageSize = 5
const languages = [
  ['typescript', 'TypeScript'],
  ['javascript', 'JavaScript'],
  ['python', 'Python'],
  ['java', 'Java'],
  ['csharp', 'C#'],
  ['cpp', 'C++'],
  ['c', 'C'],
  ['go', 'Go'],
  ['rust', 'Rust'],
  ['php', 'PHP'],
  ['ruby', 'Ruby'],
  ['kotlin', 'Kotlin'],
  ['swift', 'Swift'],
  ['dart', 'Dart'],
  ['sql', 'SQL'],
  ['bash', 'Bash'],
  ['other', 'Другой'],
] as const

export default function CodeExpeditions({ user, request }: { user: User | null; request: ApiRequest }) {
  const [data, setData] = useState<ExpeditionPage | null>(null)
  const [page, setPage] = useState(1)
  const [language, setLanguage] = useState('typescript')
  const [solution, setSolution] = useState('')
  const [approach, setApproach] = useState('')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    request<ExpeditionPage>(`/expeditions/today?page=${page}&pageSize=${pageSize}`)
      .then(result => {
        if (!active) return
        setData(result)
        setError('')
        if (result.mySolution && !editing) {
          setLanguage(result.mySolution.language)
          setSolution(result.mySolution.solution)
          setApproach(result.mySolution.approach)
        }
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'Не удалось загрузить экспедицию.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [editing, page, request, revision])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!user || !data) return
    setSaving(true)
    setError('')
    try {
      await request<ExpeditionSolution>(
        data.mySolution ? `/expeditions/solutions/${data.mySolution.id}` : '/expeditions/today/solutions',
        {
          method: data.mySolution ? 'PATCH' : 'POST',
          body: JSON.stringify({ language, solution, approach }),
        },
      )
      setEditing(false)
      setLoading(true)
      setRevision(value => value + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить решение.')
    } finally {
      setSaving(false)
    }
  }

  const deleteSolution = async () => {
    if (!data?.mySolution || !window.confirm('Удалить своё решение за сегодня?')) return
    setError('')
    try {
      await request(`/expeditions/solutions/${data.mySolution.id}`, { method: 'DELETE' })
      setLanguage('typescript')
      setSolution('')
      setApproach('')
      setEditing(false)
      setLoading(true)
      setRevision(value => value + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить решение.')
    }
  }

  if (loading && !data) {
    return <section className="page-column expedition-page"><div className="loading-state"><span className="spinner" /> Готовим кейс дня...</div></section>
  }

  if (error && !data) {
    return <section className="page-column expedition-page"><div className="notice" role="alert">{error}<button onClick={() => { setError(''); setLoading(true); setRevision(value => value + 1) }}>Повторить</button></div></section>
  }

  if (!data) return null

  return <section className="page-column expedition-page">
    <span className="page-kicker"><Compass size={15} /> ROOMFORDEVS ORIGINAL</span>
    <div className="expedition-heading">
      <div>
        <h1 className="page-title">Кодовая экспедиция</h1>
        <p className="page-subtitle">Один настоящий инженерный кейс в день. Покажи ход мысли — здесь ценят путь, а не только ответ.</p>
      </div>
      <div className="expedition-date">{new Date(`${data.date}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</div>
    </div>

    <div className="expedition-stats">
      <div className="expedition-streak"><Flame size={18} /><strong>{user ? data.streak : 0}</strong><span>дней подряд</span></div>
      <span className={`expedition-checkin ${data.completedToday ? 'is-complete' : ''}`}>
        {data.completedToday ? <><Check size={15} /> Сегодня пройдено</> : <><Code2 size={15} /> {data.total} решений сообщества</>}
      </span>
    </div>

    <article className="expedition-case">
      <div className="expedition-case-top"><span>КЕЙС ДНЯ</span><span>{data.date}</span></div>
      <h2>{data.challenge.title}</h2>
      <p className="expedition-scenario">{data.challenge.scenario}</p>
      <div className="expedition-task"><strong>Твоя миссия</strong><p>{data.challenge.task}</p></div>
      <pre className="expedition-starter">{data.challenge.starterCode}</pre>
      <p className="expedition-hint"><strong>Подумай ещё:</strong> {data.challenge.expectedComplexity}</p>
    </article>

    {!user && <div className="expedition-login">
      <p>Войди, чтобы отправить своё решение, увидеть разборы участников и начать серию дней.</p>
      <Link className="button button-dark" to="/login">Войти в экспедицию <ArrowRight size={15} /></Link>
    </div>}

    {user && <form className="expedition-form" onSubmit={submit}>
      <div className="expedition-form-heading">
        <div><span className="page-kicker">{data.mySolution ? (editing ? 'ОБНОВЛЕНИЕ РЕШЕНИЯ' : 'ТВОЙ РАЗБОР') : 'ТВОЯ ЭКСПЕДИЦИЯ'}</span>
          <h2>{data.mySolution && !editing ? 'Решение принято' : 'Покажи ход мысли'}</h2></div>
        {data.mySolution && !editing && <div className="expedition-owner-actions">
          <button type="button" className="button button-quiet" onClick={() => setEditing(true)}><Pencil size={14} /> Изменить</button>
          <button type="button" className="button button-quiet" onClick={() => void deleteSolution()}><Trash2 size={14} /> Удалить</button>
        </div>}
      </div>
      {(!data.mySolution || editing) ? <>
        <label className="expedition-label" htmlFor="expedition-language">Язык</label>
        <select id="expedition-language" value={language} onChange={event => setLanguage(event.target.value)}>
          {languages.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
        <label className="expedition-label" htmlFor="expedition-solution">Твоё решение <span>{solution.length}/10000</span></label>
        <textarea id="expedition-solution" className="expedition-code-input" value={solution} onChange={event => setSolution(event.target.value)} maxLength={10000} rows={10} required placeholder="Напиши решение или псевдокод..." />
        <label className="expedition-label" htmlFor="expedition-approach">Почему ты выбрал этот подход? <span>{approach.length}/2000</span></label>
        <textarea id="expedition-approach" value={approach} onChange={event => setApproach(event.target.value)} maxLength={2000} rows={3} required placeholder="Расскажи о сложности, краевых случаях и компромиссах..." />
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="expedition-form-footer">
          {editing && <button className="button button-quiet" type="button" onClick={() => { setEditing(false); if (data.mySolution) { setLanguage(data.mySolution.language); setSolution(data.mySolution.solution); setApproach(data.mySolution.approach) } }}>Отмена</button>}
          <button className="button button-dark" type="submit" disabled={saving || !solution.trim() || !approach.trim()}>
            <Send size={15} /> {saving ? 'Сохраняем...' : data.mySolution ? 'Сохранить разбор' : 'Отправить решение'}
          </button>
        </div>
      </> : <div className="expedition-own-solution">
        <span className="expedition-language">{languages.find(([value]) => value === data.mySolution?.language)?.[1] ?? data.mySolution.language}</span>
        <pre>{data.mySolution.solution}</pre>
        <p>{data.mySolution.approach}</p>
      </div>}
    </form>}

    <section className="expedition-community">
      <div className="expedition-community-heading"><div><span className="page-kicker">РАЗНЫЕ ГОЛОВЫ — РАЗНЫЕ РЕШЕНИЯ</span><h2>Полевые записи <span>{data.total}</span></h2></div></div>
      {data.items.length === 0 ? <div className="empty-state"><Code2 size={26} /><h3>След ещё не оставлен</h3><p>Будь первым исследователем сегодняшнего кейса.</p></div> :
        <div className="expedition-solutions">{data.items.map((entry, index) => <article className="expedition-solution" key={entry.id}>
          <div className="expedition-solution-meta"><span className="expedition-entry-number">#{(data.page - 1) * data.pageSize + index + 1}</span><strong>u/{entry.username}</strong><span>{languages.find(([value]) => value === entry.language)?.[1] ?? entry.language}</span>{entry.updated_at !== entry.created_at && <span>обновлено</span>}</div>
          <pre>{entry.solution}</pre>
          <p>{entry.approach}</p>
        </article>)}</div>}
      {data.totalPages > 1 && <nav className="pagination" aria-label="Страницы решений экспедиции">
        <button className="pagination-step" disabled={page <= 1} onClick={() => { setLoading(true); setPage(value => value - 1) }}>← <span>Назад</span></button>
        <span className="pagination-summary">Страница {data.page} из {data.totalPages}</span>
        <button className="pagination-step" disabled={page >= data.totalPages} onClick={() => { setLoading(true); setPage(value => value + 1) }}><span>Дальше</span> →</button>
      </nav>}
    </section>
  </section>
}
