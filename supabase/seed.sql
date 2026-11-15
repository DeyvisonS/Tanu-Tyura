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

-- =====================================================
-- 3. ATIVIDADES INICIAIS
-- Três níveis, com cinco questões em cada atividade.
-- A seleção por nível evita depender de IDs fixos.
-- =====================================================

INSERT INTO public.atividades (titulo, descricao, nivel)
SELECT
    dados.titulo,
    dados.descricao,
    dados.nivel
FROM (
    VALUES
        ('Fácil — Reconhecimento',
         'Identificação de palavras e seus significados.',
         'facil'),
        ('Médio — Associação e compreensão',
         'Associação entre palavras Kambeba e seus significados.',
         'medio'),
        ('Avançado — Aplicação do conhecimento',
         'Aplicação e relacionamento dos conhecimentos adquiridos.',
         'avancado')
) AS dados(titulo, descricao, nivel)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.atividades existente
    WHERE existente.nivel = dados.nivel
);

-- =====================================================
-- 4. QUESTÕES E ALTERNATIVAS
-- As alternativas são armazenadas em JSONB.
-- =====================================================

WITH dados_questoes (
    nivel, ordem, enunciado, alternativas
) AS (
    VALUES
    ('facil', 1, 'O que significa a palavra UɨPɨ?',
        jsonb_build_object('A','Dois','B','Um','C','Três','D','Nove')),
    ('facil', 2, 'Qual é o significado da expressão Katw xɨsɨ?',
        jsonb_build_object('A','Boa noite','B','Bom dia','C','Boa tarde','D','De nada')),
    ('facil', 3, 'Qual cor corresponde à palavra pɨtanɨ?',
        jsonb_build_object('A','Azul','B','Vermelho','C','Verde','D','Branco')),
    ('facil', 4, 'O que significa Mamã?',
        jsonb_build_object('A','Mãe','B','Pai','C','Filha','D','Bebê')),
    ('facil', 5, 'Qual é o significado de Wka?',
        jsonb_build_object('A','Água','B','Comida','C','Casa','D','Rio')),

    ('medio', 1, 'Como se escreve o número sete em Kambeba?',
        jsonb_build_object('A','kanxe','B','suetɨ','C','oɨtɨ','D','noebe')),
    ('medio', 2, 'Qual palavra representa a cor azul?',
        jsonb_build_object('A','swekwera','B','sukwera','C','tɨnɨ','D','tɨnɨmuka')),
    ('medio', 3, 'Qual palavra significa filha?',
        jsonb_build_object('A','Memwera','B','Taɨra','C','Mamatwa','D','papatwa')),
    ('medio', 4, 'Como se diz água em Kambeba?',
        jsonb_build_object('A','Wka','B','paranã','C','Unɨ','D','ynɨmɨra')),
    ('medio', 5, 'O que significa a expressão katw ytwnɨpɨ?',
        jsonb_build_object('A','Bom dia','B','Boa tarde','C','Boa noite','D','De nada')),

    ('avancado', 1, 'Qual alternativa apresenta os números 3, 5 e 8 na ordem correta?',
        jsonb_build_object(
            'A','musapɨrɨka – pɨtɨka – oɨtɨ',
            'B','pɨtɨka – musapɨrɨka – suetɨ',
            'C','musapɨrɨka – suetɨ – oɨtɨ',
            'D','mukuɨKuɨa – pɨtɨka – oɨtɨ'
        )),
    ('avancado', 2, 'Qual alternativa apresenta corretamente as três saudações?',
        jsonb_build_object(
            'A','Katw xɨsɨ – Boa noite; katw erwka – Bom dia; katw ytwnɨpɨ – Boa tarde.',
            'B','Katw xɨsɨ – Bom dia; katw erwka – Boa tarde; katw ytwnɨpɨ – Boa noite.',
            'C','Katw xɨsɨ – Boa tarde; katw erwka – Boa noite; katw ytwnɨpɨ – Bom dia.',
            'D','Katw xɨsɨ – De nada; katw erwka – Bom dia; katw ytwnɨpɨ – Boa tarde.'
        )),
    ('avancado', 3, 'Um estudante precisa identificar as palavras correspondentes a mãe, pai e bebê. Qual alternativa apresenta a sequência correta?',
        jsonb_build_object(
            'A','Mamã – papa – waua',
            'B','Mamatwa – Memwera – Taɨra',
            'C','papa – Mamatwa – Memwera',
            'D','waua – papa – Mamatwa'
        )),
    ('avancado', 4, 'Qual alternativa apresenta três palavras do cotidiano com seus significados corretos?',
        jsonb_build_object(
            'A','Wka – Casa; Unɨ – Água; ynɨmɨra – Comida.',
            'B','Wka – Rio; Unɨ – Casa; ynɨmɨra – Caminho.',
            'C','Wka – Comida; Unɨ – Rio; ynɨmɨra – Água.',
            'D','Wka – Cadeira; Unɨ – Comida; ynɨmɨra – Casa.'
        )),
    ('avancado', 5, 'Qual alternativa apresenta três cores com seus respectivos significados corretos?',
        jsonb_build_object(
            'A','puxɨku – Amarelo; pɨtanɨ – Vermelho; sunɨ – Preto.',
            'B','puxɨku – Azul; pɨtanɨ – Verde; sunɨ – Branco.',
            'C','puxɨku – Vermelho; pɨtanɨ – Preto; sunɨ – Amarelo.',
            'D','puxɨku – Verde; pɨtanɨ – Branco; sunɨ – Azul.'
        ))
)
INSERT INTO public.questoes (
    atividade_id, enunciado, alternativas, ordem, ativo
)
SELECT
    atividade.id,
    dados.enunciado,
    dados.alternativas,
    dados.ordem,
    TRUE
FROM dados_questoes dados
JOIN public.atividades atividade
    ON atividade.nivel = dados.nivel
WHERE NOT EXISTS (
    SELECT 1
    FROM public.questoes existente
    WHERE existente.atividade_id = atividade.id
      AND existente.ordem = dados.ordem
)
ON CONFLICT (atividade_id, ordem) DO NOTHING;

-- =====================================================
-- 5. GABARITOS
-- As respostas corretas permanecem no esquema privado.
-- =====================================================

WITH dados_gabaritos (nivel, ordem, resposta_correta) AS (
    VALUES
        ('facil', 1, 'B'),
        ('facil', 2, 'B'),
        ('facil', 3, 'B'),
        ('facil', 4, 'A'),
        ('facil', 5, 'C'),

        ('medio', 1, 'B'),
        ('medio', 2, 'A'),
        ('medio', 3, 'B'),
        ('medio', 4, 'C'),
        ('medio', 5, 'C'),

        ('avancado', 1, 'A'),
        ('avancado', 2, 'B'),
        ('avancado', 3, 'A'),
        ('avancado', 4, 'A'),
        ('avancado', 5, 'A')
)
INSERT INTO private.gabaritos (questao_id, resposta_correta)
SELECT
    questao.id,
    dados.resposta_correta
FROM dados_gabaritos dados
JOIN public.atividades atividade
    ON atividade.nivel = dados.nivel
JOIN public.questoes questao
    ON questao.atividade_id = atividade.id
   AND questao.ordem = dados.ordem
ON CONFLICT (questao_id) DO NOTHING;
