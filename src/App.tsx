import { useEffect, useState, type FormEvent } from 'react'
import {
  ArrowDown, ArrowRight, ArrowUp, Bookmark, Check, ChevronDown,
  Clock3, Code2, Flame, Hash, LogOut, Menu, MessageCircle, Plus, Search,
  Send, ShieldCheck, Sparkles,
} from 'lucide-react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import AdminPanel from './features/admin/AdminPanel'
import './App.css'

type User = { id: number; username: string; email: string; role: 'member' | 'admin' }
type Post = {
  id: number; title: string; content: string; topic: string; author_id: number;
  author: string; created_at: string; score: number; comments: number
}
type PostPage = { items: Post[]; page: number; pageSize: number; total: number; totalPages: number }
type ApiError = { error: string }

const API_URL = import.meta.env.VITE_API_URL ?? ''
const topics = [
  { name: 'javascript', label: 'JavaScript', color: 'gold' },
  { name: 'python', label: 'Python', color: 'blue' },
  { name: 'react', label: 'React', color: 'cyan' },
  { name: 'career', label: 'Карьера', color: 'green' },
  { name: 'opensource', label: 'Open source', color: 'purple' },
  { name: 'devops', label: 'DevOps', color: 'orange' },
]
async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('devroom_token')
  const headers = new Headers(options.headers)
  if (options.body) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API_URL}/api${path}`, { ...options, headers })
  let body: T | ApiError
  try { body = await response.json() as T | ApiError }
  catch { throw new Error('Сервер вернул некорректный ответ') }
  if (!response.ok) throw new Error(body && typeof body === 'object' && 'error' in body ? body.error : 'Что-то пошло не так')
  return body as T
}

function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [checked, setChecked] = useState(() => !localStorage.getItem('devroom_token'))
  useEffect(() => {
    if (!localStorage.getItem('devroom_token')) return
    let active = true
    api<User>('/auth/me').then(nextUser => { if (active) setUser(nextUser) }).catch(() => localStorage.removeItem('devroom_token')).finally(() => { if (active) setChecked(true) })
    return () => { active = false }
  }, [])
  return { user, setUser, checked }
}

function AppShell({ user, onLogout, children }: { user: User | null; onLogout: () => void; children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  return <div className="app-shell">
    <header className="topbar">
      <button className="icon-button menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label="Открыть меню"><Menu size={21} /></button>
      <Link className="brand" to="/"><span className="brand-mark"><Code2 size={21} strokeWidth={2.5} /></span><span>devroom<span className="brand-period">.</span></span></Link>
      <form className="search-box" action="/" onSubmit={e => { e.preventDefault(); const q = new FormData(e.currentTarget).get('q'); window.location.href = `/?q=${encodeURIComponent(String(q ?? ''))}` }}>
        <Search size={17} /><input name="q" placeholder="Поиск обсуждений" aria-label="Поиск обсуждений" /><kbd>⌘ K</kbd>
      </form>
      <nav className="top-actions">
        <Link className="button button-quiet header-create" aria-label="Создать новый пост" to={user ? '/submit' : '/login'}><Plus size={17} /> <span>Новый пост</span></Link>
        {user?.role === 'admin' && <Link className="button button-quiet admin-shortcut" to="/admin"><ShieldCheck size={16} /><span>Админ</span></Link>}
        {user ? <div className="account"><span className="avatar">{user.username.slice(0, 1).toUpperCase()}</span><span className="account-name">{user.username}</span><button className="icon-button logout-button" aria-label="Выйти" title="Выйти" onClick={onLogout}><LogOut size={17} /></button></div> :
          <Link className="button button-dark header-login" to="/login">Войти <ArrowRight size={15} /></Link>}
      </nav>
    </header>
    <div className="layout">
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`} onClick={event => { if ((event.target as HTMLElement).closest('a')) setMenuOpen(false) }}>
        <p className="nav-label">МЕНЮ</p>
        <Link className={`nav-link ${location.pathname === '/' ? 'nav-active' : ''}`} to="/"><Flame size={18} /> Лента <span className="nav-hot">HOT</span></Link>
        <Link className={`nav-link ${location.pathname === '/communities' ? 'nav-active' : ''}`} to="/communities"><Hash size={18} /> Сообщества</Link>
        <div className="sidebar-divider" />
        <div className="nav-heading"><p className="nav-label">ВАШИ СООБЩЕСТВА</p><button className="icon-button plus-small" title="Все сообщества" onClick={() => window.location.assign('/communities')}><Plus size={16} /></button></div>
        {topics.slice(0, 5).map((topic, i) => <Link className="community-link" to={`/communities?topic=${topic.name}`} key={topic.name}><span className={`community-dot dot-${topic.color}`}>{['JS', 'Py', 'Re', 'Ca', 'OS'][i]}</span><span>{topic.label}</span></Link>)}
        <Link className="sidebar-more" to="/communities">Все сообщества <ArrowRight size={14} /></Link>
        <div className="sidebar-divider" />
        <div className="sidebar-card"><Sparkles size={17} /><p>Место, где разработчики помогают друг другу расти.</p><span>Без шума. Только код.</span></div>
        <p className="sidebar-foot">Сделано разработчиками<br />для разработчиков <span>♥</span></p>
      </aside>
      {menuOpen && <button className="mobile-scrim" onClick={() => setMenuOpen(false)} aria-label="Закрыть меню" />}
      <main className="main-content">{children}</main>
    </div>
  </div>
}

function PostCard({ post, user, onVote, onDelete }: { post: Post; user: User | null; onVote: (id: number, delta: number) => void; onDelete: (id: number) => void }) {
  const topic = topics.find(item => item.name === post.topic) ?? topics[0]
  return <article className="post-card">
    <div className="vote-column"><button className="vote-button" aria-label="Голос за" onClick={() => onVote(post.id, 1)}><ArrowUp size={18} /></button><span>{post.score}</span><button className="vote-button down-vote" aria-label="Голос против" onClick={() => onVote(post.id, -1)}><ArrowDown size={18} /></button></div>
    <div className="post-main">
      <div className="post-meta"><Link className={`topic-pill pill-${topic.color}`} to={`/communities?topic=${topic.name}`}>d/{topic.name}</Link><span className="meta-dot">·</span><span>u/{post.author}</span><span className="meta-dot">·</span><span>{timeAgo(post.created_at)}</span></div>
      <Link className="post-title" to={`/posts/${post.id}`}>{post.title}</Link>
      <p className="post-excerpt">{post.content}</p>
      <div className="post-actions"><Link className="post-action" to={`/posts/${post.id}`}><MessageCircle size={16} /> {post.comments} комментариев</Link><button className="post-action" onClick={() => navigator.clipboard?.writeText(window.location.origin + `/posts/${post.id}`)}><Bookmark size={16} /> Сохранить</button>{user?.id === post.author_id && <button className="post-action delete-action" onClick={() => onDelete(post.id)}>Удалить</button>}</div>
    </div>
  </article>
}

function timeAgo(value: string) {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 60) return `${minutes} мин. назад`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч. назад`
  return `${Math.floor(hours / 24)} дн. назад`
}

function Feed({ user }: { user: User | null }) {
  const [posts, setPosts] = useState<Post[]>([])
  const [totalPosts, setTotalPosts] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [sort, setSort] = useState<'hot' | 'new'>('hot')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedTopic = searchParams.get('topic') ?? 'all'
  const searchQuery = searchParams.get('q') ?? ''
  const requestedPage = Number.parseInt(searchParams.get('page') ?? '1', 10)
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const firstVisiblePage = Math.max(1, Math.min(page - 2, totalPages - 4))
  const visiblePages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => firstVisiblePage + index)
  const setPage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams)
    if (nextPage === 1) params.delete('page')
    else params.set('page', String(nextPage))
    setSearchParams(params)
    setLoading(true)
  }
  const refresh = () => {
    api<PostPage>(`/posts?sort=${sort}&page=${page}${selectedTopic !== 'all' ? `&topic=${encodeURIComponent(selectedTopic)}` : ''}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ''}`)
      .then(data => { setPosts(data.items); setTotalPosts(data.total); setTotalPages(data.totalPages); setError('') })
      .catch(err => { setPosts([]); setTotalPosts(0); setTotalPages(0); setError(err instanceof Error ? err.message : 'Не удалось загрузить публикации') })
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    let active = true
    api<PostPage>(`/posts?sort=${sort}&page=${page}${selectedTopic !== 'all' ? `&topic=${encodeURIComponent(selectedTopic)}` : ''}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ''}`)
      .then(data => {
        if (!active) return
        setPosts(data.items)
        setTotalPosts(data.total)
        setTotalPages(data.totalPages)
        setError('')
        if (data.page !== page) {
          setSearchParams(params => {
            if (data.page === 1) params.delete('page')
            else params.set('page', String(data.page))
            return params
          })
        }
      })
      .catch(err => { if (active) { setPosts([]); setTotalPosts(0); setTotalPages(0); setError(err instanceof Error ? err.message : 'Не удалось загрузить публикации') } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [sort, selectedTopic, searchQuery, page, setSearchParams])
  const vote = async (id: number, delta: number) => {
    if (!user) { window.location.assign('/login'); return }
    try { const result = await api<{ score: number }>(`/posts/${id}/vote`, { method: 'POST', body: JSON.stringify({ value: delta }) }); setPosts(items => items.map(post => post.id === id ? { ...post, score: result.score } : post)) }
    catch (err) { setError(err instanceof Error ? err.message : 'Не удалось проголосовать') }
  }
  const remove = async (id: number) => {
    if (!window.confirm('Удалить публикацию?')) return
    try {
      await api(`/posts/${id}`, { method: 'DELETE' })
      setPosts(items => items.filter(post => post.id !== id))
      setTotalPosts(count => Math.max(0, count - 1))
      if (posts.length === 1 && page > 1) setPage(page - 1)
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось удалить пост') }
  }
  const changeTopic = (topic: string) => {
    const params = new URLSearchParams(searchParams)
    if (topic === 'all') params.delete('topic')
    else params.set('topic', topic)
    params.delete('page')
    setSearchParams(params)
    setLoading(true)
  }
  return <div className="feed-grid">
    <section className="feed-column">
      <div className="welcome-banner"><div className="welcome-copy"><span className="eyebrow"><span className="live-dot" /> СООБЩЕСТВО РАЗРАБОТЧИКОВ</span><h1>Привет, кодер<span> 👋</span></h1><p>Обсуждай технологии, делись опытом и находи своих.</p><Link className="welcome-link" to={user ? '/submit' : '/register'}>{user ? 'Поделиться идеей' : 'Присоединиться'} <ArrowRight size={16} /></Link></div><div className="hero-orbit"><div className="orbit-ring" /><div className="orbit-core"><Code2 size={36} /></div><span className="orbit-tag tag-js">JS</span><span className="orbit-tag tag-py">Py</span><span className="orbit-tag tag-braces">{'{ }'}</span></div></div>
      <div className="feed-heading"><div><h2>Лента обсуждений</h2><p>Лучшее из мира разработки — от сообщества</p></div><div className="sort-tabs"><button className={sort === 'hot' ? 'sort-active' : ''} onClick={() => { setLoading(true); setPage(1); setSort('hot') }}><Flame size={15} /> Популярное</button><button className={sort === 'new' ? 'sort-active' : ''} onClick={() => { setLoading(true); setPage(1); setSort('new') }}><Clock3 size={15} /> Свежее</button></div></div>
      <div className="topic-filters"><button className={selectedTopic === 'all' ? 'filter-active' : ''} onClick={() => changeTopic('all')}>Все темы</button>{topics.slice(0, 4).map(topic => <button key={topic.name} className={selectedTopic === topic.name ? 'filter-active' : ''} onClick={() => changeTopic(topic.name)}>#{topic.name}</button>)}</div>
      {error && <div className="notice">{error} <button onClick={() => { setLoading(true); refresh() }}>Повторить</button></div>}
      {loading && <div className="loading-state"><span className="spinner" /> Загружаем обсуждения...</div>}
      {!loading && posts.length === 0 && <div className="empty-state"><Code2 size={28} /><h3>Пока здесь тихо</h3><p>Стань первым, кто начнёт обсуждение в этой теме.</p><Link className="button button-dark" to={user ? '/submit' : '/login'}><Plus size={16} /> Создать пост</Link></div>}
      {!loading && posts.map(post => <PostCard key={post.id} post={post} user={user} onVote={vote} onDelete={remove} />)}
      {!loading && totalPages > 1 && <nav className="pagination" aria-label="Страницы публикаций">
        <button className="pagination-step" onClick={() => setPage(page - 1)} disabled={page <= 1}>← <span>Назад</span></button>
        <div className="pagination-numbers">
          {firstVisiblePage > 1 && <><button onClick={() => setPage(1)}>1</button><span className="pagination-ellipsis">…</span></>}
          {visiblePages.map(pageNumber => <button key={pageNumber} className={pageNumber === page ? 'pagination-current' : ''} aria-current={pageNumber === page ? 'page' : undefined} onClick={() => setPage(pageNumber)}>{pageNumber}</button>)}
          {firstVisiblePage + visiblePages.length <= totalPages && <><span className="pagination-ellipsis">…</span><button onClick={() => setPage(totalPages)}>{totalPages}</button></>}
        </div>
        <span className="pagination-summary">{totalPosts} постов</span>
        <button className="pagination-step" onClick={() => setPage(page + 1)} disabled={page >= totalPages}><span>Дальше</span> →</button>
      </nav>}
    </section>
    <aside className="right-column">
      <div className="side-widget"><div className="widget-heading"><h3>Растём вместе</h3><span className="widget-sparkle"><Sparkles size={16} /></span></div><div className="stats-row"><div><strong>2.4k</strong><span>разработчиков</span></div><div><strong>186</strong><span>сейчас онлайн</span></div></div><div className="widget-rule" /><p className="widget-copy">Уже с нами? Продолжай обсуждение. Ещё нет? Твоё место за нами!</p><Link className="button button-lime widget-cta" to={user ? '/communities' : '/register'}>{user ? 'Найти сообщество' : 'Создать аккаунт'} <ArrowRight size={16} /></Link></div>
      <div className="side-widget trending-widget"><div className="widget-heading"><h3>В тренде</h3><Flame size={16} className="trending-fire" /></div>{topics.slice(0, 4).map((topic, i) => <Link className="trending-row" to={`/communities?topic=${topic.name}`} key={topic.name}><span className={`trend-number ${i === 0 ? 'trend-hot' : ''}`}>0{i + 1}</span><span><strong>d/{topic.name}</strong><small>{['1.2k', '842', '619', '408'][i]} участников</small></span><ArrowRight size={15} /></Link>)}</div>
      <div className="quote-card"><span className="quote-mark">“</span><p>Great things are done by a series of small things brought together.</p><span>— Vincent van Gogh, probably a developer</span><span className="quote-decoration">⌘</span></div>
    </aside>
  </div>
}

function Communities() {
  const [params, setParams] = useSearchParams()
  const active = params.get('topic') ?? ''
  const query = params.get('q')?.toLowerCase() ?? ''
  const filtered = topics.filter(topic => (!active || topic.name === active) && (!query || `${topic.name} ${topic.label}`.toLowerCase().includes(query)))
  const descriptions: Record<string, string> = { javascript: 'Язык, который живёт в браузере и далеко за его пределами.', python: 'От первых скриптов до машинного обучения и больших систем.', react: 'Компоненты, хуки, архитектура и всё, что окружает React.', career: 'Обмен опытом, собеседования и рост в разработке.', opensource: 'Создаём полезные вещи вместе, одна pull request за раз.', devops: 'Инфраструктура, автоматизация и надёжная доставка кода.' }
  return <section className="page-column"><div className="page-kicker"><Hash size={15} /> КРУГИ ПО ИНТЕРЕСАМ</div><h1 className="page-title">Сообщества<span className="brand-period">.</span></h1><p className="page-subtitle">Найди свою команду. Или собери новую.</p>
    <div className="community-grid">{filtered.map(topic => <Link className="community-card" key={topic.name} to={`/?topic=${topic.name}`}><div className="community-card-top"><span className={`community-icon dot-${topic.color}`}>{['JS', 'Py', 'Re', 'Ca', 'OS', 'Dv'][topics.indexOf(topic)]}</span><span className="community-members">{['1.2k', '842', '619', '408', '327', '284'][topics.indexOf(topic)]} участников</span></div><h2>d/{topic.name}</h2><p>{descriptions[topic.name]}</p><div className="community-card-bottom"><span className="online-indicator" />{['34', '21', '18', '12', '9', '7'][topics.indexOf(topic)]} онлайн <ArrowRight size={16} /></div></Link>)}</div>
    {filtered.length === 0 && <div className="empty-state"><Search size={28} /><h3>Ничего не нашли</h3><p>Попробуйте другое название сообщества.</p><button className="button button-quiet" onClick={() => setParams({})}>Показать все</button></div>}
    <div className="create-community"><div className="create-communities-icon"><Plus size={21} /></div><div><strong>Не нашли своё?</strong><span>Начните обсуждение на любую тему — сообщество подтянется за вами.</span></div><Link className="button button-dark" to="/submit">Создать пост <ArrowRight size={15} /></Link></div>
  </section>
}

function SubmitPost({ user }: { user: User | null }) {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [topic, setTopic] = useState('javascript')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  if (!user) return <Navigate to="/login" replace />
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try { const post = await api<Post>('/posts', { method: 'POST', body: JSON.stringify({ title, content, topic }) }); navigate(`/posts/${post.id}`) }
    catch (err) { setError(err instanceof Error ? err.message : 'Не удалось опубликовать пост') }
    finally { setSaving(false) }
  }
  return <section className="form-page"><Link className="back-link" to="/"><ArrowRight size={15} /> Назад к ленте</Link><div className="form-heading"><span className="form-icon"><PenIcon /></span><div><h1>Новый пост</h1><p>Хороший вопрос — уже половина решения.</p></div></div><form className="editor-card" onSubmit={submit}><label htmlFor="post-title">Заголовок <span>Чётко и по делу</span></label><input id="post-title" autoFocus maxLength={160} placeholder="Например: Как вы тестируете React-компоненты?" value={title} onChange={e => setTitle(e.target.value)} required /><label htmlFor="post-topic">Сообщество</label><div className="select-wrap"><select id="post-topic" value={topic} onChange={e => setTopic(e.target.value)}>{topics.map(item => <option value={item.name} key={item.name}>d/{item.name}</option>)}</select><ChevronDown size={16} /></div><label htmlFor="post-content">Текст <span>Можно добавить детали и примеры кода</span></label><textarea id="post-content" rows={8} maxLength={10000} placeholder="Расскажи, что пробовал и что хочешь обсудить..." value={content} onChange={e => setContent(e.target.value)} required /><div className="editor-footer"><span>{content.length}/10000</span><button className="button button-dark" disabled={saving || !title.trim() || !content.trim()}>{saving ? 'Публикуем...' : 'Опубликовать'} <Send size={15} /></button></div>{error && <p className="form-error">{error}</p>}</form><p className="form-hint"><Sparkles size={15} /> Будь добр к людям. Мы все когда-то писали свой первый баг.</p></section>
}
function PenIcon() { return <Code2 size={21} /> }

function PostDetail({ user }: { user: User | null }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [post, setPost] = useState<Post | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loadedId, setLoadedId] = useState('')
  useEffect(() => { if (!id) return; api<Post>(`/posts/${id}`).then(data => { setPost(data); setLoadedId(id); setTitle(data.title); setContent(data.content) }).catch(err => setError(err instanceof Error ? err.message : 'Публикация не найдена')) }, [id])
  const save = async (event: FormEvent) => { event.preventDefault(); if (!id) return; try { const updated = await api<Post>(`/posts/${id}`, { method: 'PATCH', body: JSON.stringify({ title, content }) }); setPost(updated); setEditing(false) } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось сохранить') } }
  const remove = async () => { if (!id || !window.confirm('Удалить публикацию?')) return; try { await api(`/posts/${id}`, { method: 'DELETE' }); navigate('/') } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось удалить') } }
  if (error) return <section className="page-column"><Link className="back-link" to="/"><ArrowRight size={15} /> К ленте</Link><div className="notice">{error}</div></section>
  const currentPost = loadedId === id ? post : null
  if (!currentPost) return <section className="page-column"><div className="loading-state"><span className="spinner" /> Загружаем публикацию...</div></section>
  const topic = topics.find(item => item.name === currentPost.topic) ?? topics[0]
  return <section className="page-column detail-page"><Link className="back-link" to="/"><ArrowRight size={15} /> Назад к ленте</Link><article className="detail-card"><div className="post-meta"><Link className={`topic-pill pill-${topic.color}`} to={`/communities?topic=${topic.name}`}>d/{topic.name}</Link><span className="meta-dot">·</span><span>u/{currentPost.author}</span><span className="meta-dot">·</span><span>{timeAgo(currentPost.created_at)}</span></div>{editing ? <form className="edit-form" onSubmit={save}><input maxLength={160} value={title} onChange={e => setTitle(e.target.value)} required /><textarea rows={8} maxLength={10000} value={content} onChange={e => setContent(e.target.value)} required /><div className="edit-buttons"><button type="button" className="button button-quiet" onClick={() => setEditing(false)}>Отмена</button><button className="button button-dark">Сохранить <Check size={15} /></button></div></form> : <><h1>{currentPost.title}</h1><p className="detail-content">{currentPost.content}</p></>}<div className="detail-actions"><span className="detail-votes"><ArrowUp size={17} /> {currentPost.score}</span><span className="detail-votes"><MessageCircle size={17} /> {currentPost.comments} комментариев</span>{user?.id === currentPost.author_id && !editing && <><button className="post-action" onClick={() => setEditing(true)}>Редактировать</button><button className="post-action delete-action" onClick={remove}>Удалить</button></>}</div></article><div className="comments-placeholder"><div className="comment-icon"><MessageCircle size={18} /></div><div><strong>Обсуждение начинается здесь</strong><p>Комментарии скоро появятся. А пока поделись мнением новым постом.</p></div><Link className="button button-quiet" to={user ? '/submit' : '/login'}>Написать <ArrowRight size={14} /></Link></div></section>
}

function AuthPage({ mode, onAuth }: { mode: 'login' | 'register'; onAuth: (user: User, token: string) => void }) {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const register = mode === 'register'
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError('')
    try { const result = await api<{ user: User; token: string }>(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(register ? { username, email, password } : { email, password }) }); onAuth(result.user, result.token); navigate('/') }
    catch (err) { setError(err instanceof Error ? err.message : 'Не удалось войти') }
    finally { setLoading(false) }
  }
  return <div className="auth-layout"><section className="auth-art"><Link to="/" className="brand auth-brand"><span className="brand-mark"><Code2 size={21} strokeWidth={2.5} /></span><span>devroom<span className="brand-period">.</span></span></Link><span className="eyebrow"><span className="live-dot" /> ТВОИ ЛЮДИ. ТВОЙ КОД.</span><h1>Хороший код<br />пишут <em>вместе.</em></h1><p>Вопросы без стыда, идеи без границ и люди, которые понимают, почему ты снова не спал.</p><div className="auth-stat"><div className="stat-avatars"><span>А</span><span>M</span><span>JS</span><span>+</span></div><span><strong>2 400+</strong> разработчиков уже здесь</span></div><div className="auth-art-code"><span>const community = </span><b>'you'</b><span>;</span><br /><span>community.</span><b>welcome()</b><span>;</span></div></section><section className="auth-panel"><Link className="auth-mobile-brand brand" to="/"><span className="brand-mark"><Code2 size={21} /></span>devroom<span className="brand-period">.</span></Link><div className="auth-form-wrap"><span className="form-eyebrow">{register ? 'НОВЫЙ АККАУНТ' : 'СНОВА ПРИВЕТ'}</span><h2>{register ? 'Присоединяйся.' : 'Рады видеть.'}</h2><p className="auth-subtitle">{register ? 'Создай аккаунт — и сразу в обсуждение.' : 'Заходи, новые обсуждения уже ждут.'}</p><form className="auth-form" onSubmit={submit}>{register && <label>Никнейм<input autoComplete="username" minLength={3} maxLength={24} pattern="[a-zA-Z0-9_]+" placeholder="например, code_wizard" value={username} onChange={e => setUsername(e.target.value)} required /></label>}<label>Электронная почта<input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required /></label><label>Пароль<input type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={8} placeholder="Минимум 8 символов" value={password} onChange={e => setPassword(e.target.value)} required /></label>{error && <p className="form-error">{error}</p>}<button className="button button-dark auth-submit" disabled={loading}>{loading ? 'Подождите...' : register ? 'Создать аккаунт' : 'Войти'} <ArrowRight size={16} /></button></form><p className="auth-switch">{register ? 'Уже есть аккаунт?' : 'Впервые в devroom?'} <Link to={register ? '/login' : '/register'}>{register ? 'Войти' : 'Зарегистрироваться'} <ArrowRight size={14} /></Link></p><p className="auth-terms">Продолжая, ты соглашаешься быть добр к людям. <span>Это важно.</span></p></div></section></div>
}

function Application() {
  const { user, setUser, checked } = useAuth()
  const logout = () => { localStorage.removeItem('devroom_token'); setUser(null) }
  const auth = (nextUser: User, token: string) => { localStorage.setItem('devroom_token', token); setUser(nextUser) }
  if (!checked) return <div className="boot-screen"><Code2 size={26} /><span>devroom<span className="brand-period">.</span></span></div>
  return <Routes><Route path="/login" element={<AuthPage mode="login" onAuth={auth} />} /><Route path="/register" element={<AuthPage mode="register" onAuth={auth} />} /><Route path="*" element={<AppShell user={user} onLogout={logout}><Routes><Route path="/" element={<Feed user={user} />} /><Route path="/communities" element={<Communities />} /><Route path="/admin" element={<AdminPanel user={user} />} /><Route path="/submit" element={<SubmitPost user={user} />} /><Route path="/posts/:id" element={<PostDetail user={user} />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></AppShell>} /></Routes>
}

export default function App() { return <BrowserRouter><Application /></BrowserRouter> }
