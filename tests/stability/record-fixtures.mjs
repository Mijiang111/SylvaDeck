import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildGenerateEventsForScenario,
  buildNdjson,
  buildReviseEventsForScenario,
  getScenario,
  listScenarios,
} from "./fixtures/scenarios.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifactRoot = path.join(__dirname, "artifacts", "recordings");

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeScenarioArtifacts(scenarioId) {
  const scenario = getScenario(scenarioId);
  const targetDir = path.join(artifactRoot, scenarioId);
  await ensureDir(targetDir);

  await fs.writeFile(
    path.join(targetDir, "generate.ndjson"),
    buildNdjson(buildGenerateEventsForScenario(scenarioId)),
    "utf8",
  );
  await fs.writeFile(
    path.join(targetDir, "report.json"),
    JSON.stringify(scenario.report, null, 2),
    "utf8",
  );

  if (scenario.reviseReports.length > 0) {
    await Promise.all(
      scenario.reviseReports.map((_, index) =>
        fs.writeFile(
          path.join(targetDir, `revise-${index + 1}.ndjson`),
          buildNdjson(buildReviseEventsForScenario(scenarioId, index)),
          "utf8",
        ),
      ),
    );
  }

  await fs.writeFile(
    path.join(targetDir, "summary.json"),
    JSON.stringify(
      {
        id: scenario.id,
        prompt: scenario.prompt,
        pageCount: scenario.report.pageCount,
        pageTitles: scenario.report.pageTitles,
        reviseCount: scenario.reviseReports.length,
      },
      null,
      2,
    ),
    "utf8",
  );
}

await ensureDir(artifactRoot);
for (const scenarioId of listScenarios()) {
  await writeScenarioArtifacts(scenarioId);
}

console.log(`Recorded ${listScenarios().length} stability fixture scenarios into ${artifactRoot}`);
