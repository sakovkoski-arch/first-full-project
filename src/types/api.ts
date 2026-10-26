export type UserRole = 'member' | 'admin'

export interface User {
  id: number
  username: string
  email: string
  role: UserRole
}

export interface AdminUser extends User {
  created_at: string
}

export interface Post {
  id: number
  title: string
  content: string
  topic: string
  author_id: number | null
  author: string
  created_at: string
  score: number
  comments: number
}

export interface PaginatedResponse<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface ApiErrorResponse {
  error: string
}

export interface AuthResponse {
  user: User
  token: string
}

export interface VoteResponse {
  score: number
}
