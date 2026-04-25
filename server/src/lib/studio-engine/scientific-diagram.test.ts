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

test("scientific diagram lane supports explicit long-form scientific figure decks", () => {
  assert.equal(
    shouldUseScientificDiagramLane({
      thinkingMode: "academic-research",
      brief:
        "Create exactly 10 pages, Chinese scientific-visual deck. Each page must be a different scientific diagram with Nature figure style: perovskite solar cell, lithium battery degradation, catalysis energy profile.",
      totalPages: 10,
    }),
    true,
  );
  assert.equal(isScientificDiagramFigurePage({ pageNumber: 7, totalPages: 10 }), true);
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

test("scientific figure page uses every page for explicit scientific visual micro-decks", () => {
  const brief = "Create exactly 3 pages, Chinese scientific-visual micro-deck. Every page must be a different scientific diagram.";
  assert.equal(isScientificDiagramFigurePage({ pageNumber: 1, totalPages: 3, brief }), true);
  assert.equal(isScientificDiagramFigurePage({ pageNumber: 2, totalPages: 3, brief }), true);
  assert.equal(isScientificDiagramFigurePage({ pageNumber: 3, totalPages: 3, brief }), true);
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
  if (spec.family !== "neural-network") {
    throw new Error("expected neural-network spec");
  }
  assert.equal(spec.connectivity, "dense");
  assert.equal(spec.stylePreset, "paper-white");
  assert.equal(spec.layers[0]?.role, "input");
  assert.equal(spec.layers.at(-1)?.role, "output");
  assert.equal(spec.layers.length >= 3, true);
});

test("diagram spec builder routes common scientific mechanism topics to conceptual figure families", () => {
  const layerSpec = buildScientificDiagramSpec({
    brief:
      "Create a Chinese scientific diagram for a perovskite solar cell architecture with transparent electrode, ETL, absorber, HTL, and metal electrode.",
    subject: "perovskite solar cell",
    page: {
      pageTitle: "钙钛矿太阳能电池结构",
      heroClaim: "层状器件中载流子沿选择性传输层迁移。",
      objective: "显示层状器件结构与电子/空穴迁移路径。",
      takeaway: "吸收层产生载流子后，两侧传输层完成定向分流。",
      supportBullets: ["透明电极允许光进入器件。"],
      evidenceBullets: ["概念示意，不对应具体配方或效率。"],
    },
  });
  const energySpec = buildScientificDiagramSpec({
    brief: "Create a scientific figure for heterogeneous catalysis energy profile with transition state and energy barrier.",
    subject: "heterogeneous catalysis",
    page: {
      pageTitle: "异相催化能量剖面",
      heroClaim: "反应沿表面位点跨越能垒。",
      objective: "标出反应物、吸附态、过渡态和产物脱附。",
      takeaway: "最高峰对应活化能垒。",
      supportBullets: [],
      evidenceBullets: [],
    },
  });

  assert.equal(layerSpec.family, "layer-stack");
  assert.equal(energySpec.family, "energy-profile");
});

test("diagram spec builder keeps the scientific visual benchmark archetypes distinct", () => {
  const cases = [
    ["Perovskite solar cell architecture layered stack ETL HTL electrode carrier transport arrows", "layer-stack"],
    ["Lithium-ion battery degradation SEI growth lithium plating dendrite capacity fade", "mechanism-pathway"],
    ["Heterogeneous catalysis energy profile transition state energy barrier reaction coordinate", "energy-profile"],
    ["Quantum dot photophysics band gap exciton emission surface trap passivation shell", "band-physics"],
    ["Tokamak fusion confinement toroidal chamber plasma magnetic field coils divertor", "toroidal-system"],
    ["Climate carbon cycle feedback atmosphere ocean vegetation soil carbon warming feedback", "feedback-cycle"],
    ["Groundwater contaminant plume aquifer hydraulic gradient remediation barrier", "cross-section"],
    ["Earthquake fault rupture locked fault segment rupture front seismic waves aftershock", "cross-section"],
    ["Metal additive manufacturing melt pool laser powder bed thermal gradient porosity", "process-physics"],
    ["Advanced semiconductor packaging chiplet interposer TSV HBM package substrate signal routing", "hardware-architecture"],
  ] as const;

  for (const [topic, family] of cases) {
    const spec = buildScientificDiagramSpec({
      brief: `Create a Chinese scientific-visual deck. ${topic}`,
      subject: topic,
      page: {
        pageTitle: topic,
        heroClaim: topic,
        objective: topic,
        takeaway: topic,
        supportBullets: [],
        evidenceBullets: [],
      },
    });

    assert.equal(spec.family, family, topic);
  }
});

test("diagram spec builder keeps neural signal-flow micro-deck pages visually distinct", () => {
  const sharedBrief =
    "Create exactly 3 pages, Chinese scientific-visual micro-deck. Page plan: MLP forward propagation, CNN receptive field, ResNet residual highway, U-Net skip transfer, UNet++ dense skip pathways, FPN feature pyramid, Transformer residual stream, multi-head attention routing, induction head, RNN unroll, LSTM gates, GRU gates, GNN message passing, GraphSAGE aggregate, GAT attention.";
  const cases = [
    ["MLP 前向传播", "input vector, dense layers, activation gates, logits output", "mlp-flow"],
    ["CNN 感受野传递", "image patch, convolution kernel, feature map tiles, pooling", "cnn-receptive-field"],
    ["ResNet 残差高速路", "identity skip, F(x) branch, addition node", "residual-flow"],
    ["U-Net 编码器-解码器跳连", "same-scale skip transfer and segmentation mask", "unet-skip"],
    ["UNet++ 嵌套稠密跳连", "nested dense skip pathways and deep supervision heads", "unet-nested-skip"],
    ["FPN 多尺度融合", "top-down pathway, lateral connections, pyramid feature maps P2-P5", "feature-pyramid"],
    ["Transformer residual stream 读写", "attention read, MLP write, layer norm gates", "transformer-residual"],
    ["Multi-head attention 路由", "Q/K/V projections, attention score matrix, head-specific routes", "attention-routing"],
    ["Induction head 接力复制", "previous-token head, induction matcher, OV copy path", "induction-head"],
    ["RNN 隐状态递归", "time-unrolled cells and recurrent hidden state", "rnn-unroll"],
    ["LSTM cell state 通道", "forget gate, input gate, candidate update, output gate", "lstm-gates"],
    ["GRU 门控更新", "reset gate, update gate, candidate hidden state", "gru-gates"],
    ["GNN 邻域消息传递", "target node, neighbor messages, aggregate, node update", "gnn-message-passing"],
    ["GraphSAGE 采样聚合", "sampled neighbors, aggregator, concatenate self vector", "graphsage-aggregate"],
    ["GAT 注意力消息", "attention coefficients on edges, weighted neighbor messages", "gat-attention"],
  ] as const;

  for (const [title, objective, family] of cases) {
    const spec = buildScientificDiagramSpec({
      brief: sharedBrief,
      subject: "neural network information flow",
      page: {
        pageTitle: title,
        heroClaim: objective,
        objective,
        takeaway: objective,
        supportBullets: [],
        evidenceBullets: [],
      },
    });

    assert.equal(spec.family, family, title);
  }
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

  assert.equal(spec.family, "neural-network");
  if (spec.family !== "neural-network") {
    throw new Error("expected neural-network spec");
  }
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

  assert.equal(spec.family, "neural-network");
  if (spec.family !== "neural-network") {
    throw new Error("expected neural-network spec");
  }
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

test("scientific diagram renderer emits conceptual figure metadata and legend", () => {
  const spec = buildScientificDiagramSpec({
    brief: "Create a scientific diagram for lithium-ion battery degradation with SEI growth, lithium plating, dendrite risk, and capacity fade pathway.",
    subject: "battery degradation",
    page: {
      pageTitle: "锂离子电池退化机制",
      heroClaim: "界面副反应推动容量衰减。",
      objective: "展示SEI生长、锂沉积与枝晶风险的退化链条。",
      takeaway: "退化链条最终缩减可逆容量。",
      supportBullets: ["负极界面是主要起点。"],
      evidenceBullets: ["概念机制示意。"],
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
  assert.match(html, /Mechanism chain/);
  assert.match(html, /scientific-diagram-legend/);
});
