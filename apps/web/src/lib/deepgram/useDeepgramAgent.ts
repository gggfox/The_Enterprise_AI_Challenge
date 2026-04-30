/**
 * Browser ↔ Deepgram Voice Agent (V1) WebSocket hook.
 *
 * Pipeline:
 *   mic -> ScriptProcessor -> linear16 frames -> WS (Deepgram)
 *   WS -> {ConversationText, FunctionCallRequest, ...} JSON + binary TTS
 *   binary TTS -> PCMPlayer (chained AudioBufferSourceNodes)
 *
 * Tool calls: when the LLM in the agent emits FunctionCallRequest,
 * we hand it to `onToolCall`, then send the result back as
 * FunctionCallResponse so the agent can narrate it.
 *
 * Auth: browsers can't set custom headers on WebSockets, so we pass the
 * Deepgram API key via the `Sec-WebSocket-Protocol` subprotocol pair
 * `["token", <key>]` -- this is Deepgram's documented browser flow.
 *
 * SECURITY NOTE: VITE_DEEPGRAM_API_KEY is baked into the browser bundle.
 * That's fine for hackathon/demo. Before any real deploy, replace this
 * with a Bridge endpoint that mints a short-lived scoped Deepgram key.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { PCMPlayer } from './pcmPlayer'

const AGENT_URL = 'wss://agent.deepgram.com/v1/agent/converse'
const MIC_SAMPLE_RATE = 16000
const TTS_SAMPLE_RATE = 24000

export type ConvTurn = {
  speaker: 'user' | 'assistant'
  content: string
  ts: number
}

export type AgentState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'user_speaking'
  | 'thinking'
  | 'speaking'
  | 'error'

export type ToolResult = {
  name: string
  args: Record<string, unknown>
  result: unknown
}

export type DeepgramAgentOptions = {
  language?: 'en' | 'es' | 'multi'
  systemPrompt: string
  greeting: string
  functions: readonly DeepgramFunctionSchema[]
  onToolCall: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<unknown> | unknown
}

export type DeepgramFunctionSchema = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

type AgentJSONMessage =
  | { type: 'Welcome' | 'SettingsApplied' }
  | { type: 'UserStartedSpeaking' }
  | { type: 'AgentThinking' }
  | { type: 'AgentStartedSpeaking' }
  | { type: 'AgentAudioDone' }
  | { type: 'ConversationText'; role?: string; content?: string }
  | {
      type: 'FunctionCallRequest'
      functions?: { id: string; name: string; arguments: string }[]
    }
  | { type: 'Error' | 'AgentError'; description?: string; message?: string }

export function useDeepgramAgent(opts: DeepgramAgentOptions) {
  const [state, setState] = useState<AgentState>('idle')
  const [transcript, setTranscript] = useState<ConvTurn[]>([])
  const [lastTool, setLastTool] = useState<ToolResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const srcRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const procRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const playerRef = useRef<PCMPlayer | null>(null)
  const keepAliveRef = useRef<number | null>(null)

  // Stash the latest opts so the WS handlers always see fresh callbacks
  // without us having to tear down the socket every render.
  const optsRef = useRef(opts)
  optsRef.current = opts

  const stop = useCallback(() => {
    if (keepAliveRef.current !== null) {
      clearInterval(keepAliveRef.current)
      keepAliveRef.current = null
    }
    procRef.current?.disconnect()
    srcRef.current?.disconnect()
    procRef.current = null
    srcRef.current = null
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop()
      streamRef.current = null
    }
    if (ctxRef.current) {
      void ctxRef.current.close()
      ctxRef.current = null
    }
    if (playerRef.current) {
      playerRef.current.close()
      playerRef.current = null
    }
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) {
      wsRef.current.close()
    }
    wsRef.current = null
    setState('idle')
  }, [])

  const start = useCallback(async () => {
    const apiKey = import.meta.env?.VITE_DEEPGRAM_API_KEY as string | undefined
    if (!apiKey) {
      setError('VITE_DEEPGRAM_API_KEY is not set')
      setState('error')
      return
    }

    try {
      setState('connecting')
      setError(null)
      setTranscript([])

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      streamRef.current = stream

      const ws = new WebSocket(AGENT_URL, ['token', apiKey])
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      const player = new PCMPlayer(TTS_SAMPLE_RATE)
      await player.resume()
      playerRef.current = player

      ws.onopen = () => {
        const lang = optsRef.current.language ?? 'en'
        ws.send(
          JSON.stringify({
            type: 'Settings',
            audio: {
              input: { encoding: 'linear16', sample_rate: MIC_SAMPLE_RATE },
              output: {
                encoding: 'linear16',
                sample_rate: TTS_SAMPLE_RATE,
                container: 'none',
              },
            },
            agent: {
              language: lang,
              listen: {
                provider: { type: 'deepgram', model: 'nova-3' },
              },
              think: {
                provider: { type: 'open_ai', model: 'gpt-4o-mini' },
                prompt: optsRef.current.systemPrompt,
                functions: optsRef.current.functions,
              },
              speak: {
                provider: { type: 'deepgram', model: 'aura-2-thalia-en' },
              },
              greeting: optsRef.current.greeting,
            },
          }),
        )

        const ctx = new AudioContext({ sampleRate: MIC_SAMPLE_RATE })
        ctxRef.current = ctx
        const src = ctx.createMediaStreamSource(stream)
        srcRef.current = src
        // ScriptProcessor is deprecated but ships everywhere and avoids
        // the AudioWorklet+Vite asset-URL plumbing for one demo route.
        const proc = ctx.createScriptProcessor(4096, 1, 1)
        procRef.current = proc

        proc.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return
          const input = e.inputBuffer.getChannelData(0)
          const out = new Int16Array(input.length)
          for (let i = 0; i < input.length; i++) {
            const v = Math.max(-1, Math.min(1, input[i] ?? 0))
            out[i] = v < 0 ? v * 0x8000 : v * 0x7fff
          }
          ws.send(out.buffer)
        }

        src.connect(proc)
        // ScriptProcessor needs *some* downstream node or onaudioprocess
        // never fires; route through a muted gain so we don't echo the mic.
        const sink = ctx.createGain()
        sink.gain.value = 0
        proc.connect(sink)
        sink.connect(ctx.destination)

        keepAliveRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'KeepAlive' }))
          }
        }, 8000)

        setState('listening')
      }

      const parseArgs = (raw: string): Record<string, unknown> => {
        try {
          return JSON.parse(raw) as Record<string, unknown>
        } catch {
          return {}
        }
      }

      const runOneCall = async (call: {
        id: string
        name: string
        arguments: string
      }) => {
        const args = parseArgs(call.arguments)
        let result: unknown
        try {
          result = await optsRef.current.onToolCall(call.name, args)
        } catch (err) {
          result = { error: err instanceof Error ? err.message : 'tool_failed' }
        }
        setLastTool({ name: call.name, args, result })
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'FunctionCallResponse',
              function_call_id: call.id,
              name: call.name,
              content: JSON.stringify(result),
            }),
          )
        }
      }

      const handleFunctionCalls = async (
        calls: { id: string; name: string; arguments: string }[],
      ) => {
        for (const call of calls) await runOneCall(call)
      }

      const handleJSON = (msg: AgentJSONMessage) => {
        switch (msg.type) {
          case 'UserStartedSpeaking':
            playerRef.current?.stop()
            setState('user_speaking')
            return
          case 'ConversationText': {
            const who = msg.role
            setTranscript((t) => [
              ...t,
              {
                speaker: who === 'user' ? 'user' : 'assistant',
                content: String(msg.content ?? ''),
                ts: Date.now(),
              },
            ])
            return
          }
          case 'AgentThinking':
            setState('thinking')
            return
          case 'AgentStartedSpeaking':
            setState('speaking')
            return
          case 'AgentAudioDone':
            setState('listening')
            return
          case 'FunctionCallRequest':
            void handleFunctionCalls(msg.functions ?? [])
            return
          case 'Error':
          case 'AgentError':
            setError(String(msg.description ?? msg.message ?? 'Agent error'))
            setState('error')
            return
        }
      }

      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') {
          playerRef.current?.enqueue(new Int16Array(ev.data as ArrayBuffer))
          return
        }
        try {
          handleJSON(JSON.parse(ev.data) as AgentJSONMessage)
        } catch {}
      }

      ws.onerror = () => {
        setError('WebSocket error')
        setState('error')
      }
      ws.onclose = () => {
        stop()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start')
      setState('error')
      stop()
    }
  }, [stop])

  useEffect(() => () => stop(), [stop])

  return { state, transcript, lastTool, error, start, stop }
}
