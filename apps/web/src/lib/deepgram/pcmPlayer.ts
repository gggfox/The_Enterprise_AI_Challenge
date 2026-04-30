/**
 * Plays back-to-back linear16 PCM chunks from Deepgram's Voice Agent.
 * The agent streams raw int16 frames; we convert them to Float32 AudioBuffers
 * and chain them on the WebAudio timeline so playback is gapless.
 */
export class PCMPlayer {
  private ctx: AudioContext
  private gain: GainNode
  private nextStart = 0
  private sources: AudioBufferSourceNode[] = []
  private readonly sampleRate: number

  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate
    this.ctx = new AudioContext({ sampleRate })
    this.gain = this.ctx.createGain()
    this.gain.connect(this.ctx.destination)
  }

  async resume() {
    if (this.ctx.state === 'suspended') await this.ctx.resume()
  }

  enqueue(int16: Int16Array) {
    if (int16.length === 0) return
    const buffer = this.ctx.createBuffer(1, int16.length, this.sampleRate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < int16.length; i++) {
      channel[i] = (int16[i] ?? 0) / 0x8000
    }
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.connect(this.gain)
    // 20ms cushion so the first chunk doesn't get clipped by clock drift.
    const startAt = Math.max(this.ctx.currentTime + 0.02, this.nextStart)
    src.start(startAt)
    this.nextStart = startAt + buffer.duration
    this.sources.push(src)
    src.onended = () => {
      this.sources = this.sources.filter((s) => s !== src)
    }
  }

  // Barge-in: the user started speaking, so cut the agent off mid-word.
  stop() {
    for (const s of this.sources) {
      try {
        s.stop()
      } catch {}
    }
    this.sources = []
    this.nextStart = 0
  }

  close() {
    this.stop()
    void this.ctx.close()
  }
}
