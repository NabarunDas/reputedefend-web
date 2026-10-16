import { describe, expect, it } from "vitest"
import { devEstablishmentEditorEnabled } from "./dev-establishment-gate"
import { validateDevEstablishment } from "./establishment-command"

const valid={VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"develop",SUPABASE_URL:"https://rmzozuiamjcclvtgutgd.supabase.co",DEV_BUSINESS_ESTABLISHMENT_EDITOR_ENABLED:"true"}
const data={businessId:"ffffffff-ffff-4fff-8fff-ffffffffffff",countryCode:"GB",legalName:"Example Genuine Business Ltd",
 evidenceType:"OTHER",evidenceReference:"Operator directly checked the authentic business address.",verificationStatus:"VERIFIED",confirmed:true}
describe("PAY-ENV-05B operator command isolation",()=>{
  it("denies Production, other previews, wrong Supabase and unset flag",()=>{
    expect(devEstablishmentEditorEnabled(valid)).toBe(true)
    for(const diff of [{VERCEL_ENV:"production"},{VERCEL_GIT_COMMIT_REF:"feature/x"},
      {SUPABASE_URL:"https://cxwwekdzkkjjbiyofrov.supabase.co"},{DEV_BUSINESS_ESTABLISHMENT_EDITOR_ENABLED:"false"}])
      expect(devEstablishmentEditorEnabled({...valid,...diff})).toBe(false)
  })
  it("accepts only a real-evidence-shaped GB verification, no bypass fields",()=>{
    expect(validateDevEstablishment(data)?.countryCode).toBe("GB")
    for(const diff of [{countryCode:"US"},{confirmed:false},{verificationStatus:"PENDING"},
      {evidenceReference:"too short"},{businessId:"bad"}, {supersede:true},{actorId:"spoof"}]){
      expect(validateDevEstablishment({...data,...diff})).toBeNull()
    }
  })
})
