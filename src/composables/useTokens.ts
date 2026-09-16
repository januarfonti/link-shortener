import { ref } from 'vue'
import type { ApiToken, CreatedApiToken, ApiResponse } from '../types'

const API_BASE = '/api/tokens'

export function useTokens() {
  const tokens = ref<ApiToken[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchTokens() {
    loading.value = true
    error.value = null

    try {
      const response = await fetch(API_BASE)
      const data: ApiResponse<ApiToken[]> = await response.json()

      if (data.success && data.data) {
        tokens.value = data.data
      } else {
        error.value = data.error || 'Failed to fetch tokens'
      }
    } catch (e) {
      error.value = 'Network error. Please try again.'
      console.error('Fetch tokens error:', e)
    } finally {
      loading.value = false
    }
  }

  // Returns the raw token. It is shown once and never stored in state.
  async function createToken(name: string): Promise<string | null> {
    loading.value = true
    error.value = null

    try {
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data: ApiResponse<CreatedApiToken> = await response.json()

      if (data.success && data.data) {
        tokens.value = [data.data.record, ...tokens.value]
        return data.data.token
      } else {
        error.value = data.error || 'Failed to create token'
        return null
      }
    } catch (e) {
      error.value = 'Network error. Please try again.'
      console.error('Create token error:', e)
      return null
    } finally {
      loading.value = false
    }
  }

  async function revokeToken(id: number): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      const response = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' })
      const data: ApiResponse<never> = await response.json()

      if (data.success) {
        await fetchTokens()
        return true
      } else {
        error.value = data.error || 'Failed to revoke token'
        return false
      }
    } catch (e) {
      error.value = 'Network error. Please try again.'
      console.error('Revoke token error:', e)
      return false
    } finally {
      loading.value = false
    }
  }

  function clearError() {
    error.value = null
  }

  return {
    tokens,
    loading,
    error,
    fetchTokens,
    createToken,
    revokeToken,
    clearError,
  }
}
