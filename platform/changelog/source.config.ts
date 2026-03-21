import {
  defineConfig,
  defineDocs,
  frontmatterSchema,
} from "fumadocs-mdx/config"
import { z } from "zod"

export default defineConfig({
  lastModifiedTime: "git",
  mdxOptions: {
    providerImportSource: "@/mdx-components",
  },
})

export const { docs, meta } = defineDocs({
  dir: "changelog/content",
  docs: {
    schema: frontmatterSchema.extend({
      date: z.string(),
      tags: z.array(z.string()).optional().default([]),
      version: z.string().optional(),
    }),
  },
})
