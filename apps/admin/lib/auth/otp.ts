export const ADMIN_OTP_DIGITS = 8
export const ADMIN_OTP_PATTERN = /^\d{8}$/

export function validAdminOtp(value: unknown): value is string {
  return typeof value === "string" && ADMIN_OTP_PATTERN.test(value)
}
