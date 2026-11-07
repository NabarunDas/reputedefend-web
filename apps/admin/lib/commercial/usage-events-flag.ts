/** Customer call-usage events stay closed unless this flag is exactly "true". */
export function usageEventsEnabled(flag: string | undefined = process.env.TELLOYA_USAGE_EVENTS_ENABLED): boolean {
  return flag === "true"
}
