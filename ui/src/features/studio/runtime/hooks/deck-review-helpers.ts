import {
  DEFAULT_DECK_REVIEW_STATE,
  type DeckReviewState,
} from "../runtime-shell-contract";
import type { WorkbenchDeckOptimizationState } from "@/features/studio/types";

export const COMPLETED_AUTO_OPTIMIZATION_VERSION = 1;

export function shouldPersistCompletedAutoOptimization(
  mode: DeckReviewState["mode"],
) {
  return mode === "auto";
}

export function hasPersistedCompletedAutoOptimization(
  state: WorkbenchDeckOptimizationState | null | undefined,
  reportKey: string | null | undefined,
) {
  return Boolean(
    reportKey &&
      state?.autoOptimizedReportKey === reportKey &&
      state.autoOptimizedVersion === COMPLETED_AUTO_OPTIMIZATION_VERSION,
  );
}

export function resolveDeckReviewTimeoutState(args: {
  current: DeckReviewState;
  expectedStartedAt: number | null;
  allowedPhases: DeckReviewState["phase"][];
  warning: string;
}) {
  if (!args.allowedPhases.includes(args.current.phase)) {
    return args.current;
  }

  if (
    args.expectedStartedAt !== null &&
    args.current.startedAt !== args.expectedStartedAt
  ) {
    return args.current;
  }

  return {
    ...DEFAULT_DECK_REVIEW_STATE,
    warning: args.warning,
  } satisfies DeckReviewState;
}
