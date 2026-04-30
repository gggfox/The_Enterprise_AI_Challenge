import { AppShell } from '@/components/AppShell/AppShell'
import { Button } from '@/components/Button/Button'
import {
  type AgentState,
  type ConvTurn,
  type DeepgramFunctionSchema,
  useDeepgramAgent,
} from '@/lib/deepgram/useDeepgramAgent'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/ask')({ component: AskPage })

const SYSTEM_PROMPT = `You are an analytics assistant for the regional manager of a chain of convenience stores (think OXXO / 7-Eleven) in Mexico.
The user will ask questions about store performance: sales, traffic, average ticket, shrinkage, headcount, inventory, and similar metrics, scoped to a specific store, region, or the whole chain.

Rules:
- Whenever the user asks for a number, trend, or comparison, you MUST call the get_store_metric function. Never make numbers up.
- After the function returns, give a one-sentence insight in plain language and state the headline number. Keep spoken responses under 25 words.
- If the user's request is ambiguous (no scope or no period), pick a reasonable default and mention it briefly.
- Speak in English. Spanish support will be added later.`

const FUNCTIONS: readonly DeepgramFunctionSchema[] = [
  {
    name: 'get_store_metric',
    description:
      'Look up a metric (sales, ticket_avg, shrinkage, headcount, traffic, inventory_turns) for a store, region, or the whole chain over a period. Returns a headline value plus a daily series and a one-line insight.',
    parameters: {
      type: 'object',
      properties: {
        metric: {
          type: 'string',
          description:
            'Which metric to retrieve. One of: sales, ticket_avg, shrinkage, headcount, traffic, inventory_turns.',
        },
        scope: {
          type: 'string',
          description:
            'Store id (e.g. "store:MTY-014"), region (e.g. "region:north"), or "all" for chain-wide.',
        },
        period: {
          type: 'string',
          description:
            'Time window: "today", "this_week", "last_week", "this_month", "last_month".',
        },
      },
      required: ['metric'],
    },
  },
]

const GREETING =
  "Hi, I'm your store data assistant. Ask me about sales, traffic, or any metric and I'll pull the numbers."

type StoreMetricResult = {
  metric: string
  scope: string
  period: string
  value: number
  unit: string
  series: { label: string; value: number }[]
  insight: string
}

// Stub backend. Swap to a Bridge call (POST /api/v1/ask) once the
// real analytics endpoint exists.
function mockGetStoreMetric(args: Record<string, unknown>): StoreMetricResult {
  const metric = String(args.metric ?? 'sales')
  const scope = String(args.scope ?? 'region:north')
  const period = String(args.period ?? 'this_week')
  const series = [
    { label: 'Mon', value: 12_400 },
    { label: 'Tue', value: 13_900 },
    { label: 'Wed', value: 15_200 },
    { label: 'Thu', value: 14_100 },
    { label: 'Fri', value: 18_700 },
    { label: 'Sat', value: 21_300 },
    { label: 'Sun', value: 19_800 },
  ]
  const total = series.reduce((a, b) => a + b.value, 0)
  const unit =
    metric === 'sales' || metric === 'ticket_avg'
      ? 'MXN'
      : metric === 'shrinkage'
        ? 'percent'
        : metric === 'headcount' || metric === 'traffic'
          ? 'count'
          : 'turns'
  return {
    metric,
    scope,
    period,
    value: total,
    unit,
    series,
    insight: `${metric} in ${scope} is up ~14% week-over-week, mostly driven by the weekend.`,
  }
}

function AskPage() {
  const agent = useDeepgramAgent({
    language: 'en',
    systemPrompt: SYSTEM_PROMPT,
    greeting: GREETING,
    functions: FUNCTIONS,
    onToolCall: (name, args) => {
      if (name === 'get_store_metric') return mockGetStoreMetric(args)
      return { error: `unknown_tool:${name}` }
    },
  })

  const result = agent.lastTool?.result as StoreMetricResult | undefined
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
            Ask in plain English. The agent calls a tool for the numbers, then
            narrates the insight. Spanish support coming next.
          </p>
        </header>

        <div className="row">
          {!isRunning ? (
            <Button
              variant="primary"
              onClick={() => void agent.start()}
              disabled={agent.state === 'connecting'}
            >
              {agent.state === 'connecting'
                ? 'Connecting…'
                : 'Start conversation'}
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
      </section>
    </AppShell>
  )
}

const STATE_LABELS: Record<AgentState, string> = {
  idle: 'idle',
  connecting: 'connecting…',
  listening: 'listening',
  user_speaking: 'you are speaking',
  thinking: 'thinking…',
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
          : 'Listening for your question…'}
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

function ResultCard({ r }: { r: StoreMetricResult }) {
  const max = Math.max(...r.series.map((p) => p.value)) || 1
  return (
    <div className="stack-tight">
      <div className="muted">
        {r.metric} · {r.scope} · {r.period}
      </div>
      <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 600 }}>
        {r.value.toLocaleString()}{' '}
        <span className="muted" style={{ fontSize: 'var(--text-base)' }}>
          {r.unit}
        </span>
      </div>
      <p style={{ margin: 0 }}>{r.insight}</p>
      <svg
        viewBox="0 0 280 130"
        width="100%"
        height="130"
        role="img"
        aria-label={`${r.metric} chart`}
        style={{ marginTop: 'var(--space-2)' }}
      >
        {r.series.map((p, i) => {
          const slot = 280 / r.series.length
          const w = slot - 6
          const h = (p.value / max) * 96
          const x = i * slot + 3
          const y = 100 - h
          return (
            <g key={p.label}>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill="var(--color-accent)"
                rx="4"
              />
              <text
                x={x + w / 2}
                y={118}
                fontSize="10"
                textAnchor="middle"
                fill="var(--color-fg-muted)"
              >
                {p.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
