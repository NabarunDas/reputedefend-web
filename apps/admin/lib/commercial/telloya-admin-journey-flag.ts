/** Telloya admin journey writes stay closed unless this flag is exactly "true". */
export function telloyaAdminJourneyEnabled(flag: string | undefined = process.env.TELLOYA_ADMIN_JOURNEY_ENABLED): boolean {
  return flag === "true"
}
