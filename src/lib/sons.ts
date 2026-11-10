// Sons curtos da bipagem, gerados na hora (WebAudio): sem arquivo, sem rede.
let ctx: AudioContext | null = null

function contexto(): AudioContext | null {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === "suspended") void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tom(frequencia: number, duracao: number, inicio = 0, tipo: OscillatorType = "sine", volume = 0.18) {
  const c = contexto()
  if (!c) return
  const t0 = c.currentTime + inicio
  const osc = c.createOscillator()
  const ganho = c.createGain()
  osc.type = tipo
  osc.frequency.value = frequencia
  ganho.gain.setValueAtTime(0.0001, t0)
  ganho.gain.exponentialRampToValueAtTime(volume, t0 + 0.01)
  ganho.gain.exponentialRampToValueAtTime(0.0001, t0 + duracao)
  osc.connect(ganho).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + duracao + 0.02)
}

export const sons = {
  ok: () => tom(1320, 0.09),
  aviso: () => {
    tom(660, 0.12, 0, "triangle")
    tom(660, 0.12, 0.17, "triangle")
  },
  erro: () => {
    tom(220, 0.35, 0, "sawtooth", 0.2)
    tom(165, 0.45, 0.22, "sawtooth", 0.2)
  },
}

export type Som = keyof typeof sons
