import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const NEGATIONS = ["not", "no", "never", "cannot", "does not", "n't"];
const CONTRASTS = ["but", "however"];
const DISCLAIMER =
  "InvoiceFlow organizes invoice and tax information you configure. It does not file GST returns, give tax advice, or guarantee compliance. Review with a qualified accountant.";

export const sentenceHash = (sentence) =>
  createHash("sha256").update(sentence, "utf8").digest("hex");

function isNegated(
  sentence,
  matchIndex,
  negations = NEGATIONS,
  contrasts = CONTRASTS,
) {
  const before = sentence.slice(0, matchIndex);
  const words = before.match(/[\p{L}'-]+/gu) ?? [];
  const tail = words.slice(-6).join(" ").toLowerCase();
  const cue = negations.find((candidate) =>
    new RegExp(`(?:^| )${candidate.replaceAll(" ", " ")}(?: |$)`, "i").test(
      tail,
    ),
  );
  if (!cue || /\bnot\s+(?:only|just|merely)\b/i.test(tail)) return false;
  const cueIndex = before.toLowerCase().lastIndexOf(cue);
  const between = before.slice(cueIndex + cue.length).toLowerCase();
  return !contrasts.some((word) =>
    new RegExp(`\\b${word}\\b`, "i").test(between),
  );
}

const DEFAULT_PATTERNS = [
  ["gst-compliant", /\bGST[\s-]+compliant\b/gi],
  ["fully-compliant", /\bfully\s+compliant\b/gi],
  ["guarantees-compliance", /\bguarantee(?:s|d)?\s+compliance\b/gi],
  ["ensures-compliance", /\bensure(?:s|d)?\s+compliance\b/gi],
  ["certified", /\bcertified\b/gi],
  [
    "gst-authority-approval",
    /\bapproved\s+by\s+(?:the\s+)?GST\s+authorities\b/gi,
  ],
  ["accountant-approved", /\baccountant[- ]approved\b/gi],
  ["legally-valid", /\blegally\s+valid\b/gi],
  ["audit-proof", /\baudit[- ]proof\b/gi],
];

export function scanText(
  text,
  filename,
  {
    allowlistedHashes = [],
    patterns = DEFAULT_PATTERNS,
    negationCues = NEGATIONS,
    contrastCues = CONTRASTS,
  } = {},
) {
  const violations = [];
  for (const [patternId, regex] of patterns) {
    for (const match of text.matchAll(regex)) {
      const sentenceStart =
        Math.max(
          text.lastIndexOf(".", match.index),
          text.lastIndexOf("!", match.index),
          text.lastIndexOf("?", match.index),
        ) + 1;
      const sentenceEndCandidates = [".", "!", "?"]
        .map((mark) => text.indexOf(mark, match.index))
        .filter((index) => index >= 0);
      const sentenceEnd = sentenceEndCandidates.length
        ? Math.min(...sentenceEndCandidates) + 1
        : text.length;
      const sentence = text.slice(sentenceStart, sentenceEnd).trim();
      if (
        allowlistedHashes.includes(sentenceHash(sentence)) ||
        isNegated(
          sentence,
          match.index - sentenceStart,
          negationCues,
          contrastCues,
        )
      )
        continue;
      const before = text.slice(0, match.index);
      const line = before.split("\n").length;
      violations.push({ filename, line, ruleId: patternId, sentence });
    }
  }
  return violations;
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
    else files.push(fullPath);
  }
  return files;
}

function isUserFacing(file, root) {
  const rel = path.relative(root, file).replaceAll("\\", "/");
  if (
    rel === "README.md" ||
    rel.startsWith("backend/src/") ||
    rel.startsWith("frontend/src/") ||
    rel.startsWith("marketing/src/")
  )
    return true;
  if (rel.startsWith("frontend/dist/") || rel.startsWith("marketing/dist/"))
    return true;
  return false;
}

export async function checkClaims(root = process.cwd()) {
  const rules = JSON.parse(
    await readFile(path.join(root, "scripts/claims-rules.json"), "utf8"),
  );
  const patterns = rules.patterns.map(({ id, pattern, flags }) => [
    id,
    new RegExp(pattern, flags),
  ]);
  const allowlistPath = path.join(
    root,
    "docs/compliance/claims-allowlist.json",
  );
  const allowlist = JSON.parse(await readFile(allowlistPath, "utf8")).sentences;
  const required = [
    ["README.md", "README"],
    ["frontend/src/app/App.jsx", "tax settings"],
    ["backend/src/utils/csv.js", "GST export header"],
    ["marketing/src/main.jsx", "landing footer"],
  ];
  const violations = [];
  for (const [relative, label] of required) {
    const source = await readFile(path.join(root, relative), "utf8");
    const disclaimerSource =
      relative === "backend/src/utils/csv.js"
        ? source +
          (await readFile(
            path.join(root, "backend/src/utils/gstDisclaimer.js"),
            "utf8",
          ))
        : source;
    if (!disclaimerSource.includes(DISCLAIMER))
      violations.push({
        filename: relative,
        line: 1,
        ruleId: "missing-disclaimer",
        sentence: `Required disclaimer missing from ${label}.`,
      });
  }
  const roots = [
    "README.md",
    "backend/src",
    "frontend/src",
    "marketing/src",
    "frontend/dist",
    "marketing/dist",
  ];
  for (const relative of roots) {
    const absolute = path.join(root, relative);
    let files;
    try {
      const stat = await (await import("node:fs/promises")).stat(absolute);
      files = stat.isDirectory() ? await walk(absolute) : [absolute];
    } catch {
      continue;
    }
    for (const file of files) {
      if (!isUserFacing(file, root)) continue;
      const text = await readFile(file, "utf8");
      violations.push(
        ...scanText(text, path.relative(root, file).replaceAll("\\", "/"), {
          allowlistedHashes: allowlist,
          patterns,
          negationCues: rules.negationCues,
          contrastCues: rules.contrastCues,
        }),
      );
    }
  }
  return violations;
}
