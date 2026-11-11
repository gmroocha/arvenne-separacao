// Funções de cliente e endereço usadas pelo shopify-sync (pedidos) e pelo shopify-clientes (busca).

// Sem nome cadastrado a Shopify devolve o e-mail como nome: vira null.
export function nomeReal(nome: string | null | undefined, email: string | null | undefined): string | null {
  const n = (nome ?? "").trim();
  return !n || n.toLowerCase() === (email ?? "").trim().toLowerCase() ? null : n;
}

export type EnderecoShopify = {
  zip: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  provinceCode: string | null;
};

// Número de casa: "123", "123A", "s/n", "n° 45". O resto da frase vai para o complemento.
const NUMERO = /^(?:n[º°o.]?\s*)?(s\/?n|\d+[a-z]?)(?![\p{L}\d])(.*)$/iu;
const SO_NUMERO = /^(?:n[º°o.]?\s*)?(s\/?n|\d+[a-z]?)$/i;
// address2 que é só complemento (sem bairro).
const PARECE_COMPLEMENTO = /^(ap|apt|apto|apartamento|bloco|bl|casa|sala|conj|conjunto|cj|fundos|lote|sobrado|andar|loja|torre)\b/i;

// A Shopify junta rua e número em address1 ("Rua X, 123" ou "Rua X, 123, ap 4"). O original fica em
// shopify_bruto. O checkout da loja manda address2 como "complemento, bairro" ("AP 101, Parque Caravelas")
// ou só o bairro ("Centro"): o que vem depois da última vírgula é o bairro e o resto é o complemento.
export function enderecoBR(a: EnderecoShopify | null) {
  if (!a) return {};
  const partes = (a.address1 ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  let logradouro: string | null = partes[0] ?? null;
  let numero: string | null = null;
  const extras: string[] = [];
  if (partes.length > 1) {
    const m = partes[1].match(NUMERO);
    if (m) {
      numero = m[1];
      const resto = m[2].trim().replace(/^[-–:\s]+/, "");
      if (resto) extras.push(resto);
      extras.push(...partes.slice(2));
    } else if (SO_NUMERO.test(partes[partes.length - 1])) {
      logradouro = partes.slice(0, -1).join(", ");
      numero = partes[partes.length - 1].match(SO_NUMERO)![1];
    } else {
      logradouro = partes.join(", ");
    }
  } else if (logradouro) {
    // "Rua X 123" sem vírgula
    const m = logradouro.match(/^(.*\D)\s+(?:n[º°o.]?\s*)?(s\/?n|\d+[a-z]?)$/i);
    if (m) {
      logradouro = m[1].trim();
      numero = m[2];
    }
  }
  const partes2 = (a.address2 ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  let bairro: string | null = partes2.length ? partes2[partes2.length - 1] : null;
  let compl2: string | null = partes2.length > 1 ? partes2.slice(0, -1).join(", ") : null;
  if (partes2.length === 1 && PARECE_COMPLEMENTO.test(partes2[0])) {
    bairro = null;
    compl2 = partes2[0];
  }
  const complemento = [...extras, compl2].filter(Boolean).join(" - ") || null;
  return {
    entrega_cep: a.zip,
    entrega_logradouro: logradouro,
    entrega_numero: numero,
    entrega_complemento: complemento,
    entrega_bairro: bairro,
    entrega_cidade: a.city,
    entrega_uf: a.provinceCode ?? a.province,
  };
}
