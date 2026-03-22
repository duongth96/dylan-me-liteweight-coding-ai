export type OllamaGenerateInput = {
  baseUrl: string;
  model: string;
  prompt: string;
  systemPrompt: string;
  messages?: Array<{ role: string; content: string }>;
  context?: number[];
  signal?: AbortSignal;
};

export type OllamaGenerateResponse = {
  response: string;
  context?: number[];
};

export type OllamaChatMessage = {
  role: string;
  content: string;
  name?: string;
  tool_call_id?: string;
};

export type OllamaChatInput = {
  baseUrl: string;
  model: string;
  messages: OllamaChatMessage[];
  systemPrompt?: string;
  tools?: unknown[];
  signal?: AbortSignal;
};

export type OllamaToolCall = {
  id?: string;
  type?: string;
  function?: {
    index?: number;
    name?: string;
    arguments?: Record<string, unknown>;
  };
};

export type OllamaChatResponse = {
  role: string;
  content: string;
  toolCalls?: OllamaToolCall[];
};

export async function ollamaGenerate(input: OllamaGenerateInput): Promise<OllamaGenerateResponse> {
  const res = await fetch(input.baseUrl + "/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal: input.signal,
    body: JSON.stringify({
      model: input.model,
      prompt: input.prompt,
      stream: false,
      system: input.systemPrompt,
      messages: input.messages,
      context: input.context,
    }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const result = (await res.json()) as unknown;

  if (isRecord(result) && typeof result.error === "string" && result.error.length > 0) {
    throw new Error(result.error);
  }

  if (!isRecord(result) || typeof result.response !== "string") {
    throw new Error("Invalid response from Ollama");
  }

  const context = Array.isArray(result.context)
    ? result.context.filter((value) => typeof value === "number")
    : undefined;
  return { response: result.response, context };
}

export async function ollamaChat(input: OllamaChatInput): Promise<OllamaChatResponse> {
  const res = await fetch(input.baseUrl + "/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal: input.signal,
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      tools: input.tools,
      stream: false,
      options: {
        num_keep: 24,
        seed: 42,

        num_predict: 512,

        temperature: 0.2,
        top_k: 40,
        top_p: 0.9,
        min_p: 0.05,
        typical_p: 1.0,

        repeat_last_n: 64,
        repeat_penalty: 1.1,
        presence_penalty: 0.0,
        frequency_penalty: 0.0,
        penalize_newline: false,

        stop: [
          "\n\n\n",
          "```output",
          "END",
        ],

        num_ctx: 4096,
        num_batch: 8,

        num_gpu: 29,
        main_gpu: 0,
        use_mmap: true,
        num_thread: 8,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const result = (await res.json()) as unknown;

  if (isRecord(result) && typeof result.error === "string" && result.error.length > 0) {
    throw new Error(result.error);
  }

  if (!isRecord(result)) {
    throw new Error("Invalid response from Ollama");
  }

  const message = result.message;
  if (!isRecord(message)) {
    throw new Error("Invalid response from Ollama");
  }

  const content = typeof message.content === "string" ? message.content : "";
  const toolCalls = normalizeToolCalls(message.tool_calls);
  const role = typeof message.role === "string" ? message.role : "";
  return { role, content, toolCalls };  
}

export async function safeOllamaListModels(baseUrl: string): Promise<string[] | null> {
  try {
    return await ollamaListModels(baseUrl);
  } catch {
    return null;
  }
}

export async function ollamaListModels(baseUrl: string): Promise<string[]> {
  const res = await fetch(baseUrl + "/api/tags");

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const result = (await res.json()) as unknown;

  if (!isRecord(result) || !Array.isArray(result.models)) {
    return [];
  }

  const names = result.models.map((m: unknown) =>
    isRecord(m) && typeof m.name === "string" && m.name.length > 0 ? m.name : ""
  );
  return names;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeToolCalls(value: unknown): OllamaToolCall[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((call) => {
    if (!isRecord(call)) {
      return {};
    }
    const fn = isRecord(call.function) ? call.function : undefined;
    return {
      id: typeof call.id === "string" ? call.id : undefined,
      type: typeof call.type === "string" ? call.type : undefined,
      function: fn
        ? {
            index: typeof fn.index === "number" ? fn.index : undefined,
            name: typeof fn.name === "string" ? fn.name : undefined,
            arguments: isRecord(fn.arguments) ? fn.arguments : undefined,
          }
        : undefined,
    };
  });
}
