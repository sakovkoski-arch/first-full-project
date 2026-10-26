import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, FileText, Search, ShieldCheck, Trash2, Users } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { ActionButton } from '../../components/ui/ActionButton'
import { getAuthToken } from '../../lib/auth-token'
import type { AdminUser, ApiErrorResponse, PaginatedResponse, Post, User } from '../../types/api'
import './AdminPanel.css'

const API_URL = import.meta.env['VITE_API_URL'] ?? ''

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken()
  const headers = new Headers(options.headers)
  if (options.body) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API_URL}/api${path}`, { ...options, headers })
  let body: T | ApiErrorResponse
  try { body = await response.json() as T | ApiErrorResponse }
  catch { throw new Error('Сервер вернул некорректный ответ') }
  if (!response.ok) throw new Error(body && typeof body === 'object' && 'error' in body ? body.error : 'Что-то пошло не так')
  return body as T
}

export default function AdminPanel({ user }: { user: User | null }) {
  const [tab, setTab] = useState<'posts' | 'users'>('posts')
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [posts, setPosts] = useState<Post[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [requestKey, setRequestKey] = useState(0)

  useEffect(() => {
    if (user?.role !== 'admin') return
    let active = true
    const params = `?page=${page}&pageSize=10${search ? `&q=${encodeURIComponent(search)}` : ''}`
    const load = async () => {
      try {
        if (tab === 'posts') {
          const result = await api<PaginatedResponse<Post>>(`/admin/posts${params}`)
          if (!active) return
          setPosts(result.items)
          setUsers([])
          setTotal(result.total)
          setTotalPages(result.totalPages)
        } else {
          const result = await api<PaginatedResponse<AdminUser>>(`/admin/users${params}`)
          if (!active) return
          setUsers(result.items)
          setPosts([])
          setTotal(result.total)
          setTotalPages(result.totalPages)
        }
        setError('')
      } catch (err) {
        if (!active) return
        setPosts([])
        setUsers([])
        setTotal(0)
        setTotalPages(0)
        setError(err instanceof Error ? err.message : 'Не удалось загрузить данные панели')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [tab, page, search, requestKey, user?.role])

  const removePost = async (post: Post) => {
    if (!window.confirm(`Удалить публикацию «${post.title}»?`)) return
    try {
      await api(`/admin/posts/${post.id}`, { method: 'DELETE' })
      setPosts(items => items.filter(item => item.id !== post.id))
      setTotal(value => Math.max(0, value - 1))
      setNotice('Публикация удалена')
      if (posts.length === 1 && page > 1) setPage(value => value - 1)
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось удалить публикацию') }
  }

  const removeUser = async (target: AdminUser) => {
    if (!window.confirm(`Удалить пользователя @${target.username}? Его публикации останутся без учётной записи автора.`)) return
    try {
      await api(`/admin/users/${target.id}`, { method: 'DELETE' })
      setUsers(items => items.filter(item => item.id !== target.id))
      setTotal(value => Math.max(0, value - 1))
      setNotice(`Пользователь @${target.username} удалён`)
      if (users.length === 1 && page > 1) setPage(value => value - 1)
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось удалить пользователя') }
  }

  const changeRole = async (target: AdminUser) => {
    const role = target.role === 'admin' ? 'member' : 'admin'
    try {
      const updated = await api<AdminUser>(`/admin/users/${target.id}`, { method: 'PATCH', body: JSON.stringify({ role }) })
      setUsers(items => items.map(item => item.id === updated.id ? updated : item))
      setNotice(role === 'admin' ? `@${target.username} назначен администратором` : `Роль @${target.username} изменена на участника`)
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось изменить роль') }
  }

  const changeTab = (nextTab: 'posts' | 'users') => {
    setTab(nextTab)
    setPage(1)
    setLoading(true)
    setNotice('')
  }

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    setPage(1)
    setLoading(true)
    setSearch(query.trim())
  }

  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <section className="page-column"><div className="notice">У вас нет доступа к панели администратора.</div><Link className="back-link" to="/">Вернуться в ленту <ArrowRight size={15} /></Link></section>

  return <section className="admin-page">
    <Link className="back-link" to="/"><ArrowRight size={15} /> Назад к ленте</Link>
    <div className="admin-heading"><span className="admin-heading-icon"><ShieldCheck size={23} /></span><div><span className="page-kicker">УПРАВЛЕНИЕ СООБЩЕСТВОМ</span><h1>Админ-панель<span className="brand-period">.</span></h1><p>Пользователи и публикации — всё под контролем.</p></div></div>
    <div className="admin-toolbar">
      <div className="admin-tabs"><button className={tab === 'posts' ? 'admin-tab-active' : ''} onClick={() => changeTab('posts')}><FileText size={16} /> Публикации</button><button className={tab === 'users' ? 'admin-tab-active' : ''} onClick={() => changeTab('users')}><Users size={16} /> Пользователи</button></div>
      <form className="admin-search" onSubmit={submitSearch}><Search size={16} /><input aria-label={tab === 'posts' ? 'Поиск публикаций' : 'Поиск пользователей'} placeholder={tab === 'posts' ? 'Заголовок или автор...' : 'Никнейм или почта...'} value={query} onChange={event => setQuery(event.target.value)} /><button aria-label="Искать"><ArrowRight size={15} /></button></form>
    </div>
    {notice && <div className="admin-notice"><ShieldCheck size={15} />{notice}<button onClick={() => setNotice('')} aria-label="Скрыть уведомление">×</button></div>}
    {error && <div className="notice">{error} <button onClick={() => { setLoading(true); setRequestKey(value => value + 1) }}>Повторить</button></div>}
    <div className="admin-table-wrap">
      {loading ? <div className="loading-state"><span className="spinner" /> Загружаем данные...</div> : tab === 'posts' ? <table className="admin-table"><thead><tr><th>Публикация</th><th>Сообщество</th><th>Автор</th><th>Дата</th><th aria-label="Действия" /></tr></thead><tbody>{posts.map(post => <tr key={post.id}><td><Link className="admin-post-title" to={`/posts/${post.id}`}>{post.title}</Link><span className="admin-row-caption">{post.score} голосов · {post.comments} комментариев</span></td><td><span className="admin-topic">d/{post.topic}</span></td><td>@{post.author}</td><td>{new Date(post.created_at).toLocaleDateString('ru-RU')}</td><td><button className="admin-delete" title="Удалить публикацию" aria-label={`Удалить: ${post.title}`} onClick={() => removePost(post)}><Trash2 size={16} /></button></td></tr>)}</tbody></table> : <table className="admin-table"><thead><tr><th>Участник</th><th>Роль</th><th>Регистрация</th><th aria-label="Действия" /></tr></thead><tbody>{users.map(target => <tr key={target.id}><td><strong className="admin-username">{target.username}</strong><span className="admin-row-caption">{target.email}</span></td><td><span className={`role-badge role-${target.role}`}>{target.role === 'admin' ? 'Администратор' : 'Участник'}</span></td><td>{new Date(target.created_at).toLocaleDateString('ru-RU')}</td><td><div className="admin-row-actions"><button className="role-action" onClick={() => changeRole(target)}>{target.role === 'admin' ? 'Снять админа' : 'Назначить админом'}</button>{target.role !== 'admin' && <button className="admin-delete" title="Удалить пользователя" aria-label={`Удалить пользователя ${target.username}`} onClick={() => removeUser(target)}><Trash2 size={16} /></button>}</div></td></tr>)}</tbody></table>}
      {!loading && !error && (tab === 'posts' ? posts.length : users.length) === 0 && <div className="empty-state"><Search size={27} /><h3>Ничего не найдено</h3><p>Измени запрос или сбрось поиск.</p><button className="button button-quiet" onClick={() => { setQuery(''); setSearch(''); setPage(1) }}>Сбросить поиск</button></div>}
    </div>
    {!loading && totalPages > 1 && <div className="admin-pagination"><span>{total} {tab === 'posts' ? 'публикаций' : 'пользователей'}</span><div><ActionButton tone="quiet" size="small" disabled={page <= 1} onClick={() => { setLoading(true); setPage(value => value - 1) }}>← Назад</ActionButton><strong>{page} / {totalPages}</strong><ActionButton tone="quiet" size="small" disabled={page >= totalPages} onClick={() => { setLoading(true); setPage(value => value + 1) }}>Дальше →</ActionButton></div></div>}
    {!loading && totalPages <= 1 && <p className="admin-total">Всего: {total} {tab === 'posts' ? 'публикаций' : 'пользователей'}</p>}
  </section>
}
