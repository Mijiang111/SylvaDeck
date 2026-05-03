import type { PageFitMeasurement } from "@/features/studio/generation";
import type { PptExportResult } from "@/features/studio/pptx/export-pptx";
import type {
  LongFormClarificationResolution,
  LongFormClarificationTrigger,
  WorkbenchModuleUsageMode,
} from "@/features/studio/types";
import type { StreamingReportPage } from "./runtime-types";

export type StreamPreviewPageState = StreamingReportPage & {
  stage: "pending" | "generating" | "ready" | "error";
};

export type StreamUiState = {
  runId: string | null;
  isStreaming: boolean;
  stage: string;
  transcriptTarget: string;
  transcriptRendered: string;
  partialPages: StreamPreviewPageState[];
  expectedPageCount: number;
  pageTitles: string[];
  error: string | null;
  deckTitle: string;
};

export type DeckReviewPhase = "idle" | "reviewing" | "repairing";

export type DeckReviewState = {
  phase: DeckReviewPhase;
  mode: "auto" | "manual";
  reportKey: string | null;
  briefSource: string;
  stage: string;
  measurements: Record<number, PageFitMeasurement>;
  pendingPages: number[];
  failedPages: number[];
  repairPass: number;
  warning: string | null;
  startedAt: number | null;
  lastRepairMeasurements: Record<number, PageFitMeasurement>;
};

export type StudioShellGenerationFlowContract = {
  buildStorylineFromInput: () => Promise<void>;
  regenerateReportContent: () => Promise<void>;
  continueConversation: (nextMessage?: string) => Promise<void>;
  cancelStreamingGeneration: () => void;
  handleLongFormClarificationChoice: (
    resolution: LongFormClarificationResolution,
  ) => Promise<void>;
  updateProjectModuleUsageMode: (nextMode: WorkbenchModuleUsageMode) => void;
};

export type StudioShellReviewFlowContract = {
  deckReview: DeckReviewState;
  latestMeasuredPages: Record<number, PageFitMeasurement>;
  isDeckReviewLocked: boolean;
  currentDeckReviewKey: string | null;
  currentPageMeasurement: PageFitMeasurement | null;
  handleHtmlPageOverflow: (pageNumber: number, overflows: boolean) => void;
  handleHtmlPageMeasurement: (measurement: PageFitMeasurement) => void;
  queueDeckReview: (
    briefSource: string,
    report: {
      title: string;
      pageCount: number;
      html: string;
      pageTitles: string[];
    },
    repairPass?: number,
    options?: {
      seededMeasurements?: Record<number, PageFitMeasurement>;
      pendingPages?: number[];
      startedAt?: number | null;
      mode?: "auto" | "manual";
      markAutoOptimized?: boolean;
      lastRepairMeasurements?: Record<number, PageFitMeasurement>;
    },
  ) => void;
  stopDeckOptimization: (message?: string) => void;
  optimizeCurrentPage: () => Promise<void>;
};

export type StudioShellExportFlowContract = {
  bundleInput: string;
  setBundleInput: (value: string) => void;
  lastPptxExportResult: PptExportResult | null;
  lastPptxExportError: string | null;
  isPptxExporting: boolean;
  copyProjectBundleJson: () => Promise<void>;
  copyWorkspaceBundleJson: () => Promise<void>;
  handleImportBundle: () => Promise<void>;
  downloadCurrentHtml: () => Promise<void>;
  downloadCurrentPptx: () => Promise<void>;
  openPublishedReport: () => Promise<void>;
};

export const DEFAULT_STREAM_UI_STATE: StreamUiState = {
  runId: null,
  isStreaming: false,
  stage: "",
  transcriptTarget: "",
  transcriptRendered: "",
  partialPages: [],
  expectedPageCount: 0,
  pageTitles: [],
  error: null,
  deckTitle: "Streaming preview",
};

export const DEFAULT_DECK_REVIEW_STATE: DeckReviewState = {
  phase: "idle",
  mode: "auto",
  reportKey: null,
  briefSource: "",
  stage: "",
  measurements: {},
  pendingPages: [],
  failedPages: [],
  repairPass: 0,
  warning: null,
  startedAt: null,
  lastRepairMeasurements: {},
};

export const STANDARD_DECK_REVIEW_HARD_TIMEOUT_MS = 90_000;
export const LONG_FORM_DECK_REVIEW_HARD_TIMEOUT_MS = 180_000;
export const MAX_AUTO_REPAIR_PAGES_PER_PASS = 3;
export const MAX_LONG_FORM_AGGRESSIVE_REPAIR_PAGES = 2;

export function getLongFormClarificationPrompt(
  trigger: LongFormClarificationTrigger,
) {
  return trigger === "explicit-8-9-pages"
    ? "You asked for an 8-9 page deck. Studio's long-form flow is tuned for 10 or 12 pages, so pick the path you want before I generate it."
    : "This brief looks dense enough to support a longer deck. I can expand it into 10 or 12 pages while keeping the first pages executive-grade.";
}

export function getLongFormClarificationOptions(
  trigger: LongFormClarificationTrigger,
) {
  if (trigger === "explicit-8-9-pages") {
    return [
      {
        resolution: "long-form-10" as const,
        label: "Generate 10 pages",
      },
      {
        resolution: "long-form-12" as const,
        label: "Generate 12 pages",
      },
      {
        resolution: "keep-standard" as const,
        label: "Keep standard instead",
      },
    ];
  }

  return [
    {
      resolution: "long-form-10" as const,
      label: "Expand to 10 pages",
    },
    {
      resolution: "long-form-12" as const,
      label: "Expand to 12 pages",
    },
    {
      resolution: "keep-standard" as const,
      label: "Keep this concise",
    },
  ];
}

export function getLongFormClarificationReceipt(
  resolution: LongFormClarificationResolution | null,
) {
  switch (resolution) {
    case "long-form-10":
      return "Expand to 10 pages";
    case "long-form-12":
      return "Expand to 12 pages";
    case "keep-standard":
      return "Keep this concise";
    case "dismissed":
      return "Dismissed";
    default:
      return "";
  }
}

export function formatPptxWarningSummary(
  code: PptExportResult["warnings"][number]["code"],
) {
  switch (code) {
    case "native-chart-exported":
      return "Chart exported as a native editable PowerPoint chart.";
    case "visual-chart-exported":
      return "Chart exported as a stable visual PowerPoint snapshot.";
    case "hybrid-chart-exported":
      return "Chart page used a hybrid export to keep the figure visible and the explanation editable.";
    case "color-fallback":
      return "Color fell back to the closest PowerPoint-safe value.";
    case "gradient-flattened":
      return "Complex gradient was flattened because it could not be represented as native PowerPoint fill.";
    case "chart-image-fallback":
      return "Chart was exported as a visual snapshot to preserve visibility.";
    case "chart-contract-detected":
      return "Chart export contract was classified before rendering.";
    case "chart-contract-blocked":
      return "Chart-like content did not expose enough data for native PPTX chart export.";
    case "chart-native-unsupported":
      return "Chart type is not natively supported by the current PPTX renderer.";
    case "table-native-unsupported":
      return "Table could not be converted into a native PowerPoint table.";
    case "frame-missing":
      return "One page surface was not ready when export started.";
    case "page-missing":
      return "A page could not be collected from the current report.";
    case "block-missing":
      return "A text block could not be mapped into the PowerPoint file.";
    case "visual-missing":
      return "A visual node could not be mapped into the PowerPoint file.";
    case "html-report-missing":
      return "The editable HTML report was not available for PPTX export.";
    default:
      return code;
  }
}
