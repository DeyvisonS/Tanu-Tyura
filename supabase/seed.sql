-- =====================================================
-- TANU-TYURA: DADOS INICIAIS
-- Cinco módulos e 43 palavras
-- Este arquivo serve para reproduzir os dados
-- em outro ambiente. Não executar agora no banco atual.
-- =====================================================

-- 1. MÓDULOS
INSERT INTO public.modulos (nome, descricao, ordem)
VALUES
    ('Cumprimentos e apresentações',
     'Conteúdos sobre cumprimentos e apresentações.', 1),
    ('Números',
     'Conteúdos de aprendizagem sobre números.', 2),
    ('Cores',
     'Conteúdos de aprendizagem sobre cores.', 3),
    ('Família e pessoas',
     'Vocabulário relacionado à família e às pessoas.', 4),
    ('Palavras do cotidiano',
     'Palavras utilizadas no cotidiano.', 5)
ON CONFLICT (nome) DO NOTHING;

-- 2. PALAVRAS
INSERT INTO public.palavras (
    modulo_id,
    termo_kambeba,
    traducao_portugues,
    audio_url,
    ativo
)
SELECT
    m.id,
    v.termo_kambeba,
    v.traducao_portugues,
    NULL,
    TRUE
FROM (
    VALUES
    -- Módulo 1: Cumprimentos e apresentações
    ('Cumprimentos e apresentações', 'Katw xɨsɨ', 'Bom dia!'),
    ('Cumprimentos e apresentações', 'katw erwka', 'Boa tarde!'),
    ('Cumprimentos e apresentações', 'katw ytwnɨpɨ', 'Boa noite!'),
    ('Cumprimentos e apresentações', 'Dɨ Mɨramɨm', 'De nada'),
    ('Cumprimentos e apresentações', 'xɨra', 'Nome'),
    ('Cumprimentos e apresentações', 'Ta xɨra', 'Meu nome'),
    ('Cumprimentos e apresentações', 'Aɨ', 'Eu'),
    ('Cumprimentos e apresentações', 'Ene', 'Tu'),
    ('Cumprimentos e apresentações', 'ynê', 'Você'),

    -- Módulo 2: Números de 0 a 9
    ('Números', 'putimaã', '0'),
    ('Números', 'UɨPɨ', '1'),
    ('Números', 'mukuɨKuɨa', '2'),
    ('Números', 'musapɨrɨka', '3'),
    ('Números', 'ywaka', '4'),
    ('Números', 'pɨtɨka', '5'),
    ('Números', 'kanxe', '6'),
    ('Números', 'suetɨ', '7'),
    ('Números', 'oɨtɨ', '8'),
    ('Números', 'noebe', '9'),

    -- Módulo 3: Cores
    ('Cores', 'puxɨku', 'Amarelo'),
    ('Cores', 'pɨtanɨ', 'Vermelho'),
    ('Cores', 'sunɨ', 'Preto'),
    ('Cores', 'swekwera', 'Azul'),
    ('Cores', 'sukwera', 'Verde'),
    ('Cores', 'tɨnɨ', 'Branco'),
    ('Cores', 'tɨnɨmuka', 'Cinza'),
    ('Cores', 'pɨtanɨtɨnga', 'Rosa'),

    -- Módulo 4: Família e pessoas
    ('Família e pessoas', 'Mamã', 'Mãe'),
    ('Família e pessoas', 'papa', 'Pai'),
    ('Família e pessoas', 'Memwera', 'Filho'),
    ('Família e pessoas', 'Taɨra', 'Filha'),
    ('Família e pessoas', 'Mamatwa', 'Avó'),
    ('Família e pessoas', 'papatwa', 'Avô'),
    ('Família e pessoas', 'Mwarɨrɨ', 'Neto'),
    ('Família e pessoas', 'waua', 'Nenê / bebê'),

    -- Módulo 5: Palavras do cotidiano
    ('Palavras do cotidiano', 'Wka', 'Casa'),
    ('Palavras do cotidiano', 'Unɨ', 'Água'),
    ('Palavras do cotidiano', 'Tama', 'Cidade'),
    ('Palavras do cotidiano', 'kwara', 'Caminho'),
    ('Palavras do cotidiano', 'paranã', 'Rio'),
    ('Palavras do cotidiano', 'pɨnuko', 'Cadeira'),
    ('Palavras do cotidiano', 'Tutwmaxɨru', 'Camisa'),
    ('Palavras do cotidiano', 'ynɨmɨra', 'Comida')
) AS v(modulo_nome, termo_kambeba, traducao_portugues)
JOIN public.modulos AS m
    ON m.nome = v.modulo_nome
ON CONFLICT (modulo_id, termo_kambeba) DO NOTHING;