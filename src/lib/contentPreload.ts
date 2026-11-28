import { supabase } from "./supabase";
import {
  replaceAllOfflineContent,
  getCachedActivities,
  getCachedModules,
  getCachedQuestions,
  getCachedWords,
} from "./offline";
import type { CachedActivity, CachedModule, CachedQuestion, CachedWord } from "./offline";
import { summarizeOfflineContent } from "./offlineContentRules";

export type { OfflineContentSummary } from "./offlineContentRules";

export const inspectOfflineContent = async () => {
  const [modules, words, activities] = await Promise.all([
    getCachedModules(),
    getCachedWords(),
    getCachedActivities(),
  ]);
  const questionSets = await Promise.all(
    activities.map((activity) => getCachedQuestions(activity.id)),
  );
  return summarizeOfflineContent(modules, words, activities, questionSets.flat());
};

export const preloadOfflineContent = async () => {
  const [moduleResponse, wordResponse, activityResponse, questionResponse] = await Promise.all([
    supabase.from("modulos").select("id, nome, descricao, ordem").eq("ativo", true).order("ordem", { ascending: true }),
    supabase.from("palavras").select("id, modulo_id, termo_kambeba, traducao_portugues, audio_url").eq("ativo", true).order("id", { ascending: true }),
    supabase.from("atividades").select("id, titulo, descricao, nivel").eq("ativo", true).order("id", { ascending: true }),
    supabase.from("questoes").select("id, atividade_id, enunciado, alternativas, ordem").eq("ativo", true).order("atividade_id", { ascending: true }).order("ordem", { ascending: true }),
  ]);

  const failedResponse = [
    ["módulos", moduleResponse.error],
    ["palavras", wordResponse.error],
    ["atividades", activityResponse.error],
    ["questões", questionResponse.error],
  ].find(([, error]) => error);

  if (failedResponse) {
    const [resource, error] = failedResponse;
    console.error(`[Tanu-Tyura] Falha ao pré-carregar ${resource}`, error);
    throw new Error(`Não foi possível atualizar ${resource}.`);
  }

  const modules = (moduleResponse.data ?? []) as CachedModule[];
  const words = (wordResponse.data ?? []) as CachedWord[];
  const activities = (activityResponse.data ?? []) as CachedActivity[];
  const questions = (questionResponse.data ?? []) as CachedQuestion[];
  const summary = summarizeOfflineContent(modules, words, activities, questions);

  if (!summary.complete) {
    console.error("[Tanu-Tyura] Pré-carregamento público incompleto; cache anterior preservado", summary);
    throw new Error("O servidor retornou um conjunto incompleto de conteúdos públicos.");
  }

  await replaceAllOfflineContent(modules, words, activities, questions);
  return summary;
};
