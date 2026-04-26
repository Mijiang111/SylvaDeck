const PER_PAGE_CONSTRAINT_PATTERN =
  /\bone\s+(?:page|slide)\s*,?\s*one\s+(?:claim|mission|question|answer|objective|headline|argument)\b/i;
const CHINESE_PER_PAGE_CONSTRAINT_PATTERN =
  /(?:一|单|單)页一(?:个)?(?:结论|結論|观点|觀點|主张|主張|问题|問題|答案|任务|任務|件事|件事情)/i;
const CHINESE_PAGE_NUMBER_TOKEN_PATTERN = /[一二两三四五六七八九十]{1,3}/;
const PAGE_COUNT_TRAILING_BOUNDARY = String.raw`(?=$|\s|[，,。.;；、:：!?？])`;
const NUMERIC_SINGLE_PAGE_PATTERN = /(?:^|[^\d])(1|一)\s*(?:页|頁|张|張)/i;

const CHINESE_PAGE_COUNT_WORDS = new Map<string, number>([
  ["一", 1],
  ["二", 2],
  ["两", 2],
  ["三", 3],
  ["四", 4],
  ["五", 5],
  ["六", 6],
  ["七", 7],
  ["八", 8],
  ["九", 9],
  ["十", 10],
  ["十一", 11],
  ["十二", 12],
]);

function parseDeckPageCountToken(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  const numericValue = Number.parseInt(normalized, 10);
  if (Number.isInteger(numericValue) && numericValue >= 1 && numericValue <= 12) {
    return numericValue;
  }

  return CHINESE_PAGE_COUNT_WORDS.get(normalized);
}

function isPageCountMatchPartOfAspectRatio(sourceText: string, match: RegExpMatchArray) {
  const matchIndex = match.index ?? -1;
  if (matchIndex <= 0) {
    return false;
  }

  const separator = sourceText[matchIndex - 1];
  if (separator !== ":" && separator !== "：") {
    return false;
  }

  let cursor = matchIndex - 2;
  let hasLeftNumber = false;
  while (cursor >= 0 && /\d/.test(sourceText[cursor] ?? "")) {
    hasLeftNumber = true;
    cursor -= 1;
  }

  return hasLeftNumber;
}

export function inferRequestedHtmlPageCount(sourceText: string) {
  const normalized = sourceText.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  const numericTotalPatterns = [
    new RegExp(`\\b(\\d{1,2})\\s*[- ]?(?:page|pages|slide|slides|ppt)${PAGE_COUNT_TRAILING_BOUNDARY}`, "gi"),
    new RegExp(
      `(\\d{1,2})\\s*(?:页|頁|张|張)\\s*(?:英文|中文|双语|雙語)?\\s*(?:ppt|deck|slides?|presentation|简报|簡報)${PAGE_COUNT_TRAILING_BOUNDARY}`,
      "gi",
    ),
    new RegExp(
      `(${CHINESE_PAGE_NUMBER_TOKEN_PATTERN.source})\\s*(?:页|頁|张|張)\\s*(?:英文|中文|双语|雙語)?\\s*(?:ppt|deck|slides?|presentation|简报|簡報)${PAGE_COUNT_TRAILING_BOUNDARY}`,
      "gi",
    ),
  ];
  for (const pattern of numericTotalPatterns) {
    let lastParsed: number | undefined;
    for (const match of normalized.matchAll(pattern)) {
      if (isPageCountMatchPartOfAspectRatio(normalized, match)) {
        continue;
      }
      const parsed = parseDeckPageCountToken(match[1] ?? "");
      if (parsed !== undefined) {
        lastParsed = parsed;
      }
    }
    if (lastParsed !== undefined) {
      return lastParsed;
    }
  }

  const wordToCount: Record<string, number> = {
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
    eleven: 11,
    twelve: 12,
  };
  const wordMatches = Array.from(
    normalized.matchAll(
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*[- ]?(?:page|pages|slide|slides|ppt)\b/gi,
    ),
  );
  if (wordMatches.length > 0) {
    const latestMatch = wordMatches[wordMatches.length - 1];
    const parsed = wordToCount[(latestMatch?.[1] ?? "").toLowerCase()];
    if (parsed >= 1 && parsed <= 12) {
      return parsed;
    }
  }

  const referencedPages = Array.from(
    normalized.matchAll(
      new RegExp(
        `\\b(?:page|pages|slide|slides)\\s*(\\d{1,2})\\b|第\\s*(\\d{1,2}|${CHINESE_PAGE_NUMBER_TOKEN_PATTERN.source})\\s*(?:页|頁|张|張)`,
        "gi",
      ),
    ),
    (match) => parseDeckPageCountToken(match[1] ?? match[2] ?? ""),
  ).filter(
    (value): value is number =>
      value !== null && value !== undefined && Number.isInteger(value) && value >= 1 && value <= 12,
  );
  const uniqueReferencedPages = Array.from(new Set(referencedPages)).sort((a, b) => a - b);
  if (
    uniqueReferencedPages.length >= 2 &&
    uniqueReferencedPages[0] === 1 &&
    uniqueReferencedPages.every((value, index) => value === index + 1)
  ) {
    return uniqueReferencedPages[uniqueReferencedPages.length - 1];
  }

  if (
    !PER_PAGE_CONSTRAINT_PATTERN.test(normalized) &&
    !CHINESE_PER_PAGE_CONSTRAINT_PATTERN.test(normalized) &&
    (
      /\b(one[ -]?page|one[ -]?pager|single[ -]?page|single slide|single-page|one slide|一页|单页|單頁)\b/i.test(
        normalized,
      ) ||
      NUMERIC_SINGLE_PAGE_PATTERN.test(normalized)
    )
  ) {
    return 1;
  }

  return undefined;
}
