import {
  BLOCK_KIND_PRESETS,
} from "@/features/studio/config";
import {
  buildLayoutPlaceholderDraft,
  buildLocalDraft,
  hydrateDraftAsset,
} from "@/features/studio/generation";
import type {
  BlockDraft,
  BlockKind,
  GeneratedDraftAsset,
  LayoutBlock,
  LayoutPage,
  ModuleRegistryEntry,
  PageDraft,
  TemplateId,
  WorkflowStage,
  WorkbenchDraft,
} from "@/features/studio/types";

function describeModuleQuestion(target: BlockKind | ModuleRegistryEntry) {
  if (typeof target !== "string" && target.family === "framework") {
    return target.promptHint;
  }

  const kind = typeof target === "string" ? target : target.kind;
  if (kind === "matrix") {
    return "What two dimensions should this matrix compare?";
  }
  if (kind === "bars") {
    return "Which four comparisons should this chart make obvious?";
  }
  if (kind === "line") {
    return "What progression or maturity path should this line show?";
  }
  if (kind === "flow") {
    return "What sequence of steps should this flow walk through?";
  }
  if (kind === "gantt") {
    return "What roadmap or timing should this module lay out?";
  }
  if (kind === "phases") {
    return "What stages should this module break the page into?";
  }
  return "What should this module prove, compare, or explain?";
}

function buildModuleLibraryPreviewBlock(entry: ModuleRegistryEntry): LayoutBlock {
  const preset = BLOCK_KIND_PRESETS[entry.kind];
  return {
    id: `preview-${entry.id}`,
    moduleId: entry.id,
    title: entry.label,
    detail: entry.description,
    intent: entry.promptHint,
    kind: entry.kind,
    tone: preset.tone,
    x: 1,
    y: 1,
    w: entry.kind === "gantt" ? 12 : entry.kind === "metrics" ? 6 : 8,
    h: entry.kind === "gantt" ? 7 : entry.kind === "phases" ? 4 : 5,
    minW: preset.minW,
    minH: preset.minH,
    visualScale: 0.92,
  };
}

function buildModuleLibraryPreviewDraft(entry: ModuleRegistryEntry): BlockDraft {
  const baseSummary =
    entry.family === "framework"
      ? `${entry.label} reframes the page as a reusable thinking tool rather than a generic ${entry.kind} block.`
      : `${entry.label} gives the page a reusable ${entry.kind} structure with a clearer reading rhythm.`;
  const fieldTitles = entry.fields.map((field) => field.label).slice(0, 4);
  const useCases = entry.useCases.slice(0, 4);

  if (entry.kind === "metrics" || entry.kind === "bars") {
    const metrics = (fieldTitles.length ? fieldTitles : ["Signal", "Pressure", "Upside", "Constraint"]).map(
      (title, index) => ({
        value: entry.kind === "metrics" ? `${index + 1}` : `${88 - index * 14}%`,
        label: `${title}: ${useCases[index] ?? entry.promptHint}`,
      }),
    );

    return {
      summary: baseSummary,
      metrics,
      cards: [],
      steps: [],
    };
  }

  if (entry.kind === "flow" || entry.kind === "gantt") {
    const steps = (fieldTitles.length ? fieldTitles : ["Frame", "Break down", "Connect", "Act"]).map(
      (title, index) => ({
        title,
        body: useCases[index] ?? entry.promptHint,
      }),
    );

    return {
      summary: baseSummary,
      metrics: [],
      cards: [],
      steps,
    };
  }

  const cards = (fieldTitles.length ? fieldTitles : ["Lens 1", "Lens 2", "Lens 3", "Lens 4"]).map(
    (title, index) => ({
      title,
      body: useCases[index] ?? entry.promptHint,
    }),
  );

  return {
    summary: baseSummary,
    metrics: [],
    cards,
    steps: entry.kind === "line" ? cards : [],
  };
}

function normalizePageBriefText(value?: string) {
  const normalized = (value ?? "").trim();
  if (!normalized || normalized === "Storyline not drafted yet.") {
    return "";
  }
  return normalized;
}

function buildPageBrief(page: LayoutPage, fallbackSummary: string) {
  return (
    normalizePageBriefText(page.instruction) ||
    normalizePageBriefText(page.note) ||
    normalizePageBriefText(fallbackSummary)
  );
}

function buildCanvasAgentLead(args: {
  workflowStage: WorkflowStage;
  activePage?: LayoutPage;
  selectedBlock: LayoutBlock | null;
  moduleTrayMode: "hidden" | "add";
  isGeneratingReport: boolean;
  testCurrentPageOnly: boolean;
}) {
  const { workflowStage, activePage, selectedBlock, moduleTrayMode, isGeneratingReport, testCurrentPageOnly } =
    args;

  if (isGeneratingReport) {
    return testCurrentPageOnly && activePage
      ? `I’m writing page ${activePage.id} against the structure you set.`
      : "I’m writing the report against the structure you set.";
  }

  if (!activePage) {
    return "Start with the brief, then I will turn it into a page sequence you can shape.";
  }

  if (selectedBlock) {
    const intent = (selectedBlock.intent ?? "").trim();
    return intent
      ? `I’m treating "${selectedBlock.title}" as the place to ${intent}.`
      : describeModuleQuestion(selectedBlock.kind);
  }

  if (moduleTrayMode === "add") {
    return `Choose the module that best helps page ${activePage.id} make its point.`;
  }

  if (workflowStage === "generated") {
    return `This report is already written. You can keep reshaping page ${activePage.id} or open the final report.`;
  }

  return `Set the structure for page ${activePage.id}, then I will write into it.`;
}

function buildCanvasAgentSubline(args: {
  workflowStage: WorkflowStage;
  activePage?: LayoutPage;
  pageDraftSummary: string;
  moduleTrayMode: "hidden" | "add";
  selectedBlock: LayoutBlock | null;
  testCurrentPageOnly: boolean;
}) {
  const { workflowStage, activePage, pageDraftSummary, moduleTrayMode, selectedBlock, testCurrentPageOnly } = args;

  if (!activePage) {
    return "There are no pages yet because the report has not been generated.";
  }

  const pageBrief = buildPageBrief(activePage, pageDraftSummary);
  if (selectedBlock) {
    return pageBrief || "Once you tell me what this block should do, I’ll keep the rest of the page in sync with it.";
  }

  if (moduleTrayMode === "add") {
    return pageBrief || "Pick the visualization that best proves the page argument.";
  }

  if (workflowStage === "generated") {
    return testCurrentPageOnly
      ? "Single-page testing stays in draft mode so the rest of the report is not treated as final."
      : pageBrief || pageDraftSummary;
  }

  return pageBrief || "This page still needs a clearer argument before content is written.";
}

function createStageDraft(args: {
  workflowStage: WorkflowStage;
  projectName: string;
  sourceText: string;
  pages: LayoutPage[];
  templateId: TemplateId;
  asset: GeneratedDraftAsset | null;
}) {
  if (args.asset) {
    return hydrateDraftAsset(args.asset);
  }

  if (args.workflowStage === "generated") {
    return buildLocalDraft(args.sourceText, args.pages, args.templateId);
  }

  return buildLayoutPlaceholderDraft({
    title: args.projectName,
    subtitle:
      "Brief captured. Generate the HTML report when you are ready.",
    pages: args.pages,
  });
}

function StorylineStructureCanvas({
  page,
  pageDraft,
}: {
  page: LayoutPage;
  pageDraft: PageDraft;
}) {
  const hasManualCues = page.blocks.length > 0;

  return (
    <div className="relative aspect-[1600/900] w-full overflow-hidden rounded-[22px] bg-[#f7f2e8]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(234,214,172,0.32),_transparent_42%),linear-gradient(180deg,_rgba(255,255,255,0.72),_rgba(247,242,232,0.96))]" />
      <div className="relative flex h-full flex-col px-[7.5%] py-[7%] text-[#162635]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#8c6a2b]">
          Report Plan
        </div>
        <div className="mt-5 max-w-[68%]">
          <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#7a8892]">
            {page.chapter}
          </div>
          <h2
            className="mt-3 text-[2.25rem] leading-[1.04] text-[#17283b]"
            style={{ fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif' }}
          >
            {page.title}
          </h2>
          <p className="mt-4 max-w-[92%] text-[1.05rem] leading-7 text-[#445864]">
            {page.note || pageDraft.summary || "Define the page takeaway before design starts."}
          </p>
        </div>

        <div className="mt-10 grid flex-1 grid-cols-[minmax(0,1.45fr)_minmax(280px,0.9fr)] gap-8">
          <div className="rounded-[28px] border border-[#dfd1b6] bg-white/60 px-8 py-7 shadow-[0_18px_42px_rgba(15,23,31,0.05)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8c6a2b]">
              Current Framing
            </div>
            <div className="mt-4 space-y-4 text-[0.98rem] leading-7 text-[#334a57]">
              <p>
                This view shows the current page framing before the HTML report is regenerated.
              </p>
              <p>
                The final report is generated directly by Codex into a 16:9 HTML deck.
              </p>
              {page.instruction?.trim() ? (
                <p>
                  Current page instruction:{" "}
                  <span className="font-medium text-[#17283b]">{page.instruction.trim()}</span>
                </p>
              ) : (
                <p>
                  Add a page instruction if you want the final design pass to argue a sharper point.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-[#dfd1b6] bg-[#fffaf0]/88 px-7 py-7 shadow-[0_18px_42px_rgba(15,23,31,0.04)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8c6a2b]">
              Manual Notes
            </div>
            {hasManualCues ? (
              <div className="mt-4 space-y-3">
                {page.blocks.slice(0, 4).map((block, index) => (
                  <div key={block.id} className="border-b border-[#eadfca] pb-3 last:border-b-0 last:pb-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8a97a0]">
                      Cue {index + 1}
                    </div>
                    <div className="mt-1 text-[1rem] font-semibold leading-6 text-[#17283b]">
                      {block.title}
                    </div>
                    <div className="mt-1 text-[0.92rem] leading-6 text-[#526773]">
                      {block.intent || block.detail}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-[0.95rem] leading-7 text-[#60717d]">
                No extra page notes yet. Codex will generate directly from the brief and the page framing.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function mergeDrafts(baseDraft: WorkbenchDraft, nextDraft: WorkbenchDraft): WorkbenchDraft {
  const pageDrafts = new Map(baseDraft.pageDrafts);
  nextDraft.pageDrafts.forEach((pageDraft, pageId) => {
    pageDrafts.set(pageId, pageDraft);
  });

  return {
    title: nextDraft.title || baseDraft.title,
    subtitle: nextDraft.subtitle || baseDraft.subtitle,
    provider: nextDraft.provider,
    pageDrafts,
  };
}

export {
  buildModuleLibraryPreviewBlock,
  buildModuleLibraryPreviewDraft,
  buildCanvasAgentLead,
  buildCanvasAgentSubline,
  createStageDraft,
  mergeDrafts,
  StorylineStructureCanvas,
};
