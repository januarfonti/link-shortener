<script setup lang="ts">
import type { Link } from '../types'

defineProps<{
  links: Link[]
  loading: boolean
}>()

const emit = defineEmits<{
  edit: [link: Link]
  delete: [id: number]
  analytics: [link: Link]
  copy: [slug: string]
}>()

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function getShortUrl(slug: string): string {
  return `${window.location.origin}/${slug}`
}
</script>

<template>
  <div class="bg-white shadow-sm rounded-lg overflow-hidden">
    <table class="min-w-full divide-y divide-gray-200">
      <thead class="bg-gray-50">
        <tr>
          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Short URL
          </th>
          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Destination
          </th>
          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Clicks
          </th>
          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Created
          </th>
          <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
            Actions
          </th>
        </tr>
      </thead>
      <tbody class="bg-white divide-y divide-gray-200">
        <tr v-for="link in links" :key="link.id" class="hover:bg-gray-50">
          <td class="px-6 py-4 whitespace-nowrap">
            <div class="flex items-center">
              <span class="text-sm font-medium text-blue-600">{{ getShortUrl(link.slug) }}</span>
              <button
                @click="emit('copy', link.slug)"
                class="ml-2 text-gray-400 hover:text-gray-600"
                title="Copy to clipboard"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </td>
          <td class="px-6 py-4">
            <a
              :href="link.destination_url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-sm text-gray-600 hover:text-gray-900 truncate block max-w-xs"
              :title="link.destination_url"
            >
              {{ link.destination_url }}
            </a>
          </td>
          <td class="px-6 py-4 whitespace-nowrap">
            <button
              @click="emit('analytics', link)"
              class="inline-flex items-center text-sm text-gray-900 hover:text-blue-600"
            >
              <span class="font-medium">{{ link.click_count }}</span>
              <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </button>
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
            {{ formatDate(link.created_at) }}
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
            <button
              @click="emit('edit', link)"
              class="text-blue-600 hover:text-blue-900 mr-4"
            >
              Edit
            </button>
            <button
              @click="emit('delete', link.id)"
              class="text-red-600 hover:text-red-900"
            >
              Delete
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Loading overlay -->
    <div v-if="loading" class="absolute inset-0 bg-white bg-opacity-50 flex items-center justify-center">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  </div>
</template>
