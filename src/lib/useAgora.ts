import { useEffect, useState } from "react"

// Hora atual, renovada a cada minuto (para prazos e "atrasado").
export function useAgora(ms = 60_000) {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return agora
}
