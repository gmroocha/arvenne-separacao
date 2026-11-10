-- O checkout da loja manda address2 como "complemento, bairro" (ou só o bairro). A primeira versão
-- da sincronização gravou o address2 inteiro no complemento e deixou o bairro vazio.
-- Corrige só pedidos da Shopify cujo complemento ainda é exatamente o address2 original
-- (ninguém editou) e que ainda não têm bairro. O que a equipe já ajustou à mão não é tocado.
update public.pedidos p
set entrega_bairro      = nullif(trim(regexp_replace(s.a2, '^.*,', '')), ''),
    entrega_complemento = nullif(trim(case when s.a2 like '%,%' then regexp_replace(s.a2, ',[^,]*$', '') end), '')
from (
  select id, nullif(trim(shopify_bruto->'shippingAddress'->>'address2'), '') as a2
  from public.pedidos
  where origem = 'shopify' and shopify_bruto is not null
) s
where p.id = s.id
  and p.entrega_bairro is null
  and s.a2 is not null
  and p.entrega_complemento = s.a2;
