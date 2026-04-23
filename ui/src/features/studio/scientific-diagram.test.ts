import assert from "node:assert/strict";
import test from "node:test";
import {
  SCIENTIFIC_DIAGRAM_MODULE_KIND,
  SCIENTIFIC_DIAGRAM_SPEC_ATTRIBUTE,
  getScientificDiagramLayerCountBounds,
  parseScientificDiagramSpec,
  renderScientificDiagramModule,
  resizeScientificDiagramLayers,
  switchScientificDiagramConnectivity,
} from "./scientific-diagram";
import type { GeneratedHtmlReport, ScientificDiagramSpec } from "./types";

const mockReport = {
  title: "Research deck",
  html: "",
  pageCount: 3,
  pageTitles: ["Research question", "Method and result", "Interpretation and next work"],
  styleProfile: {
    id: "academic",
    label: "Academic Paper",
    industryLabel: "Academic / scientific / research",
    summary: "Paper-white research presentation profile.",
    materialDirection: "Conference readout white canvas.",
    toneNotes: [],
    pageBackground: "#fbfbf8",
    surfaceFill: "#ffffff",
    surfaceSecondary: "#f6f8fb",
    dividerColor: "#d8e0e8",
    accentColor: "#2f5d84",
    textPrimary: "#17283a",
    textMuted: "#617182",
    chartPalette: ["#2f5d84", "#6f88a0"],
  },
} satisfies GeneratedHtmlReport;

function buildSpec(): ScientificDiagramSpec {
  return {
    family: "neural-network",
    title: "Dense reranking network",
    caption: "Dense topology rendered deterministically for stable editing and export.",
    layers: [
      { id: "layer-input", role: "input", label: "Input layer", nodeCount: 4 },
      { id: "layer-hidden-1", role: "hidden", label: "Hidden 1", nodeCount: 5 },
      { id: "layer-hidden-2", role: "hidden", label: "Hidden 2", nodeCount: 5 },
      { id: "layer-output", role: "output", label: "Output score", nodeCount: 1 },
    ],
    connectivity: "dense",
    topLabel: "Method topology for the reranking stage",
    bottomLabel: "Output score for final document order",
    sideNotes: [
      { id: "note-1", side: "left", text: "Input features bundle lexical overlap and retrieval score." },
      { id: "note-2", side: "right", text: "The output score reorders candidates under a fixed latency budget." },
    ],
    stylePreset: "paper-white",
  };
}

test("diagram resize preserves input/output layers and adjusts hidden depth", () => {
  const resized = resizeScientificDiagramLayers(buildSpec(), 5);

  assert.equal(resized.layers.length, 5);
  assert.equal(resized.layers[0]?.role, "input");
  assert.equal(resized.layers.at(-1)?.role, "output");
  assert.equal(resized.layers.filter((layer) => layer.role === "hidden").length, 3);
});

test("rendered scientific module keeps metadata and editable labels", () => {
  const html = renderScientificDiagramModule({
    spec: buildSpec(),
    theme: {
      surfacePrimary: mockReport.styleProfile?.surfaceFill ?? "#ffffff",
      surfaceSecondary: mockReport.styleProfile?.surfaceSecondary ?? "#f6f8fb",
      textPrimary: mockReport.styleProfile?.textPrimary ?? "#17283a",
      textMuted: mockReport.styleProfile?.textMuted ?? "#617182",
      accentPrimary: mockReport.styleProfile?.accentColor ?? "#2f5d84",
      accentSecondary: "#6f88a0",
      borderSubtle: mockReport.styleProfile?.dividerColor ?? "#d8e0e8",
    },
  });

  assert.match(html, new RegExp(`data-html-module-kind="${SCIENTIFIC_DIAGRAM_MODULE_KIND}"`));
  assert.match(html, new RegExp(SCIENTIFIC_DIAGRAM_SPEC_ATTRIBUTE));
  assert.match(html, /scientific-diagram-caption/);
  assert.match(html, /scientific-diagram-layer-label/);
});

test("diagram spec round-trips through the serialized data attribute payload", () => {
  const html = renderScientificDiagramModule({
    spec: buildSpec(),
    theme: {
      surfacePrimary: mockReport.styleProfile?.surfaceFill ?? "#ffffff",
      surfaceSecondary: mockReport.styleProfile?.surfaceSecondary ?? "#f6f8fb",
      textPrimary: mockReport.styleProfile?.textPrimary ?? "#17283a",
      textMuted: mockReport.styleProfile?.textMuted ?? "#617182",
      accentPrimary: mockReport.styleProfile?.accentColor ?? "#2f5d84",
      accentSecondary: "#6f88a0",
      borderSubtle: mockReport.styleProfile?.dividerColor ?? "#d8e0e8",
    },
  });
  const match = html.match(/data-html-diagram-spec="([^"]+)"/);
  assert.ok(match?.[1]);
  const parsed = parseScientificDiagramSpec(
    match?.[1]
      ?.replaceAll("&quot;", '"')
      ?.replaceAll("&amp;", "&")
      ?.replaceAll("&lt;", "<")
      ?.replaceAll("&gt;", ">"),
  );

  assert.equal(parsed?.title, "Dense reranking network");
  assert.equal(parsed?.layers.length, 4);
  assert.equal(parsed?.layers.at(-1)?.label, "Output score");
});

test("switching connectivity remaps the diagram into an encoder-decoder topology", () => {
  const switched = switchScientificDiagramConnectivity(buildSpec(), "encoder-decoder");

  assert.equal(switched.connectivity, "encoder-decoder");
  assert.equal(switched.layers.some((layer) => layer.role === "bottleneck"), true);
  assert.equal(switched.layers.some((layer) => layer.role === "encoder"), true);
  assert.equal(switched.layers.some((layer) => layer.role === "decoder"), true);
  assert.deepEqual(getScientificDiagramLayerCountBounds(switched.connectivity), {
    min: 5,
    max: 7,
  });
});

test("scientific renderer exposes residual connectivity in the chrome label", () => {
  const residual = switchScientificDiagramConnectivity(buildSpec(), "residual");
  const html = renderScientificDiagramModule({
    spec: residual,
    theme: {
      surfacePrimary: mockReport.styleProfile?.surfaceFill ?? "#ffffff",
      surfaceSecondary: mockReport.styleProfile?.surfaceSecondary ?? "#f6f8fb",
      textPrimary: mockReport.styleProfile?.textPrimary ?? "#17283a",
      textMuted: mockReport.styleProfile?.textMuted ?? "#617182",
      accentPrimary: mockReport.styleProfile?.accentColor ?? "#2f5d84",
      accentSecondary: "#6f88a0",
      borderSubtle: mockReport.styleProfile?.dividerColor ?? "#d8e0e8",
    },
  });

  assert.match(html, /Residual/);
  assert.match(html, /stroke-dasharray="8 6"/);
});
