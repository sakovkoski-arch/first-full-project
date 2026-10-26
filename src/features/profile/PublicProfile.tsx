import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, Code2 } from 'lucide-react'
import type { PaginatedResponse, Post } from '../../types/api'

interface PublicUser {
  id: number
  username: string
  created_at: string
  postCount: number
}

type ApiRequest = <T>(path: string, options?: RequestInit) => Promise<T>

const pageSize = 10

export default function PublicProfile({ request }: { request: ApiRequest }) {
  const { username = '' } = useParams()
  return <ProfileView key={username} username={username} request={request} />
}

function ProfileView({ username, request }: { username: string; request: ApiRequest }) {
  const [profile, setProfile] = useState<PublicUser | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [loadingPosts, setLoadingPosts] = useState(true)
  const [profileError, setProfileError] = useState('')
  const [postsError, setPostsError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    request<PublicUser>(`/users/${encodeURIComponent(username)}`)
      .then(result => { if (active) setProfile(result) })
      .catch(err => { if (active) setProfileError(err instanceof Error ? err.message : 'Профиль не найден') })
      .finally(() => { if (active) setLoadingProfile(false) })
    return () => { active = false }
  }, [request, revision, username])

  useEffect(() => {
    if (!profile) return
    let active = true
    request<PaginatedResponse<Post>>(`/users/${encodeURIComponent(username)}/posts?page=${page}&pageSize=${pageSize}`)
      .then(result => {
        if (!active) return
        setPostsError('')
        setPosts(result.items)
        setTotalPages(result.totalPages)
      })
      .catch(err => { if (active) setPostsError(err instanceof Error ? err.message : 'Не удалось загрузить публикации') })
      .finally(() => { if (active) setLoadingPosts(false) })
    return () => { active = false }
  }, [page, profile, request, revision, username])

  if (loadingProfile) return <section className="page-column"><div className="loading-state"><span className="spinner" /> Загружаем профиль...</div></section>
  if (profileError || !profile) return <section className="page-column profile-page"><Link className="back-link" to="/"><ArrowRight size={15} /> К ленте</Link><div className="notice" role="alert">{profileError || 'Профиль не найден'} <button onClick={() => { setProfileError(''); setLoadingProfile(true); setRevision(value => value + 1) }}>Повторить</button></div></section>

  return <section className="page-column profile-page">
    <Link className="back-link" to="/"><ArrowRight size={15} /> Назад к ленте</Link>
    <header className="profile-card">
      <div className="profile-avatar">{profile.username.slice(0, 1).toUpperCase()}</div>
      <div className="profile-intro"><span className="page-kicker"><Code2 size={15} /> ПРОФИЛЬ УЧАСТНИКА</span><h1>{profile.username}</h1><p>С нами с {new Date(profile.created_at).toLocaleDateString()}</p></div>
      <div className="profile-stat"><strong>{profile.postCount}</strong><span>публикаций</span></div>
    </header>
    <div className="profile-post-heading"><div><h2>Публикации</h2><p>Обсуждения от u/{profile.username}</p></div></div>
    {postsError && <div className="notice" role="alert">{postsError} <button onClick={() => { setPostsError(''); setLoadingPosts(true); setRevision(value => value + 1) }}>Повторить</button></div>}
    {loadingPosts ? <div className="loading-state"><span className="spinner" /> Загружаем публикации...</div> : posts.length === 0 ? <div className="empty-state"><Code2 size={28} /><h3>Публикаций пока нет</h3><p>Когда появятся новые обсуждения, они будут здесь.</p></div> :
      <div className="profile-post-list">{posts.map(post => <article className="profile-post" key={post.id}>
        <div className="post-meta"><span className="profile-topic">d/{post.topic}</span><span className="meta-dot">·</span><time dateTime={post.created_at}>{new Date(post.created_at).toLocaleDateString()}</time></div>
        <Link className="post-title" to={`/posts/${post.id}`}>{post.title}</Link>
        <p className="post-excerpt">{post.content}</p>
        <Link className="post-action" to={`/posts/${post.id}`}>Обсудить <ArrowRight size={14} /></Link>
      </article>)}</div>}
    {!loadingPosts && totalPages > 1 && <nav className="pagination" aria-label="Страницы публикаций пользователя">
      <button className="pagination-step" onClick={() => { setLoadingPosts(true); setPage(value => value - 1) }} disabled={page <= 1}>← <span>Назад</span></button>
      <span className="pagination-summary">Страница {page} из {totalPages}</span>
      <button className="pagination-step" onClick={() => { setLoadingPosts(true); setPage(value => value + 1) }} disabled={page >= totalPages}><span>Дальше</span> →</button>
    </nav>}
  </section>
}
