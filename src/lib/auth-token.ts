const AUTH_TOKEN_KEY = 'roomfordevs_token'
const LEGACY_AUTH_TOKEN_KEY = 'devroom_token'

export function getAuthToken() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  const legacyToken = localStorage.getItem(LEGACY_AUTH_TOKEN_KEY)

  if (token) {
    if (legacyToken) localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY)
    return token
  }

  if (legacyToken) {
    localStorage.setItem(AUTH_TOKEN_KEY, legacyToken)
    localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY)
    return legacyToken
  }

  return null
}

export function saveAuthToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_KEY, token)
  localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY)
}

export function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY)
}
