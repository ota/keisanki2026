// Comparing typed code with the sample, and the progress panel above the
// submission form. Indentation, trailing spaces and blank lines are ignored;
// spaces inside a line count, as part of copying the sample exactly.

const codeLines = (code, keepBlank = false) =>
  code
    .split("\n")
    .map((text, index) => ({ text, trimmed: text.trim(), line: index + 1 }))
    .filter((line) => keepBlank || line.trimmed);

export const sameCode = (a, b) =>
  codeLines(a).map(({ trimmed }) => trimmed).join("\n") ===
  codeLines(b).map(({ trimmed }) => trimmed).join("\n");

export const normalizeOutput = (text) =>
  text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n+$/, "");

const describe = (character) =>
  character === " "
    ? "半角の空白"
    : character === "　"
      ? "全角の空白"
      : /[！-～]/.test(character)
        ? `${character}（全角）`
        : character;

// Share of characters two lines have in common, in order (0 to 1).
function similarity(a, b) {
  if (!a.length && !b.length) return 1;
  let previous = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const current = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++)
      current[j] =
        a[i - 1] === b[j - 1]
          ? previous[j - 1] + 1
          : Math.max(previous[j], current[j - 1]);
    previous = current;
  }
  return (2 * previous[b.length]) / (a.length + b.length);
}

// Returns { marks: Map(line -> column), messages: string[] }. Lines are
// aligned first (longest common subsequence), so one missing line does not
// make every later line count as different.
export function compareToSample(code, sampleLines) {
  const typed = codeLines(code);
  const sample = codeLines(sampleLines.join("\n"));
  const n = typed.length;
  const m = sample.length;
  const common = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      common[i][j] =
        typed[i].trimmed === sample[j].trimmed
          ? common[i + 1][j + 1] + 1
          : Math.max(common[i + 1][j], common[i][j + 1]);
  const marks = new Map();
  const messages = [];
  let extra = [];
  let missing = [];
  const report = (mine, theirs) => {
    let at = 0;
    while (at < mine.trimmed.length && mine.trimmed[at] === theirs[at]) at++;
    const indent = mine.text.length - mine.text.trimStart().length;
    marks.set(mine.line, indent + at);
    if (at >= mine.trimmed.length)
      messages.push(`${mine.line}行目：最後に「${theirs.slice(at)}」が足りません。`);
    else if (at >= theirs.length)
      messages.push(`${mine.line}行目：最後の「${mine.trimmed.slice(at)}」は見本にありません。`);
    else
      messages.push(
        `${mine.line}行目：「${describe(mine.trimmed[at])}」のところが、見本では「${describe(theirs[at])}」です。`,
      );
  };
  // Within a run of differing lines, pair each typed line with a similar
  // sample line (keeping order); the rest are extra or missing lines.
  const flush = () => {
    const a = extra;
    const b = missing;
    const cost = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let x = a.length; x >= 0; x--)
      for (let y = b.length; y >= 0; y--) {
        if (x === a.length && y === b.length) continue;
        const options = [];
        if (x < a.length) options.push(1 + cost[x + 1][y]);
        if (y < b.length) options.push(1 + cost[x][y + 1]);
        if (x < a.length && y < b.length) {
          const likeness = similarity(a[x].trimmed, b[y].trimmed);
          if (likeness >= 0.5) options.push(2 * (1 - likeness) + cost[x + 1][y + 1]);
        }
        cost[x][y] = Math.min(...options);
      }
    let x = 0;
    let y = 0;
    while (x < a.length || y < b.length) {
      const likeness =
        x < a.length && y < b.length ? similarity(a[x].trimmed, b[y].trimmed) : 0;
      if (likeness >= 0.5 && cost[x][y] === 2 * (1 - likeness) + cost[x + 1][y + 1]) {
        report(a[x++], b[y++].trimmed);
      } else if (x < a.length && cost[x][y] === 1 + cost[x + 1][y]) {
        const mine = a[x++];
        marks.set(mine.line, mine.text.length - mine.text.trimStart().length);
        messages.push(`${mine.line}行目は、見本にない行です。`);
      } else {
        const theirs = b[y++];
        messages.push(`見本の${theirs.line}行目「${theirs.trimmed}」が見つかりません。`);
      }
    }
    extra = [];
    missing = [];
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (typed[i].trimmed === sample[j].trimmed) {
      flush();
      i++;
      j++;
    } else if (common[i + 1][j] >= common[i][j + 1]) extra.push(typed[i++]);
    else missing.push(sample[j++]);
  }
  extra.push(...typed.slice(i));
  missing.push(...sample.slice(j));
  flush();
  return { marks, messages };
}

const kinds = [
  ["given", "おさらい"],
  ["sample", "見本"],
  ["fix", "エラーを直す"],
  ["try", "確認"],
  ["task", "課題"],
];

function message(rate) {
  if (rate === 100) return "全部できました 🎉 おつかれさまでした";
  if (rate >= 80) return "あと少しです 🔥";
  if (rate >= 50) return "半分を超えました。もうひと頑張り 💪";
  if (rate > 0) return "いい調子です。この調子で進めましょう 🚀";
  return "まずは最初の見本から始めましょう ✍️";
}

// entries: [{ id, kind, label, bonus, done }]
export function renderProgress(panel, entries) {
  const required = entries.filter(({ bonus }) => !bonus);
  const bonus = entries.filter(({ bonus }) => bonus);
  const done = required.filter((entry) => entry.done).length;
  const rate = required.length ? Math.round((done / required.length) * 100) : 0;
  panel.replaceChildren();
  const add = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const head = add("div", "progress-head");
  head.append(
    add("span", "progress-title", "達成状況"),
    add("strong", "progress-rate", `${rate}%`),
    add("span", "progress-count", `（${done} / ${required.length}）`),
  );
  const bar = add("div", "progress-bar");
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", "100");
  bar.setAttribute("aria-valuenow", String(rate));
  const fill = add("div", "progress-fill");
  fill.style.width = `${rate}%`;
  bar.append(fill);
  const cheer = add("p", "progress-message", message(rate));
  const bonusDone = bonus.filter((entry) => entry.done).length;
  if (bonus.length && bonusDone === bonus.length)
    cheer.append(document.createElement("br"), "発展課題も全部できました 🏆");
  else if (bonusDone)
    cheer.append(document.createElement("br"), "発展課題にも挑戦しました 🌟");
  const breakdown = add("ul", "progress-breakdown");
  for (const [kind, name] of kinds) {
    const group = required.filter((entry) => entry.kind === kind);
    if (!group.length) continue;
    const count = group.filter((entry) => entry.done).length;
    const item = add("li", count === group.length ? "complete" : "", `${name} ${count}/${group.length}`);
    breakdown.append(item);
  }
  if (bonus.length) breakdown.append(add("li", "bonus", `発展 ${bonusDone}/${bonus.length}`));
  panel.append(head, bar, cheer, breakdown);
  const remaining = required.filter((entry) => !entry.done);
  if (remaining.length) {
    const list = add("p", "progress-remaining");
    list.append("まだの欄：");
    remaining.slice(0, 6).forEach((entry, index) => {
      if (index) list.append("、");
      const link = add("a", "", entry.label);
      link.href = `#editor-${entry.id}`;
      list.append(link);
    });
    if (remaining.length > 6) list.append(` ほか${remaining.length - 6}件`);
    panel.append(list);
  }
  panel.append(
    add(
      "p",
      "progress-note",
      "この端末で実行した結果にもとづく目安です。コードを書き換えた欄は、実行し直すと数えられます。",
    ),
  );
  return { rate, done, total: required.length };
}
