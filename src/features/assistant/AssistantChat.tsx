import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { Bot, Check, LoaderCircle, Send, ShieldCheck, X } from 'lucide-react'

interface PendingAction {
  id: string
  title: string
  description: string
  destructive: boolean
  status: 'pending' | 'confirmed' | 'cancelled'
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  pendingAction?: PendingAction
}

interface ChatResponse {
  reply: string
  pendingAction?: Omit<PendingAction, 'status'>
}

interface ActionResponse {
  result: string
  username?: string
}

type ApiRequest = <T>(path: string, options?: RequestInit) => Promise<T>

const initialMessage: ChatMessage = {
  role: 'assistant',
  content: 'Привет! Я помогу разобраться в программировании и в работе с roomfordevs. Могу найти ваши публикации и комментарии, а также подготовить создание, изменение или удаление ваших материалов — перед любым изменением попрошу подтверждение.',
}

export default function AssistantChat({
  request,
  onUsernameChange,
}: {
  request: ApiRequest
  onUsernameChange: (username: string) => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [resolvingActionId, setResolvingActionId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const sendMessage = async (event?: FormEvent) => {
    event?.preventDefault()
    const content = input.trim()
    if (!content || loading) return
    const conversation = messages.slice(-12).map(({ role, content: text }) => ({ role, content: text }))
    setMessages(current => [...current, { role: 'user', content }])
    setInput('')
    setError('')
    setLoading(true)
    try {
      const response = await request<ChatResponse>('/assistant/chat', {
        method: 'POST',
        body: JSON.stringify({ message: content, history: conversation }),
      })
      setMessages(current => [
        ...current,
        {
          role: 'assistant',
          content: response.reply,
          ...(response.pendingAction ? {
            pendingAction: { ...response.pendingAction, status: 'pending' as const },
          } : {}),
        },
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить сообщение. Попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  const resolveAction = async (action: PendingAction, approve: boolean) => {
    if (resolvingActionId) return
    setResolvingActionId(action.id)
    setError('')
    try {
      const response = await request<ActionResponse>(
        approve ? '/assistant/confirm' : '/assistant/cancel',
        { method: 'POST', body: JSON.stringify({ actionId: action.id }) },
      )
      if (response.username) onUsernameChange(response.username)
      setMessages(current => current.map(message => message.pendingAction?.id === action.id
        ? {
            ...message,
            content: approve ? response.result : 'Действие отменено. Ничего не изменено.',
            pendingAction: { ...action, status: approve ? 'confirmed' : 'cancelled' },
          }
        : message))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обработать действие.')
    } finally {
      setResolvingActionId(null)
    }
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage()
    }
  }

  return <section className="page-column assistant-page">
    <span className="page-kicker"><Bot size={15} /> ПЕРСОНАЛЬНЫЙ ПОМОЩНИК</span>
    <h1 className="page-title">ИИ-чат</h1>
    <p className="page-subtitle">Задавайте вопросы, учитесь и управляйте только своими публикациями, комментариями и никнеймом.</p>

    <div className="assistant-privacy" role="note">
      <ShieldCheck size={17} />
      <p>Помощник не имеет доступа к паролям, email, настройкам сервера или приватным данным других участников. Сообщения и запрошенные вами данные ваших материалов передаются внешнему AI-провайдеру. Не отправляйте секреты.</p>
    </div>

    <div className="assistant-chat" aria-label="Переписка с ИИ">
      {messages.map((message, index) => <article
        className={`assistant-message assistant-message-${message.role}`}
        key={`${index}-${message.role}`}
      >
        {message.role === 'assistant' && <span className="assistant-message-avatar"><Bot size={16} /></span>}
        <div className="assistant-message-body">
          <div className="assistant-message-content">{message.content}</div>
          {message.pendingAction && <div className={`assistant-action-card ${message.pendingAction.destructive ? 'assistant-action-danger' : ''}`}>
            <strong>{message.pendingAction.title}</strong>
            <pre>{message.pendingAction.description}</pre>
            {message.pendingAction.status === 'pending' ? <div className="assistant-action-buttons">
              <button className={message.pendingAction.destructive ? 'button button-danger' : 'button button-dark'} disabled={resolvingActionId !== null} onClick={() => message.pendingAction && void resolveAction(message.pendingAction, true)}>
                {resolvingActionId === message.pendingAction.id ? <LoaderCircle size={15} className="assistant-spinner" /> : <Check size={15} />} Подтвердить
              </button>
              <button className="button button-quiet" disabled={resolvingActionId !== null} onClick={() => message.pendingAction && void resolveAction(message.pendingAction, false)}>
                <X size={15} /> Отмена
              </button>
            </div> : <span className="assistant-action-status" role="status">
              {message.pendingAction.status === 'confirmed' ? 'Подтверждено' : 'Отменено'}
            </span>}
          </div>}
        </div>
      </article>)}
      {loading && <div className="assistant-thinking" role="status"><LoaderCircle size={16} className="assistant-spinner" /> Думаю...</div>}
      {error && <p className="form-error assistant-error" role="alert">{error}</p>}
    </div>

    <form className="assistant-composer" onSubmit={sendMessage}>
      <textarea
        value={input}
        onChange={event => setInput(event.target.value)}
        onKeyDown={handleComposerKeyDown}
        maxLength={4000}
        rows={3}
        aria-label="Сообщение ИИ-помощнику"
        placeholder="Например: объясни, как работает пагинация, или найди мои последние публикации..."
      />
      <div className="assistant-composer-footer">
        <span>Enter — отправить · Shift+Enter — новая строка · {input.length}/4000</span>
        <button className="button button-dark" type="submit" disabled={loading || !input.trim()}>
          <Send size={15} /> Отправить
        </button>
      </div>
    </form>
  </section>
}
