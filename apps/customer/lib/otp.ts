export const CUSTOMER_OTP_DIGITS = 8
export const CUSTOMER_OTP_PATTERN = /^\d{8}$/

export function normalizeCustomerOtp(value: string): string {
  return value.replace(/\D/g, "").slice(0, CUSTOMER_OTP_DIGITS)
}

export function validCustomerOtp(value: unknown): value is string {
  return typeof value === "string" && CUSTOMER_OTP_PATTERN.test(value)
}
