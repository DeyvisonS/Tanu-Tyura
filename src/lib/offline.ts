export type CachedActivity = {
  id: number;
  titulo: string;
  descricao: string;
  nivel: "facil" | "medio" | "avancado";
};

export type CachedQuestion = {
  id: number;
  atividade_id: number;
  enunciado: string;
  alternativas: Record<"A" | "B" | "C" | "D", string>;
  ordem: number;
};

export type CachedModule = {
  id: number;
  nome: string;
  descricao: string;
  ordem: number;
};

export type CachedWord = {
  id: number;
  modulo_id: number;
  termo_kambeba: string;
  traducao_portugues: string;
  audio_url: string | null;
};

export type StoredAnswer = {
  questao_id: number;
  resposta: "A" | "B" | "C" | "D";
};

export type StoredResult = {
  acertos: number;
  total_questoes: number;
};

export type OfflineAttempt = {
  tentativa_uuid: string;
  usuario_id: string;
  atividade_id: number;
  atividade_titulo: string;
  nivel: CachedActivity["nivel"];
  respostas: StoredAnswer[];
  status: "pending" | "synced";
  criado_em: string;
  sincronizado_em?: string;
  resultado?: StoredResult;
  ultimo_erro?: string;
};

export type StoredWordView = {
  usuario_id: string;
  palavra_id: number;
  visualizada_em: string;
  status: "pending" | "synced";
  sincronizada_em?: string;
};

const DATABASE_NAME = "tanu-tyura-offline";
const DATABASE_VERSION = 3;

const requestToPromise = <T,>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha no IndexedDB."));
  });

const transactionToPromise = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Falha na transação do IndexedDB."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Transação do IndexedDB cancelada."));
  });

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains("activities")) {
        database.createObjectStore("activities", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("questions")) {
        const questions = database.createObjectStore("questions", { keyPath: "id" });
        questions.createIndex("atividade_id", "atividade_id", { unique: false });
      }
      if (!database.objectStoreNames.contains("attempts")) {
        const attempts = database.createObjectStore("attempts", { keyPath: "tentativa_uuid" });
        attempts.createIndex("usuario_id", "usuario_id", { unique: false });
      }
      if (!database.objectStoreNames.contains("modules")) {
        database.createObjectStore("modules", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("words")) {
        const words = database.createObjectStore("words", { keyPath: "id" });
        words.createIndex("modulo_id", "modulo_id", { unique: false });
      }
      if (!database.objectStoreNames.contains("wordViews")) {
        const wordViews = database.createObjectStore("wordViews", {
          keyPath: ["usuario_id", "palavra_id"],
        });
        wordViews.createIndex("usuario_id", "usuario_id", { unique: false });
        wordViews.createIndex("usuario_status", ["usuario_id", "status"], { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir o armazenamento offline."));
    request.onblocked = () => reject(new Error("A atualização do armazenamento offline está bloqueada."));
  });

export const cacheActivities = async (activities: CachedActivity[]) => {
  const database = await openDatabase();
  const transaction = database.transaction("activities", "readwrite");
  const store = transaction.objectStore("activities");
  activities.forEach((activity) => store.put(activity));
  await transactionToPromise(transaction);
  database.close();
};

export const getCachedActivities = async () => {
  const database = await openDatabase();
  const transaction = database.transaction("activities", "readonly");
  const activities = await requestToPromise(transaction.objectStore("activities").getAll()) as CachedActivity[];
  await transactionToPromise(transaction);
  database.close();
  return activities.sort((first, second) => first.id - second.id);
};

export const cacheQuestions = async (questions: CachedQuestion[]) => {
  const database = await openDatabase();
  const transaction = database.transaction("questions", "readwrite");
  const store = transaction.objectStore("questions");
  questions.forEach((question) => store.put(question));
  await transactionToPromise(transaction);
  database.close();
};

export const getCachedQuestions = async (activityId: number) => {
  const database = await openDatabase();
  const transaction = database.transaction("questions", "readonly");
  const index = transaction.objectStore("questions").index("atividade_id");
  const questions = await requestToPromise(index.getAll(IDBKeyRange.only(activityId))) as CachedQuestion[];
  await transactionToPromise(transaction);
  database.close();
  return questions.sort((first, second) => first.ordem - second.ordem);
};

export const cacheModules = async (modules: CachedModule[]) => {
  const database = await openDatabase();
  const transaction = database.transaction("modules", "readwrite");
  const store = transaction.objectStore("modules");
  modules.forEach((module) => store.put(module));
  await transactionToPromise(transaction);
  database.close();
};

export const getCachedModules = async () => {
  const database = await openDatabase();
  const transaction = database.transaction("modules", "readonly");
  const modules = await requestToPromise(transaction.objectStore("modules").getAll()) as CachedModule[];
  await transactionToPromise(transaction);
  database.close();
  return modules.sort((first, second) => first.ordem - second.ordem);
};

export const cacheWords = async (words: CachedWord[]) => {
  const database = await openDatabase();
  const transaction = database.transaction("words", "readwrite");
  const store = transaction.objectStore("words");
  words.forEach((word) => store.put(word));
  await transactionToPromise(transaction);
  database.close();
};

export const getCachedWords = async (moduleId?: number) => {
  const database = await openDatabase();
  const transaction = database.transaction("words", "readonly");
  const store = transaction.objectStore("words");
  const request = moduleId === undefined
    ? store.getAll()
    : store.index("modulo_id").getAll(IDBKeyRange.only(moduleId));
  const words = await requestToPromise(request) as CachedWord[];
  await transactionToPromise(transaction);
  database.close();
  return words.sort((first, second) => first.id - second.id);
};

export const savePendingAttempt = async (attempt: OfflineAttempt) => {
  const database = await openDatabase();
  const transaction = database.transaction("attempts", "readwrite");
  const store = transaction.objectStore("attempts");
  const existing = await requestToPromise(store.get(attempt.tentativa_uuid)) as OfflineAttempt | undefined;

  if (!existing) {
    store.add(attempt);
  }

  await transactionToPromise(transaction);
  database.close();
  return existing ?? attempt;
};

export const getPendingAttempts = async (userId: string) => {
  const database = await openDatabase();
  const transaction = database.transaction("attempts", "readonly");
  const attempts = await requestToPromise(
    transaction.objectStore("attempts").index("usuario_id").getAll(IDBKeyRange.only(userId)),
  ) as OfflineAttempt[];
  await transactionToPromise(transaction);
  database.close();
  return attempts
    .filter((attempt) => attempt.status === "pending")
    .sort((first, second) => first.criado_em.localeCompare(second.criado_em));
};

export const countPendingAttempts = async (userId: string) =>
  (await getPendingAttempts(userId)).length;

export const markAttemptSynced = async (attempt: OfflineAttempt, result: StoredResult) => {
  const database = await openDatabase();
  const transaction = database.transaction("attempts", "readwrite");
  const synchronizedAttempt: OfflineAttempt = {
    ...attempt,
    status: "synced",
    resultado: result,
    sincronizado_em: new Date().toISOString(),
    ultimo_erro: undefined,
  };
  transaction.objectStore("attempts").put(synchronizedAttempt);
  await transactionToPromise(transaction);
  database.close();
};

export const keepAttemptPending = async (attempt: OfflineAttempt, errorMessage: string) => {
  const database = await openDatabase();
  const transaction = database.transaction("attempts", "readwrite");
  transaction.objectStore("attempts").put({
    ...attempt,
    status: "pending",
    ultimo_erro: errorMessage,
  } satisfies OfflineAttempt);
  await transactionToPromise(transaction);
  database.close();
};


// Word views are stored per authenticated user and remain pending until the
// server confirms synchronization. Existing activity attempts are untouched.
export const saveWordView = async (userId: string, wordId: number) => {
  const database = await openDatabase();
  const transaction = database.transaction("wordViews", "readwrite");
  const store = transaction.objectStore("wordViews");
  const key: [string, number] = [userId, wordId];
  const result = await new Promise<StoredWordView>((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => {
      const existing = request.result as StoredWordView | undefined;
      const current = existing ?? {
        usuario_id: userId,
        palavra_id: wordId,
        visualizada_em: new Date().toISOString(),
        status: "pending" as const,
      };
      if (!existing) store.add(current);
      resolve(current);
    };
    request.onerror = () => reject(request.error ?? new Error("Não foi possível registrar a palavra localmente."));
  });
  await transactionToPromise(transaction);
  database.close();
  return result;
};

export const getViewedWordIds = async (userId: string) => {
  const database = await openDatabase();
  const transaction = database.transaction("wordViews", "readonly");
  const ids = await requestToPromise(
    transaction.objectStore("wordViews").index("usuario_id").getAll(IDBKeyRange.only(userId)),
  ) as StoredWordView[];
  await transactionToPromise(transaction);
  database.close();
  return new Set(ids.map((item) => item.palavra_id));
};

export const getPendingWordViews = async (userId: string) => {
  const database = await openDatabase();
  const transaction = database.transaction("wordViews", "readonly");
  const items = await requestToPromise(
    transaction.objectStore("wordViews").index("usuario_status").getAll(
      IDBKeyRange.only([userId, "pending"]),
    ),
  ) as StoredWordView[];
  await transactionToPromise(transaction);
  database.close();
  return items.sort((a, b) => a.visualizada_em.localeCompare(b.visualizada_em));
};

export const markWordViewsPending = async (userId: string) => {
  const database = await openDatabase();
  const transaction = database.transaction("wordViews", "readwrite");
  const store = transaction.objectStore("wordViews");
  const items = await requestToPromise(
    store.index("usuario_id").getAll(IDBKeyRange.only(userId)),
  ) as StoredWordView[];
  items.forEach((item) => store.put({ ...item, status: "pending", sincronizada_em: undefined }));
  await transactionToPromise(transaction);
  database.close();
};

export const markWordViewsSynced = async (items: StoredWordView[]) => {
  if (items.length === 0) return;
  const database = await openDatabase();
  const transaction = database.transaction("wordViews", "readwrite");
  const store = transaction.objectStore("wordViews");
  const synchronizedAt = new Date().toISOString();
  items.forEach((item) => store.put({ ...item, status: "synced", sincronizada_em: synchronizedAt }));
  await transactionToPromise(transaction);
  database.close();
};

export const mergeSyncedWordViews = async (
  userId: string,
  items: Array<{ palavra_id: number; visualizada_em: string }>,
) => {
  if (items.length === 0) return;
  const database = await openDatabase();
  const transaction = database.transaction("wordViews", "readwrite");
  const store = transaction.objectStore("wordViews");
  const synchronizedAt = new Date().toISOString();
  items.forEach((item) => store.put({
    usuario_id: userId,
    palavra_id: item.palavra_id,
    visualizada_em: item.visualizada_em,
    status: "synced",
    sincronizada_em: synchronizedAt,
  } satisfies StoredWordView));
  await transactionToPromise(transaction);
  database.close();
};


/** Atomically refreshes all public learning content without touching pending attempts or word views. */
export const replaceAllOfflineContent = async (
  modules: CachedModule[],
  words: CachedWord[],
  activities: CachedActivity[],
  questions: CachedQuestion[],
) => {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(
      ["modules", "words", "activities", "questions"],
      "readwrite",
    );
    const completed = transactionToPromise(transaction);
    const replace = <T,>(store: IDBObjectStore, records: T[]) => {
      store.clear();
      records.forEach((record) => store.put(record));
    };
    replace(transaction.objectStore("modules"), modules);
    replace(transaction.objectStore("words"), words);
    replace(transaction.objectStore("activities"), activities);
    replace(transaction.objectStore("questions"), questions);
    await completed;
  } finally {
    database.close();
  }
};
