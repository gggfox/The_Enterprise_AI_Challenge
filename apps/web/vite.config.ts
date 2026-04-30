import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  // Load env files from the monorepo root so VITE_* vars in the shared
  // /.env are picked up by both `vite dev` and the SSR/Nitro build.
  // The API does the equivalent via `tsx --env-file=../../.env`.
  envDir: '../../',
  plugins: [
    viteTsConfigPaths({ projects: ['./tsconfig.json'] }),
    tanstackStart({
      // Test files colocated with route files (e.g. routes/foo.test.tsx) are
      // not routes -- exclude them so the router-generator stops touching
      // routeTree.gen.ts on every test edit.
      router: { routeFileIgnorePattern: String.raw`\.(test|spec)\.` },
    }),
    nitro(),
    viteReact({
      babel: {
        plugins: [['babel-plugin-react-compiler', {}]],
      },
    }),
  ],
})
