import * as fs from "fs";
import * as path from "path";

type StructureOptions = {
  ignoreDirs?: string[];
  includeExtensions?: string[];
};

type ReadFileOptions = {
  maxChars?: number;
};

type SearchOptions = {
  ignoreDirs?: string[];
  includeExtensions?: string[];
  maxResults?: number;
};

type SearchMatch = {
  filePath: string;
  line: number;
  column: number;
  preview: string;
};

export async function getProjectStructureFlat(
  rootPath: string,
  options: StructureOptions = {}
): Promise<string> {
  const ignoreDirs = new Set(options.ignoreDirs ?? defaultIgnoreDirs());
  const includeExtensions = options.includeExtensions ?? [];
  const files = await collectFiles(rootPath, ignoreDirs, includeExtensions);
  const normalized = files.map((file) => file.split(path.sep).join("/"));
  return normalized.join("; ");
}

export async function readFileContent(
  filePath: string,
  options: ReadFileOptions = {}
): Promise<string> {
  const maxChars = options.maxChars ?? 200_000;
  const content = await fs.promises.readFile(filePath, "utf8");
  if (content.length <= maxChars) {
    return content;
  }
  return content.slice(0, maxChars);
}

export async function searchCode(
  rootPath: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchMatch[]> {
  const ignoreDirs = new Set(options.ignoreDirs ?? defaultIgnoreDirs());
  const includeExtensions = options.includeExtensions ?? [];
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
        const match = regex.exec(lineText);
        if (match && typeof match.index === "number") {
          matches.push({
            filePath,
            line: i + 1,
            column: match.index + 1,
            preview: lineText.trim(),
          });
        }
      } else {
        const index = lineText.indexOf(query);
        if (index >= 0) {
          matches.push({
            filePath,
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

export function describeToolkitFunctions() {
  return [
    {
      type: "function",
      function: {
        name: "get_project_structure",
        description: "Get project structure as a flat list separated by semicolons",
        parameters: {
          type: "object",
          properties: {
            rootPath: {
              type: "string",
              description: "Absolute path to the project root",
            },
            ignoreDirs: {
              type: "array",
              items: { type: "string" },
              description: "Directory names to ignore",
            },
            includeExtensions: {
              type: "array",
              items: { type: "string" },
              description: "File extensions to include, e.g. .ts",
            },
          },
          required: ["rootPath"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "read_file",
        description: "Read the full content of a file",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Absolute path to the file",
            },
            maxChars: {
              type: "number",
              description: "Maximum number of characters to return",
            },
          },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_code",
        description: "Search code by string or regex pattern",
        parameters: {
          type: "object",
          properties: {
            rootPath: {
              type: "string",
              description: "Absolute path to the project root",
            },
            query: {
              type: "string",
              description: "Search string or regex, e.g. /foo.*/i",
            },
            ignoreDirs: {
              type: "array",
              items: { type: "string" },
              description: "Directory names to ignore",
            },
            includeExtensions: {
              type: "array",
              items: { type: "string" },
              description: "File extensions to include, e.g. .ts",
            },
            maxResults: {
              type: "number",
              description: "Maximum number of matches to return",
            },
          },
          required: ["rootPath", "query"],
        },
      },
    },
  ];
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

function buildRegex(input: string): RegExp {
  const lastSlash = input.lastIndexOf("/");
  const body = input.slice(1, lastSlash);
  const flags = input.slice(lastSlash + 1);
  return new RegExp(body, flags);
}
