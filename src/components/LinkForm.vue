<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Link } from '../types'

const props = defineProps<{
  link: Link | null
  loading: boolean
}>()

const emit = defineEmits<{
  submit: [data: { slug?: string; destination_url: string }]
  cancel: []
}>()

const slug = ref('')
const destinationUrl = ref('')
const useCustomSlug = ref(false)

const isEditing = computed(() => props.link !== null)
const title = computed(() => isEditing.value ? 'Edit Link' : 'Create New Link')
const baseUrl = computed(() => window.location.origin)

onMounted(() => {
  if (props.link) {
    slug.value = props.link.slug
    destinationUrl.value = props.link.destination_url
    useCustomSlug.value = true
  }
})

function handleSubmit() {
  const data: { slug?: string; destination_url: string } = {
    destination_url: destinationUrl.value.trim(),
  }

  if (useCustomSlug.value && slug.value.trim()) {
    data.slug = slug.value.trim()
  }

  emit('submit', data)
}
</script>

<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <div class="bg-white rounded-lg shadow-xl max-w-md w-full">
      <div class="px-6 py-4 border-b border-gray-200">
        <h2 class="text-lg font-semibold text-gray-900">{{ title }}</h2>
      </div>

      <form @submit.prevent="handleSubmit" class="p-6 space-y-4">
        <!-- Destination URL -->
        <div>
          <label for="destination" class="block text-sm font-medium text-gray-700 mb-1">
            Destination URL
          </label>
          <input
            id="destination"
            v-model="destinationUrl"
            type="url"
            required
            placeholder="https://example.com/your-long-url"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <!-- Custom Slug Toggle -->
        <div v-if="!isEditing" class="flex items-center">
          <input
            id="custom-slug"
            v-model="useCustomSlug"
            type="checkbox"
            class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label for="custom-slug" class="ml-2 block text-sm text-gray-700">
            Use custom slug
          </label>
        </div>

        <!-- Custom Slug Input -->
        <div v-if="useCustomSlug || isEditing">
          <label for="slug" class="block text-sm font-medium text-gray-700 mb-1">
            Custom Slug
          </label>
          <div class="flex items-center">
            <span class="text-sm text-gray-500 mr-1">{{ baseUrl }}/</span>
            <input
              id="slug"
              v-model="slug"
              type="text"
              :required="useCustomSlug || isEditing"
              placeholder="my-custom-slug"
              pattern="[a-zA-Z0-9-]{3,50}"
              class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <p class="mt-1 text-xs text-gray-500">3-50 characters, letters, numbers, and hyphens only</p>
        </div>

        <!-- Actions -->
        <div class="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            @click="emit('cancel')"
            :disabled="loading"
            class="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            :disabled="loading"
            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center"
          >
            <span v-if="loading" class="mr-2">
              <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </span>
            {{ isEditing ? 'Update' : 'Create' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
