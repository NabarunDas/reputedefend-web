import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url))
const customerRoot = fileURLToPath(new URL("../../apps/customer", import.meta.url)).replace(/\/$/, "")
const serverOnly = fileURLToPath(new URL("../server-only-stub.ts", import.meta.url))

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  server: { fs: { allow: [repositoryRoot] } },
  plugins: [
    {
      name: "customer-app-alias",
      enforce: "pre",
      async resolveId(source, importer, options) {
        if (!source.startsWith("@/")) return null
        if (!importer?.replaceAll("\\", "/").includes("/apps/customer/")) return null
        return this.resolve(`${customerRoot}/${source.slice(2)}`, importer, { ...options, skipSelf: true })
      },
    },
  ],
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    server: { deps: { inline: [/\/apps\/customer\//] } },
  },
  resolve: {
    alias: { "server-only": serverOnly },
  },
})
