import test from "node:test";
import assert from "node:assert/strict";
import { compareToSample, normalizeOutput, sameCode } from "../src/progress.js";

const sample = [
  "#include <stdio.h>",
  "int main(void) {",
  "    int a = 7;",
  "    printf(\"%d\\n\", a);",
  "    return 0;",
  "}",
];

test("indentation, trailing spaces and blank lines do not count as differences", () => {
  const typed = "#include <stdio.h>\n\nint main(void) {\nint a = 7;   \n  printf(\"%d\\n\", a);\n        return 0;\n}\n";
  assert.equal(sameCode(typed, sample.join("\n")), true);
  assert.deepEqual(compareToSample(typed, sample).messages, []);
});

test("a changed character is located and named, including full-width symbols", () => {
  const typed = sample.join("\n").replace("int a = 7;", "int a = 7；");
  const { marks, messages } = compareToSample(typed, sample);
  assert.deepEqual([...marks], [[3, 13]]);
  assert.deepEqual(messages, ["3行目：「；（全角）」のところが、見本では「;」です。"]);
});

test("one missing line is reported alone, without shifting the lines after it", () => {
  const typed = sample.filter((line) => !line.includes("int a")).join("\n");
  const { marks, messages } = compareToSample(typed, sample);
  assert.equal(marks.size, 0);
  assert.deepEqual(messages, ["見本の3行目「int a = 7;」が見つかりません。"]);
});

test("extra, shortened and lengthened lines are reported", () => {
  const typed = sample
    .join("\n")
    .replace("return 0;", "return 0")
    .replace("int a = 7;", "int a = 7;;\n        a = 1;");
  const { messages } = compareToSample(typed, sample);
  assert.deepEqual(messages, [
    "3行目：最後の「;」は見本にありません。",
    "4行目は、見本にない行です。",
    "6行目：最後に「;」が足りません。",
  ]);
});

test("output comparison ignores trailing spaces and final newlines", () => {
  assert.equal(normalizeOutput("  *  \r\n ***\n\n"), normalizeOutput("  *\n ***"));
  assert.notEqual(normalizeOutput(" *"), normalizeOutput("*"));
});
