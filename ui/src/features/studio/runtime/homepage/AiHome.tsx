import { ArrowUpRight } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { HOMEPAGE_TOKENS } from "./HomepageThemeTokens";

export function AiHome({
  intakeInput,
  setIntakeInput,
  statusLine,
  starters,
  isGenerating,
  onGenerate,
}: {
  intakeInput: string;
  setIntakeInput: (value: string) => void;
  statusLine: string;
  starters: string[];
  isGenerating: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="flex min-h-[78vh] flex-col items-center justify-center">
      <div className="w-full max-w-[980px]">
        <div className="mx-auto max-w-3xl text-center">
          <div className={HOMEPAGE_TOKENS.label}>AI</div>
          <div className="mt-3 text-[3.2rem] font-semibold tracking-[-0.06em] text-white">
            Start a new report with one brief.
          </div>
          <p className="mt-4 text-[15px] leading-7 text-white/42">
            Describe the outcome you want. Codex will turn it into a 16:9 HTML report deck and drop you into the report workspace.
          </p>
        </div>

        <div className="mt-9 rounded-[34px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.065),rgba(255,255,255,0.03))] p-3 shadow-[0_40px_100px_rgba(0,0,0,0.4)] backdrop-blur-xl">
          <Textarea
            value={intakeInput}
            onChange={(event) => setIntakeInput(event.target.value)}
            className="min-h-[180px] border-0 bg-transparent px-6 py-6 text-[15px] leading-7 text-white placeholder:text-white/22"
            placeholder="做一个 3 页 AI 案例分析，先说明背景和挑战，再展示关键证据，最后收在结果或启示。"
          />
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.08] px-5 pb-2 pt-4">
            <div className="max-w-xl text-sm leading-6 text-white/34">
              {statusLine}
            </div>
            <button
              type="button"
              onClick={onGenerate}
              disabled={isGenerating}
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#081018] transition hover:bg-[#e8edf1] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isGenerating ? "Generating..." : "Draft storyline"}
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {starters.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => setIntakeInput(starter)}
              className="rounded-full border border-white/[0.08] bg-white/[0.035] px-4 py-2 text-sm text-white/60 transition hover:bg-white/[0.06] hover:text-white"
            >
              {starter}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
