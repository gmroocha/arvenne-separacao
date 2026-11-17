import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { iniciais } from "@/lib/equipe"
import { cn } from "@/lib/utils"

// Pessoa do time: círculo com as iniciais (cores do tema, sem foto).
export default function AvatarMembro({ nome, size = "sm", className }: { nome: string; size?: "default" | "sm" | "lg"; className?: string }) {
  return (
    <Avatar size={size} className={className} title={nome} role="img" aria-label={nome}>
      <AvatarFallback className={cn("font-semibold", size === "sm" ? "text-[10px]" : "text-xs")}>{iniciais(nome)}</AvatarFallback>
    </Avatar>
  )
}
