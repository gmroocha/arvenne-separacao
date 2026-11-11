import logoBranca from "@/assets/logo-pratas-branca.svg"
import logoPreta from "@/assets/logo-pratas-preta.svg"
import { cn } from "@/lib/utils"

// Logo da Arvenne: a preta no tema claro, a branca no tema escuro.
export default function Logo({ className }: { className?: string }) {
  return (
    <>
      <img src={logoPreta} alt="Arvenne Pratas" className={cn("block w-auto dark:hidden", className)} />
      <img src={logoBranca} alt="Arvenne Pratas" className={cn("hidden w-auto dark:block", className)} />
    </>
  )
}
