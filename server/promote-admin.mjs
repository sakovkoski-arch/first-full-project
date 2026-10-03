import 'dotenv/config'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'

const email = process.argv[2]?.trim().toLowerCase()
if (!email) {
  console.error('Usage: npm run admin:promote -- user@example.com')
  process.exitCode = 1
} else {
  const databasePath = resolve(process.env.DATABASE_PATH ?? 'data/devroom.sqlite')
  const db = new Database(databasePath)
  try {
    const columns = db.pragma('table_info(users)')
    if (columns.length === 0) throw new Error('Database is not initialized. Start the API once before promoting an administrator.')
    if (!columns.some(column => column.name === 'role')) {
      db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin'))")
    }
    const user = db.prepare('SELECT id, username, email FROM users WHERE email = ? COLLATE NOCASE').get(email)
    if (!user) throw new Error(`No account found for ${email}. Register that account before promoting it.`)
    const result = db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(user.id)
    if (result.changes !== 1) throw new Error(`Failed to promote ${email}.`)
    console.log(`Granted administrator access to ${user.username} (${user.email}).`)
  } finally {
    db.close()
  }
}
