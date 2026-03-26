import * as path from "path";
import {
  getProjectStructureFlat,
  readFileContent,
  writeFileContent,
  runCommand,
  searchWeb,
  searchCode
} from "./basicToolkit";
import type { ToolkitError } from "./basicToolkit";

export type ToolkitExecutorOptions = {
  defaultRootPath?: string;
  searchEngines?: string[];
};

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  options: ToolkitExecutorOptions = {}
): Promise<string> {
  const defaultRootPath = options.defaultRootPath;

  if (name === "list_files") {
    const rootPath = typeof args.rootPath === "string" ? args.rootPath : defaultRootPath ?? "";
    const ignoreDirs = toStringArray(args.ignoreDirs);
    const includeExtensions = toStringArray(args.includeExtensions);
    const structure = await getProjectStructureFlat(rootPath, {
      ignoreDirs: ignoreDirs.length > 0 ? ignoreDirs : undefined,
      includeExtensions: includeExtensions.length > 0 ? includeExtensions : undefined,
    });
    return JSON.stringify({ results: structure });
  }

  if (name === "read_file") {
    const fileArg = getStringArg(args, ["file", "filePath", "path"]);
    const filePath = fileArg
      ? path.isAbsolute(fileArg)
        ? fileArg
        : path.join(defaultRootPath ?? "", fileArg)
      : "";
    const maxChars = typeof args.maxChars === "number" ? args.maxChars : undefined;
    const fromLine = typeof args.fromLine === "number" ? args.fromLine : undefined;
    const startChar = typeof args.startChar === "number" ? args.startChar : undefined;
    const rootPath = typeof args.rootPath === "string" ? args.rootPath : defaultRootPath;
    const result = await readFileContent(filePath, { maxChars, rootPath, fromLine, startChar });

    if ("error" in result) {
      return result.error;
    }

    return `
      Read file ${filePath} result:
      ${result.content}
    `.trim();
  }

  if (name === "write_file") {
    const fileArg = getStringArg(args, ["file", "filePath", "path"]);
    const filePath = fileArg
      ? path.isAbsolute(fileArg)
        ? fileArg
        : path.join(defaultRootPath ?? "", fileArg)
      : "";
    const content = typeof args.content === "string" ? args.content : "";
    const rootPath = typeof args.rootPath === "string" ? args.rootPath : defaultRootPath;
    const result = await writeFileContent(filePath, content, { rootPath });

    if ("error" in result) {
      return result.error;
    }

    return `
      Write file "${result.file}" (Bytes written: ${result.bytes}).
    `.trim();
  }

  if (name === "search_code") {
    const rootPath = typeof args.rootPath === "string" ? args.rootPath : defaultRootPath ?? "";
    const query = getStringArg(args, ["keyword", "query"]) ?? "";
    const ignoreDirs = toStringArray(args.ignoreDirs);
    const includeExtensions = toStringArray(args.includeExtensions);
    const maxResults = typeof args.maxResults === "number" ? args.maxResults : undefined;
    const matches = await searchCode(rootPath, query, {
      ignoreDirs: ignoreDirs.length > 0 ? ignoreDirs : undefined,
      includeExtensions: includeExtensions.length > 0 ? includeExtensions : undefined,
      maxResults,
    });

    if ("error" in matches) {
      return matches.error;
    }

    return JSON.stringify({ matches });
  }

  if (name === "search_web") {
    const keyword = getStringArg(args, ["keyword", "query"]) ?? "";
    const maxResults = typeof args.maxResults === "number" ? args.maxResults : undefined;
    const results = await searchWeb(keyword, { maxResults, engines: options.searchEngines });

    if ("error" in results) {
      return results.error;
    }

    return JSON.stringify(results);
  }

  if (name === "run_command") {
    const command = getStringArg(args, ["command"]) ?? "";
    const result = await runCommand(command, { cwd: defaultRootPath });

    if ("error" in result) {
      return result.error;
    }

    return `
      Run command "${result.command}" result (Code: ${result.code}):
      ${result.stdout}
      ${result.stderr}
    `.trim();
  }

  throw new Error(`Unknown tool: ${name}`);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((v) => typeof v === "string") as string[];
}

function getStringArg(args: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}
