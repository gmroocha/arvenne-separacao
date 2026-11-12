import { Search } from "lucide-react"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

type Props = {
  valor: string
  aoMudar: (v: string) => void
  placeholder: string
  carregando?: boolean
  className?: string
  autoFocus?: boolean
}

// Campo de busca com lupa (ou spinner enquanto carrega). Alto no celular, normal no PC.
export function CampoBusca({ valor, aoMudar, placeholder, carregando, className, autoFocus }: Props) {
  return (
    <InputGroup className={cn("h-11 min-w-0 lg:h-9", className)}>
      <InputGroupAddon>{carregando ? <Spinner /> : <Search />}</InputGroupAddon>
      <InputGroupInput aria-label={placeholder} placeholder={placeholder} value={valor} autoFocus={autoFocus} onChange={(e) => aoMudar(e.target.value)} />
    </InputGroup>
  )
}
