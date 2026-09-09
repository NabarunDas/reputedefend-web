import {Hero,Services,Process,FAQ,EnquirySection} from "@/components/sections"
import { FaqStructuredData } from "@/components/structured-data"
import { faqs } from "@/lib/content"

export default function Home(){return <><FaqStructuredData questions={faqs}/><Hero/><Services/><Process/><FAQ/><EnquirySection/></>}
