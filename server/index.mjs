import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const port = Number(process.env.API_PORT ?? 3001)
const databasePath = resolve(process.env.DATABASE_PATH ?? 'data/devroom.sqlite')
mkdirSync(dirname(databasePath), { recursive: true })
let secret = process.env.JWT_SECRET
if (!secret && process.env.NODE_ENV !== 'production') {
  const secretPath = resolve(dirname(databasePath), '.jwt-secret')
  try {
    secret = readFileSync(secretPath, 'utf8').trim()
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    secret = randomBytes(48).toString('hex')
    writeFileSync(secretPath, secret, { flag: 'wx', mode: 0o600 })
  }
}
if (!secret || secret.length < 32) {
  throw new Error('Set JWT_SECRET in .env to a random value of at least 32 characters.')
}
const db = new Database(databasePath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    topic TEXT NOT NULL,
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    author TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS votes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    value INTEGER NOT NULL CHECK (value IN (-1, 1)),
    PRIMARY KEY (user_id, post_id)
  );
  CREATE INDEX IF NOT EXISTS posts_created_at_idx ON posts(created_at DESC);
`)
const userColumns = db.pragma('table_info(users)')
if (!userColumns.some(column => column.name === 'role')) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin'))")
}

const samplePosts = [
  ['Какие маленькие инструменты вы написали для себя — и теперь не представляете работу без них?', 'У меня это скрипт, который находит все TODO в проекте и группирует их по папкам. Написал за вечер, а пользуюсь каждый день. Поделитесь своими находками — от пары строк на bash до полноценного pet-проекта.', 'career', 'byte_me', 248, 42, 38],
  ['React Server Components: когда они действительно имеют смысл?', 'Разбирался с App Router и попытался понять, где заканчивается практическая польза серверных компонентов и начинается усложнение архитектуры. Как вы решаете, что оставить на клиенте?', 'react', 'frontend_owl', 186, 31, 180],
  ['Вышел Python 3.14 — собрал самое интересное в одном месте', 'JIT, свободнопоточный режим, улучшения в typing и ещё несколько вещей, которые приятно попробовать. Уже обновили свои проекты?', 'python', 'pythonic', 124, 18, 360],
]
if (db.prepare('SELECT COUNT(*) AS count FROM posts').get().count === 0) {
  const insert = db.prepare(`INSERT INTO posts (title, content, topic, author, score, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', ?))`)
  const seed = db.transaction(() => {
    for (const [title, content, topic, author, score, , minutes] of samplePosts) {
      insert.run(title, content, topic, author, score, `-${minutes} minutes`)
    }
  })
  seed()
}

const postSelect = `SELECT p.id, p.title, p.content, p.topic, p.author_id, p.author, p.created_at,
  p.score + COALESCE((SELECT SUM(v.value) FROM votes v WHERE v.post_id = p.id), 0) AS score,
  0 AS comments FROM posts p`
const getUser = db.prepare('SELECT id, username, email, role FROM users WHERE id = ?')
const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(value))
}
const readBody = async req => {
  let text = ''
  for await (const chunk of req) {
    text += chunk
    if (text.length > 1_000_000) throw Object.assign(new Error('Запрос слишком большой'), { status: 413 })
  }
  try { return text ? JSON.parse(text) : {} } catch { throw Object.assign(new Error('Некорректный JSON'), { status: 400 }) }
}
const requireUser = req => {
  const authorization = req.headers.authorization ?? ''
  if (!authorization.startsWith('Bearer ')) throw Object.assign(new Error('Войдите в аккаунт, чтобы продолжить'), { status: 401 })
  try {
    const payload = jwt.verify(authorization.slice(7), secret)
    const user = getUser.get(payload.sub)
    if (!user) throw new Error('Account no longer exists')
    return user
  } catch {
    throw Object.assign(new Error('Сессия истекла. Войдите снова.'), { status: 401 })
  }
}
const requireAdmin = req => {
  const user = requireUser(req)
  if (user.role !== 'admin') throw Object.assign(new Error('Доступ разрешён только администраторам'), { status: 403 })
  return user
}
const pagination = (url, total) => {
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get('pageSize') ?? '10', 10) || 10))
  const totalPages = Math.ceil(total / pageSize)
  const requestedPage = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
  return { page: totalPages ? Math.min(requestedPage, totalPages) : 1, pageSize, total, totalPages }
}
const postById = db.prepare(`${postSelect} WHERE p.id = ?`)
const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  try {
    if (req.method === 'GET' && path === '/api/health') return json(res, 200, { status: 'ok' })
    if (req.method === 'POST' && (path === '/api/auth/register' || path === '/api/auth/login')) {
      const body = await readBody(req)
      const register = path.endsWith('/register')
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      const password = typeof body.password === 'string' ? body.password : ''
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw Object.assign(new Error('Введите корректный адрес электронной почты'), { status: 400 })
      if (password.length < 8 || password.length > 72) throw Object.assign(new Error('Пароль должен содержать от 8 до 72 символов'), { status: 400 })
      let user
      if (register) {
        const username = typeof body.username === 'string' ? body.username.trim() : ''
        if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) throw Object.assign(new Error('Никнейм: 3–24 символа, только латиница, цифры и _'), { status: 400 })
        try {
          const result = db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)').run(username, email, await bcrypt.hash(password, 12))
          user = getUser.get(Number(result.lastInsertRowid))
        } catch (error) {
          if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') throw Object.assign(new Error('Этот никнейм или адрес уже зарегистрирован'), { status: 409 })
          throw error
        }
      } else {
        const record = db.prepare('SELECT id, password_hash FROM users WHERE email = ? COLLATE NOCASE').get(email)
        if (!record || !(await bcrypt.compare(password, record.password_hash))) throw Object.assign(new Error('Неверная почта или пароль'), { status: 401 })
        user = getUser.get(record.id)
      }
      const token = jwt.sign({}, secret, { subject: String(user.id), expiresIn: '7d' })
      return json(res, register ? 201 : 200, { user, token })
    }
    if (req.method === 'GET' && path === '/api/auth/me') return json(res, 200, requireUser(req))

    if (path.startsWith('/api/admin/')) {
      const admin = requireAdmin(req)
      if (req.method === 'GET' && path === '/api/admin/users') {
        const query = url.searchParams.get('q')?.trim() ?? ''
        const where = query ? 'WHERE username LIKE ? OR email LIKE ?' : ''
        const values = query ? [`%${query}%`, `%${query}%`] : []
        const total = db.prepare(`SELECT COUNT(*) AS count FROM users ${where}`).get(...values).count
        const pageInfo = pagination(url, total)
        const users = db.prepare(`SELECT id, username, email, role, created_at FROM users ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
          .all(...values, pageInfo.pageSize, (pageInfo.page - 1) * pageInfo.pageSize)
        return json(res, 200, { ...pageInfo, items: users })
      }
      const userMatch = path.match(/^\/api\/admin\/users\/(\d+)$/)
      if (userMatch) {
        const userId = Number(userMatch[1])
        const target = getUser.get(userId)
        if (!target) throw Object.assign(new Error('Пользователь не найден'), { status: 404 })
        if (req.method === 'PATCH') {
          const { role } = await readBody(req)
          if (role !== 'admin' && role !== 'member') throw Object.assign(new Error('Неизвестная роль пользователя'), { status: 400 })
          if (target.role === 'admin' && role === 'member') {
            const admins = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get().count
            if (admins <= 1) throw Object.assign(new Error('Нельзя снять роль у последнего администратора'), { status: 409 })
          }
          db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId)
          return json(res, 200, db.prepare('SELECT id, username, email, role, created_at FROM users WHERE id = ?').get(userId))
        }
        if (req.method === 'DELETE') {
          if (userId === admin.id) throw Object.assign(new Error('Нельзя удалить собственную учётную запись из панели'), { status: 409 })
          if (target.role === 'admin') throw Object.assign(new Error('Сначала снимите с пользователя роль администратора'), { status: 409 })
          db.prepare('DELETE FROM users WHERE id = ?').run(userId)
          return json(res, 200, { deleted: true })
        }
      }
      if (req.method === 'GET' && path === '/api/admin/posts') {
        const query = url.searchParams.get('q')?.trim() ?? ''
        const where = query ? 'WHERE p.title LIKE ? OR p.content LIKE ? OR p.author LIKE ?' : ''
        const values = query ? [`%${query}%`, `%${query}%`, `%${query}%`] : []
        const total = db.prepare(`SELECT COUNT(*) AS count FROM posts p ${where}`).get(...values).count
        const pageInfo = pagination(url, total)
        const posts = db.prepare(`${postSelect} ${where} ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`)
          .all(...values, pageInfo.pageSize, (pageInfo.page - 1) * pageInfo.pageSize)
        return json(res, 200, { ...pageInfo, items: posts })
      }
      const adminPostMatch = path.match(/^\/api\/admin\/posts\/(\d+)$/)
      if (adminPostMatch && req.method === 'DELETE') {
        const postId = Number(adminPostMatch[1])
        if (!postById.get(postId)) throw Object.assign(new Error('Публикация не найдена'), { status: 404 })
        db.prepare('DELETE FROM posts WHERE id = ?').run(postId)
        return json(res, 200, { deleted: true })
      }
      return json(res, 404, { error: 'Маршрут панели управления не найден' })
    }

    if (req.method === 'GET' && path === '/api/posts') {
      const conditions = []
      const values = []
      const topic = url.searchParams.get('topic')
      const query = url.searchParams.get('q')
      if (topic) { conditions.push('p.topic = ?'); values.push(topic) }
      if (query) { conditions.push('(p.title LIKE ? OR p.content LIKE ?)'); values.push(`%${query}%`, `%${query}%`) }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
      const order = url.searchParams.get('sort') === 'new' ? 'p.created_at DESC, p.id DESC' : 'score DESC, p.created_at DESC, p.id DESC'
      const pageSize = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get('pageSize') ?? '10', 10) || 10))
      const total = db.prepare(`SELECT COUNT(*) AS count FROM posts p ${where}`).get(...values).count
      const totalPages = Math.ceil(total / pageSize)
      const requestedPage = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
      const page = totalPages ? Math.min(requestedPage, totalPages) : 1
      const posts = db.prepare(`${postSelect} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
        .all(...values, pageSize, (page - 1) * pageSize)
      return json(res, 200, { items: posts, page, pageSize, total, totalPages })
    }
    const postMatch = path.match(/^\/api\/posts\/(\d+)(?:\/(vote))?$/)
    if (postMatch) {
      const id = Number(postMatch[1])
      const post = postById.get(id)
      if (!post) throw Object.assign(new Error('Публикация не найдена'), { status: 404 })
      if (req.method === 'GET' && !postMatch[2]) return json(res, 200, post)
      if (postMatch[2] === 'vote' && req.method === 'POST') {
        const user = requireUser(req)
        const { value } = await readBody(req)
        if (value !== 1 && value !== -1) throw Object.assign(new Error('Голос должен быть 1 или -1'), { status: 400 })
        db.prepare(`INSERT INTO votes (user_id, post_id, value) VALUES (?, ?, ?)
          ON CONFLICT(user_id, post_id) DO UPDATE SET value = excluded.value`).run(user.id, id, value)
        return json(res, 200, { score: postById.get(id).score })
      }
      if (req.method === 'PATCH' && !postMatch[2]) {
        const user = requireUser(req)
        if (post.author_id !== user.id && user.role !== 'admin') throw Object.assign(new Error('Редактировать публикацию может только её автор'), { status: 403 })
        const body = await readBody(req)
        const title = typeof body.title === 'string' ? body.title.trim() : post.title
        const content = typeof body.content === 'string' ? body.content.trim() : post.content
        const topic = typeof body.topic === 'string' ? body.topic : post.topic
        if (!title || title.length > 160) throw Object.assign(new Error('Заголовок должен содержать от 1 до 160 символов'), { status: 400 })
        if (!content || content.length > 10_000) throw Object.assign(new Error('Текст должен содержать от 1 до 10 000 символов'), { status: 400 })
        if (!/^[a-z0-9_-]{2,32}$/.test(topic)) throw Object.assign(new Error('Некорректное название сообщества'), { status: 400 })
        db.prepare('UPDATE posts SET title = ?, content = ?, topic = ? WHERE id = ?').run(title, content, topic, id)
        return json(res, 200, postById.get(id))
      }
      if (req.method === 'DELETE' && !postMatch[2]) {
        const user = requireUser(req)
        if (post.author_id !== user.id && user.role !== 'admin') throw Object.assign(new Error('Удалить публикацию может только её автор'), { status: 403 })
        db.prepare('DELETE FROM posts WHERE id = ?').run(id)
        return json(res, 200, { deleted: true })
      }
    }
    if (req.method === 'POST' && path === '/api/posts') {
      const user = requireUser(req)
      const body = await readBody(req)
      const title = typeof body.title === 'string' ? body.title.trim() : ''
      const content = typeof body.content === 'string' ? body.content.trim() : ''
      const topic = typeof body.topic === 'string' ? body.topic : ''
      if (!title || title.length > 160) throw Object.assign(new Error('Заголовок должен содержать от 1 до 160 символов'), { status: 400 })
      if (!content || content.length > 10_000) throw Object.assign(new Error('Текст должен содержать от 1 до 10 000 символов'), { status: 400 })
      if (!/^[a-z0-9_-]{2,32}$/.test(topic)) throw Object.assign(new Error('Некорректное название сообщества'), { status: 400 })
      const result = db.prepare('INSERT INTO posts (title, content, topic, author_id, author) VALUES (?, ?, ?, ?, ?)').run(title, content, topic, user.id, user.username)
      return json(res, 201, postById.get(Number(result.lastInsertRowid)))
    }
    return json(res, 404, { error: 'Маршрут не найден' })
  } catch (error) {
    const status = Number(error.status) || 500
    if (status >= 500) console.error(error)
    return json(res, status, { error: status >= 500 ? 'Внутренняя ошибка сервера' : error.message })
  }
})

server.listen(port, () => console.log(`devroom API is listening on http://localhost:${port}`))
