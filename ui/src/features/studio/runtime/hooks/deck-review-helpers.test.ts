import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DECK_REVIEW_STATE,
} from "../runtime-shell-contract";
import {
  COMPLETED_AUTO_OPTIMIZATION_VERSION,
  hasPersistedCompletedAutoOptimization,
  resolveDeckReviewTimeoutState,
  shouldPersistCompletedAutoOptimization,
} from "./deck-review-helpers";

test("shouldPersistCompletedAutoOptimization only persists successful auto passes", () => {
  assert.equal(shouldPersistCompletedAutoOptimization("auto"), true);
  assert.equal(shouldPersistCompletedAutoOptimization("manual"), false);
});

test("hasPersistedCompletedAutoOptimization only trusts the current completion version", () => {
  assert.equal(
    hasPersistedCompletedAutoOptimization(
      {
        autoOptimizedReportKey: "report-1",
        autoOptimizedVersion: COMPLETED_AUTO_OPTIMIZATION_VERSION,
      },
      "report-1",
    ),
    true,
  );
  assert.equal(
    hasPersistedCompletedAutoOptimization(
      {
        autoOptimizedReportKey: "report-1",
        autoOptimizedVersion: null,
      },
      "report-1",
    ),
    false,
  );
});

test("resolveDeckReviewTimeoutState unlocks stalled reviews even with partial measurements", () => {
  const current = {
    ...DEFAULT_DECK_REVIEW_STATE,
    phase: "reviewing" as const,
    reportKey: "report-1",
    measurements: {
      1: { pageNumber: 1 } as never,
    },
    pendingPages: [2, 3],
    failedPages: [1],
    startedAt: 1234,
  };

  const next = resolveDeckReviewTimeoutState({
    current,
    expectedStartedAt: 1234,
    allowedPhases: ["reviewing"],
    warning: "Timed out",
  });

  assert.deepEqual(next, {
    ...DEFAULT_DECK_REVIEW_STATE,
    warning: "Timed out",
  });
});

test("resolveDeckReviewTimeoutState ignores stale timers from older review runs", () => {
  const current = {
    ...DEFAULT_DECK_REVIEW_STATE,
    phase: "reviewing" as const,
    reportKey: "report-2",
    startedAt: 9999,
  };

  const next = resolveDeckReviewTimeoutState({
    current,
    expectedStartedAt: 1234,
    allowedPhases: ["reviewing", "repairing"],
    warning: "Timed out",
  });

  assert.equal(next, current);
});
