import assert from "node:assert/strict";
import test from "node:test";
import {
  extractHtmlEditableStructure,
  updateGeneratedHtmlReportBlock,
} from "./html-report-structure";
import type { GeneratedHtmlReport } from "./types";

const domParserTest = typeof DOMParser === "undefined" ? test.skip : test;

domParserTest("diagram svg text is extracted as editable object-owned text", () => {
  const html = `<!DOCTYPE html><html><body>
    <section class="page" data-page-number="1" data-page-title="Operating model">
      <main
        data-export-object-id="p1-primary-diagram"
        data-export-object-kind="diagram"
        data-ownership-scope="text,shape,svg"
      >
        <svg viewBox="0 0 400 240"><text x="40" y="40" font-size="18">Governance layer</text></svg>
      </main>
    </section>
  </body></html>`;

  const structure = extractHtmlEditableStructure({ html });
  const block = structure.pages[0]?.blocks.find((entry) => entry.sourceTag === "svg:text");

  assert.ok(block);
  assert.equal(block.text, "Governance layer");
  assert.equal(block.objectId, "p1-primary-diagram");
  assert.equal(block.exportObjectId, "p1-primary-diagram");
});

domParserTest("editing an svg text block updates the matching svg node", () => {
  const report: GeneratedHtmlReport = {
    title: "Deck",
    html: `<!DOCTYPE html><html><body>
      <section class="page" data-page-number="1" data-page-title="Operating model">
        <main
          data-export-object-id="p1-primary-diagram"
          data-export-object-kind="diagram"
          data-ownership-scope="text,shape,svg"
        >
          <svg viewBox="0 0 400 240"><text x="40" y="40">Governance layer</text></svg>
        </main>
      </section>
    </body></html>`,
    pageCount: 1,
    pageTitles: ["Operating model"],
  };
  const structure = extractHtmlEditableStructure({ html: report.html });
  const block = structure.pages[0]?.blocks.find((entry) => entry.sourceTag === "svg:text");
  assert.ok(block);

  const updated = updateGeneratedHtmlReportBlock({
    report,
    pageNumber: 1,
    blockId: block.id,
    text: "Decision rights",
  });

  assert.match(updated.html, /<text x="40" y="40">Decision rights<\/text>/);
  assert.equal(
    updated.structure?.pages[0]?.blocks.find((entry) => entry.id === block.id)?.text,
    "Decision rights",
  );
});

domParserTest("chart module svg labels are not promoted to ordinary text blocks", () => {
  const html = `<!DOCTYPE html><html><body>
    <section class="page" data-page-number="1" data-page-title="Revenue chart">
      <main
        data-export-object-id="p1-primary-chart"
        data-export-object-kind="chart-visual"
        data-ownership-scope="shape,svg"
      >
        <div data-html-module-kind="chart" data-html-chart-spec='{"kind":"bar","categories":["A"],"series":[{"label":"Revenue","values":[1]}]}'>
          <svg viewBox="0 0 400 240"><text x="40" y="40">Axis label</text></svg>
        </div>
      </main>
    </section>
  </body></html>`;

  const structure = extractHtmlEditableStructure({ html });
  assert.equal(
    structure.pages[0]?.blocks.some((entry) => entry.sourceTag.startsWith("svg:")),
    false,
  );
});

domParserTest("raw chart-visual without chart data falls back to svg text edit blocks", () => {
  const html = `<!DOCTYPE html><html><body>
    <section class="page" data-page-number="1" data-page-title="Operating model">
      <main
        data-export-object-id="p1-primary-chart-visual"
        data-export-object-kind="chart-visual"
        data-ownership-scope="shape,svg"
        data-export-contract='{"objectId":"p1-primary-chart-visual","dataContract":null}'
      >
        <svg viewBox="0 0 400 240"><text x="40" y="40">Operating model shift</text></svg>
      </main>
    </section>
  </body></html>`;

  const structure = extractHtmlEditableStructure({ html });
  const block = structure.pages[0]?.blocks.find((entry) => entry.sourceTag === "svg:text");

  assert.ok(block);
  assert.equal(block.text, "Operating model shift");
  assert.equal(block.objectId, "p1-primary-chart-visual");
});
