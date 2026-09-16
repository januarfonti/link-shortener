import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import {
  LinkError,
  createLink,
  deleteLink,
  getLinkBySlug,
  getLinkStats,
  listLinks,
  updateLink,
  type Link,
} from './links'

export interface ToolDeps {
  db: D1Database
  origin: string
}

function ok(data: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  }
}

function fail(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

function handleError(error: unknown, slug: string | undefined): CallToolResult {
  if (error instanceof LinkError) {
    switch (error.code) {
      case 'invalid_url':
        return fail('Invalid URL. Must start with http:// or https://.')
      case 'invalid_slug':
        return fail('Invalid slug. Use 3-50 letters, numbers, or hyphens, and not a reserved word.')
      case 'slug_taken':
        return fail(`Slug "${slug}" is already taken. Try another slug or omit it to auto-generate.`)
      case 'not_found':
        return fail(`No link with slug "${slug}".`)
      case 'no_changes':
        return fail('Provide new_destination_url or new_slug.')
      case 'slug_generation_failed':
        return fail('Could not generate a unique slug. Try again or pass a custom slug.')
    }
  }
  console.error('MCP tool error:', error)
  return fail('Internal error.')
}

function shortUrl(origin: string, slug: string): string {
  return `${origin}/${slug}`
}

function linkView(origin: string, link: Link) {
  return {
    short_url: shortUrl(origin, link.slug),
    slug: link.slug,
    destination_url: link.destination_url,
    click_count: link.click_count,
    created_at: link.created_at,
  }
}

export function registerTools(server: McpServer, { db, origin }: ToolDeps): void {
  server.registerTool(
    'create_short_link',
    {
      title: 'Create short link',
      description:
        'Shorten a URL. Returns the short URL. Omit slug to auto-generate a 6-character one.',
      inputSchema: {
        url: z.string().describe('Destination URL, must start with http:// or https://'),
        slug: z.string().optional().describe('Optional custom slug: 3-50 letters, numbers, or hyphens'),
      },
    },
    async ({ url, slug }) => {
      try {
        const link = await createLink(db, { destination_url: url, slug })
        return ok({
          short_url: shortUrl(origin, link.slug),
          slug: link.slug,
          destination_url: link.destination_url,
          created_at: link.created_at,
        })
      } catch (error) {
        return handleError(error, slug?.trim())
      }
    }
  )

  server.registerTool(
    'list_links',
    {
      title: 'List short links',
      description: 'List short links, newest first. Optionally filter by text in the slug or destination URL.',
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe('Maximum links to return (default 20, max 100)'),
        search: z.string().optional().describe('Text to match in the slug or destination URL'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ limit, search }) => {
      try {
        const links = await listLinks(db, { limit: limit ?? 20, search })
        return ok({ links: links.map((link) => linkView(origin, link)) })
      } catch (error) {
        return handleError(error, undefined)
      }
    }
  )

  server.registerTool(
    'get_link_stats',
    {
      title: 'Get link stats',
      description: 'Click count, top 5 referrers, and the last 20 clicks for one short link.',
      inputSchema: {
        slug: z.string().describe('Slug of the short link'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ slug }) => {
      try {
        const stats = await getLinkStats(db, slug)
        return ok({
          ...linkView(origin, stats),
          top_referrers: stats.top_referrers,
          recent_clicks: stats.recent_clicks,
        })
      } catch (error) {
        return handleError(error, slug)
      }
    }
  )

  server.registerTool(
    'update_link',
    {
      title: 'Update link',
      description:
        'Change the destination URL and/or slug of an existing short link. Existing shared short URLs will redirect to the new destination.',
      inputSchema: {
        slug: z.string().describe('Current slug of the link to update'),
        new_destination_url: z.string().optional().describe('New destination URL'),
        new_slug: z.string().optional().describe('New slug: 3-50 letters, numbers, or hyphens'),
      },
      annotations: { destructiveHint: true },
    },
    async ({ slug, new_destination_url, new_slug }) => {
      let link: Link
      try {
        link = await getLinkBySlug(db, slug)
      } catch (error) {
        return handleError(error, slug)
      }

      try {
        const updated = await updateLink(db, link.id, {
          destination_url: new_destination_url,
          slug: new_slug,
        })
        return ok({ ...linkView(origin, updated), updated_at: updated.updated_at })
      } catch (error) {
        return handleError(error, new_slug?.trim() ?? slug)
      }
    }
  )

  server.registerTool(
    'delete_link',
    {
      title: 'Delete link',
      description:
        'Permanently delete a short link and its click history. confirm_slug must exactly match slug.',
      inputSchema: {
        slug: z.string().describe('Slug of the link to delete'),
        confirm_slug: z.string().describe('Repeat the slug exactly to confirm deletion'),
      },
      annotations: { destructiveHint: true },
    },
    async ({ slug, confirm_slug }) => {
      if (slug !== confirm_slug) {
        return fail('confirm_slug must exactly match slug. Nothing was deleted.')
      }
      try {
        const link = await getLinkBySlug(db, slug)
        await deleteLink(db, link.id)
        return ok({ deleted: slug })
      } catch (error) {
        return handleError(error, slug)
      }
    }
  )
}
