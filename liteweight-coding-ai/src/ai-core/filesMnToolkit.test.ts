import { strict as assert } from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getProjectStructureFlat, readFileContent, searchCode } from "./basicToolkit";

async function createTempDir(): Promise<string> {
  return await fs.promises.mkdtemp(path.join(os.tmpdir(), "toolkit-test-"));
}

async function writeFile(filePath: string, content: string) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content, "utf8");
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

    const result = await getProjectStructureFlat(tempDir);
    assert.ok(Array.isArray(result));
    assert.ok(result.includes("src/a.ts"));
    assert.ok(result.includes("src/b.js"));
    assert.ok(!result.includes("node_modules/x.js"));
  });

  it("readFileContent respects maxChars", async () => {
    const filePath = path.join(tempDir, "long.txt");
    const content = "x".repeat(300);
    await writeFile(filePath, content);

    const output = await readFileContent(filePath, { maxChars: 120, rootPath: tempDir });
    assert.ok(!("error" in output));
    assert.equal(output.file, "long.txt");
    assert.equal(output.content.length, 120);
    assert.equal(output.content, content.slice(0, 120));
  });

  it("searchCode finds matches by string and regex", async () => {
    await writeFile(path.join(tempDir, "notes.txt"), "hello world\nanother line");
    await writeFile(path.join(tempDir, "src", "index.ts"), "const value = 42;\nhello");

    const stringMatches = await searchCode(tempDir, "hello", {
      includeExtensions: [".ts", ".txt"],
    });
    assert.ok(Array.isArray(stringMatches));
    assert.ok(stringMatches.length >= 2);
    assert.ok(stringMatches.some((m) => m.preview.includes("hello")));
    assert.ok(stringMatches.every((m) => !path.isAbsolute(m.filePath)));

    const regexMatches = await searchCode(tempDir, "/value\\s*=\\s*\\d+/");
    assert.ok(Array.isArray(regexMatches));
    assert.ok(regexMatches.length >= 1);
    assert.ok(regexMatches[0].preview.includes("value"));
    assert.ok(!path.isAbsolute(regexMatches[0].filePath));
  });

  it("searchCode supports regex keyword with flags", async () => {
    await writeFile(path.join(tempDir, "src", "server.js"), "PORT: 8080\nport: 3000");
    const matches = await searchCode(tempDir, "/port:\\s*\\d+/i", {
      includeExtensions: [".js"],
    });
    assert.ok(Array.isArray(matches));
    assert.ok(matches.length >= 1);
    assert.ok(matches.some((m) => m.preview.toLowerCase().includes("port")));
  });

  it("searchCode returns error when query is empty", async () => {
    const result = await searchCode(tempDir, "");
    assert.ok(!Array.isArray(result));
    assert.ok("error" in result);
  });
});
