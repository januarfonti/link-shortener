<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useLinks } from '../composables/useLinks'
import type { Link, LinkWithAnalytics } from '../types'
import LinkForm from '../components/LinkForm.vue'
import LinkList from '../components/LinkList.vue'
import AnalyticsModal from '../components/AnalyticsModal.vue'

const { links, loading, error, fetchLinks, createLink, updateLink, deleteLink, getLinkWithAnalytics, clearError } = useLinks()

const showForm = ref(false)
const editingLink = ref<Link | null>(null)
const analyticsData = ref<LinkWithAnalytics | null>(null)
const showAnalytics = ref(false)

onMounted(() => {
  fetchLinks()
})

function openCreateForm() {
  editingLink.value = null
  showForm.value = true
}

function openEditForm(link: Link) {
  editingLink.value = link
  showForm.value = true
}

function closeForm() {
  showForm.value = false
  editingLink.value = null
}

async function handleSubmit(data: { slug?: string; destination_url: string }) {
  if (editingLink.value) {
    const result = await updateLink(editingLink.value.id, data)
    if (result) closeForm()
  } else {
    const result = await createLink(data)
    if (result) closeForm()
  }
}

async function handleDelete(id: number) {
  if (confirm('Are you sure you want to delete this link?')) {
    await deleteLink(id)
  }
}

async function openAnalytics(link: Link) {
  analyticsData.value = await getLinkWithAnalytics(link.id)
  if (analyticsData.value) {
    showAnalytics.value = true
  }
}

function closeAnalytics() {
  showAnalytics.value = false
  analyticsData.value = null
}

function copyToClipboard(slug: string) {
  const url = `${window.location.origin}/${slug}`
  navigator.clipboard.writeText(url)
}
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white shadow-sm">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-gray-900">Link Shortener</h1>
            <p class="text-sm text-gray-500">Manage your short links</p>
          </div>
          <button
            @click="openCreateForm"
            class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            New Link
          </button>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Error Alert -->
      <div
        v-if="error"
        class="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between"
      >
        <span>{{ error }}</span>
        <button @click="clearError" class="text-red-500 hover:text-red-700">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="loading && links.length === 0" class="flex items-center justify-center py-12">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>

      <!-- Empty State -->
      <div v-else-if="links.length === 0" class="text-center py-12">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900">No links</h3>
        <p class="mt-1 text-sm text-gray-500">Get started by creating a new short link.</p>
        <div class="mt-6">
          <button
            @click="openCreateForm"
            class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            New Link
          </button>
        </div>
      </div>

      <!-- Links List -->
      <LinkList
        v-else
        :links="links"
        :loading="loading"
        @edit="openEditForm"
        @delete="handleDelete"
        @analytics="openAnalytics"
        @copy="copyToClipboard"
      />
    </main>

    <!-- Create/Edit Modal -->
    <LinkForm
      v-if="showForm"
      :link="editingLink"
      :loading="loading"
      @submit="handleSubmit"
      @cancel="closeForm"
    />

    <!-- Analytics Modal -->
    <AnalyticsModal
      v-if="showAnalytics && analyticsData"
      :link="analyticsData"
      @close="closeAnalytics"
    />
  </div>
</template>
