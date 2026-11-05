import type { CallStatus, MinimalLead, ProjectedAnalysis, ResolvedTenant } from "./types"

const SUMMARY_MAX = 600

export function leadIdFor(environment: string, locationId: string, callId: string): string {
  return `lead_${environment}_${locationId}_${callId}`
}

export function composeSummary(analysis: ProjectedAnalysis | null, fallback: string): string {
  if (!analysis) return fallback
  const parts = [
    analysis.callerName ? `Caller: ${analysis.callerName}` : null,
    analysis.callbackNumber ? `Callback number: ${analysis.callbackNumber}` : null,
    analysis.serviceRequested ? `Request: ${analysis.serviceRequested}` : null,
    analysis.jobLocation ? `Job location: ${analysis.jobLocation}` : null,
    analysis.callbackWindow ? `Callback preference: ${analysis.callbackWindow}` : null,
  ].filter((part): part is string => part != null)
  if (parts.length === 0) return fallback
  const kept: string[] = []
  for (const part of parts) {
    const next = kept.length === 0 ? part : `${kept.join("\n")}\n${part}`
    if (next.length > SUMMARY_MAX) break
    kept.push(part)
  }
  return kept.join("\n")
}

export function leadIsIncomplete(analysis: ProjectedAnalysis | null): boolean {
  if (!analysis) return true
  return analysis.callbackNumber == null || analysis.serviceRequested == null
}

export function statusForAnalysis(analysis: ProjectedAnalysis | null, providerError: boolean): CallStatus {
  if (providerError) return "failed"
  if (leadIsIncomplete(analysis)) return "incomplete"
  return "completed"
}

export function buildLead(input: {
  environment: string
  tenant: ResolvedTenant
  callId: string
  analysis: ProjectedAnalysis | null
  providerError: boolean
  createdAt: string
  summaryFallback: string
}): MinimalLead {
  const analysis = input.analysis
  return {
    tenantBusinessId: input.tenant.businessId,
    tenantLocationId: input.tenant.locationId,
    providerCallRef: input.callId,
    callbackNumber: analysis?.callbackNumber ?? null,
    callerName: analysis?.callerName ?? null,
    serviceRequested: analysis?.serviceRequested ?? null,
    jobLocation: analysis?.jobLocation ?? null,
    callbackWindow: analysis?.callbackWindow ?? null,
    summary: composeSummary(analysis, input.summaryFallback),
    incomplete: leadIsIncomplete(analysis),
    callStatus: statusForAnalysis(analysis, input.providerError),
    createdAt: input.createdAt,
  }
}
