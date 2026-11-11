// Acesso à Admin API da Shopify por um app do Dev Dashboard instalado na loja.
// O token é gerado com client_credentials e dura pouco; fica em cache na instância.

const DOMAIN = Deno.env.get("SHOPIFY_STORE_DOMAIN") ?? "";
const CLIENT_ID = Deno.env.get("SHOPIFY_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("SHOPIFY_CLIENT_SECRET") ?? "";
const VERSION = Deno.env.get("SHOPIFY_API_VERSION") ?? "2026-01";

let cache: { token: string; expira: number } | null = null;

async function tokenAdmin(): Promise<string> {
  if (cache && Date.now() < cache.expira) return cache.token;
  if (!DOMAIN || !CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Faltam SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID ou SHOPIFY_CLIENT_SECRET nos segredos.");
  }
  const res = await fetch(`https://${DOMAIN}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) {
    const texto = await res.text();
    if (texto.includes("app_not_installed")) {
      throw new Error("O app da Shopify não está instalado nesta loja. No Dev Dashboard, abra o app e use Instalar app.");
    }
    // A Shopify às vezes devolve uma página HTML inteira: reduz a texto curto para a tela.
    const curto = texto.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
    throw new Error(`Token Shopify falhou (${res.status}): ${curto}`);
  }
  const { access_token, expires_in } = await res.json();
  cache = { token: access_token, expira: Date.now() + (expires_in ?? 300) * 1000 - 60_000 };
  return access_token;
}

// Erro com o status HTTP (a repetição e a limpeza do token decidem por ele).
class ErroShopify extends Error {
  status: number;
  constructor(mensagem: string, status: number) {
    super(mensagem);
    this.status = status;
  }
}

let custoLogado = false;

async function chamar<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`https://${DOMAIN}/admin/api/${VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await tokenAdmin() },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors) {
    throw new ErroShopify(`Shopify ${res.status}: ${JSON.stringify(body.errors ?? body).slice(0, 500)}`, res.status);
  }
  // Uma vez por instância: mostra o custo pedido, para ver se a consulta chega perto do limite (1000).
  if (!custoLogado && body.extensions?.cost) {
    custoLogado = true;
    console.log("Shopify custo da consulta:", JSON.stringify(body.extensions.cost.requestedQueryCost ?? body.extensions.cost));
  }
  return body.data as T;
}

export function urlAdminPedido(id: string | number): string {
  const loja = DOMAIN.replace(".myshopify.com", "");
  return `https://admin.shopify.com/store/${loja}/orders/${id}`;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Tempo esgotado ou conexão caída (fetch com AbortSignal.timeout lança TimeoutError/AbortError).
function ehTimeout(e: unknown): boolean {
  const nome = (e as Error)?.name ?? "";
  return nome === "TimeoutError" || nome === "AbortError" || e instanceof TypeError;
}

// A Admin API limita o custo por segundo: no THROTTLED espera e tenta de novo. Também repete em erro 5xx
// e timeout. No 401 (token vencido ou trocado) limpa o cache do token e tenta com um novo.
export async function consulta<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    try {
      return await chamar<T>(query, variables);
    } catch (e) {
      const status = e instanceof ErroShopify ? e.status : 0;
      if (tentativa === 5) throw e;
      if (status === 401) {
        cache = null;
      } else if (!(String((e as Error).message).includes("THROTTLED") || status >= 500 || ehTimeout(e))) {
        throw e;
      }
      await espera(1500 * 2 ** tentativa);
    }
  }
  throw new Error("Shopify: limite de consultas persistente");
}

export { consulta as shopify };
