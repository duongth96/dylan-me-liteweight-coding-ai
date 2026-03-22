import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";

type StructureOptions = {
  ignoreDirs?: string[];
  includeExtensions?: string[];
};

type ReadFileOptions = {
  maxChars?: number;
  rootPath?: string;
  fromLine?: number;
  startChar?: number;
};

type WriteFileOptions = {
  rootPath?: string;
};

type SearchOptions = {
  ignoreDirs?: string[];
  includeExtensions?: string[];
  maxResults?: number;
};

type WebSearchOptions = {
  maxResults?: number;
  engines?: string[];
};

type RunCommandOptions = {
  cwd?: string;
  timeoutMs?: number;
  maxBuffer?: number;
};

type SearchMatch = {
  filePath: string;
  line: number;
  column: number;
  preview: string;
};

type ToolkitError = {
  error: string;
};

export async function getProjectStructureFlat(
  rootPath: string,
  options: StructureOptions = {}
): Promise<string[] | ToolkitError> {
  if (!rootPath) {
    return { error: "Missing root path. Please provide root path." };
  }
  const ignoreDirs = new Set(options.ignoreDirs ?? defaultIgnoreDirs());
  const includeExtensions = normalizeExtensions(options.includeExtensions ?? []);
  const files = await collectFiles(rootPath, ignoreDirs, includeExtensions);
  const normalized = files.map((file) =>
    path.relative(rootPath, file).split(path.sep).join("/")
  );
  return normalized;
}

export async function readFileContent(
  filePath: string,
  options: ReadFileOptions = {}
): Promise<{ file: string; content: string } | ToolkitError> {
  if (!filePath) {
    return { error: "Missing file path. Please provide file path." };
  }
  const maxChars = options.maxChars ?? 200_000;
  const content = await fs.promises.readFile(filePath, "utf8");
  let working = content;
  const fromLine = typeof options.fromLine === "number" ? Math.floor(options.fromLine) : undefined;
  if (fromLine && fromLine > 0) {
    const lines = working.split(/\r?\n/);
    working = lines.slice(fromLine - 1).join("\n");
  }
  const startChar = typeof options.startChar === "number" ? Math.floor(options.startChar) : undefined;
  if (typeof startChar === "number" && startChar > 0) {
    working = working.slice(startChar);
  }
  const rootPath = options.rootPath ?? path.parse(filePath).root;
  const relativePath = path.relative(rootPath, filePath).split(path.sep).join("/");
  if (working.length <= maxChars) {
    return { file: relativePath, content: working };
  }
  return { file: relativePath, content: working.slice(0, maxChars) };
}

export async function writeFileContent(
  filePath: string,
  content: string,
  options: WriteFileOptions = {}
): Promise<{ file: string; bytes: number } | ToolkitError> {
  if (!filePath) {
    return { error: "Missing file path. Please provide file path." };
  }
  if (typeof content !== "string") {
    return { error: "Missing content. Please provide content." };
  }
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content, "utf8");
  const rootPath = options.rootPath ?? path.parse(filePath).root;
  const relativePath = path.relative(rootPath, filePath).split(path.sep).join("/");
  return { file: relativePath, bytes: Buffer.byteLength(content, "utf8") };
}

export async function searchCode(
  rootPath: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchMatch[] | ToolkitError> {
  if (!query || !query.trim()) {
    return { error: "Missing keyword. Please provide search keyword." };
  }
  if (!rootPath) {
    return { error: "Missing root path. Please provide root path." };
  }
  const ignoreDirs = new Set(options.ignoreDirs ?? defaultIgnoreDirs());
  const includeExtensions = normalizeExtensions(options.includeExtensions ?? []);
  const maxResults = options.maxResults ?? 200;
  const files = await collectFiles(rootPath, ignoreDirs, includeExtensions);
  const matches: SearchMatch[] = [];
  const isRegex = query.startsWith("/") && query.lastIndexOf("/") > 0;
  const regex = isRegex ? buildRegex(query) : null;

  for (const filePath of files) {
    if (matches.length >= maxResults) {
      break;
    }
    let content = "";
    try {
      content = await fs.promises.readFile(filePath, "utf8");
    } catch {
      continue;
    }

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (matches.length >= maxResults) {
        break;
      }
      const lineText = lines[i];
      if (!lineText) {
        continue;
      }
      if (regex) {
        regex.lastIndex = 0;
        const match = regex.exec(lineText);
        if (match && typeof match.index === "number") {
          matches.push({
            filePath: path.relative(rootPath, filePath).split(path.sep).join("/"),
            line: i + 1,
            column: match.index + 1,
            preview: lineText.trim(),
          });
        }
      } else {
        const index = lineText.indexOf(query);
        if (index >= 0) {
          matches.push({
            filePath: path.relative(rootPath, filePath).split(path.sep).join("/"),
            line: i + 1,
            column: index + 1,
            preview: lineText.trim(),
          });
        }
      }
    }
  }

  return matches;
}

export async function searchWeb(
  query: string,
  options: WebSearchOptions = {}
): Promise<{ query: string; results: Array<{ title: string; url: string; snippet: string }> } | ToolkitError> {
  if (!query || !query.trim()) {
    return { error: "Missing keyword. Please provide search keyword." };
  }
  const maxResults = options.maxResults ?? 8;
  try {
    const engines = normalizeSearchEngines(options.engines);
    const queryString = encodeURIComponent(query);
    for (const engine of engines) {
      const url = engine.replace(/@q/g, queryString);
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (!response.ok) {
        continue;
      }
      const html = await response.text();
      const results = extractDuckDuckGoResults(html, maxResults);
      if (results.length > 0) {
        return { query, results };
      }
    }
    return { query, results: [] };
  } catch (error) {
    return { error: `Web search failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export async function runCommand(
  command: string,
  options: RunCommandOptions = {}
): Promise<{ command: string; code: number; stdout: string; stderr: string } | ToolkitError> {
  if (!command || !command.trim()) {
    return { error: "Missing command. Please provide a command to run." };
  }

  const cwd = options.cwd;
  const timeoutMs = options.timeoutMs ?? 10000;
  const maxBuffer = options.maxBuffer ?? 200_000;

  return await new Promise((resolve) => {
    exec(
      command,
      { cwd, timeout: timeoutMs, maxBuffer },
      (error, stdout, stderr) => {
        const code = typeof (error as { code?: number } | null)?.code === "number"
          ? (error as { code: number }).code
          : 0;
        resolve({
          command,
          code,
          stdout: stdout ?? "",
          stderr: stderr ?? (error ? String(error) : ""),
        });
      }
    );
  });
}

export function describeToolkitFunctions() {
  return [
    {
      type: "function",
      function: {
        name: "list_files",
        description: "Get project structure as a flat list of relative paths",
        parameters: {
          type: "object",
          properties: {
            ignoreDirs: {
              type: "array",
              items: { type: "string" },
              description: "Directories to ignore (EX: node_modules, .git, .vscode, etc...)",
            },
            includeExtensions: {
              type: "array",
              items: { type: "string" },
              description: "File extensions to include (EX: .js, .ts, .jsx, .tsx, etc...)",
            },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "read_file",
        description: "Read file content and return { file, content }",
        parameters: {
          type: "object",
          properties: {
            file: {
              type: "string",
              description: "Relative path from project root",
            },
            maxChars: {
              type: "number",
              description: "Maximum characters to return",
            },
            fromLine: {
              type: "number",
              description: "Start reading from this line number (1-based)",
            },
            startChar: {
              type: "number",
              description: "Start reading from this character position",
            },
          },
          required: ["file"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "write_file",
        description: "Write content to a file (overwrite existing content)",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "File path to write"
            },
            content: {
              type: "string",
              description: "Full file content"
            }
          },
          required: ["path", "content"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "search_code",
        description: "Search code by string or regex",
        parameters: {
          type: "object",
          properties: {
            keyword: {
              type: "string",
              description: "Search string or regex, e.g. /foo.*/i",
            },
            ignoreDirs: {
              type: "array",
              items: { type: "string" },
              description: "Directories to ignore",
            },
            includeExtensions: {
              type: "array",
              items: { type: "string" },
              description: "File extensions to include",
            },
            maxResults: {
              type: "number",
              description: "Maximum matches to return",
            },
          },
          required: ["keyword"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_web",
        description: "Search the web and return a short list of results",
        parameters: {
          type: "object",
          properties: {
            keyword: {
              type: "string",
              description: "Search keyword",
            },
            maxResults: {
              type: "number",
              description: "Maximum results to return",
            },
          },
          required: ["keyword"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "run_command",
        description: "Run a shell command and return output",
        parameters: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "Command to run",
            },
          },
          required: ["command"],
        },
      },
    },
  ];
}

function extractDuckDuckGoResults(html: string, maxResults: number) {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const blockRegex = /<div class="result[^"]*"[\s\S]*?<\/div>\s*<\/div>/g;
  const blocks = html.match(blockRegex) ?? [];
  for (const block of blocks) {
    if (results.length >= maxResults) {
      break;
    }
    const titleMatch = block.match(/<a[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/);
    const urlMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"/);
    const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    const title = titleMatch ? decodeHtml(stripTags(titleMatch[1])) : "";
    const url = urlMatch ? decodeHtml(urlMatch[1]) : "";
    const snippet = snippetMatch ? decodeHtml(stripTags(snippetMatch[1])) : "";
    if (!title || !url) {
      continue;
    }
    results.push({ title, url, snippet });
  }
  return results;
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function normalizeSearchEngines(engines?: string[]): string[] {
  const cleaned = Array.isArray(engines)
    ? engines.map((item) => String(item ?? "").trim()).filter((item) => item.length > 0)
    : [];
  const filtered = cleaned.filter((item) => item.includes("@q"));
  return filtered.length > 0 ? filtered : ["https://duckduckgo.com/html/?q=@q"];
}

async function collectFiles(
  rootPath: string,
  ignoreDirs: Set<string>,
  includeExtensions: string[]
): Promise<string[]> {
  const results: string[] = [];
  const stack: string[] = [rootPath];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (ignoreDirs.has(entry.name)) {
          continue;
        }
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (includeExtensions.length > 0) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!includeExtensions.includes(ext)) {
          continue;
        }
      }
      results.push(fullPath);
    }
  }

  return results;
}

function defaultIgnoreDirs(): string[] {
  return [
    ".git",
    "node_modules",
    "out",
    "dist",
    ".vscode",
    ".idea",
    ".turbo",
    ".next",
    ".cache",
    ".venv",
    "coverage",
    "webview",
  ];
}

function normalizeExtensions(extensions: string[]): string[] {
  return extensions
    .map((ext) => {
      const trimmed = String(ext ?? "").trim();
      if (!trimmed) {
        return "";
      }
      return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
    })
    .filter((ext) => ext.length > 1);
}

function buildRegex(input: string): RegExp {
  const lastSlash = input.lastIndexOf("/");
  const body = input.slice(1, lastSlash);
  const flagsRaw = input.slice(lastSlash + 1);
  const flags = flagsRaw.replace(/[^gimsuy]/g, "");
  return new RegExp(body, flags);
}
