import { Button } from '@/components/Button/Button'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: HomeRoute })

function HomeRoute() {
  return (
    <main className="page">
      <section className="hero">
        <h1>Enterprise AI</h1>
        <p className="lead">
          TanStack Start, React 19 with the React Compiler, and CSS Modules. No
          Tailwind, no UI library, no server-state lib &mdash; yet.
        </p>
        <div className="actions">
          <Button variant="primary">Get started</Button>
          <Button variant="ghost">Read the docs</Button>
        </div>
      </section>
    </main>
  )
}
