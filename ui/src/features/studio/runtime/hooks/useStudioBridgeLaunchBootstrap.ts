import { useEffect } from "react";
import { consumeStudioBridgeLaunch } from "@/features/studio/bridge-launch";
import { useLocation, useNavigate } from "@/lib/router";
import { startAiConversationFromPrompt } from "../start-ai-conversation";
import { getAsyncActionErrorMessage } from "../fire-and-forget";
import { useStudioProjectActions } from "../studio/store";

declare global {
  interface Window {
    __studioBridgeLaunchHandledIds?: Set<string>;
    __studioBridgeLaunchInFlight?: Map<
      string,
      Promise<Awaited<ReturnType<typeof consumeStudioBridgeLaunch>>>
    >;
  }
}

type UseStudioBridgeLaunchBootstrapArgs = {
  shellBootState: "booting" | "ready" | "error";
  workspaceReady?: boolean;
  onLaunchConsumed?: () => void;
};

export function useStudioBridgeLaunchBootstrap(
  args: UseStudioBridgeLaunchBootstrapArgs,
) {
  const { shellBootState, workspaceReady = false, onLaunchConsumed } = args;
  const navigate = useNavigate();
  const location = useLocation();
  const { setStatusLine } = useStudioProjectActions();

  useEffect(() => {
    if (shellBootState !== "ready" || !workspaceReady) {
      return;
    }

    const params = new URLSearchParams(location.search);
    const bridgeLaunchId = params.get("bridgeLaunch")?.trim();
    if (!bridgeLaunchId) {
      return;
    }
    const globalHandledIds =
      window.__studioBridgeLaunchHandledIds ??
      (window.__studioBridgeLaunchHandledIds = new Set<string>());
    if (globalHandledIds.has(bridgeLaunchId)) {
      return;
    }
    const globalInFlight =
      window.__studioBridgeLaunchInFlight ??
      (window.__studioBridgeLaunchInFlight = new Map());
    let payloadPromise = globalInFlight.get(bridgeLaunchId);
    if (!payloadPromise) {
      payloadPromise = consumeStudioBridgeLaunch(bridgeLaunchId);
      globalInFlight.set(bridgeLaunchId, payloadPromise);
    }
    let canceled = false;

    void (async () => {
      try {
        const payload = await payloadPromise;
        if (canceled) {
          return;
        }
        if (globalHandledIds.has(bridgeLaunchId)) {
          return;
        }
        globalHandledIds.add(bridgeLaunchId);

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
        if (!globalHandledIds.has(bridgeLaunchId)) {
          setStatusLine(
            getAsyncActionErrorMessage(
              error,
              "Studio launch link was not found or has already expired.",
            ),
          );
          navigate("/", { replace: true });
        }
      } finally {
        globalInFlight.delete(bridgeLaunchId);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [
    location.search,
    navigate,
    onLaunchConsumed,
    setStatusLine,
    shellBootState,
    workspaceReady,
  ]);
}
