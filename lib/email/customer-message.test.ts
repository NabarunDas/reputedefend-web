import { describe, expect, it } from "vitest"
import { brandAssets, brandColors, brandName, brandSiteUrl } from "@/lib/brand"
import { customerEmailLogoUrl, customerEmailSecurityNote, renderCustomerEmail, trustedActionUrl } from "@/lib/email/customer-message"

const upload = "https://customer.profilerelaunch.com/action/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

describe("shared customer email", () => {
  it("renders a responsive branded message with a text fallback for a blocked logo", () => {
    const rendered = renderCustomerEmail({
      title: "Supporting documents",
      caseRef: "PR-1042",
      blocks: [
        { type: "paragraph", text: "Hello," },
        { type: "list", title: "Documents requested", items: ["Shop licence", "Proof of operating location"] },
        { type: "button", label: "Upload your documents securely", url: upload },
      ],
    })
    expect(rendered).not.toBeNull()
    const html = rendered?.html ?? ""
    const text = rendered?.text ?? ""
    expect(customerEmailLogoUrl).toBe(`${brandSiteUrl}${brandAssets.horizontal.dark}`)
    expect(html).toContain(customerEmailLogoUrl)
    expect(html).toContain(`alt="${brandName}"`)
    expect(html).toContain(`>${brandName}</p>`)
    expect(html).toContain(brandColors.forest)
    expect(html).toContain(brandColors.green)
    expect(html).toContain('role="presentation"')
    expect(html).toMatch(/max-width:\s*600px/)
    expect(html).toContain("@media only screen and (max-width:620px)")
    expect(html).toContain("<ul")
    expect(html).toContain("<li")
    expect(html).toContain(`href="${upload}"`)
    expect(html.match(new RegExp(upload, "g"))).toHaveLength(1)
    expect(html).toContain("Upload your documents securely")
    expect(html).toContain("Case reference: PR-1042")
    expect(html).toContain(customerEmailSecurityNote)
    expect(html).not.toMatch(/<script|javascript:|data:|display\s*:\s*flex|display\s*:\s*grid/i)
    expect(text).toContain("- Shop licence")
    expect(text).toContain("- Proof of operating location")
    expect(text).toContain(upload)
    expect(text.match(new RegExp(upload, "g"))).toHaveLength(1)
    expect(text).toContain("Case reference: PR-1042")
    expect(text).toContain(brandSiteUrl)
  })

  it("escapes customer text and refuses an untrusted button address", () => {
    const rendered = renderCustomerEmail({
      title: "Update",
      blocks: [{ type: "paragraph", text: `<script>alert("x")</script>` }],
    })
    expect(rendered?.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;")
    expect(rendered?.html).not.toContain("<script>alert")
    expect(trustedActionUrl(`${upload}#t=secret`)).toBe(false)
    expect(renderCustomerEmail({
      title: "Update",
      blocks: [{ type: "button", label: "Open", url: "javascript:alert(1)" }],
    })).toBeNull()
    expect(renderCustomerEmail({
      title: "Update",
      blocks: [{ type: "button", label: "Open", url: `${upload}#t=abcdef` }],
    })).toBeNull()
  })
})
