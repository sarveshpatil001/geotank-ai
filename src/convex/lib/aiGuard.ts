/**
 * Deterministic post-filter for model commentary.
 *
 * The prompt forbids numeric results and liquid-level claims, but a model can
 * still violate it. This filter rejects the whole response rather than trying
 * to rewrite a dangerous sentence, so a partial claim can never reach storage.
 */

export type AiNarrative = {
  summary: string;
  sections: { title: string; body: string }[];
  limitations: string[];
};

export type AiSafetyResult =
  | { ok: true }
  | { ok: false; reason: string };

const NUMBER_UNIT = new RegExp(
  String.raw`(?:\d[\d,]*(?:\.\d+)?|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand)\b)\s*(?:m\s*³|m3|cubic\s+met(?:er|re)s?|lit(?:er|re)s?|l\b|us\s+gallons?|gallons?|gal\b|barrels?|bbl\b|%|percent\b|kilomet(?:er|re)s?|km\b|met(?:er|re)s?|m\b|centimet(?:er|re)s?|cm\b|millimet(?:er|re)s?|mm\b|feet|foot|ft\b|inches|inch)`,
  "i",
);

const LIQUID_LEVEL_TERMS =
  /\b(?:liquid|product|tank|fill)\s+(?:level|volume|content|contents)\b|\b(?:inventory|stock)\s+(?:level|volume|estimate|is|stands|appears)\b/i;

const FULL_CLAIM =
  /\b(?:\d+(?:\.\d+)?\s*(?:%|percent)\s*(?:full|filled)|(?:half|quarter|one[- ]third|two[- ]thirds)\s+(?:full|filled)|(?:tank|vessel)\s+(?:is|appears?|seems?)\s+(?:full|empty|partially\s+full))\b/i;

const NEGATION =
  /\b(?:not|no|never|cannot|can't|unable|without|unknown|undetermined|unverified|outside|does not|do not|isn't|aren't|neither|nor)\b/i;

function sentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((paragraph) => paragraph.split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

export function checkAiOutputSafety(output: AiNarrative): AiSafetyResult {
  const allText = [
    output.summary,
    ...output.sections.flatMap((section) => [section.title, section.body]),
    ...output.limitations,
  ].join("\n");

  if (NUMBER_UNIT.test(allText)) {
    return {
      ok: false,
      reason: "numeric statement with a volume, length or percentage unit",
    };
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
