-- Novo status "avisar_cliente": a peça deu problema (falta/defeito) e a cliente ainda não foi avisada.
-- Depois de avisar, o pedido vai para "aguardando_cliente". A fase da v_pedidos cai no else 'expedicao'.
alter table public.pedidos drop constraint if exists pedidos_status_check;
alter table public.pedidos add constraint pedidos_status_check check (status in (
  'em_aberto', 'aguardando_pagamento', 'perdida',
  'novo', 'separacao', 'avisar_cliente', 'aguardando_cliente', 'conferencia', 'etiquetagem', 'bipagem',
  'faturamento', 'embalagem', 'pronto_envio', 'enviado', 'cancelado'));
