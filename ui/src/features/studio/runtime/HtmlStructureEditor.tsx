import { useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import type { HtmlEditablePage } from "@/features/studio/types";
import { InfoHint, ShellLabel } from "./runtime-presentational";

type HtmlStructureEditorProps = {
  page: HtmlEditablePage | null;
  selectedBlockId?: string | null;
  onUpdateBlock: (blockId: string, nextContent: { text?: string; items?: string[] }) => void;
};

function formatBlockLabel(kind: HtmlEditablePage["blocks"][number]["kind"]) {
  switch (kind) {
    case "headline":
      return "Headline";
    case "heading":
      return "Heading";
    case "paragraph":
      return "Paragraph";
    case "list":
      return "List";
    case "eyebrow":
      return "Eyebrow";
    default:
      return kind;
  }
}

export function HtmlStructureEditor({ page, selectedBlockId, onUpdateBlock }: HtmlStructureEditorProps) {
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const editorRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  useEffect(() => {
    if (!selectedBlockId) {
      return;
    }

    blockRefs.current[selectedBlockId]?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });

    const targetEditor = editorRefs.current[selectedBlockId];
    if (!targetEditor) {
      return;
    }

    window.setTimeout(() => {
      targetEditor.focus();
      const caretPosition = targetEditor.value.length;
      targetEditor.setSelectionRange(caretPosition, caretPosition);
    }, 80);
  }, [selectedBlockId]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <ShellLabel>Structure</ShellLabel>
        <InfoHint text="This editor rewrites the current HTML page in place. It is the bridge between generated HTML and future co-editing." />
      </div>

      <div className="mt-2.5 rounded-[16px] border border-white/8 bg-white/[0.035]">
        {page ? (
          <div className="divide-y divide-white/8">
            <div className="px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8ea3b1]">
                Page {page.pageNumber}
              </div>
              <div className="mt-1 text-[14px] font-semibold text-[#edf6ff]">
                {page.title}
              </div>
              {page.headline ? (
                <div className="mt-1 text-[12px] leading-5 text-[#b7c9d4]">{page.headline}</div>
              ) : null}
            </div>

            {page.blocks.map((block) => (
              <div
                key={block.id}
                ref={(node) => {
                  blockRefs.current[block.id] = node;
                }}
                className={[
                  "px-3 py-3 transition",
                  selectedBlockId === block.id ? "bg-white/[0.055]" : "",
                ].join(" ")}
              >
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8ea3b1]">
                  {formatBlockLabel(block.kind)}
                </div>

                {block.text ? (
                  <Textarea
                    ref={(node) => {
                      editorRefs.current[block.id] = node;
                    }}
                    value={block.text}
                    onChange={(event) => {
                      onUpdateBlock(block.id, { text: event.target.value });
                    }}
                    className="min-h-[88px] rounded-[10px] border-0 bg-white/[0.04] p-2.5 text-[12px] leading-5 text-[#edf6ff] placeholder:text-[#748d9d]"
                  />
                ) : null}

                {block.items?.length ? (
                  <div className="space-y-1.5">
                    {block.items.map((item, index) => (
                      <Textarea
                        key={`${block.id}-${index}`}
                        ref={(node) => {
                          if (index === 0) {
                            editorRefs.current[block.id] = node;
                          }
                        }}
                        value={item}
                        onChange={(event) => {
                          const nextItems = [...(block.items ?? [])];
                          nextItems[index] = event.target.value;
                          onUpdateBlock(block.id, { items: nextItems });
                        }}
                        className="min-h-[56px] rounded-[10px] border-0 bg-white/[0.04] p-2.5 text-[12px] leading-5 text-[#edf6ff] placeholder:text-[#748d9d]"
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="px-3 py-3 text-[13px] leading-6 text-[#8ea3b1]">
            Generate a report first and this panel will extract the current page into a minimal editable structure.
          </div>
        )}
      </div>
    </div>
  );
}
