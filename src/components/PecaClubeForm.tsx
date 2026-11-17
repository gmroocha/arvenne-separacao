import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { toast } from "sonner"
import { ExternalLink, ImagePlus, RefreshCw, Sparkles, X } from "lucide-react"
import CampoReais from "@/components/CampoReais"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { useAtualizarPecaClube, useCriarPecaClube } from "@/lib/api"
import { enviarFoto } from "@/lib/foto"
import { lerNumero, numeroParaTexto } from "@/lib/formato"
import { lerVariante, montarVariante, TIPOS_VARIANTE, type PartesVariante, type TipoVariante } from "@/lib/varianteClube"
import type { PecaClube } from "@/lib/tipos"

// Endereço do agente do GPT que melhora as fotos. Fica em .env.local / Cloudflare, para trocar sem código.
const LINK_AGENTE_FOTO = import.meta.env.VITE_LINK_AGENTE_FOTO as string | undefined

// O Supabase devolve erros que nem sempre são `Error`; sem isto a tela só mostrava o texto genérico.
function mensagem(err: unknown, padrao: string): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message)
  return padrao
}

// Sem "peca": cadastra uma nova. Com "peca": edita aquela (a foto atual fica, a menos que troque ou remova).
export default function PecaClubeForm({ peca, aoSalvar }: { peca?: PecaClube; aoSalvar: (peca: PecaClube) => void }) {
  const criar = useCriarPecaClube()
  const atualizar = useAtualizarPecaClube()
  const entrada = useRef<HTMLInputElement>(null)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [fotoAtual, setFotoAtual] = useState<string | null>(peca?.foto_url ?? null)
  const [codigo, setCodigo] = useState(peca?.codigo ?? "")
  const [nome, setNome] = useState(peca?.nome ?? "")
  const [variante, setVariante] = useState<PartesVariante>(() => lerVariante(peca?.variante))
  const [preco, setPreco] = useState(numeroParaTexto(peca?.preco ?? null))
  const [enviando, setEnviando] = useState(false)
  const mudarVariante = (parcial: Partial<PartesVariante>) => setVariante((v) => ({ ...v, ...parcial }))

  const novaPrevia = useMemo(() => (arquivo ? URL.createObjectURL(arquivo) : null), [arquivo])
  const previa = novaPrevia ?? fotoAtual
  useEffect(() => {
    return () => {
      if (novaPrevia) URL.revokeObjectURL(novaPrevia)
    }
  }, [novaPrevia])

  function remover() {
    setArquivo(null)
    setFotoAtual(null)
    if (entrada.current) entrada.current.value = ""
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const precoLido = preco.trim() ? lerNumero(preco) : null
    if (preco.trim() && precoLido == null) return void toast.error("Preço não entendido. Use, por exemplo, 49,90")
    setEnviando(true)
    let foto_url: string | null = fotoAtual
    try {
      if (arquivo) foto_url = await enviarFoto(arquivo)
    } catch (err) {
      toast.error(`Não foi possível enviar a foto: ${mensagem(err, "erro desconhecido")}`)
      setEnviando(false)
      return
    }
    try {
      const dados = { codigo: codigo.trim(), nome: nome.trim(), variante: montarVariante(variante), preco: precoLido, foto_url }
      const salva = peca ? await atualizar.mutateAsync({ id: peca.id, ...dados }) : await criar.mutateAsync(dados)
      toast.success(peca ? "Peça do Clube atualizada" : "Peça salva no Clube")
      aoSalvar(salva)
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
            <FieldLabel htmlFor="tipo-variante">Variante</FieldLabel>
            <Select value={variante.tipo} onValueChange={(tipo) => mudarVariante({ tipo: tipo as TipoVariante })}>
              <SelectTrigger id="tipo-variante" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_VARIANTE.map((t) => (
                  <SelectItem key={t.valor} value={t.valor}>
                    {t.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        {variante.tipo !== "nenhuma" && (
          <div className="grid gap-4 sm:grid-cols-2">
            {(variante.tipo === "cor" || variante.tipo === "tamanho_cor") && (
              <Field>
                <FieldLabel htmlFor="cor">Cor</FieldLabel>
                <Input id="cor" placeholder="Ex.: Verde" value={variante.cor} onChange={(e) => mudarVariante({ cor: e.target.value })} />
              </Field>
            )}
            {(variante.tipo === "tamanho" || variante.tipo === "tamanho_cor") && (
              <Field>
                <FieldLabel htmlFor="tamanho">Tamanho</FieldLabel>
                <Input id="tamanho" placeholder="Ex.: 16 ou P" value={variante.tamanho} onChange={(e) => mudarVariante({ tamanho: e.target.value })} />
              </Field>
            )}
            {variante.tipo === "outra" && (
              <Field>
                <FieldLabel htmlFor="variante">Qual</FieldLabel>
                <Input id="variante" placeholder="Ex.: 5 mm" value={variante.outra} onChange={(e) => mudarVariante({ outra: e.target.value })} />
              </Field>
            )}
            <p className="self-end pb-2 text-sm text-muted-foreground sm:col-span-2">
              Fica assim: <span className="font-medium text-foreground">{montarVariante(variante) ?? "—"}</span>
            </p>
          </div>
        )}
        <Field>
          <FieldLabel htmlFor="nome">Nome</FieldLabel>
          <Input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="preco">Preço</FieldLabel>
            <CampoReais id="preco" value={preco} onValueChange={setPreco} />
          </Field>
        </div>
        <Button type="submit" disabled={enviando}>
          {enviando && <Spinner />} {peca ? "Salvar alterações" : "Salvar peça"}
        </Button>
      </FieldGroup>
    </form>
  )
}
