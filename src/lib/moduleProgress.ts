type ProgressModule = { id: number };
type ProgressWord = { id: number; modulo_id: number };

export const calculateModuleProgress = (
  modules: ProgressModule[],
  words: ProgressWord[],
  viewedWordIds: Set<number>,
) => {
  const completed = modules.filter((module) => {
    const moduleWords = words.filter((word) => word.modulo_id === module.id);
    return moduleWords.length > 0 && moduleWords.every((word) => viewedWordIds.has(word.id));
  }).length;

  return { completed, total: modules.length };
};
