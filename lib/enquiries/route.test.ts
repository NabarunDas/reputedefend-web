import { beforeEach,afterEach,describe,expect,it,vi } from "vitest"
const mocks=vi.hoisted(()=>({general:vi.fn(),formal:vi.fn(),legacy:vi.fn()}))
vi.mock("@/lib/enquiries/intake",()=>({persistGeneralEnquiry:mocks.general}))
vi.mock("@/lib/cases/intake",()=>({persistGetHelpCase:mocks.formal}))
vi.mock("@/lib/enquiry-delivery",()=>({deliverEnquiry:mocks.legacy,ENQUIRY_UNAVAILABLE:"Unavailable"}))
import { POST } from "@/app/api/enquiry/route"
import { resetEnquiryRateLimit } from "@/lib/enquiry-rate-limit"
const key="22222222-2222-4222-8222-222222222222"
const payload={fullName:"Alex",email:"alex@example.com",source:"contact",subject:"general-question",details:"Please explain the service.",submissionKey:key}
function req(body:unknown){return new Request("https://profilerelaunch.com/api/enquiry",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)})}
beforeEach(()=>{vi.resetAllMocks();resetEnquiryRateLimit();mocks.general.mockResolvedValue({ok:true,persisted:true,message:"Your enquiry has been received."});mocks.formal.mockResolvedValue({ok:true,caseRef:"PR-26-ABCDEF"})})
afterEach(()=>vi.unstubAllEnvs())
describe("public durable enquiry route",()=>{
 it.each(["contact","homepage"])("saves %s before returning received",async source=>{const r=await POST(req({...payload,source,service:"general"}));expect(r.status).toBe(200);expect(mocks.general).toHaveBeenCalledWith(expect.objectContaining({source}),key);expect(mocks.legacy).not.toHaveBeenCalled();expect(mocks.formal).not.toHaveBeenCalled()})
 it("keeps formal intake out of the general queue",async()=>{vi.stubEnv("CASE_PERSISTENCE_ENABLED","true");await POST(req({...payload,source:"get-help",service:"profile-recovery",businessName:"Bakery",country:"UK",informationAccurate:true,privacyAccepted:true}));expect(mocks.formal).toHaveBeenCalledOnce();expect(mocks.general).not.toHaveBeenCalled()})
 it("rejects a missing key, a honeypot and an oversized streamed body",async()=>{expect((await POST(req({...payload,submissionKey:null}))).status).toBe(400);expect((await POST(req({...payload,companyFax:"spam"}))).status).toBe(400);expect((await POST(req("x".repeat(65537)))).status).toBe(413);expect(mocks.general).not.toHaveBeenCalled()})
 it("does not send legacy email when durable storage fails",async()=>{mocks.general.mockResolvedValue({ok:false,message:"Unavailable"});expect((await POST(req(payload))).status).toBe(503);expect(mocks.legacy).not.toHaveBeenCalled()})
})
