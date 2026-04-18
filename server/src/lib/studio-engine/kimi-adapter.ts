export const DEFAULT_KIMI_BASE_URL = "https://api.moonshot.cn/v1";
export const DEFAULT_KIMI_MODEL = "moonshot-v1-128k";

export type KimiEnvironmentCheck = {
  code: string;
  level: "info" | "warn" | "error";
  message: string;
  detail?: string | null;
  hint?: string | null;
};

export type KimiEnvironmentTestResult = {
  adapterType: "kimi";
  status: "pass" | "warn" | "fail";
  checks: KimiEnvironmentCheck[];
  testedAt: string;
};

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function summarizeStatus(checks: KimiEnvironmentCheck[]): KimiEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

export async function testEnvironment(
  config: {
    apiKey?: unknown;
    baseUrl?: unknown;
    model?: unknown;
  },
): Promise<KimiEnvironmentTestResult> {
  const checks: KimiEnvironmentCheck[] = [];
  const apiKey = asString(config.apiKey, "").trim();
  const baseUrl = asString(config.baseUrl, DEFAULT_KIMI_BASE_URL).trim();
  const model = asString(config.model, DEFAULT_KIMI_MODEL).trim();

  if (!apiKey) {
    checks.push({
      code: "kimi_api_key_missing",
      level: "error",
      message: "Kimi API key is not configured.",
      hint: "Set the Kimi API key in AI settings or KIMI_API_KEY env variable.",
    });
  } else {
    checks.push({
      code: "kimi_api_key_present",
      level: "info",
      message: "Kimi API key is configured.",
    });
  }

  if (!baseUrl) {
    checks.push({
      code: "kimi_base_url_missing",
      level: "error",
      message: "Kimi base URL is not configured.",
    });
  } else {
    checks.push({
      code: "kimi_base_url_present",
      level: "info",
      message: `Kimi base URL is configured: ${baseUrl}`,
    });
  }

  if (apiKey && baseUrl) {
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });
      if (res.ok) {
        checks.push({
          code: "kimi_hello_probe_passed",
          level: "info",
          message: "Kimi API hello probe succeeded.",
          detail: `Model list reachable. Using model: ${model}`,
        });
      } else {
        const body = await res.text().catch(() => "");
        checks.push({
          code: "kimi_hello_probe_failed",
          level: "error",
          message: `Kimi API hello probe failed: HTTP ${res.status}`,
          detail: body.slice(0, 240),
          hint: "Check your API key and base URL.",
        });
      }
    } catch (err) {
      checks.push({
        code: "kimi_hello_probe_failed",
        level: "error",
        message: "Kimi API hello probe failed.",
        detail: err instanceof Error ? err.message : String(err),
        hint: "Check network connectivity and base URL.",
      });
    }
  }

  return {
    adapterType: "kimi",
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
