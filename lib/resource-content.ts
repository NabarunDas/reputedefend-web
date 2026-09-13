import type { ReactNode } from "react"
import type { OfficialSource } from "@/lib/resources"

/**
 * Article body for a published resource.
 * Production map stays empty until researched content is supplied in Phase 1B.
 * Tests inject bodies directly into ResourceArticleView — they must not be
 * registered here or they would become publicly indexable.
 */
export type ResourceArticleBody = {
  intro: string
  quickAnswer: ReactNode
  main: ReactNode
  googleSays?: {
    paraphrase: ReactNode
    sources: OfficialSource[]
  }
  interpretation?: ReactNode
  beforeYouAct?: ReactNode
  urgentCallout?: ReactNode
  checklist?: {
    heading?: string
    items: string[]
  }
  commonMistakes?: {
    heading?: string
    items: string[]
  }
  scenarios?: Array<{
    heading: string
    body: ReactNode
  }>
  sourcesUsed: OfficialSource[]
}

const resourceBodies: Record<string, ResourceArticleBody> = {}

export function getResourceBody(slug: string): ResourceArticleBody | undefined {
  return resourceBodies[slug]
}

export function hasResourceBody(slug: string) {
  return Boolean(resourceBodies[slug])
}

export function listResourceBodySlugs() {
  return Object.keys(resourceBodies)
}
