import type { ReactNode } from "react"
import { canAGoogleReviewBeRemovedBody } from "@/lib/resource-articles/can-a-google-review-be-removed"
import { appealEvidenceChecklistBody } from "@/lib/resource-articles/google-business-profile-appeal-evidence-checklist"
import { appealRejectedWhatNextBody } from "@/lib/resource-articles/google-business-profile-appeal-rejected-what-next"
import { suspensionBeforeAppealBody } from "@/lib/resource-articles/google-business-profile-suspended-before-appeal"
import { verificationStuckOrRejectedBody } from "@/lib/resource-articles/google-business-profile-verification-stuck-or-rejected"
import type { OfficialSource } from "@/lib/resources"

/**
 * Article body for a published resource.
 * Tests inject bodies directly into ResourceArticleView — they must not be
 * registered here or they would become publicly indexable.
 */
export type ResourceMistakeItem =
  | string
  | {
      title: string
      body: ReactNode
    }

export type ResourceArticleBody = {
  intro: ReactNode
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
    items: ResourceMistakeItem[]
  }
  scenarios?: Array<{
    heading: string
    body: ReactNode
  }>
  closing?: ReactNode
  sourcesUsed: OfficialSource[]
}

const resourceBodies: Record<string, ResourceArticleBody> = {
  "google-business-profile-suspended-before-appeal": suspensionBeforeAppealBody,
  "google-business-profile-appeal-evidence-checklist": appealEvidenceChecklistBody,
  "google-business-profile-appeal-rejected-what-next": appealRejectedWhatNextBody,
  "google-business-profile-verification-stuck-or-rejected": verificationStuckOrRejectedBody,
  "can-a-google-review-be-removed": canAGoogleReviewBeRemovedBody,
}

export function getResourceBody(slug: string): ResourceArticleBody | undefined {
  return resourceBodies[slug]
}

export function hasResourceBody(slug: string) {
  return Boolean(resourceBodies[slug])
}

export function listResourceBodySlugs() {
  return Object.keys(resourceBodies)
}
