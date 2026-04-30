import { AppShell } from '@/components/AppShell/AppShell'
import { useApiMutation } from '@/lib/api/useApiMutation'
import { useAuthedFetch } from '@/lib/auth'
import { useAuth } from '@clerk/clerk-react'
import { api } from '@enterprise-ai/convex/convex/_generated/api'
import { type Role, can, canMaybe, isRole } from '@enterprise-ai/shared/auth'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery as useConvexQuery } from 'convex/react'
import { type FormEvent, useState } from 'react'

export const Route = createFileRoute('/prompts')({ component: PromptsPage })

type PromptDTO = {
  _id: string
  authorId: string
  authorName: string
  title: string
  body: string
  archived: boolean
  _creationTime: number
}

function PromptsPage() {
  // Gate Convex subscriptions on auth state. AppShell decides whether to
  // render children, but hooks here run regardless -- without `'skip'`
  // we'd subscribe to `prompts.list` while signed out and trigger an
  // `unauthenticated` error overlay.
  const { isSignedIn } = useAuth()
  const me = useConvexQuery(api.users.me)
  const prompts = useConvexQuery(
    api.prompts.list,
    isSignedIn && me ? {} : 'skip',
  ) as readonly PromptDTO[] | undefined

  const queryClient = useQueryClient()
  const fetchWithAuth = useAuthedFetch()

  const createPrompt = useApiMutation<
    { title: string; body: string },
    { _id: string }
  >(
    (vars) =>
      fetchWithAuth('/api/v1/prompts', {
        method: 'POST',
        body: vars,
      }),
    {
      onSuccess: () => {
        // Convex websocket will refresh automatically; no need to invalidate.
        void queryClient.invalidateQueries({ queryKey: ['prompts'] })
      },
    },
  )

  const updatePrompt = useApiMutation<
    { id: string; title?: string; body?: string; archived?: boolean },
    { _id: string }
  >((vars) =>
    fetchWithAuth(`/api/v1/prompts/${vars.id}`, {
      method: 'PATCH',
      body: { title: vars.title, body: vars.body, archived: vars.archived },
    }),
  )

  const deletePrompt = useApiMutation<{ id: string }, { _id: string }>((vars) =>
    fetchWithAuth(`/api/v1/prompts/${vars.id}`, {
      method: 'DELETE',
    }),
  )

  const roles = (me?.roles ?? []).filter(isRole) as readonly Role[]
  const subject = { _id: me?._id ?? '', roles }
  const canCreate = canMaybe(subject, 'create', 'prompt')

  return (
    <AppShell>
      <section className="stack">
        <h1>Prompts</h1>
        <p className="muted">
          Reads stream live from Convex; writes go through the Bridge so the
          ABAC predicate fires twice (Bridge + Convex) on every mutation.
        </p>

        {canCreate && (
          <CreateForm
            onSubmit={(v) => createPrompt.mutate(v)}
            busy={createPrompt.isPending}
            error={createPrompt.error}
          />
        )}

        {prompts === undefined ? (
          <p>Loading prompts...</p>
        ) : prompts.length === 0 ? (
          <p>No prompts yet.</p>
        ) : (
          <ul className="prompts">
            {prompts.map((p) => (
              <PromptRow
                key={p._id}
                prompt={p}
                subject={subject}
                onUpdate={(patch) =>
                  updatePrompt.mutate({ id: p._id, ...patch })
                }
                onDelete={() => deletePrompt.mutate({ id: p._id })}
              />
            ))}
          </ul>
        )}

        {(updatePrompt.error || deletePrompt.error) && (
          <p className="error">
            {(updatePrompt.error ?? deletePrompt.error)?.reason}
          </p>
        )}
      </section>
    </AppShell>
  )
}

function CreateForm({
  onSubmit,
  busy,
  error,
}: {
  onSubmit: (v: { title: string; body: string }) => void
  busy: boolean
  error: { reason: string } | null
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  function handle(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    onSubmit({ title: title.trim(), body })
    setTitle('')
    setBody('')
  }

  return (
    <form onSubmit={handle} className="card stack-tight">
      <h2>New prompt</h2>
      <input
        type="text"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        maxLength={200}
      />
      <textarea
        placeholder="Body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        maxLength={10_000}
      />
      <div className="row">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? 'Creating...' : 'Create'}
        </button>
        {error && <span className="error">{error.reason}</span>}
      </div>
    </form>
  )
}

function PromptRow({
  prompt,
  subject,
  onUpdate,
  onDelete,
}: {
  prompt: PromptDTO
  subject: { _id: string; roles: readonly Role[] }
  onUpdate: (patch: {
    title?: string
    body?: string
    archived?: boolean
  }) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(prompt.title)
  const [body, setBody] = useState(prompt.body)

  const canUpdate = can(subject, 'update', 'prompt', prompt)
  const canDelete = can(subject, 'delete', 'prompt', prompt)

  if (editing) {
    return (
      <li className="card stack-tight">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
        />
        <div className="row">
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              onUpdate({ title, body })
              setEditing(false)
            }}
          >
            Save
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setTitle(prompt.title)
              setBody(prompt.body)
              setEditing(false)
            }}
          >
            Cancel
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className="card stack-tight">
      <div className="row">
        <strong>{prompt.title}</strong>
        <span className="muted">
          by {prompt.authorName}
          {prompt.archived ? ' · archived' : ''}
        </span>
      </div>
      <p className="prompt-body">{prompt.body || <em>(empty)</em>}</p>
      <div className="row">
        {canUpdate && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        )}
        {canUpdate && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => onUpdate({ archived: !prompt.archived })}
          >
            {prompt.archived ? 'Unarchive' : 'Archive'}
          </button>
        )}
        {canDelete && (
          <button type="button" className="btn-ghost" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
    </li>
  )
}
