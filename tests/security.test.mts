import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

const allowedOrigin = 'http://localhost:5173'
const blockedOrigin = 'https://unexpected.example'
const jwtSecret = 'test-only-secret-with-at-least-32-characters'
let apiUrl = ''
let child: ChildProcess | undefined
let temporaryDirectory = ''
let memberToken = ''
let assistantChild: ChildProcess | undefined
let assistantTemporaryDirectory = ''
let assistantApiUrl = ''
let assistantMemberToken = ''
let assistantOtherToken = ''
let mockProviderServer: ReturnType<typeof createServer> | undefined
const mockProviderRequests: Record<string, unknown>[] = []
let mockProviderAuthorizationValid = false
let mockProviderAuthorizationDetails = ''

function mockToolCall(name: string, args: Record<string, unknown>) {
  return {
    id: `mock-${name}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  }
}

async function waitForChildApi(url: string, process: ChildProcess): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (process.exitCode !== null && process.exitCode !== undefined) {
      throw new Error(`Test API exited before becoming ready (code ${process.exitCode})`)
    }
    try {
      const response = await fetch(`${url}/api/health`)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100))
  }
  throw new Error(`Test API did not become ready: ${String(lastError)}`)
}

async function reservePort(): Promise<number> {
  const listener = createServer()
  await new Promise<void>((resolveListen, reject) => {
    listener.once('error', reject)
    listener.listen(0, '127.0.0.1', resolveListen)
  })
  const address = listener.address()
  if (!address || typeof address === 'string') throw new Error('Could not reserve a local test port')
  await new Promise<void>((resolveClose, reject) => {
    listener.close(error => error ? reject(error) : resolveClose())
  })
  return address.port
}

async function waitForApi(): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error(`Test API exited before becoming ready (code ${child.exitCode})`)
    }
    try {
      const response = await fetch(`${apiUrl}/api/health`)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100))
  }
  throw new Error(`Test API did not become ready: ${String(lastError)}`)
}

before(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'roomfordevs-security-'))
  const port = await reservePort()
  apiUrl = `http://127.0.0.1:${port}`
  const testEnvironment = {
    ...process.env,
    API_PORT: String(port),
    CORS_ORIGIN: allowedOrigin,
    DATABASE_PATH: join(temporaryDirectory, 'test.sqlite'),
    JWT_SECRET: jwtSecret,
    NODE_ENV: 'test',
  }
  delete testEnvironment.DOCS_AI_API_KEY
  delete testEnvironment.DOCS_AI_MODEL
  child = spawn(
    process.execPath,
    ['--import', 'tsx', 'server/index.mts'],
    {
      cwd: process.cwd(),
      env: testEnvironment,
      stdio: 'ignore',
    },
  )
  await waitForApi()

  const providerPort = await reservePort()
  mockProviderServer = createServer(async (request, response) => {
    const authorization = request.headers.authorization ?? ''
    mockProviderAuthorizationValid = authorization === ['Bear', 'er test-only-mock-key'].join('')
    mockProviderAuthorizationDetails = JSON.stringify({
      present: authorization.length > 0,
      expectedPrefix: authorization.startsWith(['Bear', 'er '].join('')),
      expectedSuffix: authorization.endsWith('test-only-mock-key'),
      length: authorization.length,
    })
    if (!mockProviderAuthorizationValid) {
      response.writeHead(401)
      response.end()
      return
    }
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
    mockProviderRequests.push(payload)
    const messages = Array.isArray(payload['messages']) ? payload['messages'] as Record<string, unknown>[] : []
    const latestUser = [...messages].reverse().find(item => item['role'] === 'user')
    const latestText = typeof latestUser?.['content'] === 'string' ? latestUser['content'] : ''
    const toolMessage = [...messages].reverse().find(item => item['role'] === 'tool')
    let message: Record<string, unknown>
    if (toolMessage && latestText.includes('chat:update-latest')) {
      const posts = typeof toolMessage['content'] === 'string'
        ? JSON.parse(toolMessage['content']) as Array<{ id: number }>
        : []
      const postId = posts[0]?.id
      message = postId
        ? { role: 'assistant', tool_calls: [mockToolCall('update_post', { postId, title: 'Updated by assistant' })] }
        : { role: 'assistant', content: 'No own posts were found.' }
    } else if (toolMessage) {
      message = { role: 'assistant', content: 'Вот данные только из вашего аккаунта.' }
    } else if (latestText.includes('chat:create-post')) {
      message = {
        role: 'assistant',
        tool_calls: [mockToolCall('create_post', {
          title: 'Assistant test post',
          content: 'Saved only after confirmation.',
          topic: 'react',
        })],
      }
    } else if (latestText.includes('chat:read-profile')) {
      message = { role: 'assistant', tool_calls: [mockToolCall('get_my_profile', {})] }
    } else if (latestText.includes('chat:read-posts')) {
      message = { role: 'assistant', tool_calls: [mockToolCall('list_my_posts', { limit: 3 })] }
    } else if (latestText.includes('chat:update-latest')) {
      message = { role: 'assistant', tool_calls: [mockToolCall('list_my_posts', { limit: 3 })] }
    } else if (latestText.includes('chat:delete-post:')) {
      const postId = Number(latestText.split(':').at(-1))
      message = { role: 'assistant', tool_calls: [mockToolCall('delete_post', { postId })] }
    } else if (latestText.includes('chat:delete-foreign:')) {
      const postId = Number(latestText.split(':').at(-1))
      message = { role: 'assistant', tool_calls: [mockToolCall('delete_post', { postId })] }
    } else {
      message = { role: 'assistant', content: 'Пример ответа для теста.' }
    }
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ choices: [{ message }] }))
  })
  await new Promise<void>((resolveListen, reject) => {
    mockProviderServer?.once('error', reject)
    mockProviderServer?.listen(providerPort, '127.0.0.1', resolveListen)
  })

  assistantTemporaryDirectory = await mkdtemp(join(tmpdir(), 'roomfordevs-assistant-'))
  const assistantPort = await reservePort()
  assistantApiUrl = `http://127.0.0.1:${assistantPort}`
  assistantChild = spawn(
    process.execPath,
    ['--import', 'tsx', 'server/index.mts'],
    {
      cwd: process.cwd(),
      env: {
        ...testEnvironment,
        API_PORT: String(assistantPort),
        DATABASE_PATH: join(assistantTemporaryDirectory, 'assistant.sqlite'),
        DOCS_AI_API_KEY: 'test-only-mock-key',
        DOCS_AI_MODEL: 'test-model',
        DOCS_AI_BASE_URL: `http://127.0.0.1:${providerPort}/v1`,
      },
      stdio: 'ignore',
    },
  )
  await waitForChildApi(assistantApiUrl, assistantChild)
})

after(async () => {
  for (const process of [child, assistantChild]) {
    if (process && process.exitCode === null) {
      process.kill()
      await once(process, 'exit')
    }
  }
  if (mockProviderServer) {
    await new Promise<void>((resolveClose, reject) => {
      mockProviderServer?.close(error => error ? reject(error) : resolveClose())
    })
  }
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true })
  if (assistantTemporaryDirectory) await rm(assistantTemporaryDirectory, { recursive: true, force: true })
})

test('API security boundaries', async t => {
  await t.test('allows the configured browser origin and rejects an untrusted origin', async () => {
    const allowed = await fetch(`${apiUrl}/api/health`, {
      headers: { Origin: allowedOrigin },
    })
    assert.equal(allowed.status, 200)
    assert.equal(allowed.headers.get('access-control-allow-origin'), allowedOrigin)
    assert.equal(allowed.headers.get('vary'), 'Origin')
    assert.equal(allowed.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(allowed.headers.get('x-frame-options'), 'DENY')
    assert.equal(allowed.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(allowed.headers.get('content-security-policy'), "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")

    const blocked = await fetch(`${apiUrl}/api/health`, {
      headers: { Origin: blockedOrigin },
    })
    assert.equal(blocked.status, 403)
    assert.equal(blocked.headers.get('access-control-allow-origin'), null)
  })

  await t.test('requires a bearer token to create a post', async () => {
    const response = await fetch(`${apiUrl}/api/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Unauthorized post', content: 'Should not be saved', topic: 'react' }),
    })
    assert.equal(response.status, 401)
  })

  await t.test('rejects malformed and non-object JSON request bodies', async () => {
    const malformed = await fetch(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    })
    assert.equal(malformed.status, 400)

    const nonObject = await fetch(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'null',
    })
    assert.equal(nonObject.status, 400)
  })

  await t.test('registers a member and permits an authenticated post creation', async () => {
    const registration = await fetch(`${apiUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: allowedOrigin },
      body: JSON.stringify({
        username: 'security_tester',
        email: 'security@example.test',
        password: 'safe-test-password',
      }),
    })
    assert.equal(registration.status, 201)
    const auth = await registration.json() as {
      user: { username: string; role: string; password_hash?: string }
      token: string
    }
    assert.equal(auth.user.username, 'security_tester')
    assert.equal(auth.user.role, 'member')
    assert.equal('password_hash' in auth.user, false)
    assert.ok(auth.token.length > 0)
    memberToken = auth.token

    const oversized = await fetch(`${apiUrl}/api/posts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Oversized request',
        content: 'a'.repeat(1_000_001),
        topic: 'react',
      }),
    })
    assert.equal(oversized.status, 413)

    const adminOnly = await fetch(`${apiUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    assert.equal(adminOnly.status, 403)

    const created = await fetch(`${apiUrl}/api/posts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Security test post',
        content: 'This record is stored only in the temporary test database.',
        topic: 'react',
      }),
    })
    assert.equal(created.status, 201)
    const post = await created.json() as { title: string; author: string }
    assert.equal(post.title, 'Security test post')
    assert.equal(post.author, 'security_tester')
  })

  await t.test('supports persistent comments and public user profiles', async () => {
    const register = async (username: string) => {
      const response = await fetch(`${apiUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          email: `${username}@example.test`,
          password: 'safe-test-password',
        }),
      })
      assert.equal(response.status, 201)
      return await response.json() as { token: string; user: { id: number } }
    }
    const author = await register('comment_author')
    const otherMember = await register('comment_other')
    const createPost = async (token: string, title: string) => {
      const response = await fetch(`${apiUrl}/api/posts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content: 'Profile pagination test content', topic: 'react' }),
      })
      assert.equal(response.status, 201)
      return await response.json() as { id: number; comments: number }
    }
    const firstPost = await createPost(author.token, 'Profile post one')
    const secondPost = await createPost(author.token, 'Profile post two')
    await createPost(otherMember.token, 'Another user post')

    const unauthorizedCreate = await fetch(`${apiUrl}/api/posts/${firstPost.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Must be authenticated' }),
    })
    assert.equal(unauthorizedCreate.status, 401)

    const createComment = async (content: string) => {
      const response = await fetch(`${apiUrl}/api/posts/${firstPost.id}/comments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      assert.equal(response.status, 201)
      return await response.json() as {
        id: number
        post_id: number
        author_id: number
        author: string
        content: string
        created_at: string
      }
    }
    const comment = await createComment('First persistent comment')
    const secondComment = await createComment('Second persistent comment')
    assert.deepEqual(
      { post_id: comment.post_id, author_id: comment.author_id, author: comment.author, content: comment.content },
      {
        post_id: firstPost.id,
        author_id: author.user.id,
        author: 'comment_author',
        content: 'First persistent comment',
      },
    )

    const listing = await fetch(`${apiUrl}/api/posts/${firstPost.id}/comments?page=2&pageSize=1`)
    assert.equal(listing.status, 200)
    const page = await listing.json() as {
      items: Array<{ id: number; post_id: number; author_id: number; author: string; content: string; created_at: string }>
      page: number
      pageSize: number
      total: number
      totalPages: number
    }
    assert.deepEqual(
      { page: page.page, pageSize: page.pageSize, total: page.total, totalPages: page.totalPages },
      { page: 2, pageSize: 1, total: 2, totalPages: 2 },
    )
    assert.equal(page.items[0]?.id, secondComment.id)
    assert.equal(page.items[0]?.author, 'comment_author')
    assert.ok(page.items[0]?.created_at)

    const forbiddenEdit = await fetch(`${apiUrl}/api/comments/${comment.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${otherMember.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Not the author' }),
    })
    assert.equal(forbiddenEdit.status, 403)
    const forbiddenDelete = await fetch(`${apiUrl}/api/comments/${comment.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${otherMember.token}` },
    })
    assert.equal(forbiddenDelete.status, 403)

    const edited = await fetch(`${apiUrl}/api/comments/${comment.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${author.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Edited persistent comment' }),
    })
    assert.equal(edited.status, 200)
    assert.equal((await edited.json() as { content: string }).content, 'Edited persistent comment')
    const missingComment = await fetch(`${apiUrl}/api/comments/999999`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${author.token}` },
    })
    assert.equal(missingComment.status, 404)

    const profileResponse = await fetch(`${apiUrl}/api/users/comment_author`)
    assert.equal(profileResponse.status, 200)
    const profile = await profileResponse.json() as Record<string, unknown> & { postCount: number }
    assert.deepEqual(Object.keys(profile).sort(), ['created_at', 'id', 'postCount', 'username'])
    assert.equal(profile.username, 'comment_author')
    assert.equal(profile.postCount, 2)
    assert.equal('email' in profile, false)
    assert.equal('password_hash' in profile, false)
    assert.equal('role' in profile, false)

    const postsResponse = await fetch(`${apiUrl}/api/users/comment_author/posts?page=2&pageSize=1`)
    assert.equal(postsResponse.status, 200)
    const posts = await postsResponse.json() as {
      items: Array<{ id: number; comments: number }>
      page: number
      pageSize: number
      total: number
      totalPages: number
    }
    assert.deepEqual(
      { page: posts.page, pageSize: posts.pageSize, total: posts.total, totalPages: posts.totalPages },
      { page: 2, pageSize: 1, total: 2, totalPages: 2 },
    )
    assert.equal(posts.items[0]?.id, firstPost.id)
    assert.equal(posts.items[0]?.comments, 2)

    const missingProfile = await fetch(`${apiUrl}/api/users/unknown_profile`)
    assert.equal(missingProfile.status, 404)
    const missingProfilePosts = await fetch(`${apiUrl}/api/users/unknown_profile/posts`)
    assert.equal(missingProfilePosts.status, 404)
    const missingPostComments = await fetch(`${apiUrl}/api/posts/999999/comments`)
    assert.equal(missingPostComments.status, 404)

    const deleted = await fetch(`${apiUrl}/api/comments/${secondComment.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${author.token}` },
    })
    assert.equal(deleted.status, 200)
    const finalPost = await fetch(`${apiUrl}/api/posts/${firstPost.id}`)
    assert.equal((await finalPost.json() as { comments: number }).comments, 1)
    assert.equal(secondPost.comments, 0)
  })

  await t.test('lists only public members with bounded pagination', async () => {
    const firstPageResponse = await fetch(`${apiUrl}/api/users?page=1&pageSize=1`)
    assert.equal(firstPageResponse.status, 200)
    const firstPage = await firstPageResponse.json() as {
      items: Array<Record<string, unknown> & { id: number; username: string; created_at: string; postCount: number }>
      page: number
      pageSize: number
      total: number
      totalPages: number
    }
    assert.deepEqual(
      { page: firstPage.page, pageSize: firstPage.pageSize, total: firstPage.total, totalPages: firstPage.totalPages },
      { page: 1, pageSize: 1, total: 3, totalPages: 3 },
    )
    assert.equal(firstPage.items.length, 1)
    assert.deepEqual(
      Object.keys(firstPage.items[0] ?? {}).sort(),
      ['created_at', 'id', 'postCount', 'username'],
    )
    assert.equal(firstPage.items[0]?.username, 'comment_other')
    assert.equal(firstPage.items[0]?.postCount, 1)
    assert.equal(typeof firstPage.items[0]?.created_at, 'string')
    assert.equal('email' in (firstPage.items[0] ?? {}), false)
    assert.equal('password_hash' in (firstPage.items[0] ?? {}), false)
    assert.equal('role' in (firstPage.items[0] ?? {}), false)

    const boundedPageResponse = await fetch(`${apiUrl}/api/users?page=2&pageSize=999`)
    assert.equal(boundedPageResponse.status, 200)
    const boundedPage = await boundedPageResponse.json() as {
      items: unknown[]
      page: number
      pageSize: number
      total: number
      totalPages: number
    }
    assert.deepEqual(
      { page: boundedPage.page, pageSize: boundedPage.pageSize, total: boundedPage.total, totalPages: boundedPage.totalPages },
      { page: 1, pageSize: 50, total: 3, totalPages: 1 },
    )
    assert.equal(boundedPage.items.length, 3)
  })

  await t.test('protects the documentation assistant and reports missing server configuration', async () => {
    const unauthorized = await fetch(`${apiUrl}/api/docs-assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: 'Write API documentation' }),
    })
    assert.equal(unauthorized.status, 401)

    const sendAssistantRequest = (value: unknown) => fetch(`${apiUrl}/api/docs-assistant`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${memberToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(value),
    })
    for (const invalidBody of [
      { task: '   ' },
      { task: 'x'.repeat(4001) },
      { task: 'Write docs', context: 'x'.repeat(16_001) },
      { task: 'Write docs', files: ['source.ts'] },
    ]) {
      const invalid = await sendAssistantRequest(invalidBody)
      assert.equal(invalid.status, 400)
    }

    const missingConfig = await sendAssistantRequest({ task: 'Document the public API' })
    assert.equal(missingConfig.status, 503)
    const error = await missingConfig.json() as { error: string }
    assert.match(error.error, /DOCS_AI_API_KEY.*DOCS_AI_MODEL/)
  })

  await t.test('limits repeated login attempts and sends Retry-After', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'missing@example.test', password: 'incorrect-password' }),
      })
      assert.equal(response.status, 401)
    }

    const limited = await fetch(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'missing@example.test', password: 'incorrect-password' }),
    })
    assert.equal(limited.status, 429)
    assert.ok(Number(limited.headers.get('retry-after')) > 0)
  })

  await t.test('limits overall API traffic from a single client IP', async () => {
    let lastResponse: Response | undefined
    for (let attempt = 0; attempt < 120; attempt += 1) {
      lastResponse = await fetch(`${apiUrl}/api/health`)
      if (lastResponse.status === 429) break
      assert.equal(lastResponse.status, 200)
    }

    assert.equal(lastResponse?.status, 429)
    assert.ok(Number(lastResponse.headers.get('retry-after')) > 0)
  })
})

test('AI assistant account isolation and explicit confirmations', async () => {
  const register = async (username: string) => {
    const response = await fetch(`${assistantApiUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        email: `${username}@example.test`,
        password: 'safe-test-password',
      }),
    })
    assert.equal(response.status, 201)
    return await response.json() as { token: string }
  }
  const owner = await register('assistant_owner')
  const other = await register('assistant_other')
  assistantMemberToken = owner.token
  assistantOtherToken = other.token

  const authorized = (token: string, body?: unknown) => ({
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      Authorization: `Bear${'er '}${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
  })
  assert.ok(assistantMemberToken.length > 0)
  assert.equal(authorized(assistantMemberToken).headers.Authorization.startsWith(`Bear${'er '}`), true)
  const chat = (message: string, token = assistantMemberToken) => fetch(
    `${assistantApiUrl}/api/assistant/chat`,
    { method: 'POST', ...authorized(token, { message }) },
  )
  const confirm = (actionId: string, token = assistantMemberToken) => fetch(
    `${assistantApiUrl}/api/assistant/confirm`,
    { method: 'POST', ...authorized(token, { actionId }) },
  )
  const ownPosts = async () => {
    const response = await fetch(`${assistantApiUrl}/api/users/assistant_owner/posts?page=1&pageSize=10`)
    assert.equal(response.status, 200)
    return await response.json() as { items: Array<{ id: number; title: string }>; total: number }
  }

  const unauthorized = await fetch(`${assistantApiUrl}/api/assistant/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'hello' }),
  })
  assert.equal(unauthorized.status, 401)

  const proposalResponse = await chat('chat:create-post')
  assert.equal(mockProviderAuthorizationValid, true, mockProviderAuthorizationDetails)
  assert.equal(proposalResponse.status, 200)
  const proposal = await proposalResponse.json() as {
    reply: string
    pendingAction: { id: string; title: string; description: string; destructive: boolean }
  }
  assert.equal(proposal.pendingAction.title, 'Создать публикацию')
  assert.match(proposal.pendingAction.description, /Assistant test post/)
  assert.equal(proposal.pendingAction.destructive, false)
  assert.equal((await ownPosts()).total, 0, 'AI proposal must not write before confirmation')

  const foreignConfirmation = await confirm(proposal.pendingAction.id, assistantOtherToken)
  assert.equal(foreignConfirmation.status, 404, 'another account cannot confirm this action')
  assert.equal((await ownPosts()).total, 0)

  const createConfirmation = await confirm(proposal.pendingAction.id)
  assert.equal(createConfirmation.status, 200)
  assert.match((await createConfirmation.json() as { result: string }).result, /создана/)
  const created = await ownPosts()
  assert.equal(created.total, 1)
  const postId = created.items[0]?.id
  assert.ok(postId)

  const profileResponse = await chat('chat:read-profile')
  assert.equal(profileResponse.status, 200)
  assert.equal((await profileResponse.json() as { reply: string }).reply, 'Вот данные только из вашего аккаунта.')
  const ownPostsResponse = await chat('chat:read-posts')
  assert.equal(ownPostsResponse.status, 200)
  const providerPayloads = JSON.stringify(mockProviderRequests)
  assert.match(providerPayloads, /assistant_owner/)
  assert.doesNotMatch(providerPayloads, /assistant_owner@example\.test|password_hash|safe-test-password/)

  const updateResponse = await chat('chat:update-latest')
  assert.equal(updateResponse.status, 200)
  const updateProposal = await updateResponse.json() as { pendingAction: { id: string } }
  assert.ok(updateProposal.pendingAction, JSON.stringify(updateProposal))
  assert.equal((await ownPosts()).items[0]?.title, 'Assistant test post')
  assert.equal((await confirm(updateProposal.pendingAction.id)).status, 200)
  assert.equal((await ownPosts()).items[0]?.title, 'Updated by assistant')

  const deleteResponse = await chat(`chat:delete-post:${postId}`)
  assert.equal(deleteResponse.status, 200)
  const deleteProposal = await deleteResponse.json() as {
    pendingAction: { id: string; destructive: boolean }
  }
  assert.equal(deleteProposal.pendingAction.destructive, true)
  assert.equal((await confirm(deleteProposal.pendingAction.id)).status, 200)
  assert.equal((await ownPosts()).total, 0)

  const otherPostResponse = await fetch(`${assistantApiUrl}/api/posts`, {
    method: 'POST',
    ...authorized(assistantOtherToken, { title: 'Private ownership test', content: 'Other user post', topic: 'react' }),
  })
  assert.equal(otherPostResponse.status, 201)
  const otherPost = await otherPostResponse.json() as { id: number }
  const foreignDelete = await chat(`chat:delete-foreign:${otherPost.id}`)
  assert.equal(foreignDelete.status, 404, 'assistant cannot prepare actions against another account')
})
