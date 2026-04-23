import { useEffect, useRef } from "react";
import { fetchStudioInstallStatus, isCodexInstallReady } from "@/features/studio/install";
import { useLocation, useNavigate } from "@/lib/router";
import { useStudioProjectActions } from "../studio/store";

type UseStudioInstallGateArgs = {
  enabled: boolean;
  returnPath: string;
};

export function useStudioInstallGate(args: UseStudioInstallGateArgs) {
  const { enabled, returnPath } = args;
  const navigate = useNavigate();
  const location = useLocation();
  const handledRef = useRef(false);
  const { setStatusLine } = useStudioProjectActions();

  useEffect(() => {
    if (!enabled || handledRef.current) {
      return;
    }

    const params = new URLSearchParams(location.search);
    if (params.has("bridgeLaunch")) {
      return;
    }

    handledRef.current = true;
    let cancelled = false;

    void (async () => {
      try {
        const status = await fetchStudioInstallStatus();
        if (cancelled || isCodexInstallReady(status)) {
          return;
        }

        setStatusLine("Codex setup is not ready yet. Opening the install guide.");
        navigate(`/install?return=${encodeURIComponent(returnPath)}`, { replace: true });
      } catch {
        // Public/docs mode keeps working even when the local API is unavailable.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, location.search, navigate, returnPath, setStatusLine]);
}
