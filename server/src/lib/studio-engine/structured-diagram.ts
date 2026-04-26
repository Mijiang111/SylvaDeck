import type {
  PageRecipePlan,
  StructuredDiagramConnector,
  StructuredDiagramKind,
  StructuredDiagramLane,
  StructuredDiagramNode,
  StructuredDiagramPhase,
  StructuredDiagramSpec,
  StructuredGanttTask,
} from "./contracts.js";

type PageRecipePlanPage = PageRecipePlan["pages"][number];

const FLOWCHART_PATTERN = /\b(?:flowchart|flow\s+chart|process\s+diagram)\b|流程图/i;
const SWIMLANE_PATTERN = /\b(?:swimlane|swim\s+lane)\b|泳道/i;
const EXPLICIT_GANTT_PATTERN = /\bgantt\b|甘特/i;
const ROADMAP_PATTERN = /\b(?:roadmap|workstreams?)\b|路线图/i;
const TIME_BUCKET_PATTERN =
  /\b(?:Q[1-4](?:\s*(?:FY)?\d{2,4})?|20\d{2}|H[12]|month|monthly|week|weekly|quarter|timeline|time\s+buckets?)\b|季度|月份|周计划|时间轴|时间桶/i;

const SEGMENT_STOP_PATTERN =
  /\b(?:Page plan|Layout\s*\/|Visual thesis|Tone\s*\+|Anti-patterns|Source constraint)\b/i;

function uniqueStrings(items: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function clampLabel(value: string, maxLength = 44) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trimEnd()}...` : normalized;
}

function extractStructuredDiagramTitle(text: string, fallbackTitle: string) {
  const explicitTitle =
    text.match(/标题(?:为|是|:|：)\s*[「“"']?([^」”"'\n。]{2,80})[」”"']?/)?.[1] ??
    text.match(/\btitle\s*(?:is|:)\s*[“"']?([^”"'\n.]{2,80})[”"']?/i)?.[1] ??
    "";
  const title = explicitTitle || fallbackTitle;
  return clampLabel(title || "Structured diagram", 80);
}

function slugId(prefix: string, label: string, index: number) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  return `${prefix}-${slug || index + 1}`;
}

function extractSegmentAfter(text: string, patterns: RegExp[]) {
  let bestIndex = -1;
  let bestEnd = -1;
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    pattern.lastIndex = 0;
    if (match && (bestIndex < 0 || match.index < bestIndex)) {
      bestIndex = match.index;
      bestEnd = match.index + match[0].length;
    }
  }
  if (bestIndex < 0) {
    return text;
  }

  const tail = text.slice(bestEnd);
  const stop = tail.search(SEGMENT_STOP_PATTERN);
  return stop >= 0 ? tail.slice(0, stop) : tail;
}

function extractQuotedItemsNear(text: string, keywords: RegExp[], maxItems: number) {
  let startIndex = -1;
  for (const keyword of keywords) {
    const match = keyword.exec(text);
    keyword.lastIndex = 0;
    if (match && (startIndex < 0 || match.index < startIndex)) {
      startIndex = match.index;
    }
  }
  if (startIndex < 0) {
    return [];
  }

  const slice = text.slice(startIndex, startIndex + 420);
  return uniqueStrings(
    Array.from(slice.matchAll(/[“"']([^”"']{1,48})[”"']/g), (match) => match[1] ?? ""),
  ).slice(0, maxItems);
}

function cleanListLabel(value: string) {
  return value
    .replace(/^[\s"'“”‘’\[\]【】()（）<>]+|[\s"'“”‘’\[\]【】()（）<>.。]+$/g, "")
    .replace(/^(?:and|or)\s+/i, "")
    .trim();
}

function extractInlineListNear(text: string, keywords: RegExp[], maxItems: number) {
  let startIndex = -1;
  for (const keyword of keywords) {
    const match = keyword.exec(text);
    keyword.lastIndex = 0;
    if (match && (startIndex < 0 || match.index < startIndex)) {
      startIndex = match.index;
    }
  }
  if (startIndex < 0) {
    return [];
  }

  const slice = text.slice(startIndex, startIndex + 520);
  const colonMatch = slice.match(/[:：]\s*([^\n。;；]{3,260})/);
  if (!colonMatch) {
    return [];
  }
  const listText = (() => {
    const raw = colonMatch[1] ?? "";
    const stop = raw.search(SEGMENT_STOP_PATTERN);
    return stop >= 0 ? raw.slice(0, stop) : raw;
  })();

  return uniqueStrings(
    listText
      .split(/\s*(?:[,，、/|]|(?:\s+and\s+))\s*/i)
      .map(cleanListLabel)
      .filter((item) => item.length > 0 && item.length <= 48),
  ).slice(0, maxItems);
}

function extractLabeledItemsNear(text: string, keywords: RegExp[], maxItems: number) {
  return uniqueStrings([
    ...extractQuotedItemsNear(text, keywords, maxItems),
    ...extractInlineListNear(text, keywords, maxItems),
  ]).slice(0, maxItems);
}

function extractNumberedItems(text: string) {
  const rawSegment = extractSegmentAfter(text, [
    /\bprocess\s+nodes?\s+to\s+reproduce\b/i,
    /\bnodes?\s+to\s+reproduce\b/i,
    /\b(?:numbered\s+)?(?:project\s+planning\s+)?steps?\s*(?:to\s+reproduce)?\s*[:：]/i,
    /\bworkstreams?\b/i,
    /\btasks?\b/i,
    /流程节点/,
    /步骤/,
  ])
    .trim();
  const lineItems: Array<{ number: number; label: string }> = [];
  let startedNumberedLines = false;
  for (const line of rawSegment.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d{1,2})(?:[.)、]|\s+)(.+?)\s*$/);
    if (!match) {
      if (startedNumberedLines && line.trim()) {
        break;
      }
      continue;
    }
    startedNumberedLines = true;
    const number = Number.parseInt(match[1] ?? "", 10);
    const label = clampLabel(
      (match[2] ?? "")
        .replace(/\((?:diamond|decision)\)/gi, "")
        .trim(),
      54,
    );
    if (Number.isInteger(number) && number > 0 && label && !/^\d+$/.test(label)) {
      lineItems.push({ number, label });
    }
  }
  if (lineItems.length >= 2) {
    return lineItems;
  }

  const segment = rawSegment.replace(/\r?\n/g, " ").trim();
  const items: Array<{ number: number; label: string }> = [];
  const pattern = /(?:^|[\s,;；。:：-])(\d{1,2})(?:[.)、]|\s+)(.*?)(?=(?:[\s,;；。-]\d{1,2}(?:[.)、]|\s+))|$)/gs;

  for (const match of segment.matchAll(pattern)) {
    const number = Number.parseInt(match[1] ?? "", 10);
    const rawLabel = (match[2] ?? "")
      .replace(/\((?:diamond|decision)\)/gi, "")
      .replace(/\b(?:Page plan|Layout|Visual thesis)\b.*$/i, "")
      .trim();
    const label = clampLabel(rawLabel, 54);
    if (!Number.isInteger(number) || number <= 0 || !label || /^\d+$/.test(label)) {
      continue;
    }
    items.push({ number, label });
  }

  return items.length >= 2 ? items : [];
}

function detectStructuredDiagramKind(text: string): StructuredDiagramKind | null {
  if (SWIMLANE_PATTERN.test(text)) {
    return "swimlane";
  }
  if (FLOWCHART_PATTERN.test(text)) {
    return "flowchart";
  }
  if (EXPLICIT_GANTT_PATTERN.test(text)) {
    return "gantt";
  }
  if (ROADMAP_PATTERN.test(text) && TIME_BUCKET_PATTERN.test(text)) {
    return "gantt";
  }
  return null;
}

function buildLanes(text: string, kind: StructuredDiagramKind): StructuredDiagramLane[] {
  if (kind !== "swimlane") {
    return [];
  }

  const labels = extractLabeledItemsNear(text, [
    /\b(?:swimlanes?|swim\s+lanes?)\b/i,
    /\b(?:lane\s+headers?|lanes?)\b/i,
    /泳道/,
    /泳道.*?(?:header|headers|标签|标题)?/i,
  ], 6);

  return labels.map((label, index) => ({
    id: slugId("lane", label, index),
    label,
  }));
}

function buildPhases(text: string): StructuredDiagramPhase[] {
  const labels = extractLabeledItemsNear(text, [
    /\b(?:stage|phase)\s+(?:bands?|blocks?|labels?)\s*[:：]/i,
    /\b(?:phases|stages)\s*[:：]/i,
    /阶段(?:块|标签)?\s*[:：]/,
  ], 6);

  return labels.map((label, index) => ({
    id: slugId("phase", label, index),
    label,
  }));
}

function isDecisionLabel(label: string) {
  return /\b(?:decision|whether|judge|approve)\b/i.test(label) || /判断|是否|审批|决策/.test(label);
}

function pickLaneId(label: string, lanes: StructuredDiagramLane[], index: number) {
  if (lanes.length === 0) {
    return null;
  }

  const customerLane = lanes.find((lane) => /客户|client|customer/i.test(lane.label));
  const projectLane = lanes.find((lane) => /项目|project|team/i.test(lane.label));
  const expertLane = lanes.find((lane) => /专家|expert|committee/i.test(lane.label));
  const consultingLane = lanes.find((lane) => /咨询|consult/i.test(lane.label));

  if (customerLane && /认可|确认|accept|approve/i.test(label)) {
    return customerLane.id;
  }
  if (expertLane && /讨论|判断|审核|评审|review|judge|decision/i.test(label)) {
    return expertLane.id;
  }
  if (consultingLane && /汇报|长期|顾问|consult|report/i.test(label)) {
    return consultingLane.id;
  }
  if (projectLane && /现场|调研|标杆|研究|形成|提出|方案设计|培训|分阶段|实施|design|train|research/i.test(label)) {
    return projectLane.id;
  }

  return lanes[index % lanes.length]?.id ?? null;
}

function pickPhaseId(label: string, phases: StructuredDiagramPhase[], index: number, total: number) {
  if (phases.length === 0) {
    return null;
  }

  const diagnosis = phases.find((phase) => /现状|诊断|diagnos/i.test(phase.label));
  const design = phases.find((phase) => /方案|设计|design/i.test(phase.label));
  const implementation = phases.find((phase) => /辅导|实施|implement|enable/i.test(phase.label));
  const longTerm = phases.find((phase) => /长期|服务|long/i.test(phase.label));

  if (longTerm && /长期|顾问|long/i.test(label)) {
    return longTerm.id;
  }
  if (implementation && /项目成果|培训|分阶段|实施|train|implement/i.test(label)) {
    return implementation.id;
  }
  if (design && /认可诊断|方案|框架|审核|项目结果|design|review/i.test(label)) {
    return design.id;
  }
  if (diagnosis && /调研|标杆|诊断|research|diagnos/i.test(label)) {
    return diagnosis.id;
  }

  const bucket = Math.min(phases.length - 1, Math.floor(index / Math.max(1, Math.ceil(total / phases.length))));
  return phases[bucket]?.id ?? null;
}

function buildNodes(
  numberedItems: Array<{ number: number; label: string }>,
  lanes: StructuredDiagramLane[],
  phases: StructuredDiagramPhase[],
) {
  return numberedItems.map((item, index) => ({
    id: `node-${item.number}`,
    label: item.label,
    number: item.number,
    laneId: pickLaneId(item.label, lanes, index),
    phaseId: pickPhaseId(item.label, phases, index, numberedItems.length),
    shape: isDecisionLabel(item.label) ? "decision" : "process",
  })) satisfies StructuredDiagramNode[];
}

function buildConnectors(text: string, nodes: StructuredDiagramNode[]) {
  const nodeByNumber = new Map(nodes.map((node) => [node.number, node] as const));
  const connectors: StructuredDiagramConnector[] = [];
  const seen = new Set<string>();
  const addConnector = (fromNumber: number | undefined, toNumber: number | undefined) => {
    const from = nodeByNumber.get(fromNumber);
    const to = nodeByNumber.get(toNumber);
    if (!from || !to) {
      return;
    }
    const key = `${from.id}->${to.id}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    connectors.push({ fromId: from.id, toId: to.id, label: null });
  };

  for (const match of text.matchAll(/\b\d{1,2}\b(?:\s*(?:→|->|=>|-->|到|至)\s*\b\d{1,2}\b)+/g)) {
    const numbers = Array.from((match[0] ?? "").matchAll(/\d{1,2}/g), (numberMatch) =>
      Number.parseInt(numberMatch[0], 10),
    );
    for (let index = 0; index < numbers.length - 1; index += 1) {
      addConnector(numbers[index], numbers[index + 1]);
    }
  }

  if (connectors.length === 0) {
    const ordered = [...nodes].sort((left, right) => (left.number ?? 0) - (right.number ?? 0));
    for (let index = 0; index < ordered.length - 1; index += 1) {
      connectors.push({ fromId: ordered[index]!.id, toId: ordered[index + 1]!.id, label: null });
    }
  }

  return connectors;
}

function extractTimeBuckets(text: string) {
  const quarterBuckets = uniqueStrings(
    Array.from(text.matchAll(/\bQ[1-4](?:\s*(?:FY)?\d{2,4})?\b/gi), (match) => match[0].replace(/\s+/g, " ")),
  );
  if (quarterBuckets.length >= 2) {
    return quarterBuckets.slice(0, 8);
  }

  const yearBuckets = uniqueStrings(Array.from(text.matchAll(/\b20\d{2}\b/g), (match) => match[0]));
  if (yearBuckets.length >= 2) {
    return yearBuckets.slice(0, 8);
  }

  return ["Q1", "Q2", "Q3", "Q4"];
}

function buildGanttTasks(
  numberedItems: Array<{ number: number; label: string }>,
  buckets: string[],
) {
  const bucketCount = Math.max(1, buckets.length);
  return numberedItems.map((item, index) => {
    const startBucket = Math.min(bucketCount - 1, Math.floor((index / Math.max(1, numberedItems.length)) * bucketCount));
    const duration = bucketCount <= 4 ? 1 : 2;
    return {
      id: `task-${item.number}`,
      label: item.label,
      trackId: `track-${item.number}`,
      startBucket,
      endBucket: Math.min(bucketCount - 1, startBucket + duration),
      milestone: /milestone|launch|go-live|上线|发布|里程碑/i.test(item.label),
    } satisfies StructuredGanttTask;
  });
}

export function buildStructuredDiagramSpec(args: {
  brief: string;
  page: PageRecipePlanPage;
}): StructuredDiagramSpec | null {
  const combinedText = [
    args.brief,
    args.page.pageTitle,
    args.page.objective,
    args.page.insight,
    args.page.compositionHint,
    args.page.moduleHints.join(" "),
  ].join("\n");
  const kind = detectStructuredDiagramKind(combinedText);
  if (!kind) {
    return null;
  }

  const numberedItems = extractNumberedItems(combinedText);
  if (numberedItems.length < 2) {
    return null;
  }

  if (kind === "gantt") {
    const timeBuckets = extractTimeBuckets(combinedText);
    const tasks = buildGanttTasks(numberedItems, timeBuckets);
    if (tasks.length < 2) {
      return null;
    }
    return {
      kind,
      title: extractStructuredDiagramTitle(combinedText, args.page.pageTitle || "Execution roadmap"),
      lanes: [],
      phases: [],
      nodes: [],
      connectors: [],
      timeBuckets,
      tasks,
      source: "heuristic",
    };
  }

  const lanes = buildLanes(combinedText, kind);
  const phases = buildPhases(combinedText);
  const nodes = buildNodes(numberedItems, lanes, phases);
  if (nodes.length < 2) {
    return null;
  }

  return {
    kind,
    title: extractStructuredDiagramTitle(combinedText, args.page.pageTitle || "Process flow"),
    lanes,
    phases,
    nodes,
    connectors: buildConnectors(combinedText, nodes),
    timeBuckets: [],
    tasks: [],
    source: "heuristic",
  };
}
