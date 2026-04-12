import { useMemo } from "react";
import type { WorkbenchProject } from "@/features/studio/types";
import {
  getLongFormClarificationOptions,
  getLongFormClarificationPrompt,
  getLongFormClarificationReceipt,
} from "../runtime-shell-contract";

export function useLongFormClarification(
  clarification: WorkbenchProject["longFormClarification"] | null | undefined,
) {
  const safeClarification = clarification ?? {
    status: "idle" as const,
    trigger: null,
    resolution: null,
  };

  const prompt = useMemo(
    () =>
      safeClarification.trigger
        ? getLongFormClarificationPrompt(safeClarification.trigger)
        : "",
    [safeClarification.trigger],
  );

  const receipt = useMemo(
    () => getLongFormClarificationReceipt(safeClarification.resolution),
    [safeClarification.resolution],
  );

  const options = useMemo(
    () =>
      safeClarification.trigger
        ? getLongFormClarificationOptions(safeClarification.trigger)
        : [],
    [safeClarification.trigger],
  );

  return {
    longFormClarification: safeClarification,
    clarificationPrompt: prompt,
    clarificationReceipt: receipt,
    clarificationOptions: options,
  };
}
