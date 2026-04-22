import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  createModuleDraftFromImportedPage,
  importDeckTemplatePackFromPptx,
  semanticizeImportedPage,
} from "./pptx-import";
import type { ImportedSourceObject } from "./types";

function createPresentationXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
    <p:sldSz cx="12192000" cy="6858000"/>
  </p:presentation>`;
}

function createSlide1Xml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
    <p:cSld>
      <p:spTree>
        <p:sp>
          <p:nvSpPr><p:cNvPr id="2" name="Title"/></p:nvSpPr>
          <p:spPr>
            <a:xfrm>
              <a:off x="914400" y="457200"/>
              <a:ext cx="5486400" cy="914400"/>
            </a:xfrm>
            <a:prstGeom prst="rect"/>
          </p:spPr>
          <p:txBody>
            <a:bodyPr/>
            <a:p>
              <a:pPr algn="l"/>
              <a:r><a:rPr sz="3200"/><a:t>Film curtain opening</a:t></a:r>
            </a:p>
          </p:txBody>
        </p:sp>
        <p:sp>
          <p:nvSpPr><p:cNvPr id="3" name="Panel"/></p:nvSpPr>
          <p:spPr>
            <a:xfrm>
              <a:off x="914400" y="1828800"/>
              <a:ext cx="3657600" cy="1828800"/>
            </a:xfrm>
            <a:solidFill><a:srgbClr val="E7EEF3"/></a:solidFill>
            <a:ln w="12700"><a:solidFill><a:srgbClr val="9BB6C2"/></a:solidFill></a:ln>
            <a:prstGeom prst="roundRect"/>
          </p:spPr>
        </p:sp>
        <p:cxnSp>
          <p:nvCxnSpPr><p:cNvPr id="4" name="Divider"/></p:nvCxnSpPr>
          <p:spPr>
            <a:xfrm>
              <a:off x="914400" y="3886200"/>
              <a:ext cx="5486400" cy="63500"/>
            </a:xfrm>
            <a:ln w="19050"><a:solidFill><a:srgbClr val="A7B6BF"/></a:solidFill></a:ln>
          </p:spPr>
        </p:cxnSp>
        <p:pic>
          <p:nvPicPr><p:cNvPr id="5" name="Curtain still"/></p:nvPicPr>
          <p:blipFill><a:blip r:embed="rIdImage1"/></p:blipFill>
          <p:spPr>
            <a:xfrm>
              <a:off x="6400800" y="1371600"/>
              <a:ext cx="3200400" cy="2743200"/>
            </a:xfrm>
          </p:spPr>
        </p:pic>
      </p:spTree>
    </p:cSld>
  </p:sld>`;
}

function createSlide2Xml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
    <p:cSld>
      <p:spTree>
        <p:sp>
          <p:nvSpPr><p:cNvPr id="2" name="Headline"/></p:nvSpPr>
          <p:spPr>
            <a:xfrm>
              <a:off x="914400" y="457200"/>
              <a:ext cx="5486400" cy="914400"/>
            </a:xfrm>
            <a:prstGeom prst="rect"/>
          </p:spPr>
          <p:txBody>
            <a:bodyPr/>
            <a:p>
              <a:pPr algn="l"/>
              <a:r><a:rPr sz="3000"/><a:t>Recovered revenue swing</a:t></a:r>
            </a:p>
          </p:txBody>
        </p:sp>
        <p:graphicFrame>
          <p:nvGraphicFramePr><p:cNvPr id="3" name="Revenue chart"/></p:nvGraphicFramePr>
          <p:xfrm>
            <a:off x="914400" y="1600200"/>
            <a:ext cx="7315200" cy="3200400"/>
          </p:xfrm>
          <a:graphic>
            <a:graphicData>
              <c:chart r:id="rIdChart1"></c:chart>
            </a:graphicData>
          </a:graphic>
        </p:graphicFrame>
      </p:spTree>
    </p:cSld>
  </p:sld>`;
}

function createSlide1RelsXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rIdImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
  </Relationships>`;
}

function createSlide2RelsXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rIdChart1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/>
  </Relationships>`;
}

function createChartXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
    <c:chart>
      <c:title>
        <c:tx>
          <c:rich>
            <a:p><a:r><a:t>Recovered revenue</a:t></a:r></a:p>
          </c:rich>
        </c:tx>
      </c:title>
      <c:plotArea>
        <c:barChart>
          <c:grouping val="clustered"/>
          <c:ser>
            <c:tx><c:v>Revenue</c:v></c:tx>
            <c:cat>
              <c:strRef>
                <c:strCache>
                  <c:pt idx="0"><c:v>Q1</c:v></c:pt>
                  <c:pt idx="1"><c:v>Q2</c:v></c:pt>
                  <c:pt idx="2"><c:v>Q3</c:v></c:pt>
                </c:strCache>
              </c:strRef>
            </c:cat>
            <c:val>
              <c:numRef>
                <c:numCache>
                  <c:pt idx="0"><c:v>10</c:v></c:pt>
                  <c:pt idx="1"><c:v>14</c:v></c:pt>
                  <c:pt idx="2"><c:v>18</c:v></c:pt>
                </c:numCache>
              </c:numRef>
            </c:val>
          </c:ser>
        </c:barChart>
      </c:plotArea>
    </c:chart>
  </c:chartSpace>`;
}

async function createPptxBlob() {
  const zip = new JSZip();
  zip.file("ppt/presentation.xml", createPresentationXml());
  zip.file("ppt/slides/slide1.xml", createSlide1Xml());
  zip.file("ppt/slides/slide2.xml", createSlide2Xml());
  zip.file("ppt/slides/_rels/slide1.xml.rels", createSlide1RelsXml());
  zip.file("ppt/slides/_rels/slide2.xml.rels", createSlide2RelsXml());
  zip.file("ppt/charts/chart1.xml", createChartXml());
  zip.file("ppt/media/image1.png", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  const bytes = new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
  return new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}

test("semanticizeImportedPage promotes chart and long-form text into semantic slots", () => {
  const page = semanticizeImportedPage({
    pageNumber: 2,
    title: "Recovered swing",
    sourceObjects: [
      {
        id: "text-title",
        kind: "text",
        x: 100,
        y: 60,
        w: 540,
        h: 90,
        zIndex: 0,
        text: "Recovered swing",
        fontSize: 34,
      },
      {
        id: "chart-1",
        kind: "chart",
        x: 120,
        y: 220,
        w: 700,
        h: 320,
        zIndex: 1,
        chartKind: "bar",
        title: "Recovered revenue",
        categories: ["Q1", "Q2"],
        series: [{ values: [10, 14] }],
      },
      {
        id: "unsupported-1",
        kind: "unsupported",
        x: 900,
        y: 240,
        w: 200,
        h: 200,
        zIndex: 2,
        label: "Table",
        reason: "Requires manual review.",
      },
    ] satisfies ImportedSourceObject[],
  });

  assert.equal(page.pageRole, "chart");
  assert.equal(page.semanticSlots.some((slot) => slot.kind === "chart"), true);
  assert.deepEqual(page.unresolvedObjectIds, ["unsupported-1"]);
});

test("importDeckTemplatePackFromPptx creates a multi-page semanticized pack", async () => {
  const assetCalls: Array<{ mimeType: string; size: number; alt?: string }> = [];
  const pack = await importDeckTemplatePackFromPptx({
    fileName: "movie-curtain.pptx",
    blob: await createPptxBlob(),
    saveAsset: async ({ blob, mimeType, alt }) => {
      assetCalls.push({ mimeType, size: blob.size, alt });
      return {
        assetId: `asset-${assetCalls.length}`,
        mimeType,
        size: blob.size,
        alt,
      };
    },
  });

  assert.equal(pack.pages.length, 2);
  assert.equal(pack.pages[0]?.pageRole, "cover");
  assert.equal(pack.pages[1]?.pageRole, "chart");
  assert.equal(pack.pages[0]?.sourceObjects.some((object) => object.kind === "image"), true);
  assert.equal(pack.pages[0]?.sourceObjects.some((object) => object.kind === "line"), true);
  assert.equal(pack.pages[1]?.semanticSlots.some((slot) => slot.kind === "chart"), true);
  assert.equal(assetCalls.length, 1);
  assert.equal(assetCalls[0]?.alt, "Curtain still");
});

test("createModuleDraftFromImportedPage translates one imported slide into a single editable draft", () => {
  const draft = createModuleDraftFromImportedPage({
    fileName: "movie-curtain.pptx",
    page: {
      id: "page-1",
      pageNumber: 1,
      title: "Film curtain opening",
      background: "#ffffff",
      sourceObjects: [
        {
          id: "title-1",
          kind: "text",
          x: 100,
          y: 60,
          w: 600,
          h: 100,
          zIndex: 0,
          text: "Film curtain opening",
          fontSize: 34,
          align: "left",
          color: "#102838",
        },
        {
          id: "body-1",
          kind: "text",
          x: 100,
          y: 190,
          w: 620,
          h: 120,
          zIndex: 1,
          text: "Explain how the stage reveals the next scene with one strong editorial body.",
          fontSize: 20,
          align: "left",
          color: "#173043",
        },
        {
          id: "shape-1",
          kind: "shape",
          x: 840,
          y: 180,
          w: 280,
          h: 220,
          zIndex: 2,
          shape: "rectangle",
          fill: "#E7EEF3",
          stroke: "#9BB6C2",
          strokeWidth: 1,
        },
        {
          id: "line-1",
          kind: "line",
          x: 100,
          y: 360,
          w: 720,
          h: 20,
          zIndex: 3,
          stroke: "#A7B6BF",
          strokeWidth: 2,
        },
        {
          id: "image-1",
          kind: "image",
          x: 1160,
          y: 160,
          w: 280,
          h: 260,
          zIndex: 4,
          asset: {
            assetId: "asset-image-1",
            mimeType: "image/png",
            size: 2048,
            alt: "Curtain still",
          },
          fit: "cover",
        },
        {
          id: "chart-1",
          kind: "chart",
          x: 920,
          y: 470,
          w: 520,
          h: 240,
          zIndex: 5,
          chartKind: "bar",
          title: "Recovered revenue",
          categories: ["Q1", "Q2", "Q3"],
          series: [{ name: "Revenue", values: [10, 14, 18] }],
        },
        {
          id: "unsupported-1",
          kind: "unsupported",
          x: 100,
          y: 470,
          w: 320,
          h: 180,
          zIndex: 6,
          label: "SmartArt",
          reason: "Requires manual review.",
        },
      ],
      semanticSlots: [
        {
          id: "slot-title",
          kind: "ai-text",
          label: "Page title",
          role: "page-title",
          sourceObjectIds: ["title-1"],
          required: true,
          canHide: false,
        },
        {
          id: "slot-body",
          kind: "ai-text",
          label: "Primary narrative",
          role: "body",
          sourceObjectIds: ["body-1"],
          required: true,
          canHide: false,
        },
        {
          id: "slot-chart",
          kind: "chart",
          label: "Recovered revenue",
          role: "chart",
          sourceObjectIds: ["chart-1"],
          required: true,
          canHide: false,
        },
      ],
      semanticDecorations: [
        {
          id: "decoration-shape",
          label: "Imported shape",
          kind: "shape",
          sourceObjectIds: ["shape-1"],
          locked: true,
        },
        {
          id: "decoration-line",
          label: "Imported line",
          kind: "line",
          sourceObjectIds: ["line-1"],
          locked: true,
        },
        {
          id: "decoration-image",
          label: "Curtain still",
          kind: "image",
          sourceObjectIds: ["image-1"],
          locked: true,
        },
      ],
      unresolvedObjectIds: ["unsupported-1"],
      warnings: [],
      pageRole: "chart",
      reusablePattern: "chart-led content page",
      briefHint: "Film curtain opening",
      editableRule: "semantic-only",
    },
  });

  assert.equal(draft.fields.some((field) => field.objectKind === "slot"), true);
  assert.equal(draft.fields.some((field) => field.objectKind === "rectangle"), true);
  assert.equal(draft.fields.some((field) => field.objectKind === "line"), true);
  assert.equal(draft.fields.some((field) => field.objectKind === "image"), true);
  assert.equal(draft.fields.some((field) => field.objectKind === "data"), true);
  assert.equal(draft.fields.some((field) => field.objectKind === "chart"), true);
  assert.equal(
    draft.fields.some((field) => field.importSource?.reviewState === "needs-review"),
    true,
  );
  assert.equal(draft.connections?.some((connection) => connection.kind === "data-flow"), true);
  assert.equal(
    draft.fields.find((field) => field.objectKind === "image")?.imageAsset?.assetId,
    "asset-image-1",
  );
});
