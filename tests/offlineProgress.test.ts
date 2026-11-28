import test from "node:test";
import assert from "node:assert/strict";
import { summarizeOfflineContent } from "../src/lib/offlineContentRules.ts";
import { calculateModuleProgress } from "../src/lib/moduleProgress.ts";

const modules = Array.from({ length: 5 }, (_, index) => ({
  id: index + 1,
  nome: `Módulo ${index + 1}`,
  descricao: "",
  ordem: index + 1,
}));

const words = Array.from({ length: 43 }, (_, index) => ({
  id: index + 1,
  modulo_id: Math.floor(index / 9) + 1,
  termo_kambeba: `palavra-${index + 1}`,
  traducao_portugues: `tradução-${index + 1}`,
  audio_url: null,
}));

const activities = ["facil", "medio", "avancado"].map((nivel, index) => ({
  id: index + 1,
  titulo: `Atividade ${nivel}`,
  descricao: "",
  nivel,
}));

const questions = activities.flatMap((activity) =>
  Array.from({ length: 5 }, (_, index) => ({
    id: (activity.id - 1) * 5 + index + 1,
    atividade_id: activity.id,
    enunciado: `Questão ${index + 1}`,
    alternativas: { A: "A", B: "B", C: "C", D: "D" },
    ordem: index + 1,
  })),
);

test("aceita o conjunto pedagógico completo validado", () => {
  const summary = summarizeOfflineContent(modules, words, activities, questions);
  assert.equal(summary.complete, true);
  assert.equal(summary.modules, 5);
  assert.equal(summary.words, 43);
  assert.equal(summary.activities, 3);
  assert.equal(summary.questions, 15);
  assert.deepEqual(summary.questionsPerActivity, [5, 5, 5]);
});

test("rejeita conjunto incompleto sem todos os módulos", () => {
  assert.equal(summarizeOfflineContent(modules.slice(0, 4), words, activities, questions).complete, false);
});

test("rejeita palavras vinculadas a módulo inexistente", () => {
  const invalidWords = words.map((word, index) =>
    index === 0 ? { ...word, modulo_id: 999 } : word,
  );
  assert.equal(summarizeOfflineContent(modules, invalidWords, activities, questions).complete, false);
});

test("rejeita atividade com quantidade diferente de cinco questões", () => {
  assert.equal(summarizeOfflineContent(modules, words, activities, questions.slice(0, 14)).complete, false);
});

test("rejeita questão sem uma das quatro alternativas", () => {
  const invalidQuestions = questions.map((question, index) =>
    index === 0
      ? { ...question, alternativas: { A: "A", B: "B", C: "C" } }
      : question,
  );
  assert.equal(summarizeOfflineContent(modules, words, activities, invalidQuestions).complete, false);
});

test("calcula zero módulos concluídos sem palavras visualizadas", () => {
  assert.deepEqual(calculateModuleProgress(modules, words, new Set()), {
    completed: 0,
    total: 5,
  });
});

test("conclui apenas o módulo cujas palavras foram todas visualizadas", () => {
  const firstModuleWordIds = new Set(
    words.filter((word) => word.modulo_id === modules[0].id).map((word) => word.id),
  );
  assert.deepEqual(calculateModuleProgress(modules, words, firstModuleWordIds), {
    completed: 1,
    total: 5,
  });
});

test("não conclui módulo sem palavras cadastradas", () => {
  const modulesWithEmpty = [...modules, { id: 6, nome: "Vazio", descricao: "", ordem: 6 }];
  assert.deepEqual(calculateModuleProgress(modulesWithEmpty, words, new Set(words.map((word) => word.id))), {
    completed: 5,
    total: 6,
  });
});
