import { useSyncExternalStore } from "react"

const CONSULTA_MOBILE = "(max-width: 767px)"
const assinar = (avisar: () => void) => {
  const media = window.matchMedia(CONSULTA_MOBILE)
  media.addEventListener("change", avisar)
  return () => media.removeEventListener("change", avisar)
}
const ler = () => window.matchMedia(CONSULTA_MOBILE).matches
const lerServidor = () => false

export function useIsMobile() {
  return useSyncExternalStore(assinar, ler, lerServidor)
}
