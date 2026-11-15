export type ActivityLevelCode = "facil" | "medio" | "avancado";
export type AnswerChoice = "A" | "B" | "C" | "D";

export type LearningActivity = {
  id: number;
  titulo: string;
  descricao: string | null;
  nivel: ActivityLevelCode;
};

export type ActivityQuestion = {
  id: number;
  atividade_id: number;
  enunciado: string;
  alternativas: Record<AnswerChoice, string>;
  ordem: number;
};

export type PendingAttempt = {
  tentativa_uuid: string;
  usuario_id: string;
  atividade_id: number;
  respostas: { questao_id: number; resposta: AnswerChoice }[];
  criada_em: string;
};

const DATABASE_NAME = "tanu-tyura-offline";
const DATABASE_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Este navegador não oferece suporte ao armazenamento local necessário."));
      return;
    }

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

      if (!database.objectStoreNames.contains("pending_attempts")) {
        database.createObjectStore("pending_attempts", { keyPath: "tentativa_uuid" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir o armazenamento local."));
    request.onblocked = () => reject(new Error("O armazenamento local está ocupado por outra aba. Feche as outras abas do Tanu-Tyura e tente novamente."));
  });
}

function transactionFinished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Falha ao salvar os dados locais."));
    transaction.onabort = () => reject(transaction.error ?? new Error("A operação local foi cancelada."));
  });
}

export async function cacheActivities(activities: LearningActivity[]): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction("activities", "readwrite");
    const done = transactionFinished(transaction);
    const store = transaction.objectStore("activities");
    store.clear();
    activities.forEach((activity) => store.put(activity));
    await done;
  } finally {
    database.close();
  }
}

export async function getCachedActivities(): Promise<LearningActivity[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction("activities", "readonly");
    const request = transaction.objectStore("activities").getAll();
    const values = await new Promise<LearningActivity[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as LearningActivity[]);
      request.onerror = () => reject(request.error ?? new Error("Não foi possível ler as atividades armazenadas."));
    });
    return values.sort((a, b) => a.id - b.id);
  } finally {
    database.close();
  }
}

export async function cacheQuestionsForActivity(
  activityId: number,
  questions: ActivityQuestion[],
): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction("questions", "readwrite");
    const done = transactionFinished(transaction);
    const store = transaction.objectStore("questions");
    const cursorRequest = store.index("atividade_id").openCursor(IDBKeyRange.only(activityId));

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        questions.forEach((question) => store.put(question));
      }
    };

    cursorRequest.onerror = () => transaction.abort();
    await done;
  } finally {
    database.close();
  }
}

export async function getCachedQuestions(activityId: number): Promise<ActivityQuestion[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction("questions", "readonly");
    const request = transaction.objectStore("questions")
      .index("atividade_id")
      .getAll(IDBKeyRange.only(activityId));
    const values = await new Promise<ActivityQuestion[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as ActivityQuestion[]);
      request.onerror = () => reject(request.error ?? new Error("Não foi possível ler as questões armazenadas."));
    });
    return values.sort((a, b) => a.ordem - b.ordem);
  } finally {
    database.close();
  }
}

export async function savePendingAttempt(attempt: PendingAttempt): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction("pending_attempts", "readwrite");
    const done = transactionFinished(transaction);
    transaction.objectStore("pending_attempts").put(attempt);
    await done;
  } finally {
    database.close();
  }
}

export async function getPendingAttempts(userId: string): Promise<PendingAttempt[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction("pending_attempts", "readonly");
    const request = transaction.objectStore("pending_attempts").getAll();
    const values = await new Promise<PendingAttempt[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as PendingAttempt[]);
      request.onerror = () => reject(request.error ?? new Error("Não foi possível ler as tentativas pendentes."));
    });
    return values.filter((attempt) => attempt.usuario_id === userId);
  } finally {
    database.close();
  }
}

export async function removePendingAttempt(attemptId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction("pending_attempts", "readwrite");
    const done = transactionFinished(transaction);
    transaction.objectStore("pending_attempts").delete(attemptId);
    await done;
  } finally {
    database.close();
  }
}
