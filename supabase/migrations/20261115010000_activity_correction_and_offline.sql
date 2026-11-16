-- Atualização do banco para correção de atividades e sincronização offline.
-- Esta migração registra alterações já aplicadas no projeto remoto.

ALTER TABLE public.resultados
    ADD COLUMN IF NOT EXISTS tentativa_uuid UUID;

UPDATE public.resultados
SET tentativa_uuid = gen_random_uuid()
WHERE tentativa_uuid IS NULL;

ALTER TABLE public.resultados
    ALTER COLUMN tentativa_uuid SET DEFAULT gen_random_uuid();

ALTER TABLE public.resultados
    ALTER COLUMN tentativa_uuid SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS resultados_tentativa_uuid_uidx
    ON public.resultados (tentativa_uuid);

CREATE OR REPLACE FUNCTION public.corrigir_atividade(
    p_tentativa_uuid UUID,
    p_atividade_id BIGINT,
    p_respostas JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_usuario_id UUID;
    v_total INTEGER;
    v_total_respostas INTEGER;
    v_respostas_validas INTEGER;
    v_gabaritos INTEGER;
    v_acertos INTEGER;
    v_resultado_id BIGINT;
    v_data_realizacao TIMESTAMPTZ;
    v_existente public.resultados%ROWTYPE;
BEGIN
    v_usuario_id := auth.uid();

    IF v_usuario_id IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado.'
            USING ERRCODE = '42501';
    END IF;

    IF p_tentativa_uuid IS NULL OR p_atividade_id IS NULL THEN
        RAISE EXCEPTION 'Identificador da tentativa e atividade são obrigatórios.';
    END IF;

    IF pg_catalog.jsonb_typeof(p_respostas) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'As respostas devem ser enviadas em formato de lista.';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_tentativa_uuid::text, 0)
    );

    SELECT *
    INTO v_existente
    FROM public.resultados
    WHERE tentativa_uuid = p_tentativa_uuid;

    IF FOUND THEN
        IF v_existente.usuario_id <> v_usuario_id
           OR v_existente.atividade_id <> p_atividade_id THEN
            RAISE EXCEPTION 'Identificador de tentativa já utilizado.'
                USING ERRCODE = '42501';
        END IF;

        RETURN pg_catalog.jsonb_build_object(
            'resultado_id', v_existente.id,
            'tentativa_uuid', v_existente.tentativa_uuid,
            'acertos', v_existente.acertos,
            'total_questoes', v_existente.total_questoes,
            'data_realizacao', v_existente.data_realizacao,
            'ja_processada', true
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.atividades
        WHERE id = p_atividade_id
    ) THEN
        RAISE EXCEPTION 'Atividade não encontrada.';
    END IF;

    SELECT pg_catalog.count(*)::INTEGER
    INTO v_total
    FROM public.questoes
    WHERE atividade_id = p_atividade_id
      AND ativo = TRUE;

    IF v_total <> 5 THEN
        RAISE EXCEPTION 'A atividade deve possuir exatamente cinco questões ativas.';
    END IF;

    v_total_respostas := pg_catalog.jsonb_array_length(p_respostas);

    IF v_total_respostas <> v_total THEN
        RAISE EXCEPTION 'É necessário responder às cinco questões.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_array_elements(p_respostas) AS item(value)
        WHERE pg_catalog.jsonb_typeof(item.value) IS DISTINCT FROM 'object'
           OR COALESCE(item.value ->> 'questao_id', '') !~ '^[0-9]+$'
           OR COALESCE(item.value ->> 'resposta', '') NOT IN ('A', 'B', 'C', 'D')
    ) THEN
        RAISE EXCEPTION 'Uma ou mais respostas possuem formato inválido.';
    END IF;

    SELECT pg_catalog.count(DISTINCT item.value ->> 'questao_id')::INTEGER
    INTO v_respostas_validas
    FROM pg_catalog.jsonb_array_elements(p_respostas) AS item(value);

    IF v_respostas_validas <> v_total_respostas THEN
        RAISE EXCEPTION 'Existem questões repetidas nas respostas.';
    END IF;

    SELECT pg_catalog.count(*)::INTEGER
    INTO v_respostas_validas
    FROM pg_catalog.jsonb_array_elements(p_respostas) AS item(value)
    JOIN public.questoes q
      ON q.id = (item.value ->> 'questao_id')::BIGINT
     AND q.atividade_id = p_atividade_id
     AND q.ativo = TRUE;

    IF v_respostas_validas <> v_total THEN
        RAISE EXCEPTION 'As respostas não correspondem às questões da atividade.';
    END IF;

    SELECT pg_catalog.count(*)::INTEGER
    INTO v_gabaritos
    FROM pg_catalog.jsonb_array_elements(p_respostas) AS item(value)
    JOIN public.questoes q
      ON q.id = (item.value ->> 'questao_id')::BIGINT
     AND q.atividade_id = p_atividade_id
    JOIN private.gabaritos g
      ON g.questao_id = q.id;

    IF v_gabaritos <> v_total THEN
        RAISE EXCEPTION 'Existem questões sem gabarito cadastrado.';
    END IF;

    SELECT pg_catalog.count(*) FILTER (
        WHERE g.resposta_correta = item.value ->> 'resposta'
    )::INTEGER
    INTO v_acertos
    FROM pg_catalog.jsonb_array_elements(p_respostas) AS item(value)
    JOIN public.questoes q
      ON q.id = (item.value ->> 'questao_id')::BIGINT
     AND q.atividade_id = p_atividade_id
     AND q.ativo = TRUE
    JOIN private.gabaritos g
      ON g.questao_id = q.id;

    INSERT INTO public.resultados (
        usuario_id,
        atividade_id,
        acertos,
        total_questoes,
        tentativa_uuid
    )
    VALUES (
        v_usuario_id,
        p_atividade_id,
        v_acertos,
        v_total,
        p_tentativa_uuid
    )
    RETURNING id, data_realizacao
    INTO v_resultado_id, v_data_realizacao;

    RETURN pg_catalog.jsonb_build_object(
        'resultado_id', v_resultado_id,
        'tentativa_uuid', p_tentativa_uuid,
        'acertos', v_acertos,
        'total_questoes', v_total,
        'data_realizacao', v_data_realizacao,
        'ja_processada', false
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.corrigir_atividade(UUID, BIGINT, JSONB)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.corrigir_atividade(UUID, BIGINT, JSONB)
    TO authenticated;
