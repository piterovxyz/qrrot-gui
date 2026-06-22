import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('cn utility function', () => {
  it('should merge standard string classes', () => {
    expect(cn('class1', 'class2')).toBe('class1 class2')
  })

  it('should merge object-based conditional classes', () => {
    expect(cn('class1', { class2: true, class3: false })).toBe('class1 class2')
  })

  it('should correctly merge conflicting Tailwind classes', () => {
    // Tailwind classes: p-2 (padding: 0.5rem) and p-4 (padding: 1rem)
    // tailwind-merge should prefer the latter one.
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })

  it('should handle undefined, null, and empty inputs gracefully', () => {
    expect(cn('class1', undefined, null, '', 'class2')).toBe('class1 class2')
  })

  it('should combine conditional and conflicting classes', () => {
    expect(cn('bg-red-500', { 'bg-blue-500': true })).toBe('bg-blue-500')
    expect(cn('bg-red-500', { 'bg-blue-500': false })).toBe('bg-red-500')
  })
})
