// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
const navigation=vi.hoisted(()=>({push:vi.fn(),refresh:vi.fn()}))
vi.mock("next/navigation",()=>({useRouter:()=>navigation}))
import { RecordForm, MembershipForm, VerifyContactForm } from "./forms"
const id="22222222-2222-4222-8222-222222222222", business="33333333-3333-4333-8333-333333333333"
const fetchMock=vi.fn()
beforeEach(()=>{vi.stubGlobal("fetch",fetchMock);fetchMock.mockReset();navigation.push.mockReset();navigation.refresh.mockReset()})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
describe("record forms",()=>{
 it("submits explicit fields with an idempotency key and prevents repeated save after success",async()=>{
  fetchMock.mockResolvedValue({ok:true,status:200,json:async()=>({message:"Saved",id})})
  const {container}=render(<RecordForm entity="client" />)
  fireEvent.change(screen.getByLabelText("Full name"),{target:{value:"Alex"}})
  fireEvent.change(screen.getByLabelText("Email address"),{target:{value:"alex@example.com"}})
  fireEvent.change(screen.getByRole("textbox",{name:/Reason for this change/}),{target:{value:"Customer confirmed these details."}})
  fireEvent.submit(container.querySelector("form")!)
  await waitFor(()=>expect(navigation.push).toHaveBeenCalledWith(`/records/client/${id}`))
  const [,options]=fetchMock.mock.calls[0]
  expect(options.headers["idempotency-key"]).toMatch(/^[a-f0-9-]{36}$/)
  expect(JSON.parse(options.body)).toEqual({entity:"client",id:null,version:0,data:{name:"Alex",email:"alex@example.com",phone:""},reason:"Customer confirmed these details."})
  fireEvent.submit(container.querySelector("form")!)
  expect(fetchMock).toHaveBeenCalledTimes(1)
 })
 it("keeps unsaved fields on conflict and blocks blind resubmission",async()=>{
  fetchMock.mockResolvedValue({ok:false,status:409,json:async()=>({message:"This record has changed."})})
  const {container}=render(<RecordForm entity="business" record={{id:business,name:"Business",version:3,website:""}} />)
  fireEvent.change(screen.getByLabelText("Business name"),{target:{value:"Edited name"}})
  fireEvent.submit(container.querySelector("form")!)
  await waitFor(()=>expect(screen.getByRole("status").textContent).toContain("changed"))
  expect((screen.getByLabelText("Business name") as HTMLInputElement).value).toBe("Edited name")
  expect(container.querySelector("fieldset")?.disabled).toBe(true)
  fireEvent.submit(container.querySelector("form")!)
  expect(fetchMock).toHaveBeenCalledTimes(1)
 })
 it("starts new relationships pending and requires an explicit confirmation",()=>{
  render(<MembershipForm customerId={id} businessId={business} />)
  expect((screen.getByLabelText("Relationship status") as HTMLSelectElement).value).toBe("pending")
  expect((screen.getByRole("checkbox") as HTMLInputElement).required).toBe(true)
 })
 it("does not offer verification of a missing phone number",()=>{
  render(<VerifyContactForm record={{id,name:"Alex",version:1,email:"alex@example.com",phone:null}} />)
  expect(screen.getAllByRole("option")).toHaveLength(1)
  expect(screen.getByText(/does not send a message/)).toBeTruthy()
 })
})
