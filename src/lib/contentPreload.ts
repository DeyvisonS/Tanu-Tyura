import { supabase } from "./supabase";
import {
  cacheActivities,
  cacheModules,
  cacheQuestions,
  cacheWords,
  getCachedActivities,
  getCachedModules,
  getCachedQuestions,
  getCachedWords,
} from "./offline";
import type {
  CachedActivity,
  CachedModule,
  CachedQuestion,
  CachedWord,
} from "./offline";

export type OfflineContentSummary = {
  modules: number;
  words: number;
  activities: number;
  questions: number;
  questionsPerActivity: number[];
  complete: boolean;
};

const hasFourOptions = (question: CachedQuestion) =>
  ["A", "B", "C", "D"].every(
    (option) => typeof question.alternativas?.[option as keyof CachedQuestion["alternativas"]] === "string",
  );

const summarizeContent = (
  modules: CachedModule[],
  words: CachedWord[],
  activities: CachedActivity[],
  questions: CachedQuestion[],
): OfflineContentSummary => {
  const moduleIds = new Set(modules.map((module) => module.id));
  const questionsPerActivity = activities.map(
    (activity) => questions.filter((question) => question.atividade_id === activity.id).length,
  );

  return {
    modules: modules.length,
    words: words.length,
    activities: activities.length,
    questions: questions.length,
    questionsPerActivity,
    complete: modules.length === 5
      && words.length === 43
      && words.every((word) => moduleIds.has(word.modulo_id))
      && activities.length === 3
      && questions.length === 15
      && questionsPerActivity.every((count) => count === 5)
      && questions.every(hasFourOptions),
  };
};

export const inspectOfflineContent = async () => {
  const [modules, words, activities] = await Promise.all([
    getCachedModules(),
    getCachedWords(),
    getCachedActivities(),
  ]);
  const questionSets = await Promise.all(
    activities.map((activity) => getCachedQuestions(activity.id)),
  );
  return summarizeContent(modules, words, activities, questionSets.flat());
};

export const preloadOfflineContent = async () => {
  const [moduleResponse, wordResponse, activityResponse, questionResponse] = await Promise.all([
    supabase
      .from("modulos")
      .select("id, nome, descricao, ordem")
      .eq("ativo", true)
      .order("ordem", { ascending: true }),
    supabase
      .from("palavras")
      .select("id, modulo_id, termo_kambeba, traducao_portugues, audio_url")
      .eq("ativo", true)
      .order("id", { ascending: true }),
    supabase
      .from("atividades")
      .select("id, titulo, descricao, nivel")
      .eq("ativo", true)
      .order("id", { ascending: true }),
    supabase
      .from("questoes")
      .select("id, atividade_id, enunciado, alternativas, ordem")
      .eq("ativo", true)
      .order("atividade_id", { ascending: true })
      .order("ordem", { ascending: true }),
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
  const summary = summarizeContent(modules, words, activities, questions);

  if (!summary.complete) {
    console.error("[Tanu-Tyura] Pré-carregamento público incompleto; cache anterior preservado", summary);
    throw new Error("O servidor retornou um conjunto incompleto de conteúdos públicos.");
  }

  await Promise.all([
    cacheModules(modules),
    cacheWords(words),
    cacheActivities(activities),
    cacheQuestions(questions),
  ]);

  return summary;
};
