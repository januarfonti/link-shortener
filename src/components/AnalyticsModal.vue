<script setup lang="ts">
import type { LinkWithAnalytics } from '../types'

defineProps<{
  link: LinkWithAnalytics
}>()

const emit = defineEmits<{
  close: []
}>()

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getShortUrl(slug: string): string {
  return `${window.location.origin}/${slug}`
}

function truncateReferrer(referrer: string | null): string {
  if (!referrer) return 'Direct'
  try {
    const url = new URL(referrer)
    return url.hostname + (url.pathname !== '/' ? url.pathname : '')
  } catch {
    return referrer.substring(0, 50)
  }
}
</script>

<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-gray-900">Link Analytics</h2>
          <p class="text-sm text-blue-600">{{ getShortUrl(link.slug) }}</p>
        </div>
        <button @click="emit('close')" class="text-gray-400 hover:text-gray-600">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Stats -->
      <div class="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div class="grid grid-cols-3 gap-4">
          <div class="text-center">
            <p class="text-3xl font-bold text-gray-900">{{ link.click_count }}</p>
            <p class="text-sm text-gray-500">Total Clicks</p>
          </div>
          <div class="text-center">
            <p class="text-sm font-medium text-gray-900">{{ formatDateTime(link.created_at) }}</p>
            <p class="text-sm text-gray-500">Created</p>
          </div>
          <div class="text-center">
            <p class="text-sm font-medium text-gray-900">{{ formatDateTime(link.updated_at) }}</p>
            <p class="text-sm text-gray-500">Last Updated</p>
          </div>
        </div>
      </div>

      <!-- Recent Clicks -->
      <div class="flex-1 overflow-auto px-6 py-4">
        <h3 class="text-sm font-medium text-gray-700 mb-3">Recent Clicks (Last 100)</h3>

        <div v-if="link.recent_clicks.length === 0" class="text-center py-8 text-gray-500">
          No clicks recorded yet
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="click in link.recent_clicks"
            :key="click.id"
            class="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg text-sm"
          >
            <span class="text-gray-600">{{ formatDateTime(click.clicked_at) }}</span>
            <span class="text-gray-500 truncate max-w-xs" :title="click.referrer || 'Direct'">
              {{ truncateReferrer(click.referrer) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-gray-200 flex justify-end">
        <button
          @click="emit('close')"
          class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>
