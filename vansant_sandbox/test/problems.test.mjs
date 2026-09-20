import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/renderer/src/components/problems.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { collectEditorDiagnostics, parseRunProblems } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const failed = (stderr, extra = {}) => ({ ok: false, command: "test", stdout: "", stderr, exitCode: 1, ...extra });

test("editor errors keep full messages, locations, codes, and warning severity", () => {
  const marker = { severity: 8, message: "Type 'string' is not assignable to type 'number'.\nCheck the assigned value.", startLineNumber: 3, startColumn: 7, endLineNumber: 3, endColumn: 12, source: "ts", code: { value: "2322" } };
  const result = collectEditorDiagnostics("C:\\School\\week 1.ts", [marker, { ...marker, severity: 4, startLineNumber: 1 }, { ...marker, severity: 1 }]);
  assert.equal(result.errors, 1);
  assert.equal(result.warnings, 1);
  assert.equal(result.problems[0].severity, "warning");
  assert.equal(result.problems[1].message, marker.message);
  assert.equal(result.problems[1].line, 3);
  assert.equal(result.problems[1].column, 7);
  assert.equal(result.problems[1].endColumn, 12);
  assert.equal(result.problems[1].code, "2322");
});

test("cleared markers clear both counts and messages", () => {
  assert.deepEqual(collectEditorDiagnostics("file.ts", []), { errors: 0, warnings: 0, problems: [] });
});

test("Python syntax errors show the exception instead of the source code", () => {
  const result = parseRunProblems(failed('  File "C:\\School\\week 1.py", line 3\n    print("Hello" name)\n          ^^^^^^^^^^^^\nSyntaxError: invalid syntax. Perhaps you forgot a comma?'));
  assert.equal(result.length, 1);
  assert.equal(result[0].line, 3);
  assert.equal(result[0].message, "SyntaxError: invalid syntax. Perhaps you forgot a comma?");
});

test("Python tracebacks use the innermost frame and map unsaved editor buffers", () => {
  const result = parseRunProblems(failed('Traceback (most recent call last):\n  File "<string>", line 1, in <module>\n  File "<editor>", line 3, in <module>\nNameError: name \'name\' is not defined', { filePath: "C:\\School\\week 1.py" }));
  assert.equal(result.length, 1);
  assert.equal(result[0].file, "C:\\School\\week 1.py");
  assert.equal(result[0].line, 3);
  assert.match(result[0].message, /NameError/);
});

test("chained Python exceptions retain their own locations", () => {
  const result = parseRunProblems(failed('  File "one.py", line 2\nValueError: invalid number\nDuring handling of the above exception, another exception occurred:\n  File "two.py", line 8\nTypeError: unsupported value'));
  assert.deepEqual(result.map(({ file, line }) => ({ file, line })), [{ file: "one.py", line: 2 }, { file: "two.py", line: 8 }]);
});

test("TypeScript and Java compiler diagnostics retain Windows paths", () => {
  const result = parseRunProblems(failed('C:\\My Project\\main.ts(2,7): error TS2322: Type mismatch.\nC:\\My Project\\Main.java:9: error: cannot find symbol'));
  assert.equal(result.length, 2);
  assert.equal(result[0].file, "C:\\My Project\\main.ts");
  assert.equal(result[0].code, "TS2322");
  assert.equal(result[1].line, 9);
  assert.equal(result[1].message, "cannot find symbol");
});

test("JavaScript runtime errors link the message to the first user stack frame", () => {
  const result = parseRunProblems(failed('ReferenceError: missing is not defined\n    at run (C:\\My Project\\main.js:4:9)\n    at node:internal/main/run_main_module:28:49'));
  assert.equal(result[0].file, "C:\\My Project\\main.js");
  assert.equal(result[0].line, 4);
  assert.equal(result[0].column, 9);
  assert.match(result[0].message, /ReferenceError/);
});

test("JavaScript syntax errors map unsaved eval locations", () => {
  const result = parseRunProblems(failed('[eval]:2\nconst =\n      ^\nSyntaxError: Unexpected token', { filePath: "C:\\main.js" }));
  assert.equal(result[0].file, "C:\\main.js");
  assert.equal(result[0].line, 2);
});

test("all reported issues remain available beyond eight entries", () => {
  const result = parseRunProblems(failed(Array.from({ length: 12 }, (_, i) => `file.ts(${i + 1},1): error TS1005: Expected a token.`).join("\n")));
  assert.equal(result.length, 12);
});

test("warnings are preserved even when the command succeeds", () => {
  const result = parseRunProblems({ ok: true, command: "test", stdout: 'main.ts(1,1): warning TS1234: Check this value.', stderr: "", exitCode: 0 });
  assert.equal(result[0].severity, "warning");
});

test("unrecognized failures retain the complete message; successful runs stay empty", () => {
  assert.equal(parseRunProblems(failed("Unable to start interpreter.\nThe command was not found."))[0].message, "Unable to start interpreter.\nThe command was not found.");
  assert.deepEqual(parseRunProblems({ ok: true, command: "test", stdout: "Hello", stderr: "", exitCode: 0 }), []);
  assert.deepEqual(parseRunProblems(null), []);
});
