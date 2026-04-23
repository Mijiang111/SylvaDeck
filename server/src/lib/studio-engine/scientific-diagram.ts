import type {
  DeckThinkingMode,
  NeuralNetworkDiagramConnectivity,
  NeuralNetworkDiagramLayer,
  NeuralNetworkDiagramLayerRole,
  PageRecipe,
  ScientificDiagramSpec,
  ScientificDiagramSideNote,
} from "./contracts.js";

export const SCIENTIFIC_DIAGRAM_MODULE_KIND = "scientific-diagram";
export const SCIENTIFIC_DIAGRAM_SPEC_ATTRIBUTE = "data-html-diagram-spec";
export const SCIENTIFIC_DIAGRAM_LABEL = "Scientific diagram";

const SCIENTIFIC_DIAGRAM_CUE_PATTERN =
  /\b(neural network|mlp|hidden layer|input layer|output layer|encoder|decoder|topology|feed[- ]forward|residual|skip connection|shortcut|resnet|autoencoder|latent|bottleneck|seq2seq)\b|(?:神经网络|隐藏层|输入层|输出层|编码器|解码器|拓扑|残差|跳连|捷径连接|自编码器|潜变量|瓶颈)/i;
const SCIENTIFIC_DIAGRAM_ENCODER_DECODER_PATTERN =
  /\b(encoder|decoder|autoencoder|latent|bottleneck|seq2seq)\b|(?:编码器|解码器|自编码器|潜变量|瓶颈)/i;
const SCIENTIFIC_DIAGRAM_RESIDUAL_PATTERN =
  /\b(residual|skip connection|shortcut|resnet)\b|(?:残差|跳连|捷径连接)/i;

type ScientificDiagramRenderTheme = {
  surfacePrimary: string;
  surfaceSecondary: string;
  textPrimary: string;
  textMuted: string;
  accentPrimary: string;
  accentSecondary: string;
  borderSubtle: string;
};

type DiagramGeometryNode = {
  x: number;
  y: number;
  radius: number;
};

type DiagramGeometryLayer = {
  layer: ScientificDiagramSpec["layers"][number];
  x: number;
  labelLeftPercent: number;
  nodes: DiagramGeometryNode[];
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function withHexAlpha(hex: string, alpha: number) {
  const normalized = hex.replace("#", "").trim();
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return hex;
  }
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(alpha, 1))})`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function toSentenceLabel(value: string, fallback: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return fallback;
  }
  return normalized.length > 84 ? `${normalized.slice(0, 81).trim()}...` : normalized;
}

function formatConnectivityLabel(connectivity: ScientificDiagramSpec["connectivity"]) {
  if (connectivity === "encoder-decoder") {
    return "Encoder-decoder";
  }
  if (connectivity === "residual") {
    return "Residual";
  }
  return "Dense";
}

export function hasScientificDiagramCue(text: string) {
  return SCIENTIFIC_DIAGRAM_CUE_PATTERN.test(text);
}

export function resolveScientificDiagramConnectivity(text: string): NeuralNetworkDiagramConnectivity {
  if (SCIENTIFIC_DIAGRAM_ENCODER_DECODER_PATTERN.test(text)) {
    return "encoder-decoder";
  }
  if (SCIENTIFIC_DIAGRAM_RESIDUAL_PATTERN.test(text)) {
    return "residual";
  }
  return "dense";
}

function parseLayerCount(text: string, connectivity: NeuralNetworkDiagramConnectivity) {
  const explicitMatch =
    text.match(/\b([3-7])\s*(?:layer|layers|stage|stages)\b/i) ??
    text.match(/([3-7])\s*层/i);
  if (explicitMatch) {
    const requested = Number(explicitMatch[1]);
    if (connectivity === "encoder-decoder") {
      const oddRequested = requested % 2 === 0 ? requested + 1 : requested;
      return clamp(oddRequested, 5, 7);
    }
    if (connectivity === "residual") {
      return clamp(requested, 4, 6);
    }
    return clamp(requested, 3, 6);
  }
  if (connectivity === "encoder-decoder") {
    return 5;
  }
  if (connectivity === "residual") {
    return 4;
  }
  return 4;
}

function parseInputNodeCount(text: string) {
  const explicitMatch =
    text.match(/\b([2-8])\s*(?:input|feature|signal|token)s?\b/i) ??
    text.match(/([2-8])\s*(?:个)?(?:输入|特征|信号)/i);
  if (explicitMatch) {
    return clamp(Number(explicitMatch[1]), 2, 8);
  }
  return /(token|query|embedding|sequence)/i.test(text) ? 6 : 4;
}

function parseOutputNodeCount(text: string) {
  const explicitMatch =
    text.match(/\b([1-6])\s*(?:output|class|classes|label)s?\b/i) ??
    text.match(/([1-6])\s*(?:个)?(?:输出|类别|标签)/i);
  if (explicitMatch) {
    return clamp(Number(explicitMatch[1]), 1, 6);
  }
  return /(ranking|score|logit|probability|rerank|retrieval)/i.test(text) ? 1 : 3;
}

function parseHiddenNodeCount(text: string) {
  const explicitMatch =
    text.match(/\b([3-9])\s*(?:hidden (?:unit|units|node|nodes|neuron|neurons))\b/i) ??
    text.match(/([3-9])\s*(?:个)?(?:隐藏单元|隐藏节点|神经元)/i);
  if (explicitMatch) {
    return clamp(Number(explicitMatch[1]), 3, 9);
  }
  return /(residual|skip connection|shortcut|resnet)/i.test(text) ? 6 : 5;
}

function buildDefaultLayerLabel(args: {
  role: NeuralNetworkDiagramLayerRole;
  index: number;
  total: number;
  text: string;
}) {
  if (args.role === "input") {
    if (/(query|token|retrieval|ranking|rerank|embedding)/i.test(args.text)) {
      return "Input features";
    }
    return "Input layer";
  }
  if (args.role === "output") {
    if (/(ranking|score|rerank|retrieval|logit)/i.test(args.text)) {
      return "Output score";
    }
    return "Output layer";
  }
  if (args.role === "encoder") {
    const encoderOrdinal = Math.max(1, args.index);
    return args.total > 5 ? `Encoder ${encoderOrdinal}` : "Encoder";
  }
  if (args.role === "decoder") {
    const decoderIndex = Math.max(1, args.total - args.index - 1);
    return args.total > 5 ? `Decoder ${decoderIndex}` : "Decoder";
  }
  if (args.role === "bottleneck") {
    return /(latent|bottleneck|autoencoder)/i.test(args.text) ? "Latent bottleneck" : "Bridge";
  }
  if (/(residual|skip connection|shortcut|resnet)/i.test(args.text)) {
    return `Residual block ${args.index}`;
  }
  return args.total > 3 ? `Hidden ${args.index}` : "Hidden layer";
}

function buildSideNotes(page: Pick<PageRecipe, "supportBullets" | "evidenceBullets" | "objective" | "takeaway">) {
  const notePool = [
    ...page.supportBullets,
    ...page.evidenceBullets,
    page.objective,
    page.takeaway,
  ]
    .map((item) => normalizeText(item))
    .filter(Boolean);

  const uniqueNotes = Array.from(new Set(notePool)).slice(0, 2);
  return uniqueNotes.map((text, index) => ({
    id: `note-${index + 1}`,
    text: toSentenceLabel(text, index === 0 ? "Method note" : "Result note"),
    side: index % 2 === 0 ? "left" : "right",
  })) satisfies ScientificDiagramSideNote[];
}

function createLayer(
  id: string,
  role: NeuralNetworkDiagramLayerRole,
  label: string,
  nodeCount: number,
): NeuralNetworkDiagramLayer {
  return {
    id,
    role,
    label,
    nodeCount,
  };
}

function buildDenseLayers(args: {
  text: string;
  layerCount: number;
  inputCount: number;
  hiddenCount: number;
  outputCount: number;
}) {
  const hiddenLayerCount = Math.max(1, args.layerCount - 2);
  const layers: NeuralNetworkDiagramLayer[] = [
    createLayer(
      "layer-input",
      "input",
      buildDefaultLayerLabel({
        role: "input",
        index: 0,
        total: args.layerCount,
        text: args.text,
      }),
      args.inputCount,
    ),
  ];
  for (let index = 0; index < hiddenLayerCount; index += 1) {
    layers.push(
      createLayer(
        `layer-hidden-${index + 1}`,
        "hidden",
        buildDefaultLayerLabel({
          role: "hidden",
          index: index + 1,
          total: args.layerCount,
          text: args.text,
        }),
        args.hiddenCount,
      ),
    );
  }
  layers.push(
    createLayer(
      "layer-output",
      "output",
      buildDefaultLayerLabel({
        role: "output",
        index: args.layerCount - 1,
        total: args.layerCount,
        text: args.text,
      }),
      args.outputCount,
    ),
  );
  return layers;
}

function buildResidualLayers(args: {
  text: string;
  layerCount: number;
  inputCount: number;
  hiddenCount: number;
  outputCount: number;
}) {
  const hiddenLayerCount = Math.max(2, args.layerCount - 2);
  const layers: NeuralNetworkDiagramLayer[] = [
    createLayer(
      "layer-input",
      "input",
      buildDefaultLayerLabel({
        role: "input",
        index: 0,
        total: hiddenLayerCount + 2,
        text: args.text,
      }),
      Math.max(3, args.inputCount),
    ),
  ];
  for (let index = 0; index < hiddenLayerCount; index += 1) {
    layers.push(
      createLayer(
        `layer-hidden-${index + 1}`,
        "hidden",
        buildDefaultLayerLabel({
          role: "hidden",
          index: index + 1,
          total: hiddenLayerCount + 2,
          text: `${args.text} residual`,
        }),
        Math.max(4, args.hiddenCount - (index % 2 === 0 ? 0 : 1)),
      ),
    );
  }
  layers.push(
    createLayer(
      "layer-output",
      "output",
      buildDefaultLayerLabel({
        role: "output",
        index: hiddenLayerCount + 1,
        total: hiddenLayerCount + 2,
        text: args.text,
      }),
      args.outputCount,
    ),
  );
  return layers;
}

function buildEncoderDecoderLayers(args: {
  text: string;
  layerCount: number;
  inputCount: number;
  hiddenCount: number;
  outputCount: number;
}) {
  const adjustedLayerCount = args.layerCount % 2 === 0 ? args.layerCount + 1 : args.layerCount;
  const middleIndex = Math.floor(adjustedLayerCount / 2);
  const bottleneckCount = clamp(Math.round(args.hiddenCount / 2), 1, 4);
  const encoderDepth = middleIndex - 1;
  const descendingCounts = Array.from({ length: encoderDepth }, (_, index) => {
    const progress = (index + 1) / (encoderDepth + 1);
    return clamp(Math.round(args.inputCount - (args.inputCount - bottleneckCount) * progress), 3, 8);
  });

  return Array.from({ length: adjustedLayerCount }, (_, index) => {
    if (index === 0) {
      return createLayer(
        "layer-input",
        "input",
        buildDefaultLayerLabel({
          role: "input",
          index,
          total: adjustedLayerCount,
          text: args.text,
        }),
        Math.max(4, args.inputCount),
      );
    }
    if (index === adjustedLayerCount - 1) {
      return createLayer(
        "layer-output",
        "output",
        buildDefaultLayerLabel({
          role: "output",
          index,
          total: adjustedLayerCount,
          text: args.text,
        }),
        args.outputCount,
      );
    }
    if (index === middleIndex) {
      return createLayer(
        `layer-bottleneck-${index}`,
        "bottleneck",
        buildDefaultLayerLabel({
          role: "bottleneck",
          index,
          total: adjustedLayerCount,
          text: args.text,
        }),
        bottleneckCount,
      );
    }
    if (index < middleIndex) {
      return createLayer(
        `layer-encoder-${index}`,
        "encoder",
        buildDefaultLayerLabel({
          role: "encoder",
          index,
          total: adjustedLayerCount,
          text: args.text,
        }),
        descendingCounts[index - 1] ?? Math.max(3, args.hiddenCount),
      );
    }
    const mirrorIndex = adjustedLayerCount - index - 2;
    return createLayer(
      `layer-decoder-${adjustedLayerCount - index - 1}`,
      "decoder",
      buildDefaultLayerLabel({
        role: "decoder",
        index,
        total: adjustedLayerCount,
        text: args.text,
      }),
      descendingCounts[mirrorIndex] ?? Math.max(3, args.hiddenCount),
    );
  });
}

function buildDiagramLayers(args: {
  connectivity: NeuralNetworkDiagramConnectivity;
  text: string;
  layerCount: number;
  inputCount: number;
  hiddenCount: number;
  outputCount: number;
}) {
  if (args.connectivity === "encoder-decoder") {
    return buildEncoderDecoderLayers(args);
  }
  if (args.connectivity === "residual") {
    return buildResidualLayers(args);
  }
  return buildDenseLayers(args);
}

function buildDiagramCaption(args: {
  connectivity: NeuralNetworkDiagramConnectivity;
  takeaway: string;
  objective: string;
}) {
  const raw = args.takeaway || args.objective;
  if (raw) {
    return toSentenceLabel(raw, "");
  }
  if (args.connectivity === "encoder-decoder") {
    return "Encoder-decoder topology rendered deterministically for stable editing and export.";
  }
  if (args.connectivity === "residual") {
    return "Residual topology rendered deterministically for stable editing and export.";
  }
  return "Dense topology rendered deterministically for stable editing and export.";
}

function buildDiagramTopLabel(args: {
  connectivity: NeuralNetworkDiagramConnectivity;
  objective: string;
}) {
  if (args.objective) {
    return toSentenceLabel(args.objective, "Method topology");
  }
  if (args.connectivity === "encoder-decoder") {
    return "Encoder-decoder topology";
  }
  if (args.connectivity === "residual") {
    return "Residual information flow";
  }
  return "Method topology";
}

function buildDiagramBottomLabel(args: {
  connectivity: NeuralNetworkDiagramConnectivity;
  subject?: string | null;
  takeaway: string;
}) {
  if (args.subject || args.takeaway) {
    return toSentenceLabel(args.subject || args.takeaway, "Prediction output");
  }
  if (args.connectivity === "encoder-decoder") {
    return "Decoded prediction";
  }
  if (args.connectivity === "residual") {
    return "Skip-enhanced output";
  }
  return "Prediction output";
}

export function shouldUseScientificDiagramLane(args: {
  thinkingMode: DeckThinkingMode;
  brief: string;
  totalPages: number;
}) {
  return (
    args.thinkingMode === "academic-research" &&
    args.totalPages <= 5 &&
    hasScientificDiagramCue(args.brief)
  );
}

export function isScientificDiagramFigurePage(args: {
  pageNumber: number;
  totalPages: number;
}) {
  return args.totalPages <= 1 ? args.pageNumber === 1 : args.pageNumber === 2;
}

export function buildScientificDiagramSpec(args: {
  brief: string;
  subject?: string | null;
  page: Pick<PageRecipe, "pageTitle" | "heroClaim" | "objective" | "takeaway" | "supportBullets" | "evidenceBullets">;
}): ScientificDiagramSpec {
  const sourceText = normalizeText(
    [
      args.brief,
      args.subject ?? "",
      args.page.pageTitle,
      args.page.heroClaim,
      args.page.objective,
      args.page.takeaway,
      ...args.page.supportBullets,
      ...args.page.evidenceBullets,
    ].join(" "),
  );
  const connectivity = resolveScientificDiagramConnectivity(sourceText);
  const layerCount = parseLayerCount(sourceText, connectivity);
  const inputCount = parseInputNodeCount(sourceText);
  const outputCount = parseOutputNodeCount(sourceText);
  const hiddenCount = parseHiddenNodeCount(sourceText);
  const layers = buildDiagramLayers({
    connectivity,
    text: sourceText,
    layerCount,
    inputCount,
    hiddenCount,
    outputCount,
  });

  return {
    family: "neural-network",
    title: toSentenceLabel(args.page.pageTitle || args.page.heroClaim, "Neural network topology"),
    caption: buildDiagramCaption({
      connectivity,
      takeaway: args.page.takeaway,
      objective: args.page.objective,
    }),
    layers,
    connectivity,
    topLabel: buildDiagramTopLabel({
      connectivity,
      objective: args.page.objective,
    }),
    bottomLabel: buildDiagramBottomLabel({
      connectivity,
      subject: args.subject,
      takeaway: args.page.takeaway,
    }),
    sideNotes: buildSideNotes(args.page),
    stylePreset: "paper-white",
  };
}

function buildLayerGeometry(spec: ScientificDiagramSpec) {
  const width = 860;
  const height = 360;
  const xPadding = spec.connectivity === "encoder-decoder" ? 72 : 80;
  const yPadding = 44;
  const spacing =
    spec.layers.length > 1 ? (width - xPadding * 2) / (spec.layers.length - 1) : 0;

  return spec.layers.map((layer, layerIndex) => {
    const x = xPadding + spacing * layerIndex;
    const radius = clamp(26 - Math.max(0, layer.nodeCount - 4) * 1.5, 14, 24);
    const ySpacing =
      layer.nodeCount > 1
        ? (height - yPadding * 2) / (layer.nodeCount - 1)
        : 0;
    const nodes = Array.from({ length: layer.nodeCount }, (_, nodeIndex) => ({
      x,
      y: layer.nodeCount === 1 ? height / 2 : yPadding + ySpacing * nodeIndex,
      radius,
    }));
    return {
      layer,
      x,
      labelLeftPercent: (x / width) * 100,
      nodes,
    } satisfies DiagramGeometryLayer;
  });
}

function renderAdjacentConnections(geometry: DiagramGeometryLayer[], stroke: string) {
  return geometry
    .slice(0, -1)
    .map((sourceLayer, layerIndex) =>
      sourceLayer.nodes
        .flatMap((sourceNode) =>
          geometry[layerIndex + 1]!.nodes.map(
            (targetNode) =>
              `<line x1="${sourceNode.x}" y1="${sourceNode.y}" x2="${targetNode.x}" y2="${targetNode.y}" stroke="${stroke}" stroke-width="2.2" />`,
          ),
        )
        .join(""),
    )
    .join("");
}

function pickNodeSamples(layer: DiagramGeometryLayer) {
  if (layer.nodes.length <= 3) {
    return layer.nodes;
  }
  return [layer.nodes[0]!, layer.nodes[Math.floor(layer.nodes.length / 2)]!, layer.nodes.at(-1)!];
}

function renderResidualSkipConnections(geometry: DiagramGeometryLayer[], stroke: string) {
  return geometry
    .slice(0, -2)
    .map((sourceLayer, layerIndex) => {
      const targetLayer = geometry[layerIndex + 2];
      if (!targetLayer) {
        return "";
      }
      const sourceSamples = pickNodeSamples(sourceLayer);
      const targetSamples = pickNodeSamples(targetLayer);
      return sourceSamples
        .map((sourceNode, sampleIndex) => {
          const targetNode = targetSamples[Math.min(sampleIndex, targetSamples.length - 1)]!;
          const controlX = (sourceNode.x + targetNode.x) / 2;
          const lift = sampleIndex === 1 ? 18 : 46;
          return `<path d="M ${sourceNode.x} ${sourceNode.y} C ${controlX} ${sourceNode.y - lift}, ${controlX} ${targetNode.y - lift}, ${targetNode.x} ${targetNode.y}" fill="none" stroke="${stroke}" stroke-width="2.4" stroke-dasharray="8 6" />`;
        })
        .join("");
    })
    .join("");
}

function renderEncoderDecoderBands(geometry: DiagramGeometryLayer[], theme: ScientificDiagramRenderTheme) {
  const encoderLayers = geometry.filter((entry) => entry.layer.role === "encoder");
  const decoderLayers = geometry.filter((entry) => entry.layer.role === "decoder");
  const bottleneck = geometry.find((entry) => entry.layer.role === "bottleneck") ?? null;
  const bandFill = withHexAlpha(theme.accentPrimary, 0.06);

  const encoderBand =
    encoderLayers.length > 0
      ? `<rect x="${encoderLayers[0]!.x - 54}" y="24" width="${encoderLayers.at(-1)!.x - encoderLayers[0]!.x + 108}" height="312" rx="26" fill="${bandFill}" />`
      : "";
  const decoderBand =
    decoderLayers.length > 0
      ? `<rect x="${decoderLayers[0]!.x - 54}" y="24" width="${decoderLayers.at(-1)!.x - decoderLayers[0]!.x + 108}" height="312" rx="26" fill="${bandFill}" />`
      : "";
  const bridgeBand =
    bottleneck
      ? `<rect x="${bottleneck.x - 44}" y="72" width="88" height="216" rx="22" fill="${withHexAlpha(
          theme.accentPrimary,
          0.08,
        )}" />`
      : "";
  return `${encoderBand}${decoderBand}${bridgeBand}`;
}

function renderNodes(geometry: DiagramGeometryLayer[], nodeFill: string, nodeStroke: string) {
  return geometry
    .flatMap((entry) =>
      entry.nodes.map(
        (node) =>
          `<circle cx="${node.x}" cy="${node.y}" r="${node.radius}" fill="${nodeFill}" stroke="${nodeStroke}" stroke-width="3" />`,
      ),
    )
    .join("");
}

export function renderScientificDiagramShell(args: {
  spec: ScientificDiagramSpec;
  theme: ScientificDiagramRenderTheme;
}) {
  const geometry = buildLayerGeometry(args.spec);
  const connectorStroke = withHexAlpha(args.theme.accentPrimary, 0.34);
  const skipStroke = withHexAlpha(args.theme.accentPrimary, 0.5);
  const nodeFill = withHexAlpha(args.theme.accentPrimary, 0.12);
  const nodeStroke = withHexAlpha(args.theme.accentPrimary, 0.82);
  const labelColor = args.theme.textMuted;
  const noteBackground = withHexAlpha(args.theme.surfaceSecondary, 0.92);
  const serializedSpec = escapeHtml(JSON.stringify(args.spec));
  const leftNote = args.spec.sideNotes.find((note) => note.side === "left") ?? null;
  const rightNote = args.spec.sideNotes.find((note) => note.side === "right") ?? null;
  const networkBackground =
    args.spec.connectivity === "encoder-decoder"
      ? renderEncoderDecoderBands(geometry, args.theme)
      : "";
  const primaryConnections = renderAdjacentConnections(geometry, connectorStroke);
  const residualConnections =
    args.spec.connectivity === "residual"
      ? renderResidualSkipConnections(geometry, skipStroke)
      : "";

  return `<div class="scientific-diagram-shell" data-html-visual-kind="chart-frame" data-html-fit-role="content" data-html-module-kind="${SCIENTIFIC_DIAGRAM_MODULE_KIND}" data-html-module-label="${escapeHtml(
    SCIENTIFIC_DIAGRAM_LABEL,
  )}" ${SCIENTIFIC_DIAGRAM_SPEC_ATTRIBUTE}="${serializedSpec}" style="position:relative;border:1px solid ${withHexAlpha(
    args.theme.borderSubtle,
    0.94,
  )};border-radius:32px;background:${args.theme.surfacePrimary};padding:24px 32px 28px;min-height:560px;display:flex;flex-direction:column;gap:18px;overflow:hidden;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;">
      <div>
        <div class="scientific-diagram-kicker" style="margin-bottom:10px;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:${args.theme.accentSecondary};">Research figure</div>
        <h3 class="scientific-diagram-title" style="margin:0;font-size:30px;line-height:1.15;font-weight:600;color:${args.theme.textPrimary};max-width:860px;">${escapeHtml(
          args.spec.title,
        )}</h3>
        <p class="scientific-diagram-top-label" style="margin:10px 0 0 0;font-size:15px;line-height:1.5;color:${args.theme.textMuted};">${escapeHtml(
          args.spec.topLabel,
        )}</p>
      </div>
      <div style="display:inline-flex;align-items:center;padding:8px 12px;border:1px solid ${withHexAlpha(
        args.theme.borderSubtle,
        0.92,
      )};background:${withHexAlpha(args.theme.surfaceSecondary, 0.72)};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${args.theme.accentPrimary};">
        ${escapeHtml(formatConnectivityLabel(args.spec.connectivity))}
      </div>
    </div>
    <div class="scientific-diagram-figure" style="position:relative;flex:1;min-height:360px;padding:24px 168px 36px;">
      ${
        leftNote
          ? `<p class="scientific-diagram-side-note scientific-diagram-side-note-left" style="position:absolute;left:0;top:24px;width:148px;margin:0;padding:12px 14px;border:1px solid ${withHexAlpha(
              args.theme.borderSubtle,
              0.88,
            )};background:${noteBackground};font-size:14px;line-height:1.45;color:${args.theme.textMuted};">${escapeHtml(
              leftNote.text,
            )}</p>`
          : ""
      }
      ${
        rightNote
          ? `<p class="scientific-diagram-side-note scientific-diagram-side-note-right" style="position:absolute;right:0;top:84px;width:148px;margin:0;padding:12px 14px;border:1px solid ${withHexAlpha(
              args.theme.borderSubtle,
              0.88,
            )};background:${noteBackground};font-size:14px;line-height:1.45;color:${args.theme.textMuted};">${escapeHtml(
              rightNote.text,
            )}</p>`
          : ""
      }
      <svg class="scientific-diagram-network" viewBox="0 0 860 360" role="img" aria-label="${escapeHtml(
        args.spec.title,
      )}" style="display:block;width:100%;height:360px;">
        ${networkBackground}
        ${primaryConnections}
        ${residualConnections}
        ${renderNodes(geometry, nodeFill, nodeStroke)}
      </svg>
      ${geometry
        .map(
          (entry) =>
            `<p class="scientific-diagram-layer-label" style="position:absolute;top:0;left:calc(${entry.labelLeftPercent}% - 68px);width:136px;margin:0;text-align:center;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:${labelColor};">${escapeHtml(
              entry.layer.label,
            )}</p>`,
        )
        .join("")}
      <p class="scientific-diagram-bottom-label" style="position:absolute;left:50%;bottom:0;transform:translateX(-50%);margin:0;font-size:14px;line-height:1.4;color:${args.theme.textMuted};text-align:center;">${escapeHtml(
        args.spec.bottomLabel,
      )}</p>
    </div>
    <p class="scientific-diagram-caption" style="margin:0;border-top:1px solid ${withHexAlpha(
      args.theme.borderSubtle,
      0.96,
    )};padding-top:14px;font-size:15px;line-height:1.55;color:${args.theme.textMuted};">${escapeHtml(
      args.spec.caption,
    )}</p>
  </div>`;
}
