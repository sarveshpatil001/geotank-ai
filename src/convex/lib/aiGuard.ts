/**
 * Deterministic post-filter for model commentary.
 *
 * The prompt forbids numeric results and liquid-level claims, but a model can
 * still violate it. This filter rejects the whole response rather than trying
 * to rewrite a dangerous sentence, so a partial claim can never reach storage.
 *
 * This is a safety net, not proof. It catches common numeric and fill claims;
 * it does not prove the remaining commentary is correct or harmless.
 */

export type AiNarrative = {
  summary: string;
  sections: { title: string; body: string }[];
  limitations: string[];
};

export type AiSafetyResult =
  | { ok: true }
  | { ok: false; reason: string };

const UNIT_PATTERN = String.raw`(?:m\s*³|m3|cubic\s+met(?:er|re)s?|lit(?:er|re)s?|l\b|us\s+gallons?|gallons?|gal\b|barrels?|bbl\b|%|percent\b|kilomet(?:er|re)s?|km\b|met(?:er|re)s?|m\b|centimet(?:er|re)s?|cm\b|millimet(?:er|re)s?|mm\b|feet|foot|ft\b|inches|inch)`;
const WORD_NUMBER_PATTERN = String.raw`(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)`;

const NUMBER_WITH_UNIT = new RegExp(
  String.raw`(?<![\w.,-])(\d[\d,]*(?:\.\d+)?|${WORD_NUMBER_PATTERN})\s*(?:${UNIT_PATTERN})`,
  "gi",
);

const WRITTEN_NUMBER_WITH_UNIT = new RegExp(
  String.raw`\b${WORD_NUMBER_PATTERN}(?:\s+(?:hundred|thousand))?\s*(?:${UNIT_PATTERN})`,
  "i",
);

const INPUT_NUMBER =
  /(?<![\w.-])-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?![\w.-])/g;

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  thousand: 1000,
};

const LIQUID_LEVEL_TERMS =
  /\b(?:liquid|product|tank|fill)\s+(?:level|volume|content|contents)\b|\b(?:inventory|stock)\s+(?:level|volume|estimate|is|stands|appears)\b/i;

const FULL_CLAIM =
  /\b(?:\d+(?:\.\d+)?\s*(?:%|percent)\s*(?:full|filled)|(?:half|quarter|one[- ]third|two[- ]thirds)\s+(?:full|filled)|(?:tank|vessel)\s+(?:is|appears?|seems?)\s+(?:full|empty|partially\s+full))\b/i;

const NEGATION =
  /\b(?:not|no|never|cannot|can't|unable|without|unknown|undetermined|unverified|outside|does not|do not|isn't|aren't|neither|nor)\b/i;

function inputNumbers(input: unknown): Set<number> {
  const values = new Set<number>();
  const serialized = JSON.stringify(input ?? null);
  for (const match of serialized.matchAll(INPUT_NUMBER)) {
    const value = Number(match[0]);
    if (Number.isFinite(value)) values.add(value);
  }
  return values;
}

function outputNumber(token: string): number | null {
  const normalized = token.replace(/,/g, "").toLowerCase();
  const word = NUMBER_WORDS[normalized];
  if (word !== undefined) return word;

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function sentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((paragraph) => paragraph.split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

export function checkAiOutputSafety(
  output: AiNarrative,
  input?: unknown,
): AiSafetyResult {
  const allText = [
    output.summary,
    ...output.sections.flatMap((section) => [section.title, section.body]),
    ...output.limitations,
  ].join("\n");
  const allowedNumbers = inputNumbers(input);

  if (WRITTEN_NUMBER_WITH_UNIT.test(allText)) {
    return {
      ok: false,
      reason: "written-number measurement claim",
    };
  }

  for (const match of allText.matchAll(NUMBER_WITH_UNIT)) {
    const value = outputNumber(match[1]);
    if (value === null || !allowedNumbers.has(value)) {
      return {
        ok: false,
        reason: "numeric statement that is not in the input data",
      };
    }
  }

  for (const sentence of sentences(allText)) {
    if (
      (LIQUID_LEVEL_TERMS.test(sentence) || FULL_CLAIM.test(sentence)) &&
      !NEGATION.test(sentence)
    ) {
      return {
        ok: false,
        reason: "affirmative liquid-level or inventory claim",
      };
    }
  }

  return { ok: true };
}
