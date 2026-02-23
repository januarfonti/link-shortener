export interface Link {
  id: number
  slug: string
  destination_url: string
  created_at: string
  updated_at: string
  click_count: number
}

export interface Click {
  id: number
  link_id: number
  clicked_at: string
  referrer: string | null
}

export interface CreateLinkRequest {
  slug?: string
  destination_url: string
}

export interface UpdateLinkRequest {
  slug?: string
  destination_url?: string
}

export interface LinkWithAnalytics extends Link {
  recent_clicks: Click[]
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}
