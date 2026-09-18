// @vitest-environment jsdom
import React from 'react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn(),push:vi.fn()})}))
import {TaskForm,SubmissionForm,TransitionForm,NoteForm} from './forms'
import type {CaseDetail} from '@/lib/cases/model'
const c={id:'22222222-2222-4222-8222-222222222222',version:4,track:'GUIDED',stage:'SERVICE_SELECTION',transitions:['PAYMENT_REQUIRED','AUTHORIZATION_REQUIRED','PREPARATION']} as CaseDetail
const fetchMock=vi.fn()
beforeEach(()=>{vi.stubGlobal('fetch',fetchMock);fetchMock.mockReset().mockResolvedValue({ok:true,status:200,json:async()=>({message:'Saved'})})})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
describe('case forms',()=>{
 it('records deadline input as UTC and includes source and original timezone',async()=>{const {container}=render(<TaskForm c={c}/>);fireEvent.change(screen.getByLabelText('Task'),{target:{value:'Call the owner'}});fireEvent.change(screen.getByLabelText('Due date and time (UTC)'),{target:{value:'2026-10-25T01:30'}});fireEvent.change(screen.getByLabelText('Source of deadline'),{target:{value:'Agreed during call'}});fireEvent.change(screen.getByRole('textbox',{name:/Supporting note/}),{target:{value:'Customer asked for a call.'}});fireEvent.submit(container.querySelector('form')!);await waitFor(()=>expect(fetchMock).toHaveBeenCalled());const [url,options]=fetchMock.mock.calls[0];expect(url).toBe('/api/cases/command');expect(JSON.parse(options.body)).toMatchObject({id:c.id,version:4,operation:'task',data:{due:'2026-10-25T01:30:00.000Z',timezone:'Europe/London',owner:'ADMIN',source:'Agreed during call'}})})
 it('labels Guided submission correctly and requires evidence confirmation',()=>{render(<SubmissionForm c={c}/>);expect(screen.getByText('the customer')).toBeTruthy();expect((screen.getByRole('checkbox') as HTMLInputElement).required).toBe(true);expect(screen.getByLabelText('Customer confirmation and evidence reference')).toBeTruthy()})
 it('does not offer the Managed payment path to Guided cases or allow pending gates',()=>{render(<TransitionForm c={c}/>);expect(screen.queryByRole('option',{name:'Waiting for permission'})).toBeNull();expect((screen.getByRole('option',{name:/Preparing the submission/}) as HTMLOptionElement).disabled).toBe(true)})
 it('defaults to internal notes and requires explicit review for customer text',()=>{render(<NoteForm c={c}/>);expect((screen.getByLabelText('Visibility') as HTMLSelectElement).value).toBe('INTERNAL');fireEvent.change(screen.getByLabelText('Visibility'),{target:{value:'CUSTOMER'}});expect((screen.getByRole('checkbox') as HTMLInputElement).required).toBe(true)})
})
