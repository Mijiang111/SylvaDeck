import type { Dispatch, SetStateAction } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  BLOCK_KIND_PRESETS,
  MODULE_REGISTRY_CATEGORIES,
} from "@/features/studio/config";
import { getAvailableSkillDefinitionById } from "@/features/studio/registry";
import type {
  CompositionTestCase,
  CompositionTestRun,
  ModuleRegistryEntry,
  ModuleRegistryScope,
  ModuleRegistryStatus,
  ModuleSkillRequirement,
  ModuleTemplateField,
  ModuleTemplateFamily,
  SkillDefinition,
} from "@/features/studio/types";
import type {
  ThinkingFlowRunFieldOutput,
  ThinkingFlowRunResult,
  ThinkingFlowRunTraceStep,
} from "../flow-runtime";
import { updateFieldAt } from "../helpers";
import { getThinkingFlowNodeIcon } from "../thinking-flow-model";

type PublishStagePanelProps = {
  view: {
    flowRunResult: ThinkingFlowRunResult | null;
    flowRunTraceSteps: ThinkingFlowRunTraceStep[];
    flowRunOutputEntries: Array<{
      field: ModuleTemplateField;
      output: ThinkingFlowRunFieldOutput;
    }>;
    flowRunBrief: string;
    savedTestCases: CompositionTestCase[];
    savedTestRuns: CompositionTestRun[];
    selectedSavedTestCase: CompositionTestCase | null;
    trustSummary: { hasPassingEvidence: boolean };
    publishReady: boolean;
    publishChecklist: Array<{
      label: string;
      detail: string;
      done: boolean;
    }>;
    draft: ModuleRegistryEntry;
    publishVersionNote: string;
    availableSkills: SkillDefinition[];
    relatedPresets: Array<{
      id: string;
      label: string;
      description: string;
    }>;
  };
  actions: {
    setFlowRunBrief: (value: string) => void;
    runThinkingFlowPreview: () => void;
    saveCurrentBriefAsTestCase: () => void;
    setCanvasMode: (mode: "visual" | "semantic" | "output") => void;
    clearThinkingFlowPreview: () => void;
    setSelectedSavedTestCaseId: (caseId: string) => void;
    runSavedCompositionCase: (testCase: CompositionTestCase) => void;
    removeSavedCompositionCase: (caseId: string) => void;
    setDraft: Dispatch<SetStateAction<ModuleRegistryEntry>>;
    setPublishVersionNote: (value: string) => void;
    saveDraft: () => void;
    removeDraft: () => void;
  };
};

export function PublishStagePanel({ view, actions }: PublishStagePanelProps) {
  const {
    flowRunResult,
    flowRunTraceSteps,
    flowRunOutputEntries,
    flowRunBrief,
    savedTestCases,
    savedTestRuns,
    selectedSavedTestCase,
    trustSummary,
    publishReady,
    publishChecklist,
    draft,
    publishVersionNote,
    availableSkills,
    relatedPresets,
  } = view;
  const {
    setFlowRunBrief,
    runThinkingFlowPreview,
    saveCurrentBriefAsTestCase,
    setCanvasMode,
    clearThinkingFlowPreview,
    setSelectedSavedTestCaseId,
    runSavedCompositionCase,
    removeSavedCompositionCase,
    setDraft,
    setPublishVersionNote,
    saveDraft,
    removeDraft,
  } = actions;
  return (
    <>
                <section className="border-b border-white/8 px-4 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f95a6]">
                      Verification run
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-[#627987]">
                      {flowRunResult
                        ? `${flowRunTraceSteps.length} steps · ${flowRunOutputEntries.length} outputs`
                        : "Local"}
                    </div>
                  </div>
                  <div className="mt-3 text-[12px] leading-5 text-[#8ca3b2]">
                    Paste a sample brief, run the preview, and inspect what
                    lands in the AI text and chart slots before you publish.
                  </div>
                  <Textarea
                    value={flowRunBrief}
                    onChange={(event) => setFlowRunBrief(event.target.value)}
                    placeholder="Paste a realistic user brief for this template."
                    className="mt-3 min-h-[120px] border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm leading-6 text-white placeholder:text-[#7f95a6]"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={runThinkingFlowPreview}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-[#31d4c2]/40 bg-[#31d4c2]/16 px-4 text-sm font-semibold text-[#eafcf8] transition hover:bg-[#31d4c2]/22"
                    >
                      Run flow
                    </button>
                    <button
                      type="button"
                      onClick={saveCurrentBriefAsTestCase}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
                    >
                      Save as test case
                    </button>
                    {flowRunResult ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setCanvasMode("output")}
                          className="inline-flex h-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
                        >
                          Show on canvas
                        </button>
                        <button
                          type="button"
                          onClick={clearThinkingFlowPreview}
                          className="inline-flex h-10 items-center justify-center rounded-full border border-white/10 bg-transparent px-4 text-sm font-semibold text-white transition hover:bg-white/[0.05]"
                        >
                          Clear
                        </button>
                      </>
                    ) : null}
                  </div>
                  {flowRunResult ? (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-white">
                            {flowRunTraceSteps.length} steps executed
                          </div>
                          <div className="text-[10px] uppercase tracking-[0.16em] text-[#95a3c9]">
                            {new Date(flowRunResult.ranAt).toLocaleTimeString()}
                          </div>
                        </div>
                      <div className="mt-1 text-[12px] leading-5 text-[#8ca3b2]">
                          The center canvas is now showing output preview mode.
                          Read the trace first, then inspect what landed in each
                          semantic slot.
                      </div>
                      </div>
                      {flowRunResult.warnings.length > 0 ? (
                        <div className="space-y-2">
                          {flowRunResult.warnings.map((warning, index) => (
                            <div
                              key={`${warning}-${index}`}
                              className="border-l-2 border-[#d8a45f] pl-3 text-[12px] leading-5 text-[#d9c199]"
                            >
                              {warning}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-white">
                            Step trace
                          </div>
                          <div className="text-[10px] uppercase tracking-[0.16em] text-[#95a3c9]">
                            {flowRunTraceSteps.length} nodes
                          </div>
                        </div>
                        <div className="mt-1 text-[12px] leading-5 text-[#8ca3b2]">
                          Each step shows the input it received, the operation
                          it ran, and the artifact it handed downstream.
                        </div>
                        <div className="mt-3 space-y-2">
                          {flowRunTraceSteps.map((step, index) => {
                            const TraceIcon = getThinkingFlowNodeIcon(
                              step.kind
                            );
                            const accent =
                              step.kind === "start"
                                ? "#ffffff"
                                : step.kind === "if"
                                ? "#ff5d8d"
                                : step.kind === "tool"
                                ? "#31d4c2"
                                : step.kind === "calc"
                                ? "#8f93ff"
                                : step.kind === "output"
                                ? "#ffe16b"
                                : "#9bb6ff";
                            return (
                              <div
                                key={`trace-${step.nodeId}`}
                                className="rounded-[16px] border border-white/8 bg-[#0d1328]/76 px-3 py-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex min-w-0 items-start gap-3">
                                    <div
                                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border shadow-[0_12px_24px_rgba(0,0,0,0.32)]"
                                      style={{
                                        borderColor: accent,
                                        color: accent,
                                        background: "rgba(8,12,24,0.92)",
                                        boxShadow: `0 0 0 1px ${accent} inset, 0 12px 24px rgba(0,0,0,0.32)`,
                                      }}
                                    >
                                      <TraceIcon className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <div className="truncate text-sm font-semibold text-white">
                                          {index + 1}. {step.label}
                                        </div>
                                        <div
                                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]"
                                          style={{
                                            color: accent,
                                            background: `${accent}22`,
                                          }}
                                        >
                                          {step.traceLabel}
                                        </div>
                                      </div>
                                      <div className="mt-1 text-[12px] leading-5 text-[#8ca3b2]">
                                        {step.outputSummary}
                                      </div>
                                    </div>
                                  </div>
                                  <div
                                    className={[
                                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]",
                                      step.status === "warning"
                                        ? "bg-[#d8a45f]/18 text-[#f1c98b]"
                                        : step.status === "skipped"
                                        ? "bg-white/10 text-[#a7b1cf]"
                                        : "bg-[#68c197]/18 text-[#b4e2c4]",
                                    ].join(" ")}
                                  >
                                    {step.status === "warning"
                                      ? "Needs input"
                                      : step.status === "skipped"
                                      ? "Skipped"
                                      : "Ready"}
                                  </div>
                                </div>
                                <div className="mt-3 grid gap-2">
                                  <div className="rounded-[14px] border border-white/6 bg-white/[0.03] px-3 py-2.5">
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#95a3c9]">
                                      Input
                                    </div>
                                    <div className="mt-1 text-[12px] leading-5 text-[#d7e0eb]">
                                      {step.inputSummary}
                                    </div>
                                  </div>
                                  <div className="rounded-[14px] border border-white/6 bg-white/[0.03] px-3 py-2.5">
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#95a3c9]">
                                      Trace
                                    </div>
                                    <div className="mt-1 space-y-1">
                                      {step.traceItems.map(
                                        (item, itemIndex) => (
                                          <div
                                            key={`${step.nodeId}-trace-item-${itemIndex}`}
                                            className="text-[12px] leading-5 text-[#d7e0eb]"
                                          >
                                            • {item}
                                          </div>
                                        )
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-white">
                            Output cards
                          </div>
                          <div className="text-[10px] uppercase tracking-[0.16em] text-[#95a3c9]">
                            {flowRunOutputEntries.length} blocks
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {flowRunOutputEntries.map(({ field, output }) => (
                          <div
                            key={`run-output-${field.id}`}
                            className="rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-white">
                                  {field.label}
                                </div>
                                <div className="mt-1 truncate text-[12px] text-[#8ca3b2]">
                                  {output.title}
                                </div>
                              </div>
                              <div className="text-[10px] uppercase tracking-[0.16em] text-[#95a3c9]">
                                {output.usedFallback ? "Fallback" : "Flow"}
                              </div>
                            </div>
                            <div className="mt-3 text-[12px] leading-6 text-[#d7e0eb]">
                              {output.body}
                            </div>
                            <div className="mt-3 space-y-1">
                              {output.bullets.map((bullet, index) => (
                                <div
                                  key={`${field.id}-bullet-${index}`}
                                  className="text-[11px] leading-5 text-[#aebdd1]"
                                >
                                  • {bullet}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>

                <section className="border-b border-white/8 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f95a6]">
                      Verification cases
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-[#627987]">
                      {savedTestCases.length} cases · {savedTestRuns.length} runs
                    </div>
                  </div>
                  <div className="mt-3 text-[12px] leading-5 text-[#8ca3b2]">
                    Save realistic briefs here so the template can be rerun
                    through the shared runtime contract instead of relying on
                    one-off preview text.
                  </div>
                  <div className="mt-4 space-y-3">
                    {savedTestCases.map((testCase) => {
                      const latestRunForCase = savedTestRuns.find(
                        (run) => run.caseId === testCase.id
                      );
                      return (
                        <div
                          key={testCase.id}
                          className={[
                            "rounded-[18px] border px-3 py-3",
                            selectedSavedTestCase?.id === testCase.id
                              ? "border-[#7aa6ff]/40 bg-[#7aa6ff]/10"
                              : "border-white/8 bg-white/[0.03]",
                          ].join(" ")}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedSavedTestCaseId(testCase.id)
                                }
                                className="text-left text-sm font-semibold text-white"
                              >
                                {testCase.label}
                              </button>
                              <div className="mt-1 line-clamp-3 text-[12px] leading-5 text-[#9ab0bf]">
                                {testCase.brief}
                              </div>
                              <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-[#7f95a6]">
                                {latestRunForCase
                                  ? `Latest ${latestRunForCase.result}`
                                  : "Not run yet"}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col gap-2">
                              <button
                                type="button"
                                onClick={() => runSavedCompositionCase(testCase)}
                                className="inline-flex h-9 items-center justify-center rounded-full border border-[#31d4c2]/40 bg-[#31d4c2]/14 px-3 text-xs font-semibold text-[#eafcf8] transition hover:bg-[#31d4c2]/20"
                              >
                                Run
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  removeSavedCompositionCase(testCase.id)
                                }
                                className="inline-flex h-9 items-center justify-center rounded-full border border-white/10 px-3 text-xs font-semibold text-white transition hover:bg-white/[0.06]"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {savedTestCases.length === 0 ? (
                      <div className="border border-dashed border-white/10 px-4 py-4 text-sm leading-6 text-[#91a7b4]">
                        No saved cases yet. Save the current brief as a test case
                        once it looks representative.
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="border-b border-white/8 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f95a6]">
                      Trust signal
                    </div>
                    <div
                      className={[
                        "text-[10px] font-semibold uppercase tracking-[0.16em]",
                        trustSummary.hasPassingEvidence
                          ? "text-[#68c197]"
                          : "text-[#d8a45f]",
                      ].join(" ")}
                    >
                      {trustSummary.hasPassingEvidence ? "Passing evidence" : "Needs evidence"}
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {savedTestRuns.slice(0, 3).map((run) => (
                      <div
                        key={run.id}
                        className="rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-white">
                            {savedTestCases.find((item) => item.id === run.caseId)?.label ??
                              run.caseId}
                          </div>
                          <div className="text-[10px] uppercase tracking-[0.16em] text-[#95a3c9]">
                            {run.result}
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] uppercase tracking-[0.14em] text-[#7f95a6]">
                          <div>Field: {run.evaluation.fieldCoverage}</div>
                          <div>Semantic: {run.evaluation.semanticCorrectness}</div>
                          <div>Framework: {run.evaluation.frameworkCorrectness}</div>
                          <div>Slide: {run.evaluation.slideQuality}</div>
                        </div>
                        <div className="mt-3 text-[12px] leading-5 text-[#9ab0bf]">
                          {run.evaluation.notes.slice(0, 3).join(" ")}
                        </div>
                      </div>
                    ))}
                    {savedTestRuns.length === 0 ? (
                      <div className="border border-dashed border-white/10 px-4 py-4 text-sm leading-6 text-[#91a7b4]">
                        Run a saved case to capture reusable evaluation evidence.
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="border-b border-white/8 px-4 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f95a6]">
                      Readiness
                    </div>
                    <div
                      className={[
                        "text-[10px] font-semibold uppercase tracking-[0.16em]",
                        publishReady ? "text-[#68c197]" : "text-[#d8a45f]",
                      ].join(" ")}
                    >
                      {publishReady ? "Ready" : "Draft"}
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {publishChecklist.map((item) => (
                      <div
                        key={item.label}
                        className={[
                          "border-l-2 pl-3 text-[12px] leading-5",
                          item.done
                            ? "border-[#68c197] text-[#cce9d7]"
                            : "border-[#d8a45f] text-[#d9c199]",
                        ].join(" ")}
                      >
                        <div className="font-semibold text-white">
                          {item.label}
                        </div>
                        <div className="mt-1">{item.detail}</div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="border-b border-white/8 px-4 py-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f95a6]">
                    Release lane
                  </div>
                  <div className="mt-3 grid gap-3">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f95a6]">
                          Scope
                        </div>
                        <select
                          value={draft.scope}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              scope: event.target.value as ModuleRegistryScope,
                            }))
                          }
                          className="h-10 w-full border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none transition focus:border-white/20 focus:bg-white/[0.06]"
                        >
                          <option value="private">Private</option>
                          <option value="community">Community</option>
                          <option value="core">Core</option>
                        </select>
                      </label>
                      <label className="block">
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f95a6]">
                          Stability
                        </div>
                        <select
                          value={draft.status}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              status: event.target.value as ModuleRegistryStatus,
                            }))
                          }
                          className="h-10 w-full border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none transition focus:border-white/20 focus:bg-white/[0.06]"
                        >
                          <option value="draft">Draft</option>
                          <option value="experimental">Experimental</option>
                          <option value="beta">Beta</option>
                          <option value="stable">Stable</option>
                        </select>
                      </label>
                    </div>
                    <label className="block">
                      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f95a6]">
                        Version note
                      </div>
                      <Textarea
                        value={publishVersionNote}
                        onChange={(event) =>
                          setPublishVersionNote(event.target.value)
                        }
                        className="min-h-[74px] border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm leading-6 text-white placeholder:text-[#7f95a6]"
                        placeholder="What changed in this release?"
                      />
                    </label>
                    <div className="border-l-2 border-white/10 pl-3 text-[12px] leading-5 text-[#8ca3b2]">
                      Draft and experimental are the fast iteration lanes. Beta
                      and stable are public reuse lanes, so they depend on saved
                      passing evidence and publish artifacts.
                    </div>
                  </div>
                </section>

                <section className="border-b border-white/8 px-4 py-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f95a6]">
                    Meta
                  </div>
                  <div className="mt-3 grid gap-3">
                    <label className="block">
                      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f95a6]">
                        Renderer
                      </div>
                      <select
                        value={draft.kind}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            kind: event.target
                              .value as ModuleRegistryEntry["kind"],
                          }))
                        }
                        className="h-10 w-full border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none transition focus:border-white/20 focus:bg-white/[0.06]"
                      >
                        {Object.entries(BLOCK_KIND_PRESETS).map(
                          ([kind, preset]) => (
                            <option key={kind} value={kind}>
                              {preset.label}
                            </option>
                          )
                        )}
                      </select>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f95a6]">
                          Family
                        </div>
                        <select
                          value={draft.family}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              family: event.target
                                .value as ModuleTemplateFamily,
                            }))
                          }
                          className="h-10 w-full border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none transition focus:border-white/20 focus:bg-white/[0.06]"
                        >
                          <option value="primitive">Primitive</option>
                          <option value="framework">Framework</option>
                          <option value="story-pattern">Story pattern</option>
                        </select>
                      </label>
                      <label className="block">
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f95a6]">
                          Category
                        </div>
                        <select
                          value={draft.category}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              category: event.target
                                .value as ModuleRegistryEntry["category"],
                            }))
                          }
                          className="h-10 w-full border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none transition focus:border-white/20 focus:bg-white/[0.06]"
                        >
                          {MODULE_REGISTRY_CATEGORIES.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="block">
                      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f95a6]">
                        System id
                      </div>
                      <input
                        value={draft.id}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            id: event.target.value,
                          }))
                        }
                        className="h-10 w-full border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none transition focus:border-white/20 focus:bg-white/[0.06]"
                      />
                    </label>
                  </div>
                </section>

                <section className="border-b border-white/8 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f95a6]">
                      Companion skills
                    </div>
                    <div className="text-[11px] text-[#91a7b4]">
                      {draft.defaultSkillRequirements?.length ?? 0}
                    </div>
                  </div>
                  <div className="mt-2 text-[12px] leading-5 text-[#8ca3b2]">
                    Optional legacy companions. The primary template logic now
                    lives in the Thinking Flow stage.
                  </div>
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          defaultSkillRequirements: [
                            ...(current.defaultSkillRequirements ?? []),
                            {
                              skillId: availableSkills[0]?.id ?? "",
                              status: "recommended",
                              reason:
                                "Explain how this skill should sharpen the template.",
                              role: availableSkills[0]?.class ?? "framework",
                              defaultEnabled: true,
                              order:
                                (current.defaultSkillRequirements?.length ??
                                  0) + 1,
                              label: availableSkills[0]?.label,
                              description: availableSkills[0]?.semanticPromise,
                              source: "skill",
                            },
                          ],
                        }))
                      }
                      className="inline-flex h-10 items-center gap-2 border border-white/10 px-3 text-xs font-semibold text-white transition hover:bg-white/[0.05]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {(draft.defaultSkillRequirements ?? []).map(
                      (requirement, index) => (
                        <div
                          key={`${requirement.skillId}-${index}`}
                          className="border border-white/8 px-3 py-3"
                        >
                          <div className="grid gap-2">
                            <select
                              value={requirement.skillId}
                              onChange={(event) =>
                                setDraft((current) => ({
                                  ...current,
                                  defaultSkillRequirements: updateFieldAt(
                                    current.defaultSkillRequirements ?? [],
                                    index,
                                    (item) => {
                                      const nextSkill =
                                        getAvailableSkillDefinitionById(
                                          event.target.value
                                        );
                                      return {
                                        ...item,
                                        skillId: event.target.value,
                                        role: nextSkill?.class ?? item.role,
                                        label: nextSkill?.label ?? item.label,
                                        description:
                                          nextSkill?.semanticPromise ??
                                          item.description,
                                      };
                                    }
                                  ),
                                }))
                              }
                              className="h-10 w-full border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none transition focus:border-white/20 focus:bg-white/[0.06]"
                            >
                              {availableSkills.map((skill) => (
                                <option key={skill.id} value={skill.id}>
                                  {skill.label}
                                </option>
                              ))}
                            </select>
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                              <select
                                value={requirement.status}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...current,
                                    defaultSkillRequirements: updateFieldAt(
                                      current.defaultSkillRequirements ?? [],
                                      index,
                                      (item) => ({
                                        ...item,
                                        status: event.target
                                          .value as ModuleSkillRequirement["status"],
                                      })
                                    ),
                                  }))
                                }
                                className="h-10 w-full border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none transition focus:border-white/20 focus:bg-white/[0.06]"
                              >
                                <option value="required">Required</option>
                                <option value="recommended">Recommended</option>
                                <option value="optional">Optional</option>
                              </select>
                              <button
                                type="button"
                                onClick={() =>
                                  setDraft((current) => ({
                                    ...current,
                                    defaultSkillRequirements: (
                                      current.defaultSkillRequirements ?? []
                                    ).filter(
                                      (_, currentIndex) =>
                                        currentIndex !== index
                                    ),
                                  }))
                                }
                                className="inline-flex h-10 items-center justify-center border border-white/10 px-3 text-[#9cb2be] transition hover:bg-white/[0.05] hover:text-white"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          <Textarea
                            value={requirement.reason}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                defaultSkillRequirements: updateFieldAt(
                                  current.defaultSkillRequirements ?? [],
                                  index,
                                  (item) => ({
                                    ...item,
                                    reason: event.target.value,
                                  })
                                ),
                              }))
                            }
                            className="mt-3 min-h-[74px] border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm leading-6 text-white placeholder:text-[#7f95a6]"
                          />
                        </div>
                      )
                    )}

                    {(draft.defaultSkillRequirements?.length ?? 0) === 0 ? (
                      <div className="border border-dashed border-white/10 px-4 py-4 text-sm leading-6 text-[#91a7b4]">
                        No default skills yet.
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="border-b border-white/8 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f95a6]">
                      Presets
                    </div>
                    <div className="text-[11px] text-[#91a7b4]">
                      {relatedPresets.length}
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {relatedPresets.length > 0 ? (
                      relatedPresets.map((preset) => (
                        <div
                          key={preset.id}
                          className="border border-white/8 px-3 py-3"
                        >
                          <div className="text-sm font-semibold text-white">
                            {preset.label}
                          </div>
                          <div className="mt-1 text-sm leading-6 text-[#93aab8]">
                            {preset.description}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="border border-dashed border-white/10 px-4 py-4 text-sm leading-6 text-[#91a7b4]">
                        No presets are registered for this template yet.
                      </div>
                    )}
                  </div>
                </section>

                <section className="px-4 py-4">
                  <div className="grid gap-2">
                    <button
                      type="button"
                      onClick={saveDraft}
                      className="inline-flex h-10 items-center justify-center border border-white bg-white px-4 text-sm font-semibold text-[#0b1117] transition hover:bg-[#eef3f6]"
                    >
                      Save template
                    </button>
                    <button
                      type="button"
                      onClick={removeDraft}
                      className="inline-flex h-10 items-center justify-center border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/[0.05]"
                    >
                      Delete
                    </button>
                  </div>
                </section>
    </>
  );
}
