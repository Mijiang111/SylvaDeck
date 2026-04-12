import type { LucideIcon } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type {
  ModuleTemplateField,
  ModuleThinkingFlowNode,
} from "@/features/studio/types";
import type { ThinkingFlowCanvasNode } from "../authoring-local-types";
import { getThinkingFlowNodeLabel } from "../flow-runtime";
import {
  getThinkingFlowNodeDisplayLabel,
  getThinkingFlowNodeTheme,
} from "../thinking-flow-model";
import {
  THINKING_FLOW_TOOL_ADAPTERS,
  THINKING_FLOW_TOOL_ADAPTER_IDS,
  THINKING_FLOW_TOOL_ADAPTER_LABEL,
  getThinkingFlowToolConfig,
  normalizeThinkingFlowToolConfig,
} from "../tool-adapters";

type SemanticsStagePanelProps = {
  view: {
    selectedFlowNodeIds: string[];
    selectedFlowNode: ThinkingFlowCanvasNode | null;
    selectedFlowNodeTheme: ReturnType<typeof getThinkingFlowNodeTheme> | null;
    SelectedFlowNodeIcon: LucideIcon | null;
    selectedFlowField: ModuleTemplateField | null;
    selectedFlowToolConfig: ReturnType<typeof getThinkingFlowToolConfig> | null;
  };
  actions: {
    updateFieldOutputContract: (
      fieldId: string,
      updater: (contract: NonNullable<ModuleTemplateField["outputContract"]>) => NonNullable<ModuleTemplateField["outputContract"]>
    ) => void;
    updateThinkingFlowNode: (
      nodeId: string,
      updater: (node: ModuleThinkingFlowNode) => ModuleThinkingFlowNode
    ) => void;
  };
};

export function SemanticsStagePanel({ view, actions }: SemanticsStagePanelProps) {
  const {
    selectedFlowNodeIds,
    selectedFlowNode,
    selectedFlowNodeTheme,
    SelectedFlowNodeIcon,
    selectedFlowField,
    selectedFlowToolConfig,
  } = view;
  const {
    updateFieldOutputContract,
    updateThinkingFlowNode,
  } = actions;
  return (
    <>
                <section className="px-4 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f95a6]">
                      Advanced template logic
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-[#627987]">
                      {selectedFlowNodeIds.length > 1
                        ? `${selectedFlowNodeIds.length} selected`
                        : selectedFlowNode
                        ? selectedFlowNode.kind === "output"
                          ? "Output"
                          : getThinkingFlowNodeLabel(selectedFlowNode.kind)
                        : "Canvas"}
                    </div>
                  </div>
                  {selectedFlowNodeIds.length > 1 ? (
                    <div className="mt-3 border border-white/8 bg-white/[0.02] px-3 py-3">
                      <div className="text-sm font-semibold text-white">
                        One prompt at a time
                      </div>
                      <div className="mt-1 text-[12px] leading-6 text-[#8ca3b2]">
                        Multi-select is only for moving steps on the canvas.
                        This stage is optional for simple templates and useful
                        when you want advanced routing or data-aware behavior.
                      </div>
                    </div>
                  ) : selectedFlowNode ? (
                    <div className="mt-3 grid gap-3">
                      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border border-white/8 bg-white/[0.02] px-3 py-3">
                        <div
                          className="inline-flex h-12 w-12 items-center justify-center rounded-full border-[3px]"
                          style={{
                            borderColor: selectedFlowNodeTheme!.border,
                            background: selectedFlowNodeTheme!.background,
                            boxShadow: `0 0 18px ${
                              selectedFlowNodeTheme!.glow
                            }, 0 18px 28px rgba(5,8,18,0.34)`,
                          }}
                        >
                          <span
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full"
                            style={{
                              background: selectedFlowNodeTheme!.inner,
                              boxShadow:
                                "inset 0 5px 8px rgba(255,255,255,0.88), 0 6px 12px rgba(8,12,24,0.18)",
                            }}
                          >
                            {SelectedFlowNodeIcon ? (
                              <SelectedFlowNodeIcon
                                className="h-4 w-4"
                                style={{
                                  color: selectedFlowNodeTheme!.innerText,
                                }}
                              />
                            ) : null}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-white">
                            {getThinkingFlowNodeDisplayLabel(selectedFlowNode)}
                          </div>
                          <div className="mt-1 text-[12px] leading-5 text-[#8ca3b2]">
                            {selectedFlowNode.kind === "output"
                              ? `Feeds ${
                                  selectedFlowField?.label ?? "a layout block"
                                }.`
                              : "Write the instruction for this advanced template step."}
                          </div>
                        </div>
                      </div>
                      <label className="block">
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f95a6]">
                          Prompt
                        </div>
                        <Textarea
                          value={
                            selectedFlowNode.kind === "output"
                              ? selectedFlowField?.outputContract?.goal ?? ""
                              : selectedFlowNode.detail
                          }
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            if (
                              selectedFlowNode.kind === "output" &&
                              selectedFlowField
                            ) {
                              updateFieldOutputContract(
                                selectedFlowField.id,
                                (contract) => ({
                                  ...contract,
                                  goal: nextValue,
                                })
                              );
                              return;
                            }
                            updateThinkingFlowNode(
                              selectedFlowNode.id,
                              (node) => ({
                                ...node,
                                detail: nextValue,
                              })
                            );
                          }}
                          placeholder={
                            selectedFlowNode.kind === "output"
                              ? "Tell AI what this output block should deliver. Leave blank to inherit the layout role."
                              : "Tell AI what to think, check, or calculate in this step."
                          }
                          className="min-h-[240px] border border-white/10 bg-white/[0.03] px-3 py-3 text-sm leading-7 text-white placeholder:text-[#7f95a6]"
                        />
                      </label>
                      {selectedFlowNode.kind === "tool" &&
                      selectedFlowToolConfig ? (
                        <div className="space-y-3 rounded-[18px] border border-white/8 bg-white/[0.02] px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-white">
                                Tool adapter
                              </div>
                              <div className="mt-1 text-[12px] leading-5 text-[#8ca3b2]">
                                Pick what this tool step should extract before
                                handing results downstream.
                              </div>
                            </div>
                            <div className="text-[10px] uppercase tracking-[0.16em] text-[#95a3c9]">
                              {
                                THINKING_FLOW_TOOL_ADAPTER_LABEL[
                                  selectedFlowToolConfig.adapterId
                                ]
                              }
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {THINKING_FLOW_TOOL_ADAPTER_IDS.map((adapterId) => {
                              const isActive =
                                selectedFlowToolConfig.adapterId === adapterId;
                              return (
                                <button
                                  key={`${selectedFlowNode.id}-${adapterId}`}
                                  type="button"
                                  onClick={() =>
                                    updateThinkingFlowNode(
                                      selectedFlowNode.id,
                                      (node) => ({
                                        ...node,
                                        toolConfig:
                                          normalizeThinkingFlowToolConfig({
                                            ...getThinkingFlowToolConfig(node),
                                            adapterId,
                                          }),
                                      })
                                    )
                                  }
                                  className={[
                                    "inline-flex h-9 items-center justify-center rounded-full border px-3 text-sm font-semibold transition",
                                    isActive
                                      ? "border-white bg-white text-[#0b1117]"
                                      : "border-white/10 bg-transparent text-white hover:bg-white/[0.05]",
                                  ].join(" ")}
                                  title={
                                    THINKING_FLOW_TOOL_ADAPTERS[adapterId]
                                      .summary
                                  }
                                >
                                  {THINKING_FLOW_TOOL_ADAPTER_LABEL[adapterId]}
                                </button>
                              );
                            })}
                          </div>
                          <label className="block">
                            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f95a6]">
                              Focus
                            </div>
                            <input
                              value={selectedFlowToolConfig.focusPrompt ?? ""}
                              onChange={(event) =>
                                updateThinkingFlowNode(
                                  selectedFlowNode.id,
                                  (node) => ({
                                    ...node,
                                    toolConfig: normalizeThinkingFlowToolConfig(
                                      {
                                        ...getThinkingFlowToolConfig(node),
                                        focusPrompt: event.target.value,
                                      }
                                    ),
                                  })
                                )
                              }
                              placeholder="Optional focus like risk, growth, or evidence"
                              className="h-10 w-full border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none transition focus:border-white/20 focus:bg-white/[0.06]"
                            />
                          </label>
                          <div>
                            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f95a6]">
                              Depth
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {[2, 3, 4].map((maxItems) => {
                                const isActive =
                                  selectedFlowToolConfig.maxItems === maxItems;
                                return (
                                  <button
                                    key={`${selectedFlowNode.id}-depth-${maxItems}`}
                                    type="button"
                                    onClick={() =>
                                      updateThinkingFlowNode(
                                        selectedFlowNode.id,
                                        (node) => ({
                                          ...node,
                                          toolConfig:
                                            normalizeThinkingFlowToolConfig({
                                              ...getThinkingFlowToolConfig(
                                                node
                                              ),
                                              maxItems,
                                            }),
                                        })
                                      )
                                    }
                                    className={[
                                      "inline-flex h-9 items-center justify-center rounded-full border px-3 text-sm font-semibold transition",
                                      isActive
                                        ? "border-white bg-white text-[#0b1117]"
                                        : "border-white/10 bg-transparent text-white hover:bg-white/[0.05]",
                                    ].join(" ")}
                                  >
                                    {maxItems} items
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ) : null}
                      <div className="border-l-2 border-white/10 pl-3 text-[12px] leading-6 text-[#8ca3b2]">
                        {selectedFlowNode.kind === "output"
                          ? "Keep this short and outcome-focused. The output node should describe what lands in the layout block, not how the reasoning works."
                          : "Use one instruction per step. If the logic splits, create another node on the canvas instead of stacking multiple ideas here."}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 border border-white/8 bg-white/[0.02] px-3 py-3 text-sm leading-6 text-[#7f95a6]">
                      Select a node on the canvas to write its thinking prompt.
                      Use the bottom toolbar to add steps, then connect them on
                      the board.
                    </div>
                  )}
                </section>
    </>
  );
}
