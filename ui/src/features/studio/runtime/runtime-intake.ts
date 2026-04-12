import { createTemplateProjectState } from "@/features/studio/state";
import { buildReportSourceInput, composeBriefSource } from "@/features/studio/module-runtime-input";
import { getTemplateDefinition } from "@/features/studio/templates";
import type { WorkbenchProject } from "@/features/studio/types";
import type { BriefSummary, Message } from "./runtime-types";

const INTAKE_GREETING =
  "Describe the report you need. I will turn the brief directly into a 16:9 HTML report deck.";

const INTAKE_STARTERS = [
  "Create a report about...",
  "Turn these notes into a 16:9 HTML report about...",
  "I need a report that explains or argues for...",
];

const CONFIRMATION_PATTERNS = [
  /\bconfirm\b/i,
  /\byes\b/i,
  /\blooks good\b/i,
  /\bsounds good\b/i,
  /\bthat works\b/i,
  /\bgo ahead\b/i,
  /\bproceed\b/i,
];

function describeMissingBriefPiece(missing: string) {
  if (missing === "audience") {
    return "who needs to receive or believe this report";
  }
  if (missing === "objective") {
    return "what decision, takeaway, or shift this deck should drive";
  }
  if (missing === "output style") {
    return "what kind of presentation this should feel like";
  }
  if (missing === "evidence stance") {
    return "whether I should stay inside your notes or bring in outside evidence";
  }
  return missing;
}

function joinNaturalList(items: string[]) {
  if (items.length === 0) {
    return "";
  }
  if (items.length === 1) {
    return items[0];
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function normalizeFormat(summary: BriefSummary) {
  return summary.format === "Format not specified" ? "presentation" : summary.format;
}

function buildBriefFraming(summary: BriefSummary) {
  const pieces = [
    `I’m shaping this as a ${normalizeFormat(summary)} about ${summary.topic}.`,
    summary.audience !== "Needs audience"
      ? `Right now it reads like a deck for ${summary.audience}.`
      : "The audience is still implicit, so I have not locked who this needs to persuade yet.",
    summary.objective !== "Needs decision or takeaway"
      ? `The deck should ultimately help with this outcome: ${summary.objective}.`
      : "The desired decision or takeaway is still too open, so I have not locked the deck’s end goal yet.",
    `Evidence plan: ${summary.evidence}.`,
  ];

  return pieces.join(" ");
}

function buildBriefNeedLine(summary: BriefSummary) {
  if (summary.assumptions.length === 0) {
    return "I have enough context to generate the HTML report now.";
  }

  return "I’m filling a few gaps with working assumptions so I can move forward without blocking you.";
}

function buildBriefReadLine(summary: BriefSummary) {
  const format = normalizeFormat(summary);
  const topicLine = `Reading this as a ${format} about ${summary.topic}.`;
  const audienceLine =
    summary.audience !== "Needs audience"
      ? `It needs to land with ${summary.audience}.`
      : "The audience is still not explicit.";
  const objectiveLine =
    summary.objective !== "Needs decision or takeaway"
      ? `The deck should drive ${summary.objective}.`
      : "The decision or takeaway is still not explicit.";

  return [topicLine, audienceLine, objectiveLine].join(" ");
}

function buildBriefGuidanceLine(summary: BriefSummary) {
  if (summary.ready) {
    return "I can generate the HTML report from this immediately. Add more context only if you want to steer the result.";
  }

  return "Give me a bit more source material and I’ll turn it into a usable report brief.";
}

function getUserBriefMessages(messages: Message[]) {
  return messages
    .filter((message) => message.role === "user")
    .map((message) => message.text.trim())
    .filter(Boolean);
}

function createIntakeThread(messages: Message[]) {
  if (messages.length === 0) {
    return [{ role: "assistant", text: INTAKE_GREETING }] satisfies Message[];
  }

  return messages;
}

function extractTopic(text: string) {
  const sentence = text
    .split(/[\n.!?]+/)
    .map((part) => part.trim())
    .find(Boolean);
  if (!sentence) {
    return "Untitled report";
  }
  return sentence.split(/\s+/).slice(0, 10).join(" ");
}

function extractAudience(text: string) {
  const audienceMatch =
    text.match(/\b(?:for|audience|presenting to)\s+([^.;\n]+)/i) ??
    text.match(
      /\b(?:exec(?:utive)?s?|board|investors?|clients?|operators?|research team|leadership|professionals?|professional\s+ppl|practitioners?|researchers?|academics?|students?|managers?|engineers?)\b/i,
    ) ??
    text.match(/\b(?:people|audience)\s+(?:who are|that are)?\s*([^.;\n]+)/i);

  if (!audienceMatch) {
    return "Needs audience";
  }

  return audienceMatch[1]?.trim() || audienceMatch[0].trim();
}

function inferAudience(text: string) {
  if (/\bprofessional(?:s|\s+people|\s+ppl)?\b/i.test(text)) {
    return "professionals who may be new to the topic";
  }
  if (/\b(?:new to the topic|unfamiliar with the topic|don'?t know the topic|never have ideas what the topic is)\b/i.test(text)) {
    return "people who are new to the topic";
  }
  if (/\b(?:research|literature|article|paper|study)\b/i.test(text)) {
    return "a professional audience that needs a clear introduction to the topic";
  }
  return "a broad professional audience";
}

function extractObjective(text: string) {
  const objectiveMatch =
    text.match(/\b(?:goal|objective|need to|should|must|want to|decision|takeaway)\b([^.;\n]+)/i) ??
    text.match(/\b(?:recommend|explain|compare|justify|summarize|convince)\b([^.;\n]*)/i);

  if (!objectiveMatch) {
    return "Needs decision or takeaway";
  }

  const fragment = `${objectiveMatch[0]}`.trim();
  return fragment.length > 72 ? `${fragment.slice(0, 69)}...` : fragment;
}

function extractEvidence(text: string) {
  if (/\d/.test(text)) {
    return "Supplied notes include usable facts or numbers";
  }
  if (/\b(source|study|research|public data|public sources|evidence|reference)\b/i.test(text)) {
    return "Will rely on supplied research and source material";
  }
  return "May need external evidence or sharper source notes";
}

function extractFormat(text: string) {
  const formatMatch = text.match(
    /\b(investor|board|strategy|research|internal|client|sales|proposal|brief|deck|presentation)\b/i,
  );

  if (!formatMatch) {
    return "Format not specified";
  }

  return `${formatMatch[0]} report`;
}

function inferObjective(text: string, topic: string) {
  if (/\b(?:understand|introduce|explain|walk through|deep dive|detail)\b/i.test(text)) {
    return `help the audience understand ${topic} clearly and in detail`;
  }
  if (/\b(?:literature|article|paper|study)\b/i.test(text)) {
    return "help the audience understand what this literature piece argues and why it matters";
  }
  return `help the audience understand ${topic}, its key arguments, and why it matters`;
}

function inferFormat(text: string) {
  if (/\b(?:article|paper|study|literature)\b/i.test(text)) {
    return "briefing presentation";
  }
  return "presentation";
}

function inferEvidence(text: string) {
  if (/\b(?:article|paper|study|literature|notes|source)\b/i.test(text)) {
    return "I will stay inside the supplied notes unless you ask for outside evidence.";
  }
  return "I will use the material you supplied and structure it into a clear deck.";
}

function isConfirmationMessage(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }

  return CONFIRMATION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function buildBriefConfirmation(summary: BriefSummary) {
  return [
    "Here is the working brief I would use for the report.",
    buildBriefFraming(summary),
    ...(summary.assumptions.length
      ? [`Working assumptions for now: ${summary.assumptions.join(" ")}`]
      : []),
    "I can generate the HTML report from this now. If you want to redirect it, tell me what to change.",
  ].join(" ");
}

function buildBriefSummary(messages: Message[], pendingInput = ""): BriefSummary {
  const briefSource = buildReportSourceInput({
    briefMessages: messages,
    pendingInput,
  }).briefText;
  const userMessages = getUserBriefMessages(messages);
  const userTurnCount = userMessages.length + (pendingInput.trim() ? 1 : 0);
  const topic = extractTopic(briefSource);
  const assumptions: string[] = [];

  let audience = extractAudience(briefSource);
  if (audience === "Needs audience") {
    const inferredAudience = inferAudience(briefSource);
    audience = inferredAudience;
    assumptions.push(`I’m assuming the deck is for ${inferredAudience}.`);
  }

  let objective = extractObjective(briefSource);
  if (objective === "Needs decision or takeaway") {
    const inferredObjective = inferObjective(briefSource, topic);
    objective = inferredObjective;
    assumptions.push(`I’m treating the goal as: ${inferredObjective}.`);
  }

  let evidence = extractEvidence(briefSource);
  if (evidence === "May need external evidence or sharper source notes") {
    const inferredEvidence = inferEvidence(briefSource);
    evidence = inferredEvidence;
    assumptions.push("I’ll use your supplied material as the evidence base unless you want outside sourcing.");
  }

  let format = extractFormat(briefSource);
  if (format === "Format not specified") {
    format = inferFormat(briefSource);
    assumptions.push(`I’m treating this as a ${format}.`);
  }

  const missing: string[] = [];
  const ready = briefSource.trim().length > 24 || userTurnCount > 0;
  const latestUserMessage = pendingInput.trim() || userMessages[userMessages.length - 1] || "";
  const confirmed = ready && isConfirmationMessage(latestUserMessage);

  return {
    topic,
    audience,
    objective,
    evidence,
    format,
    assumptions,
    missing,
    ready,
    confirmed,
  };
}

function buildIntakeFollowUp(summary: BriefSummary, userTurnCount: number, latestUserInput: string) {
  if (summary.ready && isConfirmationMessage(latestUserInput)) {
    return `Locked. I’ll keep the report centered on ${summary.topic}, shape it for ${summary.audience}, and make sure the deck drives ${summary.objective}.`;
  }

  if (!summary.ready) {
    return `I can see the topic forming around ${summary.topic}. Give me a bit more source material and I’ll turn it into a usable report brief.`;
  }

  return buildBriefConfirmation(summary);
}

function matchesTemplateStarter(project: WorkbenchProject) {
  const template = getTemplateDefinition(project.templateId);
  return (
    project.projectName === template.defaultProjectName &&
    project.sourceText === template.defaultSourceText &&
    JSON.stringify(project.pages) === JSON.stringify(template.defaultPages)
  );
}

function matchesLegacyBlankStarter(project: WorkbenchProject) {
  return matchesTemplateStarter(project);
}

function shouldResetGenericWorkbenchProject(
  project: WorkbenchProject,
  fixedTemplateId?: WorkbenchProject["templateId"],
) {
  if (fixedTemplateId) {
    return false;
  }

  return (
    (matchesTemplateStarter(project) || matchesLegacyBlankStarter(project)) &&
    project.workflowStage === "intake" &&
    project.briefMessages.length === 0 &&
    project.generationHistory.length === 0 &&
    project.publishSnapshots.length === 0 &&
    project.generatedDraft === null
  );
}

function createGenericInitialProject(
  project: WorkbenchProject,
  fixedTemplateId?: WorkbenchProject["templateId"],
): WorkbenchProject {
  if (!shouldResetGenericWorkbenchProject(project, fixedTemplateId)) {
    return project;
  }

  const blankProject = createTemplateProjectState("blank");
  return {
    ...project,
    templateId: "blank",
    projectName: blankProject.projectName,
    sourceText: blankProject.sourceText,
    briefMessages: blankProject.briefMessages,
    pages: blankProject.pages,
    generatedDraft: blankProject.generatedDraft,
    generationHistory: [],
    publishSnapshots: [],
    workflowStage: blankProject.workflowStage,
  };
}

export {
  INTAKE_GREETING,
  INTAKE_STARTERS,
  describeMissingBriefPiece,
  joinNaturalList,
  buildBriefFraming,
  buildBriefNeedLine,
  buildBriefReadLine,
  buildBriefGuidanceLine,
  composeBriefSource,
  createIntakeThread,
  buildBriefSummary,
  getUserBriefMessages,
  buildIntakeFollowUp,
  createGenericInitialProject,
};
