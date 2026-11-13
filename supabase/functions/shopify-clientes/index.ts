// Busca clientes na Shopify para preencher a venda do WhatsApp.
// { q: "(11) 98888-7777" | "ana@email.com" | "Ana Souza" } → nome, e-mail, telefone e endereço padrão.
// Precisa do escopo read_customers no app da Shopify (e do acesso a dados protegidos de cliente).

import { cors, exigirEquipe, json } from "../_shared/http.ts";
import { shopify } from "../_shared/shopify.ts";
import { enderecoBR, nomeReal } from "../_shared/cliente.ts";

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
        province
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

async function cpfPorCliente(ids: string[], limite: number): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (ids.length === 0) return mapa;
  try {
    const data = await shopify<{ nodes: CpfNode[] }>(QUERY_CPF, { ids: ids.map((i) => `gid://shopify/Customer/${i}`) }, { limite });
    for (const n of data.nodes) {
      const campo = n?.orders?.nodes[0]?.localizedFields?.nodes.find((f) => f.key === "TAX_CREDENTIAL_BR");
      const d = (campo?.value ?? "").replace(/\D/g, "");
      if (n?.legacyResourceId && (d.length === 11 || d.length === 14)) mapa.set(n.legacyResourceId, d);
    }
  } catch {
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
    province: string | null;
    provinceCode: string | null;
  } | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const negado = await exigirEquipe(req);
  if (negado) return negado;

  try {
    const limite = Date.now() + 60_000;
    const { q } = (await req.json()) as { q?: string };
    // Entre aspas na busca da Shopify: tira o que tem significado na sintaxe (aspas, barra, : * ( ) -).
    const termo = (q ?? "").trim().replace(/["\\:*()-]/g, " ").replace(/\s+/g, " ").trim();
    if (termo.length < 3) return json({ clientes: [] });

    const bruto = termo.replace(/\D/g, "");
    const digitos = bruto.length >= 12 && bruto.startsWith("55") ? bruto.slice(2) : bruto; // tira o +55 digitado
    // Telefone brasileiro (DDD + número, 10 ou 11 dígitos): a Shopify guarda em E.164 (+55...).
    // Só o e-mail e o nome entram como texto.
    const soTelefone = bruto.length > 0 && bruto.length === termo.replace(/[\s+]/g, "").length;
    const consulta = soTelefone && (digitos.length === 10 || digitos.length === 11)
      ? `phone:+55${digitos}`
      : soTelefone && digitos.length >= 8
      ? `phone:*${digitos}*`
      : (q ?? "").includes("@")
      ? `email:"${(q ?? "").trim().replace(/["\\]/g, "")}"`
      : `"${termo}"`;

    const data = await shopify<{ customers: { nodes: Cliente[] } }>(QUERY, { q: consulta }, { limite });
    const cpfs = await cpfPorCliente(data.customers.nodes.map((c) => c.legacyResourceId), limite);
    const clientes = data.customers.nodes.map((c) => {
      const a = c.defaultAddress;
      const e = enderecoBR(a) as Record<string, string | null | undefined>;
      return {
        shopify_customer_id: Number(c.legacyResourceId),
        nome: nomeReal(c.displayName, c.email),
        cpf: cpfs.get(c.legacyResourceId) ?? null,
        email: c.email,
        telefone: c.phone ?? a?.phone ?? null,
        cep: e.entrega_cep ?? null,
        logradouro: e.entrega_logradouro ?? null,
        numero: e.entrega_numero ?? null,
        complemento: e.entrega_complemento ?? null,
        bairro: e.entrega_bairro ?? null, // address2 do checkout ("complemento, bairro"); o ViaCEP confirma na tela
        cidade: e.entrega_cidade ?? null,
        uf: e.entrega_uf ?? null,
      };
    });
    return json({ clientes });
  } catch (e) {
    return json({ erro: (e as Error).message }, 500);
  }
});
