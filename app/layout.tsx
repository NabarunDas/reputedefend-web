import type { Metadata, Viewport } from "next"
import "./globals.css"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"

export const metadata: Metadata = { metadataBase:new URL("https://reputedefend.com"), title:{default:"ReputeDefend | Practical reputation support",template:"%s | ReputeDefend"}, description:"Practical support for Google Business Profile recovery and review protection.", alternates:{canonical:"/"}, openGraph:{type:"website",siteName:"ReputeDefend",title:"ReputeDefend | Practical reputation support",description:"Practical support for Google Business Profile recovery and review protection."}, robots: process.env.VERCEL_ENV === "production" ? {index:true,follow:true} : {index:false,follow:false} }
export const viewport: Viewport = { themeColor:"#f7f8f3", width:"device-width", initialScale:1 }
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en-GB"><body><Header/><main>{children}</main><Footer/></body></html> }
