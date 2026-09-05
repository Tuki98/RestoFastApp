let audioCtx: AudioContext | null = null

export function playChime() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!Ctx) return
    audioCtx = audioCtx ?? new Ctx()
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {})
    }
    const ctx = audioCtx
    const notes = [880, 1108.73]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = ctx.currentTime + i * 0.18
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.4)
    })
  } catch {
    // El navegador puede bloquear el audio hasta una interacción.
  }
}
