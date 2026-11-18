import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { toast } from "sonner"
import { ExternalLink, ImagePlus, Plus, RefreshCw, Sparkles, X } from "lucide-react"
import CampoReais from "@/components/CampoReais"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { useAtualizarPecaClube, useCriarPecaClube } from "@/lib/api"
import { enviarFoto } from "@/lib/foto"
import { lerNumero, numeroParaTexto } from "@/lib/formato"
import { lerVariante, montarVariante, proximoTipo, TIPOS_PARTE, type ParteVariante, type TipoParte } from "@/lib/varianteClube"
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
  const [partes, setPartes] = useState<ParteVariante[]>(() => lerVariante(peca?.variante))
  const [preco, setPreco] = useState(numeroParaTexto(peca?.preco ?? null))
  const [enviando, setEnviando] = useState(false)
  const mudarParte = (i: number, parcial: Partial<ParteVariante>) =>
    setPartes((ps) => ps.map((p, n) => (n === i ? { ...p, ...parcial } : p)))
  const adicionarParte = () => setPartes((ps) => [...ps, { tipo: proximoTipo(ps), valor: "" }])
  const removerParte = (i: number) => setPartes((ps) => ps.filter((_, n) => n !== i))

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
      const dados = { codigo: codigo.trim(), nome: nome.trim(), variante: montarVariante(partes), preco: precoLido, foto_url }
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
    <form onSubmit={enviar} className="grid grid-cols-1 gap-6 sm:grid-cols-[13rem_1fr]">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="codigo">Código</FieldLabel>
            <Input id="codigo" required value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="preco">Preço</FieldLabel>
            <CampoReais id="preco" value={preco} onValueChange={setPreco} />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="nome">Nome</FieldLabel>
          <Input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
        </Field>
        <FieldSet className="gap-3">
          <FieldLegend variant="label">Variante</FieldLegend>
          {partes.map((parte, i) => {
            const tipo = TIPOS_PARTE.find((t) => t.valor === parte.tipo) ?? TIPOS_PARTE[0]
            return (
              <div key={i} className="flex items-center gap-2">
                <Select value={parte.tipo} onValueChange={(t) => mudarParte(i, { tipo: t as TipoParte })}>
                  <SelectTrigger aria-label={`Tipo da variante ${i + 1}`} className="w-32 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_PARTE.map((t) => (
                      <SelectItem key={t.valor} value={t.valor}>
                        {t.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  aria-label={tipo.rotulo}
                  className="uppercase placeholder:normal-case"
                  placeholder={tipo.exemplo}
                  value={parte.valor}
                  onChange={(e) => mudarParte(i, { valor: e.target.value })}
                />
                <Button type="button" variant="ghost" size="icon-toque" aria-label={`Remover ${tipo.rotulo.toLowerCase()}`} onClick={() => removerParte(i)}>
                  <X />
                </Button>
              </div>
            )
          })}
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={adicionarParte}>
            <Plus /> {partes.length ? "Adicionar outra variante" : "Adicionar variante"}
          </Button>
          {partes.length > 0 && (
            <FieldDescription>
              Fica assim: <span className="font-medium text-foreground">{montarVariante(partes) ?? "—"}</span>
            </FieldDescription>
          )}
        </FieldSet>
        <Button type="submit" disabled={enviando}>
          {enviando && <Spinner />} {peca ? "Salvar alterações" : "Salvar peça"}
        </Button>
      </FieldGroup>
    </form>
  )
}
