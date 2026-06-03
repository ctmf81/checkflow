-- Label customizável para grupos e subgrupos
alter table grupos    add column if not exists grupo_label    text; -- como este grupo é chamado (ex: Setor)
alter table grupos    add column if not exists subgrupo_label text; -- como os subgrupos são chamados (ex: Área)
alter table subgrupos add column if not exists subgrupo_label text; -- como este subgrupo é chamado (ex: Área)
