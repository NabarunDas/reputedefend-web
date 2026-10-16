import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const adminRoot = fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, "")
const customerRoot = fileURLToPath(new URL("../customer/", import.meta.url)).replace(/\/$/, "")
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url))
const serverOnly = fileURLToPath(new URL("../../test/server-only-stub.ts", import.meta.url))

export default defineConfig({
  server: { fs: { allow: [repositoryRoot] } },
  plugins: [
    {
      name: "app-alias",
      enforce: "pre",
      async resolveId(source, importer, options) {
        if (!source.startsWith("@/")) return null
        const fromCustomer = importer?.replaceAll("\\", "/").includes("/apps/customer/")
        const target = `${fromCustomer ? customerRoot : adminRoot}/${source.slice(2)}`
        return this.resolve(target, importer, { skipSelf: true, ...options })
      },
    },
  ],
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    server: { deps: { inline: [/\/apps\/customer\//] } },
  },
  resolve: {
    alias: { "server-only": serverOnly },
  },
})
