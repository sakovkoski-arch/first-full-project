import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, Pencil, Trash2, X } from 'lucide-react'
import type { User } from '../../types/api'

interface Comment {
  id: number
  post_id: number
  author_id: number
  author: string
  content: string
  created_at: string
}

interface CommentPage {
  items: Comment[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

type ApiRequest = <T>(path: string, options?: RequestInit) => Promise<T>

const pageSize = 10

export default function CommentsSection({ postId, user, request }: {
  postId: number
  user: User | null
  request: ApiRequest
}) {
  const [comments, setComments] = useState<Comment[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [content, setContent] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)

  const loadComments = useCallback(() => {
    let active = true
    request<CommentPage>(`/posts/${postId}/comments?page=${page}&pageSize=${pageSize}`)
      .then(result => {
        if (!active) return
        setError('')
        setComments(result.items)
        setTotal(result.total)
        setTotalPages(result.totalPages)
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'Не удалось загрузить комментарии')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [page, postId, request])

  useEffect(() => loadComments(), [loadComments, revision])

  const submitComment = async (event: FormEvent) => {
    event.preventDefault()
    if (!content.trim()) return
    setSaving(true)
    setError('')
    try {
      await request<Comment>(`/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ content: content.trim() }) })
      setContent('')
      setLoading(true)
      setPage(1)
      setRevision(value => value + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить комментарий')
    } finally {
      setSaving(false)
    }
  }

  const saveEdit = async (event: FormEvent, commentId: number) => {
    event.preventDefault()
    if (!editContent.trim()) return
    setSaving(true)
    setError('')
    try {
      await request<Comment>(`/comments/${commentId}`, { method: 'PATCH', body: JSON.stringify({ content: editContent.trim() }) })
      setEditingId(null)
      setLoading(true)
      setRevision(value => value + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить комментарий')
    } finally {
      setSaving(false)
    }
  }

  const deleteComment = async (commentId: number) => {
    if (!window.confirm('Удалить комментарий?')) return
    setError('')
    try {
      await request(`/comments/${commentId}`, { method: 'DELETE' })
      setLoading(true)
      if (comments.length === 1 && page > 1) setPage(current => current - 1)
      else setRevision(value => value + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить комментарий')
    }
  }

  return <section className="comments-section" aria-labelledby="comments-heading">
    <div className="comments-heading">
      <div><span className="page-kicker"><MessageCircle size={15} /> ОБСУЖДЕНИЕ</span><h2 id="comments-heading">Комментарии <span>{total}</span></h2></div>
    </div>
    {error && <div className="notice" role="alert">{error} <button onClick={() => { setLoading(true); setRevision(value => value + 1) }}>Повторить</button></div>}
    {user ? <form className="comment-form" onSubmit={submitComment}>
      <label className="sr-only" htmlFor="new-comment">Ваш комментарий</label>
      <textarea id="new-comment" rows={3} maxLength={5000} placeholder="Поделитесь мыслями по теме..." value={content} onChange={event => setContent(event.target.value)} required />
      <div className="comment-form-footer"><span>{content.length}/5000</span><button className="button button-dark" type="submit" disabled={saving || !content.trim()}>{saving ? 'Отправляем...' : 'Отправить'}</button></div>
    </form> : <div className="comment-signin"><p>Войдите, чтобы присоединиться к обсуждению.</p><Link className="button button-quiet" to="/login">Войти</Link></div>}
    {loading ? <div className="loading-state"><span className="spinner" /> Загружаем комментарии...</div> : comments.length === 0 ? <div className="comments-empty"><MessageCircle size={20} /><p>Комментариев пока нет. Будьте первым, кто начнёт обсуждение.</p></div> :
      <div className="comment-list">{comments.map(comment => {
        const canManage = user?.id === comment.author_id || user?.role === 'admin'
        return <article className="comment-item" key={comment.id}>
          <div className="comment-avatar" aria-hidden="true">{comment.author.slice(0, 1).toUpperCase()}</div>
          <div className="comment-body">
            <div className="comment-meta"><Link to={`/users/${encodeURIComponent(comment.author)}`}>u/{comment.author}</Link><span>·</span><time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString()}</time></div>
            {editingId === comment.id ? <form className="comment-edit-form" onSubmit={event => saveEdit(event, comment.id)}>
              <label className="sr-only" htmlFor={`edit-comment-${comment.id}`}>Изменить комментарий</label>
              <textarea id={`edit-comment-${comment.id}`} rows={3} maxLength={5000} value={editContent} onChange={event => setEditContent(event.target.value)} required />
              <div className="comment-controls"><button className="button button-quiet" type="button" onClick={() => setEditingId(null)}><X size={14} /> Отмена</button><button className="button button-dark" type="submit" disabled={saving || !editContent.trim()}>{saving ? 'Сохраняем...' : 'Сохранить'}</button></div>
            </form> : <p className="comment-content">{comment.content}</p>}
          </div>
          {canManage && editingId !== comment.id && <div className="comment-actions"><button className="icon-button" aria-label="Редактировать комментарий" title="Редактировать" onClick={() => { setEditingId(comment.id); setEditContent(comment.content) }}><Pencil size={15} /></button><button className="icon-button comment-delete" aria-label="Удалить комментарий" title="Удалить" onClick={() => deleteComment(comment.id)}><Trash2 size={15} /></button></div>}
        </article>
      })}</div>}
    {!loading && totalPages > 1 && <nav className="pagination" aria-label="Страницы комментариев">
      <button className="pagination-step" onClick={() => { setLoading(true); setPage(value => value - 1) }} disabled={page <= 1}>← <span>Назад</span></button>
      <span className="pagination-summary">Страница {page} из {totalPages}</span>
      <button className="pagination-step" onClick={() => { setLoading(true); setPage(value => value + 1) }} disabled={page >= totalPages}><span>Дальше</span> →</button>
    </nav>}
  </section>
}
