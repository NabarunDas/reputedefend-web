export const observedExternalEvidence = {
  supabaseLeakedPasswordProtection: {
    observedAt: "2026-10-05",
    environment: "production",
    source: "Supabase Security Advisor",
    observation:
      "auth_leaked_password_protection is absent after enabling leaked-password protection in Authentication > Providers > Email.",
  },
} as const
