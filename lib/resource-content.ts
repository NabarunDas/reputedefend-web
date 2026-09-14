import type { ReactNode } from "react"
import { competitorOrExEmployeeReviewBody } from "@/lib/resource-articles/can-a-competitor-or-ex-employee-leave-a-google-review"
import { canAGoogleReviewBeRemovedBody } from "@/lib/resource-articles/can-a-google-review-be-removed"
import { customerThreateningReviewBody } from "@/lib/resource-articles/customer-threatening-bad-google-review"
import { fakeOrGenuineNegativeFeedbackBody } from "@/lib/resource-articles/fake-google-review-or-genuine-negative-feedback"
import { googleReviewBombingBody } from "@/lib/resource-articles/google-review-bombing"
import { googleRejectedMyReviewReportBody } from "@/lib/resource-articles/google-rejected-my-review-report"
import { googleReviewExtortionBody } from "@/lib/resource-articles/google-review-extortion"
import { offeredToRemoveGoogleReviewsForMoneyBody } from "@/lib/resource-articles/offered-to-remove-google-reviews-for-money"
import { appealEvidenceChecklistBody } from "@/lib/resource-articles/google-business-profile-appeal-evidence-checklist"
import { appealRejectedWhatNextBody } from "@/lib/resource-articles/google-business-profile-appeal-rejected-what-next"
import { suspensionBeforeAppealBody } from "@/lib/resource-articles/google-business-profile-suspended-before-appeal"
import { verificationStuckOrRejectedBody } from "@/lib/resource-articles/google-business-profile-verification-stuck-or-rejected"
import { lostAccessToGoogleBusinessProfileBody } from "@/lib/resource-articles/lost-access-to-google-business-profile"
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
  "can-a-competitor-or-ex-employee-leave-a-google-review": competitorOrExEmployeeReviewBody,
  "fake-google-review-or-genuine-negative-feedback": fakeOrGenuineNegativeFeedbackBody,
  "customer-threatening-bad-google-review": customerThreateningReviewBody,
  "google-review-extortion": googleReviewExtortionBody,
  "google-review-bombing": googleReviewBombingBody,
  "offered-to-remove-google-reviews-for-money": offeredToRemoveGoogleReviewsForMoneyBody,
  "google-rejected-my-review-report": googleRejectedMyReviewReportBody,
  "lost-access-to-google-business-profile": lostAccessToGoogleBusinessProfileBody,
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
