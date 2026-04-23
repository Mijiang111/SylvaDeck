import {
  buildGenerateEventsForScenario,
  buildNdjson,
  buildReviseEventsForScenario,
  getScenario,
} from "../fixtures/scenarios.mjs";

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export async function installStudioFixtureRoutes(page, scenarioId) {
  const scenario = getScenario(scenarioId);
  const state = {
    scenarioId,
    generateCalls: [],
    reviseCalls: [],
  };

  await page.route("**/api/install/status", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
      body: JSON.stringify({
        serverHealthy: true,
        repoPath: "/tmp/ppt-workbench-studio",
        platform: "darwin",
        nodeReady: true,
        pnpmReady: true,
        nodeVersion: "v22.0.0",
        pnpmVersion: "10.0.0",
        recommendedAgentId: "codex",
        skillSourcePath: "/tmp/ppt-workbench-studio/skills/ppt-workbench-studio",
        skillGithubUrl:
          "https://github.com/Mijiang111/claw-design/tree/main/skills/ppt-workbench-studio",
        bootstrapCommands: {
          onboard: "pnpm studio:onboard",
          doctor: "pnpm studio:doctor",
          dev: "pnpm dev",
        },
        agents: [
          {
            id: "codex",
            label: "Codex",
            visible: true,
            supported: true,
            detected: true,
            authReady: true,
            skillInstalled: true,
            status: "ready",
            installMode: "skill",
            targetPath: null,
            notes: [],
          },
        ],
      }),
    });
  });

  await page.route("**/api/studio/generate-html/stream", async (route) => {
    state.generateCalls.push(
      parseJson(route.request().postData() ?? "") ?? {
        raw: route.request().postData(),
      },
    );
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store",
      },
      body: buildNdjson(buildGenerateEventsForScenario(scenarioId)),
    });
  });

  await page.route("**/api/studio/revise-html/stream", async (route) => {
    state.reviseCalls.push(
      parseJson(route.request().postData() ?? "") ?? {
        raw: route.request().postData(),
      },
    );
    const reviseIndex = Math.max(0, state.reviseCalls.length - 1);
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store",
      },
      body: buildNdjson(buildReviseEventsForScenario(scenarioId, reviseIndex)),
    });
  });

  return { scenario, state };
}
