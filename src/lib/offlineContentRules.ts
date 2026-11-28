import type { CachedActivity, CachedModule, CachedQuestion, CachedWord } from "./offline";

export const EXPECTED_ACTIVE_MODULES = 5;
export const EXPECTED_ACTIVE_WORDS = 43;
export const EXPECTED_ACTIVITY_LEVELS = ["facil", "medio", "avancado"] as const;

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

export const summarizeOfflineContent = (
  modules: CachedModule[],
  words: CachedWord[],
  activities: CachedActivity[],
  questions: CachedQuestion[],
): OfflineContentSummary => {
  const moduleIds = new Set(modules.map((module) => module.id));
  const wordsPerModule = modules.map(
    (module) => words.filter((word) => word.modulo_id === module.id).length,
  );
  const questionsPerActivity = activities.map(
    (activity) => questions.filter((question) => question.atividade_id === activity.id).length,
  );

  return {
    modules: modules.length,
    words: words.length,
    activities: activities.length,
    questions: questions.length,
    questionsPerActivity,
    complete: modules.length === EXPECTED_ACTIVE_MODULES
      && words.length === EXPECTED_ACTIVE_WORDS
      && words.every((word) => moduleIds.has(word.modulo_id))
      && wordsPerModule.every((count) => count > 0)
      && activities.length === EXPECTED_ACTIVITY_LEVELS.length
      && EXPECTED_ACTIVITY_LEVELS.every((level) => activities.some((activity) => activity.nivel === level))
      && questions.length === 15
      && questionsPerActivity.every((count) => count === 5)
      && questions.every(hasFourOptions),
  };
};
