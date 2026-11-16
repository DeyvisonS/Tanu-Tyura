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

const DATABASE_NAME = "tanu-tyura-offline";
const DATABASE_VERSION = 2;

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
