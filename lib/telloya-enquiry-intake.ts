/**
 * Telloya enquiry intake - bridges Telloya types with existing enquiry infrastructure
 */

import "server-only"
import { persistGeneralEnquiry, type GeneralIntakeOptions } from "@/lib/enquiries/intake"
import { 
  type TelloyaEnquiryInput, 
  type TelloyaEnquiryResult,
  telloyaEnquiryToPayload 
} from "@/lib/telloya-enquiry"

/**
 * Persist a Telloya enquiry using the existing general enquiry infrastructure
 * 
 * This function:
 * 1. Converts Telloya-specific fields to the database payload format
 * 2. Uses the existing persistGeneralEnquiry function
 * 3. Extracts and returns the TY reference from the result
 * 
 * @param data Validated Telloya enquiry input
 * @param key Submission key for idempotency
 * @param options Optional test/mock overrides
 * @returns Result with TY reference
 */
export async function persistTelloyaEnquiry(
  data: TelloyaEnquiryInput,
  key: string,
  options: GeneralIntakeOptions = {}
): Promise<TelloyaEnquiryResult> {
  // Convert Telloya fields to database payload format
  const payload = telloyaEnquiryToPayload(data)

  // Use existing enquiry persistence infrastructure
  const result = await persistGeneralEnquiry(payload as any, key, options)

  // Extract enquiry reference from response if available
  // The reference is returned by create_general_enquiry_v1 in the database
  return {
    ok: result.ok,
    message: result.message,
    simulated: result.simulated,
    persisted: result.persisted,
    enquiryRef: result.enquiryRef,
  }
}
