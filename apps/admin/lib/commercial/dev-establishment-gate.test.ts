import { describe, expect, it } from "vitest"
import { devEstablishmentEditorEnabled } from "./dev-establishment-gate"

const valid={VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"develop",SUPABASE_URL:"https://rmzozuiamjcclvtgutgd.supabase.co",DEV_BUSINESS_ESTABLISHMENT_EDITOR_ENABLED:"true"}
describe("the former establishment editor flag",()=>{
  it("stays true only for the develop preview on the DEV project",()=>{
    expect(devEstablishmentEditorEnabled(valid)).toBe(true)
    for(const diff of [{VERCEL_ENV:"production"},{VERCEL_GIT_COMMIT_REF:"feature/x"},
      {SUPABASE_URL:"https://cxwwekdzkkjjbiyofrov.supabase.co"},{DEV_BUSINESS_ESTABLISHMENT_EDITOR_ENABLED:"false"}])
      expect(devEstablishmentEditorEnabled({...valid,...diff})).toBe(false)
  })
})
