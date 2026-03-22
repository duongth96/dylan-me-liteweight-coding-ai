import { strict as assert } from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getProjectStructureFlat, readFileContent, searchCode } from "./filesMnToolkit";

async function createTempDir(): Promise<string> {
  return await fs.promises.mkdtemp(path.join(os.tmpdir(), "toolkit-test-"));
}

async function writeFile(filePath: string, content: string) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content, "utf8");
}

function normalizePaths(input: string): string[] {
  if (!input.trim()) {
    return [];
  }
  return input.split("; ").map((p) => p.trim());
}

describe("filesMnToolkit", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("getProjectStructureFlat returns flat path list", async () => {
    await writeFile(path.join(tempDir, "src", "a.ts"), "export const a = 1;");
    await writeFile(path.join(tempDir, "src", "b.js"), "export const b = 2;");
    await writeFile(path.join(tempDir, "node_modules", "x.js"), "ignore");

    const result = await getProjectStructureFlat(tempDir, {
      includeExtensions: [".ts", ".js"],
    });
    const list = normalizePaths(result);
    const normalized = list.map((p) => p.replace(tempDir.replace(/\\/g, "/") + "/", ""));

    assert.ok(normalized.includes("src/a.ts"));
    assert.ok(normalized.includes("src/b.js"));
    assert.ok(!normalized.includes("node_modules/x.js"));
  });

  it("readFileContent respects maxChars", async () => {
    const filePath = path.join(tempDir, "long.txt");
    const content = "x".repeat(300);
    await writeFile(filePath, content);

    const output = await readFileContent(filePath, { maxChars: 120 });
    assert.equal(output.length, 120);
    assert.equal(output, content.slice(0, 120));
  });

  it("searchCode finds matches by string and regex", async () => {
    await writeFile(path.join(tempDir, "notes.txt"), "hello world\nanother line");
    await writeFile(path.join(tempDir, "src", "index.ts"), "const value = 42;\nhello");

    const stringMatches = await searchCode(tempDir, "hello", {
      includeExtensions: [".ts", ".txt"],
    });
    assert.ok(stringMatches.length >= 2);
    assert.ok(stringMatches.some((m) => m.preview.includes("hello")));

    const regexMatches = await searchCode(tempDir, "/value\\s*=\\s*\\d+/");
    assert.ok(regexMatches.length >= 1);
    assert.ok(regexMatches[0].preview.includes("value"));
  });
});
