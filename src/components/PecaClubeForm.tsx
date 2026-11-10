import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { toast } from "sonner"
import { ExternalLink, ImagePlus, RefreshCw, Sparkles, X } from "lucide-react"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useCriarPecaClube } from "@/lib/api"
import { enviarFoto } from "@/lib/foto"
import type { PecaClube } from "@/lib/tipos"

// Endereço do agente do GPT que melhora as fotos. Fica em .env.local / Cloudflare, para trocar sem código.
const LINK_AGENTE_FOTO = import.meta.env.VITE_LINK_AGENTE_FOTO as string | undefined

// O Supabase devolve erros que nem sempre são `Error`; sem isto a tela só mostrava o texto genérico.
function mensagem(err: unknown, padrao: string): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message)
  return padrao
}

export default function PecaClubeForm({ aoSalvar }: { aoSalvar: (peca: PecaClube) => void }) {
  const criar = useCriarPecaClube()
  const entrada = useRef<HTMLInputElement>(null)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [codigo, setCodigo] = useState("")
  const [nome, setNome] = useState("")
  const [variante, setVariante] = useState("")
  const [preco, setPreco] = useState("")
  const [enviando, setEnviando] = useState(false)

  const previa = useMemo(() => (arquivo ? URL.createObjectURL(arquivo) : null), [arquivo])
  useEffect(() => {
    return () => {
      if (previa) URL.revokeObjectURL(previa)
    }
  }, [previa])

  function remover() {
    setArquivo(null)
    if (entrada.current) entrada.current.value = ""
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    let foto_url: string | null = null
    try {
      if (arquivo) foto_url = await enviarFoto(arquivo)
    } catch (err) {
      toast.error(`Não foi possível enviar a foto: ${mensagem(err, "erro desconhecido")}`)
      setEnviando(false)
      return
    }
    try {
      const peca = await criar.mutateAsync({
        codigo: codigo.trim(),
        nome: nome.trim(),
        variante: variante.trim() || null,
        preco: preco ? Number(preco.replace(",", ".")) : null,
        foto_url,
      })
      toast.success("Peça salva no Clube")
      aoSalvar(peca)
    } catch (err) {
      toast.error(`Não foi possível salvar a peça: ${mensagem(err, "erro desconhecido")}`)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="grid gap-6 sm:grid-cols-[13rem_1fr]">
      <Alert className="sm:col-span-2">
        <Sparkles />
        <AlertTitle>Melhore a foto antes de enviar</AlertTitle>
        <AlertDescription>
          Passe a foto pelo agente do GPT (qualidade, nitidez e contraste) e suba aqui a versão melhorada.
        </AlertDescription>
        {LINK_AGENTE_FOTO && (
          <AlertAction>
            <Button asChild variant="outline" size="sm">
              <a href={LINK_AGENTE_FOTO} target="_blank" rel="noreferrer">
                Abrir agente <ExternalLink />
              </a>
            </Button>
          </AlertAction>
        )}
      </Alert>
      <div className="mx-auto flex w-full max-w-48 flex-col gap-2 sm:mx-0 sm:max-w-none">
        <AspectRatio ratio={4 / 5}>
          <label className="relative flex size-full cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-dashed bg-muted/40 text-sm text-muted-foreground transition-colors hover:bg-muted has-focus-visible:border-ring has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50">
            {previa ? (
              <img src={previa} alt="Prévia da foto" className="size-full object-cover" />
            ) : (
              <>
                <ImagePlus className="size-6" />
                <span>Adicionar foto</span>
              </>
            )}
            <input
              ref={entrada}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
          </label>
        </AspectRatio>
        {previa && (
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => entrada.current?.click()}>
              <RefreshCw /> Trocar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={remover}>
              <X /> Remover
            </Button>
          </div>
        )}
      </div>

      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="codigo">Código</FieldLabel>
            <Input id="codigo" required value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="variante">Variante</FieldLabel>
            <Input id="variante" placeholder="Ex.: aro 16" value={variante} onChange={(e) => setVariante(e.target.value)} />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="nome">Nome</FieldLabel>
          <Input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="preco">Preço (R$)</FieldLabel>
            <Input id="preco" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} />
          </Field>
        </div>
        <Button type="submit" disabled={enviando}>
          {enviando && <Spinner />} Salvar peça
        </Button>
      </FieldGroup>
    </form>
  )
}
