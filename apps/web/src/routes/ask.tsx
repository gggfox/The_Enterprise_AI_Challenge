import { AppShell } from '@/components/AppShell/AppShell'
import { Button } from '@/components/Button/Button'
import { convex } from '@/lib/convex'
import {
  type AgentState,
  type ConvTurn,
  type DeepgramFunctionSchema,
  useDeepgramAgent,
} from '@/lib/deepgram/useDeepgramAgent'
import { api } from '@enterprise-ai/convex/convex/_generated/api'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery as useConvexQuery } from 'convex/react'
import { useMemo } from 'react'

export const Route = createFileRoute('/ask')({ component: AskPage })

type Store = {
  code: string
  name: string
  city: string
  region: string
}

type SalesSeriesRow = {
  date: string
  revenue: number
  transactions: number
  units: number
}

type SalesResultOk = {
  ok: true
  scope_label: string
  date_range: string
  total_revenue_mxn: number
  total_transactions: number
  total_units: number
  series: SalesSeriesRow[]
}
type SalesResultErr = { ok: false; error: string; scope_label: string }
type SalesResult = SalesResultOk | SalesResultErr

const FUNCTIONS: readonly DeepgramFunctionSchema[] = [
  {
    name: 'query_sales',
    description:
      'Get daily revenue, transactions, and units sold for a store, region, or the whole chain over the last N days. Anchored to the most recent date in the data.',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          description:
            'Use "all" for chain-wide, "region:<NAME>" for a region (e.g. "region:CDMX"), or "store:<CODE>" for one store (e.g. "store:CDMX-POL"). Bare codes/region names are also accepted.',
        },
        days: {
          type: 'integer',
          description:
            'Window length in days, anchored to the latest date in the data. Defaults to 7. Use 7 for a week, 30 for a month, etc.',
        },
      },
      required: ['scope'],
    },
  },
]

function buildSystemPrompt(
  stores: readonly Store[],
  regions: readonly string[],
) {
  const storeLines = stores
    .map((s) => `- ${s.code} - ${s.name} (${s.city}, ${s.region})`)
    .join('\n')
  return `You are an analytics assistant for the regional manager of "Tiendita", a fictional Mexican convenience-store chain.

Available stores (use the code in the scope arg):
${storeLines || '- (still loading store list)'}

Regions: ${regions.join(', ') || '(loading)'}

When the user asks about sales, revenue, traffic, transactions, units, or trends, ALWAYS call the query_sales function. Never invent numbers.
- scope: "all", "region:<NAME>" (e.g. "region:CDMX"), or "store:<CODE>" (e.g. "store:CDMX-POL").
- days: integer window. "this week" or "the past week" -> 7, "two weeks" -> 14, "this month" -> 30, "last quarter" -> 90.

After the function returns, give a one-sentence insight in plain language and state the headline revenue figure in pesos (MXN). Keep spoken responses under 25 words.
If the result has ok=false, briefly tell the user the scope wasn't recognized and suggest a known store or region.

Speak in English. Spanish support is coming next.`
}

const GREETING =
  "Hi, I'm your store data assistant. Ask me about sales, transactions, or units across any store or region."

function AskPage() {
  const stores = useConvexQuery(api.analytics.listStores) as
    | readonly Store[]
    | undefined
  const regions = useConvexQuery(api.analytics.listRegions) as
    | readonly string[]
    | undefined

  const ready = stores !== undefined && regions !== undefined
  const systemPrompt = useMemo(
    () => buildSystemPrompt(stores ?? [], regions ?? []),
    [stores, regions],
  )

  const agent = useDeepgramAgent({
    language: 'en',
    systemPrompt,
    greeting: GREETING,
    functions: FUNCTIONS,
    onToolCall: async (name, args) => {
      if (name !== 'query_sales') return { error: `unknown_tool:${name}` }
      const scope = String(args.scope ?? 'all')
      const days = Number(args.days ?? 7)
      try {
        return await convex.query(api.analytics.querySales, { scope, days })
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'query_failed',
          scope_label: scope,
        }
      }
    },
  })

  const result = agent.lastTool?.result as SalesResult | undefined
  const isRunning =
    agent.state !== 'idle' &&
    agent.state !== 'error' &&
    agent.state !== 'connecting'

  return (
    <AppShell>
      <section className="stack">
        <header className="stack-tight">
          <h1 style={{ margin: 0 }}>Talk to your data</h1>
          <p className="muted" style={{ margin: 0 }}>
            Ask in plain English about Tiendita stores. The agent calls a tool
            that hits the Convex rollup_daily_store_sales table, then narrates
            the insight.
          </p>
        </header>

        <div className="row">
          {!isRunning ? (
            <Button
              variant="primary"
              onClick={() => void agent.start()}
              disabled={agent.state === 'connecting' || !ready}
            >
              {agent.state === 'connecting'
                ? 'Connecting...'
                : ready
                  ? 'Start conversation'
                  : 'Loading data...'}
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => agent.stop()}>
              Stop
            </Button>
          )}
          <StatePill state={agent.state} />
          {agent.error && <span className="error">{agent.error}</span>}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: 'var(--space-4)',
          }}
        >
          <div className="card stack-tight">
            <h2 style={{ margin: 0 }}>Conversation</h2>
            <Conversation turns={agent.transcript} state={agent.state} />
          </div>
          <div className="card stack-tight">
            <h2 style={{ margin: 0 }}>Result</h2>
            {result ? (
              <ResultCard r={result} />
            ) : (
              <p className="muted">
                Ask the agent something and the answer will land here.
              </p>
            )}
          </div>
        </div>

        {ready && (
          <details className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            <summary>
              Stores the agent knows about ({stores?.length ?? 0})
            </summary>
            <ul
              style={{
                margin: 'var(--space-2) 0 0',
                paddingLeft: 'var(--space-4)',
              }}
            >
              {(stores ?? []).map((s) => (
                <li key={s.code}>
                  <strong>{s.code}</strong> - {s.name} - {s.region}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </AppShell>
  )
}

const STATE_LABELS: Record<AgentState, string> = {
  idle: 'idle',
  connecting: 'connecting...',
  listening: 'listening',
  user_speaking: 'you are speaking',
  thinking: 'thinking...',
  speaking: 'agent is speaking',
  error: 'error',
}

function StatePill({ state }: { state: AgentState }) {
  return (
    <span
      style={{
        padding: '2px 10px',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        fontSize: 'var(--text-sm)',
        color: 'var(--color-fg-muted)',
      }}
    >
      {STATE_LABELS[state]}
    </span>
  )
}

function Conversation({
  turns,
  state,
}: {
  turns: ConvTurn[]
  state: AgentState
}) {
  if (turns.length === 0) {
    return (
      <p className="muted">
        {state === 'idle' || state === 'error'
          ? 'Click "Start conversation" and grant mic access.'
          : 'Listening for your question...'}
      </p>
    )
  }
  return (
    <ul
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        maxHeight: 360,
        overflowY: 'auto',
      }}
    >
      {turns.map((t, i) => (
        <li
          key={`${t.ts}-${i}`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            paddingBottom: 'var(--space-2)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <span
            className="muted"
            style={{ fontSize: 'var(--text-sm)', textTransform: 'uppercase' }}
          >
            {t.speaker === 'user' ? 'You' : 'Agent'}
          </span>
          <span>{t.content}</span>
        </li>
      ))}
    </ul>
  )
}

function ResultCard({ r }: { r: SalesResult }) {
  if (!r.ok) {
    return (
      <div className="stack-tight">
        <div className="muted">scope: {r.scope_label}</div>
        <p className="error" style={{ margin: 0 }}>
          {r.error === 'unknown_scope'
            ? "I couldn't find that store or region in the data."
            : r.error === 'no_data'
              ? 'No sales data has been seeded yet.'
              : r.error}
        </p>
      </div>
    )
  }
  const max = Math.max(...r.series.map((p) => p.revenue)) || 1
  const avgPerDay = r.total_revenue_mxn / Math.max(1, r.series.length)
  return (
    <div className="stack-tight">
      <div className="muted">
        {r.scope_label} - {r.date_range}
      </div>
      <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 600 }}>
        ${r.total_revenue_mxn.toLocaleString()}{' '}
        <span className="muted" style={{ fontSize: 'var(--text-base)' }}>
          MXN
        </span>
      </div>
      <p style={{ margin: 0 }}>
        {r.total_transactions.toLocaleString()} transactions -{' '}
        {r.total_units.toLocaleString()} units - ~$
        {Math.round(avgPerDay).toLocaleString()}/day
      </p>
      <svg
        viewBox="0 0 280 130"
        width="100%"
        height="130"
        role="img"
        aria-label="daily revenue"
        style={{ marginTop: 'var(--space-2)' }}
      >
        {r.series.map((p, i) => {
          const slot = 280 / r.series.length
          const w = Math.max(2, slot - 2)
          const h = (p.revenue / max) * 96
          const x = i * slot + (slot - w) / 2
          const y = 100 - h
          return (
            <rect
              key={p.date}
              x={x}
              y={y}
              width={w}
              height={h}
              fill="var(--color-accent)"
              rx="2"
            >
              <title>{`${p.date}: $${p.revenue.toLocaleString()} MXN`}</title>
            </rect>
          )
        })}
        {r.series.length > 0 && (
          <>
            <text x={6} y={118} fontSize="10" fill="var(--color-fg-muted)">
              {r.series[0]?.date}
            </text>
            <text
              x={274}
              y={118}
              fontSize="10"
              textAnchor="end"
              fill="var(--color-fg-muted)"
            >
              {r.series[r.series.length - 1]?.date}
            </text>
          </>
        )}
      </svg>
    </div>
  )
}
