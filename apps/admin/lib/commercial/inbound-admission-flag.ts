/** Inbound call admission stays closed unless this flag is exactly "true". */
export function inboundAdmissionEnabled(flag: string | undefined = process.env.TELLOYA_INBOUND_ADMISSION_ENABLED): boolean {
  return flag === "true"
}
