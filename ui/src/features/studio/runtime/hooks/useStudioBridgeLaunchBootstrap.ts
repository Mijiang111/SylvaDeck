import { useEffect, useRef } from "react";
import { consumeStudioBridgeLaunch } from "@/features/studio/bridge-launch";
import { useLocation, useNavigate } from "@/lib/router";
import { startAiConversationFromPrompt } from "../start-ai-conversation";
import { getAsyncActionErrorMessage } from "../fire-and-forget";
import { useStudioProjectActions } from "../studio/store";

type UseStudioBridgeLaunchBootstrapArgs = {
  shellBootState: "booting" | "ready" | "error";
  onLaunchConsumed?: () => void;
};

export function useStudioBridgeLaunchBootstrap(
  args: UseStudioBridgeLaunchBootstrapArgs,
) {
  const { shellBootState, onLaunchConsumed } = args;
  const navigate = useNavigate();
  const location = useLocation();
  const handledBridgeLaunchIdsRef = useRef(new Set<string>());
  const { setStatusLine } = useStudioProjectActions();

  useEffect(() => {
    if (shellBootState !== "ready") {
      return;
    }

    const params = new URLSearchParams(location.search);
    const bridgeLaunchId = params.get("bridgeLaunch")?.trim();
    if (!bridgeLaunchId) {
      return;
    }
    if (handledBridgeLaunchIdsRef.current.has(bridgeLaunchId)) {
      return;
    }

    handledBridgeLaunchIdsRef.current.add(bridgeLaunchId);
    let canceled = false;

    void (async () => {
      try {
        const payload = await consumeStudioBridgeLaunch(bridgeLaunchId);
        if (canceled) {
          return;
        }

        const result = startAiConversationFromPrompt({
          prompt: payload.prompt,
          projectName: payload.projectName ?? null,
          generationMode: payload.generationMode ?? "standard",
          moduleUsageMode: payload.moduleUsageMode ?? "disabled",
          htmlOutputMode: payload.htmlOutputMode ?? "static",
          requestedPageCount: payload.requestedPageCount ?? null,
          queueGeneration: (payload.mode ?? "inject-and-generate") === "inject-and-generate",
        });
        if (!result.ok) {
          setStatusLine(result.reason);
          navigate("/", { replace: true });
          return;
        }

        onLaunchConsumed?.();
        navigate(`/projects/${result.projectId}/edit`, { replace: true });
      } catch (error) {
        if (canceled) {
          return;
        }
        setStatusLine(
          getAsyncActionErrorMessage(
            error,
            "Studio launch link was not found or has already expired.",
          ),
        );
        navigate("/", { replace: true });
      }
    })();

    return () => {
      canceled = true;
    };
  }, [location.search, navigate, onLaunchConsumed, setStatusLine, shellBootState]);
}
