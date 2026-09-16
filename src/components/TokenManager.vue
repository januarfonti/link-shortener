<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useTokens } from '../composables/useTokens'
import type { ApiToken } from '../types'

const { tokens, loading, error, fetchTokens, createToken, revokeToken, clearError } = useTokens()

const name = ref('')
const newToken = ref<string | null>(null)
const copied = ref(false)

onMounted(() => {
  fetchTokens()
})

async function handleCreate() {
  const token = await createToken(name.value.trim())
  if (token) {
    newToken.value = token
    name.value = ''
  }
}

async function copyToken() {
  if (!newToken.value) return
  await navigator.clipboard.writeText(newToken.value)
  copied.value = true
}

function closeTokenDialog() {
  newToken.value = null
  copied.value = false
}

async function handleRevoke(token: ApiToken) {
  if (confirm(`Revoke "${token.name}"? Agents using it will stop working immediately.`)) {
    await revokeToken(token.id)
  }
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Never'
  // D1 returns UTC timestamps without a timezone marker
  return new Date(dateString.replace(' ', 'T') + 'Z').toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <section class="mt-10">
    <div class="mb-4">
      <h2 class="text-lg font-semibold text-gray-900">API Tokens</h2>
      <p class="text-sm text-gray-500">
        Tokens let AI agents manage links through the MCP endpoint at <code class="text-gray-700">/mcp</code>.
      </p>
    </div>

    <!-- Error Alert -->
    <div
      v-if="error"
      class="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between"
    >
      <span>{{ error }}</span>
      <button @click="clearError" class="text-red-500 hover:text-red-700">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Create Form -->
    <form @submit.prevent="handleCreate" class="mb-4 flex flex-col sm:flex-row gap-3">
      <input
        v-model="name"
        type="text"
        required
        maxlength="50"
        placeholder="Token name, e.g. hermes"
        class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
      <button
        type="submit"
        :disabled="loading || !name.trim()"
        class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
      >
        Create Token
      </button>
    </form>

    <!-- Token List -->
    <div class="bg-white shadow-sm rounded-lg overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Token</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Used</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-if="tokens.length === 0">
            <td colspan="6" class="px-6 py-8 text-center text-sm text-gray-500">
              No tokens yet. Create one to connect an AI agent.
            </td>
          </tr>
          <tr v-for="token in tokens" :key="token.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{{ token.name }}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">{{ token.prefix }}…</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ formatDate(token.created_at) }}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ formatDate(token.last_used_at) }}</td>
            <td class="px-6 py-4 whitespace-nowrap">
              <span
                v-if="token.revoked_at"
                class="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600"
              >Revoked</span>
              <span
                v-else
                class="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700"
              >Active</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
              <button
                v-if="!token.revoked_at"
                @click="handleRevoke(token)"
                :disabled="loading"
                class="text-red-600 hover:text-red-900 disabled:opacity-50"
              >
                Revoke
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- One-time Token Dialog -->
    <div v-if="newToken" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div class="bg-white rounded-lg shadow-xl max-w-lg w-full">
        <div class="px-6 py-4 border-b border-gray-200">
          <h2 class="text-lg font-semibold text-gray-900">Copy your new token</h2>
        </div>
        <div class="p-6 space-y-4">
          <p class="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            You won't see this token again. Store it in your agent's config now.
          </p>
          <code class="block w-full break-all bg-gray-100 rounded-lg px-3 py-2 text-sm font-mono text-gray-900">{{ newToken }}</code>
          <div class="flex justify-end space-x-3">
            <button
              @click="copyToken"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {{ copied ? 'Copied' : 'Copy' }}
            </button>
            <button
              @click="closeTokenDialog"
              class="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
