import { useEffect, useState } from 'react'
import { ArrowRight, Code2, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { PaginatedResponse } from '../../types/api'

interface DirectoryUser {
  id: number
  username: string
  created_at: string
  postCount: number
}

type ApiRequest = <T>(path: string, options?: RequestInit) => Promise<T>

const pageSize = 12

export default function MembersDirectory({ request }: { request: ApiRequest }) {
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    request<PaginatedResponse<DirectoryUser>>(`/users?page=${page}&pageSize=${pageSize}`)
      .then(result => {
        if (!active) return
        setError('')
        setUsers(result.items)
        setTotal(result.total)
        setTotalPages(result.totalPages)
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'Не удалось загрузить участников')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [page, request, revision])

  return <section className="page-column members-page">
    <span className="page-kicker"><Users size={15} /> СООБЩЕСТВО</span>
    <h1 className="page-title">Участники</h1>
    <p className="page-subtitle">Знакомьтесь с разработчиками сообщества и их публикациями.</p>

    {!loading && !error && <p className="members-total" aria-live="polite">Всего участников: <strong>{total}</strong></p>}
    {error && <div className="notice" role="alert">{error}<button onClick={() => { setError(''); setLoading(true); setRevision(value => value + 1) }}>Повторить</button></div>}
    {loading ? <div className="loading-state" role="status"><span className="spinner" /> Загружаем участников...</div> :
      !error && (users.length === 0 ? <div className="empty-state"><Users size={28} /><h2>Пока нет участников</h2><p>Зарегистрированные аккаунты появятся здесь.</p></div> :
        <div className="members-grid">{users.map(member => <article className="member-card" key={member.id}>
          <div className="member-avatar" aria-hidden="true">{member.username.slice(0, 1).toUpperCase()}</div>
          <div className="member-info">
            <Link className="member-name" to={`/users/${encodeURIComponent(member.username)}`}>u/{member.username}</Link>
            <span className="member-stat"><Code2 size={14} /> {member.postCount} публикаций</span>
          </div>
          <Link className="member-profile-link" to={`/users/${encodeURIComponent(member.username)}`} aria-label={`Открыть профиль ${member.username}`}><ArrowRight size={16} /></Link>
        </article>)}</div>)}

    {!loading && !error && totalPages > 1 && <nav className="pagination" aria-label="Страницы каталога участников">
      <button className="pagination-step" onClick={() => { setLoading(true); setPage(value => value - 1) }} disabled={page <= 1}>← <span>Назад</span></button>
      <span className="pagination-summary" aria-live="polite">Страница {page} из {totalPages}</span>
      <button className="pagination-step" onClick={() => { setLoading(true); setPage(value => value + 1) }} disabled={page >= totalPages}><span>Дальше</span> →</button>
    </nav>}
  </section>
}
