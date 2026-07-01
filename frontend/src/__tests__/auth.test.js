import { describe, it, expect, beforeEach } from 'vitest'
import { normalizeRole, landingFor, setAuthed, getRole, isAuthed, logout } from '../auth'

describe('auth helpers', () => {
  beforeEach(() => localStorage.clear())

  it('normalizeRole accepts known roles and rejects junk', () => {
    expect(normalizeRole('Teacher')).toBe('teacher')
    expect(normalizeRole('  STUDENT ')).toBe('student')
    expect(normalizeRole('wizard')).toBeNull()
    expect(normalizeRole('')).toBeNull()
  })

  it('landingFor routes by role', () => {
    expect(landingFor('admin')).toBe('/admin')
    expect(landingFor('teacher')).toBe('/manage-tests')
    expect(landingFor('student')).toBe('/exams')
    expect(landingFor(undefined)).toBe('/exams')
  })

  it('setAuthed / getRole / isAuthed round-trip through storage', () => {
    expect(isAuthed()).toBe(false)
    setAuthed('teacher', { userId: 7, name: 'T' })
    expect(isAuthed()).toBe(true)
    expect(getRole()).toBe('teacher')
    logout()
    expect(isAuthed()).toBe(false)
  })
})
