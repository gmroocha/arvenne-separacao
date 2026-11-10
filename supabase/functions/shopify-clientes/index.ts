// Busca clientes na Shopify para preencher a venda do WhatsApp.
// { q: "(11) 98888-7777" | "ana@email.com" | "Ana Souza" } → nome, e-mail, telefone e endereço padrão.
// Precisa do escopo read_customers no app da Shopify (e do acesso a dados protegidos de cliente).

import { cors, exigirEquipe, json } from "../_shared/http.ts";
import { shopify } from "../_shared/shopify.ts";

const QUERY = `
query Clientes($q: String!) {
  customers(first: 25, query: $q) {
    nodes {
      legacyResourceId
      displayName
      email
      phone
      defaultAddress {
        phone
        zip
        address1
        address2
        city
        provinceCode
      }
    }
  }
}`;

// O CPF/CNPJ não fica no cadastro da cliente: vem no campo localizado TAX_CREDENTIAL_BR dos pedidos.
// Consulta separada e tolerante: se falhar (escopo, campo ausente), o cpf volta null e a busca segue.
const QUERY_CPF = `
query CpfClientes($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Customer {
      legacyResourceId
      orders(first: 1, sortKey: CREATED_AT, reverse: true) {
        nodes { localizedFields(first: 10) { nodes { key value } } }
      }
    }
  }
}`;

type CpfNode = {
  legacyResourceId?: string;
  orders?: { nodes: { localizedFields?: { nodes: { key: string; value: string | null }[] } }[] };
} | null;

async function cpfPorCliente(ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (ids.length === 0) return mapa;
  try {
    const data = await shopify<{ nodes: CpfNode[] }>(QUERY_CPF, { ids: ids.map((i) => `gid://shopify/Customer/${i}`) });
    for (const n of data.nodes) {
      const campo = n?.orders?.nodes[0]?.localizedFields?.nodes.find((f) => f.key === "TAX_CREDENTIAL_BR");
      const d = (campo?.value ?? "").replace(/\D/g, "");
      if (n?.legacyResourceId && (d.length === 11 || d.length === 14)) mapa.set(n.legacyResourceId, d);
    }
  } catch (_) {
    // segue sem CPF
  }
  return mapa;
}

type Cliente = {
  legacyResourceId: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  defaultAddress: {
    phone: string | null;
    zip: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    provinceCode: string | null;
  } | null;
};

// "Rua das Flores, 123" -> rua e número. A Shopify guarda tudo em address1.
function separarRua(address1: string | null): { logradouro: string | null; numero: string | null } {
  if (!address1) return { logradouro: null, numero: null };
  const m = address1.match(/^(.*?)[,\s-]+(\d+\w*)\s*$/);
  return m ? { logradouro: m[1].trim(), numero: m[2] } : { logradouro: address1.trim(), numero: null };
}

// Sem nome cadastrado a Shopify devolve o e-mail como nome: vira null.
function nomeReal(c: Cliente): string | null {
  const n = (c.displayName ?? "").trim();
  return !n || n.toLowerCase() === (c.email ?? "").trim().toLowerCase() ? null : n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const negado = await exigirEquipe(req);
  if (negado) return negado;

  try {
    const { q } = (await req.json()) as { q?: string };
    const termo = (q ?? "").trim().replace(/["\\]/g, "");
    if (termo.length < 3) return json({ clientes: [] });

    const digitos = termo.replace(/\D/g, "");
    // Busca por telefone usa só os dígitos; e-mail e nome vão como estão.
    const consulta = digitos.length >= 8 && digitos.length === termo.replace(/[\s()+-]/g, "").length
      ? `phone:*${digitos}*`
      : termo.includes("@")
      ? `email:${termo}`
      : termo;

    const data = await shopify<{ customers: { nodes: Cliente[] } }>(QUERY, { q: consulta });
    const cpfs = await cpfPorCliente(data.customers.nodes.map((c) => c.legacyResourceId));
    const clientes = data.customers.nodes.map((c) => {
      const a = c.defaultAddress;
      const { logradouro, numero } = separarRua(a?.address1 ?? null);
      return {
        shopify_customer_id: Number(c.legacyResourceId),
        nome: nomeReal(c),
        cpf: cpfs.get(c.legacyResourceId) ?? null,
        email: c.email,
        telefone: c.phone ?? a?.phone ?? null,
        cep: a?.zip ?? null,
        logradouro,
        numero,
        complemento: a?.address2 ?? null,
        bairro: null, // a Shopify não separa o bairro; o ViaCEP completa na tela
        cidade: a?.city ?? null,
        uf: a?.provinceCode ?? null,
      };
    });
    return json({ clientes });
  } catch (e) {
    return json({ erro: (e as Error).message }, 500);
  }
});
