import { supabase } from "./supabase";
import type { OfflineAttempt, StoredResult } from "./offline";

export type ActivitySyncError = {
  code?: string;
  message: string;
  details?: string;
  hint?: string;
};

export type ActivitySyncResponse =
  | { result: StoredResult; error: null }
  | { result: null; error: ActivitySyncError };

export const correctStoredAttempt = async (attempt: OfflineAttempt): Promise<ActivitySyncResponse> => {
  const { data, error } = await supabase.rpc("corrigir_atividade", {
    p_atividade_id: attempt.atividade_id,
    p_respostas: attempt.respostas,
    p_tentativa_uuid: attempt.tentativa_uuid,
  });

  if (error) {
    return { result: null, error };
  }

  const correction = Array.isArray(data) ? data[0] : data;
  const correct = typeof correction === "number"
    ? correction
    : Number(correction?.acertos);
  const total = typeof correction === "object" && correction
    ? Number(correction.total_questoes ?? attempt.respostas.length)
    : attempt.respostas.length;

  if (
    !Number.isInteger(correct)
    || correct < 0
    || correct > attempt.respostas.length
    || !Number.isInteger(total)
    || total !== attempt.respostas.length
  ) {
    return {
      result: null,
      error: {
        code: "INVALID_RPC_RESULT",
        message: "A função corrigir_atividade retornou uma pontuação inválida.",
        details: JSON.stringify(data),
      },
    };
  }

  return {
    result: {
      acertos: correct,
      total_questoes: total,
    },
    error: null,
  };
};
