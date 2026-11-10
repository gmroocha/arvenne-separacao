import logoBranca from "@/assets/logo-branca.svg"
import logoPreta from "@/assets/logo-preta.svg"
import { cn } from "@/lib/utils"

// Logo da Arvenne: a preta no tema claro, a branca no tema escuro.
export default function Logo({ className }: { className?: string }) {
  return (
    <>
      <img src={logoPreta} alt="Arvenne" className={cn("block w-auto dark:hidden", className)} />
      <img src={logoBranca} alt="Arvenne" className={cn("hidden w-auto dark:block", className)} />
    </>
  )
}
