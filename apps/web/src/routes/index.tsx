import { AppShell } from '@/components/AppShell/AppShell'
import { Button } from '@/components/Button/Button'
import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: HomeRoute })

function HomeRoute() {
  return (
    <AppShell>
      <section className="hero">
        <h1>Enterprise AI</h1>
        <p className="lead">
          Convex (reactive reads) + Fastify Bridge (audited writes) + ABAC
          permissions everywhere. Sign in to drive the demo.
        </p>
        <div className="actions">
          <Link to="/prompts">
            <Button variant="primary">Open prompts</Button>
          </Link>
          <Link to="/admin">
            <Button variant="ghost">Admin · roles</Button>
          </Link>
        </div>
      </section>
    </AppShell>
  )
}
