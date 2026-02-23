import { ref } from 'vue'
import type { Link, LinkWithAnalytics, CreateLinkRequest, UpdateLinkRequest, ApiResponse } from '../types'

const API_BASE = '/api/links'

export function useLinks() {
  const links = ref<Link[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchLinks() {
    loading.value = true
    error.value = null

    try {
      const response = await fetch(API_BASE)
      const data: ApiResponse<Link[]> = await response.json()

      if (data.success && data.data) {
        links.value = data.data
      } else {
        error.value = data.error || 'Failed to fetch links'
      }
    } catch (e) {
      error.value = 'Network error. Please try again.'
      console.error('Fetch links error:', e)
    } finally {
      loading.value = false
    }
  }

  async function createLink(request: CreateLinkRequest): Promise<Link | null> {
    loading.value = true
    error.value = null

    try {
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      const data: ApiResponse<Link> = await response.json()

      if (data.success && data.data) {
        links.value = [data.data, ...links.value]
        return data.data
      } else {
        error.value = data.error || 'Failed to create link'
        return null
      }
    } catch (e) {
      error.value = 'Network error. Please try again.'
      console.error('Create link error:', e)
      return null
    } finally {
      loading.value = false
    }
  }

  async function updateLink(id: number, request: UpdateLinkRequest): Promise<Link | null> {
    loading.value = true
    error.value = null

    try {
      const response = await fetch(`${API_BASE}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      const data: ApiResponse<Link> = await response.json()

      if (data.success && data.data) {
        const index = links.value.findIndex(l => l.id === id)
        if (index !== -1) {
          links.value[index] = data.data
        }
        return data.data
      } else {
        error.value = data.error || 'Failed to update link'
        return null
      }
    } catch (e) {
      error.value = 'Network error. Please try again.'
      console.error('Update link error:', e)
      return null
    } finally {
      loading.value = false
    }
  }

  async function deleteLink(id: number): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      const response = await fetch(`${API_BASE}/${id}`, {
        method: 'DELETE',
      })
      const data: ApiResponse<{ id: number }> = await response.json()

      if (data.success) {
        links.value = links.value.filter(l => l.id !== id)
        return true
      } else {
        error.value = data.error || 'Failed to delete link'
        return false
      }
    } catch (e) {
      error.value = 'Network error. Please try again.'
      console.error('Delete link error:', e)
      return false
    } finally {
      loading.value = false
    }
  }

  async function getLinkWithAnalytics(id: number): Promise<LinkWithAnalytics | null> {
    try {
      const response = await fetch(`${API_BASE}/${id}`)
      const data: ApiResponse<LinkWithAnalytics> = await response.json()

      if (data.success && data.data) {
        return data.data
      } else {
        error.value = data.error || 'Failed to fetch analytics'
        return null
      }
    } catch (e) {
      error.value = 'Network error. Please try again.'
      console.error('Get analytics error:', e)
      return null
    }
  }

  function clearError() {
    error.value = null
  }

  return {
    links,
    loading,
    error,
    fetchLinks,
    createLink,
    updateLink,
    deleteLink,
    getLinkWithAnalytics,
    clearError,
  }
}
