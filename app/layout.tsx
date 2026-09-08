import type { Metadata, Viewport } from "next"
import { Inter, Manrope } from "next/font/google"
import "./globals.css"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"

const bodyFont = Inter({ subsets: ["latin"], variable: "--font-body" })
const displayFont = Manrope({ subsets: ["latin"], variable: "--font-display" })

export const metadata: Metadata = { metadataBase:new URL("https://reputedefend.com"), title:{default:"ReputeDefend | Practical reputation support",template:"%s | ReputeDefend"}, description:"Practical support for Google Business Profile recovery and review protection.", alternates:{canonical:"/"}, openGraph:{type:"website",siteName:"ReputeDefend",title:"ReputeDefend | Practical reputation support",description:"Practical support for Google Business Profile recovery and review protection."}, robots: process.env.VERCEL_ENV === "production" ? {index:true,follow:true} : {index:false,follow:false} }
export const viewport: Viewport = { themeColor:"#f7f8f3", width:"device-width", initialScale:1 }
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en-GB"><body className={`${bodyFont.variable} ${displayFont.variable}`}><Header/><main>{children}</main><Footer/></body></html> }
