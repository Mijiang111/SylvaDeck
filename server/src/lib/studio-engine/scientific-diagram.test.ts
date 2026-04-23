import assert from "node:assert/strict";
import test from "node:test";
import {
  SCIENTIFIC_DIAGRAM_MODULE_KIND,
  buildScientificDiagramSpec,
  hasScientificDiagramCue,
  isScientificDiagramFigurePage,
  resolveScientificDiagramConnectivity,
  renderScientificDiagramShell,
  shouldUseScientificDiagramLane,
} from "./scientific-diagram.js";

test("scientific diagram lane only activates for academic short decks with neural cues", () => {
  assert.equal(
    shouldUseScientificDiagramLane({
      thinkingMode: "academic-research",
      brief: "Create a scientific presentation on a neural network reranking experiment.",
      totalPages: 3,
    }),
    true,
  );
  assert.equal(
    shouldUseScientificDiagramLane({
      thinkingMode: "academic-research",
      brief: "Create a scientific presentation on a reranking experiment with one result chart and one interpretation page.",
      totalPages: 3,
    }),
    false,
  );
  assert.equal(
    shouldUseScientificDiagramLane({
      thinkingMode: "strategy",
      brief: "Create a neural network platform strategy deck.",
      totalPages: 3,
    }),
    false,
  );
});

test("neural cue detector picks up common research topology words", () => {
  assert.equal(hasScientificDiagramCue("Dense MLP with hidden layers and an output score"), true);
  assert.equal(hasScientificDiagramCue("A chart-only method comparison"), false);
});

test("connectivity resolver distinguishes dense, residual, and encoder-decoder cues", () => {
  assert.equal(resolveScientificDiagramConnectivity("Dense MLP with hidden layers"), "dense");
  assert.equal(resolveScientificDiagramConnectivity("Residual neural network with skip connection blocks"), "residual");
  assert.equal(resolveScientificDiagramConnectivity("Encoder decoder autoencoder with a latent bottleneck"), "encoder-decoder");
});

test("scientific figure page defaults to page 2 except for one-page decks", () => {
  assert.equal(isScientificDiagramFigurePage({ pageNumber: 1, totalPages: 1 }), true);
  assert.equal(isScientificDiagramFigurePage({ pageNumber: 1, totalPages: 3 }), false);
  assert.equal(isScientificDiagramFigurePage({ pageNumber: 2, totalPages: 3 }), true);
});

test("diagram spec builder produces a dense neural-network schema", () => {
  const spec = buildScientificDiagramSpec({
    brief: "Create a 3-page academic presentation on a neural network reranking experiment with hidden layers.",
    subject: "reranking experiment",
    page: {
      pageTitle: "Method and result",
      heroClaim: "A compact neural reranker improves ranking quality.",
      objective: "Show the neural network topology used in the reranking stage.",
      takeaway: "The dense topology sharpens ranking when retrieval remains decent.",
      supportBullets: ["Input features combine lexical overlap and retrieval score."],
      evidenceBullets: ["The final output score reorders documents under a fixed latency budget."],
    },
  });

  assert.equal(spec.family, "neural-network");
  assert.equal(spec.connectivity, "dense");
  assert.equal(spec.stylePreset, "paper-white");
  assert.equal(spec.layers[0]?.role, "input");
  assert.equal(spec.layers.at(-1)?.role, "output");
  assert.equal(spec.layers.length >= 3, true);
});

test("diagram spec builder produces a residual topology when skip cues appear", () => {
  const spec = buildScientificDiagramSpec({
    brief: "Create a 3-page academic presentation on a residual neural network with skip connections for reranking.",
    subject: "residual reranking experiment",
    page: {
      pageTitle: "Method and result",
      heroClaim: "A residual stack stabilizes the ranking signal.",
      objective: "Show how the residual blocks pass signals through skip connections.",
      takeaway: "Skip connections preserve gradient flow in the ranking model.",
      supportBullets: ["Residual blocks carry lexical and embedding signals together."],
      evidenceBullets: ["The output score is read after the shortcut path recombines activations."],
    },
  });

  assert.equal(spec.connectivity, "residual");
  assert.equal(spec.layers[1]?.label.startsWith("Residual block"), true);
});

test("diagram spec builder produces an encoder-decoder topology when latent cues appear", () => {
  const spec = buildScientificDiagramSpec({
    brief: "Create a 3-page academic presentation on an encoder decoder autoencoder with a latent bottleneck.",
    subject: "representation learning experiment",
    page: {
      pageTitle: "Method and result",
      heroClaim: "An encoder-decoder compresses noisy features into a stable latent state.",
      objective: "Show the encoder decoder topology and its bottleneck.",
      takeaway: "The latent bottleneck filters noisy features before decoding predictions.",
      supportBullets: ["The encoder compresses high-dimensional inputs into a compact bridge."],
      evidenceBullets: ["The decoder expands the latent state into a target prediction."],
    },
  });

  assert.equal(spec.connectivity, "encoder-decoder");
  assert.equal(spec.layers.some((layer) => layer.role === "bottleneck"), true);
  assert.equal(spec.layers.some((layer) => layer.role === "encoder"), true);
  assert.equal(spec.layers.some((layer) => layer.role === "decoder"), true);
});

test("scientific diagram renderer emits one shell with stable metadata", () => {
  const spec = buildScientificDiagramSpec({
    brief: "Create a 3-page academic presentation on a neural network reranking experiment with hidden layers.",
    subject: "reranking experiment",
    page: {
      pageTitle: "Method and result",
      heroClaim: "A compact neural reranker improves ranking quality.",
      objective: "Show the neural network topology used in the reranking stage.",
      takeaway: "The dense topology sharpens ranking when retrieval remains decent.",
      supportBullets: ["Input features combine lexical overlap and retrieval score."],
      evidenceBullets: ["The final output score reorders documents under a fixed latency budget."],
    },
  });

  const html = renderScientificDiagramShell({
    spec,
    theme: {
      surfacePrimary: "#ffffff",
      surfaceSecondary: "#f6f8fb",
      textPrimary: "#17283a",
      textMuted: "#617182",
      accentPrimary: "#2f5d84",
      accentSecondary: "#6f88a0",
      borderSubtle: "#d8e0e8",
    },
  });

  assert.match(html, new RegExp(`data-html-module-kind="${SCIENTIFIC_DIAGRAM_MODULE_KIND}"`));
  assert.match(html, /data-html-diagram-spec=/);
  assert.match(html, /scientific-diagram-caption/);
  assert.match(html, /scientific-diagram-layer-label/);
});
