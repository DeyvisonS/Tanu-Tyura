import { supabase } from "./supabase";
import {
  getPendingWordViews,
  markWordViewsPending,
  markWordViewsSynced,
  mergeSyncedWordViews,
  saveWordView,
} from "./offline";

type ProgressSyncResult = { synchronized: number; unavailable: boolean; error?: string };
type ProgressError = { code?: string; message?: string };

const isMissingProgressTable = (error: ProgressError) => {
  const message = error.message?.toLocaleLowerCase("pt-BR") ?? "";
  const mentionsProgressTable = message.includes("palavras_visualizadas");
  return error.code === "42P01"
    || (error.code === "PGRST205" && mentionsProgressTable)
    || (mentionsProgressTable && message.includes("does not exist"));
};

export const syncWordProgress = async (userId: string): Promise<ProgressSyncResult> => {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session || sessionData.session.user.id !== userId) {
    return {
      synchronized: 0,
      unavailable: false,
      error: sessionError?.message ?? "A sessão atual não corresponde ao progresso local.",
    };
  }

  const pendingWordViews = await getPendingWordViews(userId);
  if (pendingWordViews.length > 0) {
    const { error } = await supabase
      .from("palavras_visualizadas")
      .upsert(
        pendingWordViews.map((wordView) => ({
          usuario_id: wordView.usuario_id,
          palavra_id: wordView.palavra_id,
          visualizada_em: wordView.visualizada_em,
        })),
        { onConflict: "usuario_id,palavra_id", ignoreDuplicates: true },
      );

    if (error) {
      if (isMissingProgressTable(error)) {
        await markWordViewsPending(userId);
        return { synchronized: 0, unavailable: true };
      }
      return { synchronized: 0, unavailable: false, error: error.message };
    }

    await markWordViewsSynced(pendingWordViews);
  }

  const { data, error } = await supabase
    .from("palavras_visualizadas")
    .select("palavra_id, visualizada_em")
    .eq("usuario_id", userId);

  if (error) {
    if (isMissingProgressTable(error)) {
      await markWordViewsPending(userId);
      return { synchronized: pendingWordViews.length, unavailable: true };
    }
    return { synchronized: pendingWordViews.length, unavailable: false, error: error.message };
  }

  await mergeSyncedWordViews(
    userId,
    (data ?? []).map((wordView: { palavra_id: number | string; visualizada_em: string }) => ({
      palavra_id: Number(wordView.palavra_id),
      visualizada_em: wordView.visualizada_em,
    })),
  );

  return { synchronized: pendingWordViews.length, unavailable: false };
};

export const recordWordView = async (userId: string, wordId: number) => {
  const wordView = await saveWordView(userId, wordId);
  if (navigator.onLine) await syncWordProgress(userId);
  return wordView;
};
