import type {
  GeneratedHtmlReport,
  NeuralNetworkDiagramConnectivity,
  NeuralNetworkDiagramLayer,
  NeuralNetworkDiagramLayerRole,
  ScientificDiagramSpec,
  ScientificDiagramSideNote,
} from "./types";

export const SCIENTIFIC_DIAGRAM_MODULE_KIND = "scientific-diagram" as const;
export const SCIENTIFIC_DIAGRAM_SPEC_ATTRIBUTE = "data-html-diagram-spec" as const;
export const SCIENTIFIC_DIAGRAM_LABEL = "Scientific diagram";
export const SCIENTIFIC_DIAGRAM_CONNECTIVITY_OPTIONS = [
  { value: "dense", label: "Dense" },
  { value: "residual", label: "Residual" },
  { value: "encoder-decoder", label: "Encoder-decoder" },
] as const;

type ScientificDiagramTheme = {
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

function normalizeDiagramText(value: string, fallback: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return fallback;
  }
  return normalized.length > 96 ? `${normalized.slice(0, 93).trim()}...` : normalized;
}

function normalizeScientificDiagramConnectivity(
  connectivity: string | null | undefined,
): NeuralNetworkDiagramConnectivity {
  if (connectivity === "encoder-decoder") {
    return "encoder-decoder";
  }
  if (connectivity === "residual") {
    return "residual";
  }
  return "dense";
}

function normalizeSideNotes(sideNotes: ScientificDiagramSideNote[] | null | undefined) {
  return (sideNotes ?? [])
    .map((note, index) => ({
      id: normalizeText(note?.id ?? "") || `note-${index + 1}`,
      text: normalizeDiagramText(note?.text ?? "", index === 0 ? "Method note" : "Result note"),
      side: (note?.side === "right" ? "right" : "left") as "left" | "right",
    }))
    .slice(0, 2);
}

function getDefaultLayerLabel(args: {
  role: NeuralNetworkDiagramLayerRole;
  index: number;
  total: number;
}) {
  if (args.role === "input") {
    return "Input layer";
  }
  if (args.role === "output") {
    return "Output layer";
  }
  if (args.role === "encoder") {
    return args.total > 5 ? `Encoder ${Math.max(1, args.index)}` : "Encoder";
  }
  if (args.role === "decoder") {
    return args.total > 5 ? `Decoder ${Math.max(1, args.total - args.index - 1)}` : "Decoder";
  }
  if (args.role === "bottleneck") {
    return "Latent bottleneck";
  }
  return args.total > 3 ? `Hidden ${args.index}` : "Hidden layer";
}

function normalizeScientificDiagramLayer(
  layer: Partial<NeuralNetworkDiagramLayer> | null | undefined,
  index: number,
  total: number,
  connectivity: NeuralNetworkDiagramConnectivity,
): NeuralNetworkDiagramLayer {
  const role =
    layer?.role === "input" ||
    layer?.role === "hidden" ||
    layer?.role === "output" ||
    layer?.role === "encoder" ||
    layer?.role === "bottleneck" ||
    layer?.role === "decoder"
      ? layer.role
      : connectivity === "encoder-decoder"
        ? index === 0
          ? "input"
          : index === total - 1
            ? "output"
            : index === Math.floor(total / 2)
              ? "bottleneck"
              : index < Math.floor(total / 2)
                ? "encoder"
                : "decoder"
        : index === 0
          ? "input"
          : index === total - 1
            ? "output"
            : "hidden";
  const minimumNodeCount = role === "output" || role === "bottleneck" ? 1 : 2;
  return {
    id: normalizeText(layer?.id ?? "") || `layer-${role}-${index + 1}`,
    role,
    label: normalizeDiagramText(
      layer?.label ?? "",
      getDefaultLayerLabel({ role, index, total }),
    ),
    nodeCount: clamp(
      Math.round(
        Number(
          layer?.nodeCount ??
            (role === "input" ? 4 : role === "output" ? 3 : role === "bottleneck" ? 2 : 5),
        ),
      ),
      minimumNodeCount,
      9,
    ),
  };
}

function getDiagramLayerCountBounds(connectivity: NeuralNetworkDiagramConnectivity) {
  if (connectivity === "encoder-decoder") {
    return {
      min: 5,
      max: 7,
    };
  }
  if (connectivity === "residual") {
    return {
      min: 4,
      max: 6,
    };
  }
  return {
    min: 3,
    max: 6,
  };
}

function buildDenseLayersFromCount(layerCount: number) {
  const hiddenLayerCount = Math.max(1, layerCount - 2);
  const layers: NeuralNetworkDiagramLayer[] = [
    { id: "layer-input", role: "input", label: "Input layer", nodeCount: 4 },
  ];
  for (let index = 0; index < hiddenLayerCount; index += 1) {
    layers.push({
      id: `layer-hidden-${index + 1}`,
      role: "hidden",
      label: hiddenLayerCount > 1 ? `Hidden ${index + 1}` : "Hidden layer",
      nodeCount: 5,
    });
  }
  layers.push({
    id: "layer-output",
    role: "output",
    label: "Output layer",
    nodeCount: 3,
  });
  return layers;
}

function buildResidualLayersFromCount(layerCount: number) {
  const hiddenLayerCount = Math.max(2, layerCount - 2);
  const layers: NeuralNetworkDiagramLayer[] = [
    { id: "layer-input", role: "input", label: "Input layer", nodeCount: 4 },
  ];
  for (let index = 0; index < hiddenLayerCount; index += 1) {
    layers.push({
      id: `layer-hidden-${index + 1}`,
      role: "hidden",
      label: `Residual block ${index + 1}`,
      nodeCount: index % 2 === 0 ? 6 : 5,
    });
  }
  layers.push({
    id: "layer-output",
    role: "output",
    label: "Output score",
    nodeCount: 1,
  });
  return layers;
}

function buildEncoderDecoderLayersFromCount(layerCount: number) {
  const bounded = clamp(layerCount % 2 === 0 ? layerCount + 1 : layerCount, 5, 7);
  const middleIndex = Math.floor(bounded / 2);
  const encoderDepth = middleIndex - 1;
  const encoderCounts = Array.from({ length: encoderDepth }, (_, index) =>
    clamp(6 - index * 2, 3, 6),
  );
  return Array.from({ length: bounded }, (_, index) => {
    if (index === 0) {
      return {
        id: "layer-input",
        role: "input" as const,
        label: "Input features",
        nodeCount: 6,
      };
    }
    if (index === bounded - 1) {
      return {
        id: "layer-output",
        role: "output" as const,
        label: "Output layer",
        nodeCount: 3,
      };
    }
    if (index === middleIndex) {
      return {
        id: `layer-bottleneck-${index}`,
        role: "bottleneck" as const,
        label: "Latent bottleneck",
        nodeCount: 2,
      };
    }
    if (index < middleIndex) {
      return {
        id: `layer-encoder-${index}`,
        role: "encoder" as const,
        label: bounded > 5 ? `Encoder ${index}` : "Encoder",
        nodeCount: encoderCounts[index - 1] ?? 4,
      };
    }
    const decoderOrdinal = bounded - index - 1;
    const mirrorIndex = bounded - index - 2;
    return {
      id: `layer-decoder-${decoderOrdinal}`,
      role: "decoder" as const,
      label: bounded > 5 ? `Decoder ${decoderOrdinal}` : "Decoder",
      nodeCount: encoderCounts[mirrorIndex] ?? 4,
    };
  });
}

function buildDefaultLayersForConnectivity(
  connectivity: NeuralNetworkDiagramConnectivity,
  requestedLayerCount?: number,
) {
  const bounds = getDiagramLayerCountBounds(connectivity);
  const layerCount = clamp(
    Math.round(
      requestedLayerCount ??
        (connectivity === "encoder-decoder" ? 5 : connectivity === "residual" ? 4 : 4),
    ),
    bounds.min,
    bounds.max,
  );
  if (connectivity === "encoder-decoder") {
    return buildEncoderDecoderLayersFromCount(layerCount);
  }
  if (connectivity === "residual") {
    return buildResidualLayersFromCount(layerCount);
  }
  return buildDenseLayersFromCount(layerCount);
}

function remapLayersForConnectivity(
  spec: ScientificDiagramSpec,
  connectivity: NeuralNetworkDiagramConnectivity,
  requestedLayerCount?: number,
) {
  const previousLayers = normalizeScientificDiagramSpec(spec).layers;
  const nextLayers = buildDefaultLayersForConnectivity(connectivity, requestedLayerCount);
  return nextLayers.map((nextLayer, index) => {
    const previousByIndex = previousLayers[index] ?? null;
    const previousByRole =
      previousLayers.find((entry) => entry.role === nextLayer.role) ??
      previousLayers.find((entry) => entry.role === "hidden" && nextLayer.role === "hidden") ??
      null;
    const source = previousByRole ?? previousByIndex ?? null;
    const shouldPreserveLabel =
      source?.role === nextLayer.role ||
      ((nextLayer.role === "input" || nextLayer.role === "output") &&
        (source?.role === "input" || source?.role === "output"));
    return normalizeScientificDiagramLayer(
      {
        ...nextLayer,
        label: shouldPreserveLabel ? source?.label ?? nextLayer.label : nextLayer.label,
        nodeCount: source?.nodeCount ?? nextLayer.nodeCount,
      },
      index,
      nextLayers.length,
      connectivity,
    );
  });
}

function getConnectivityCaption(connectivity: NeuralNetworkDiagramConnectivity) {
  if (connectivity === "encoder-decoder") {
    return "Encoder-decoder topology rendered deterministically for stable editing and export.";
  }
  if (connectivity === "residual") {
    return "Residual topology rendered deterministically for stable editing and export.";
  }
  return "Dense topology rendered deterministically for stable editing and export.";
}

function getConnectivityTopLabel(connectivity: NeuralNetworkDiagramConnectivity) {
  if (connectivity === "encoder-decoder") {
    return "Encoder-decoder topology";
  }
  if (connectivity === "residual") {
    return "Residual information flow";
  }
  return "Method topology";
}

function getConnectivityBottomLabel(connectivity: NeuralNetworkDiagramConnectivity) {
  if (connectivity === "encoder-decoder") {
    return "Decoded prediction";
  }
  if (connectivity === "residual") {
    return "Skip-enhanced output";
  }
  return "Prediction output";
}

function formatConnectivityLabel(connectivity: NeuralNetworkDiagramConnectivity) {
  if (connectivity === "encoder-decoder") {
    return "Encoder-decoder";
  }
  if (connectivity === "residual") {
    return "Residual";
  }
  return "Dense";
}

export function normalizeScientificDiagramSpec(
  spec: Partial<ScientificDiagramSpec> | null | undefined,
): ScientificDiagramSpec {
  const connectivity = normalizeScientificDiagramConnectivity(spec?.connectivity);
  const rawLayers = Array.isArray(spec?.layers) ? spec.layers : [];
  const normalizedLayers = rawLayers
    .map((layer, index) =>
      normalizeScientificDiagramLayer(layer, index, rawLayers.length, connectivity),
    )
    .slice(0, 7);

  const layers =
    normalizedLayers.length >= getDiagramLayerCountBounds(connectivity).min
      ? normalizedLayers
      : buildDefaultLayersForConnectivity(connectivity);

  return {
    family: "neural-network",
    title: normalizeDiagramText(spec?.title ?? "", "Neural network topology"),
    caption: normalizeDiagramText(
      spec?.caption ?? "",
      getConnectivityCaption(connectivity),
    ),
    layers,
    connectivity,
    topLabel: normalizeDiagramText(spec?.topLabel ?? "", getConnectivityTopLabel(connectivity)),
    bottomLabel: normalizeDiagramText(
      spec?.bottomLabel ?? "",
      getConnectivityBottomLabel(connectivity),
    ),
    sideNotes: normalizeSideNotes(spec?.sideNotes),
    stylePreset: "paper-white",
  };
}

function buildLayerGeometry(spec: ScientificDiagramSpec) {
  const width = 860;
  const height = 360;
  const xPadding = spec.connectivity === "encoder-decoder" ? 72 : 80;
  const yPadding = 44;
  const spacing = spec.layers.length > 1 ? (width - xPadding * 2) / (spec.layers.length - 1) : 0;
  return spec.layers.map((layer, layerIndex) => {
    const x = xPadding + spacing * layerIndex;
    const radius = clamp(26 - Math.max(0, layer.nodeCount - 4) * 1.5, 14, 24);
    const ySpacing = layer.nodeCount > 1 ? (height - yPadding * 2) / (layer.nodeCount - 1) : 0;
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

export function serializeScientificDiagramSpec(spec: ScientificDiagramSpec) {
  return JSON.stringify(normalizeScientificDiagramSpec(spec));
}

export function parseScientificDiagramSpec(raw: string | null | undefined) {
  if (!raw?.trim()) {
    return null;
  }
  try {
    return normalizeScientificDiagramSpec(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function buildScientificDiagramTheme(args: {
  report: GeneratedHtmlReport;
  accent?: string | null;
  border?: string | null;
  background?: string | null;
}) {
  const profile = args.report.styleProfile;
  return {
    surfacePrimary: args.background || profile?.surfaceFill || "#ffffff",
    surfaceSecondary: profile?.surfaceSecondary || "#f6f8fb",
    textPrimary: profile?.textPrimary || "#17283a",
    textMuted: profile?.textMuted || "#617182",
    accentPrimary: args.accent || profile?.accentColor || "#2f5d84",
    accentSecondary: profile?.accentColor || "#6f88a0",
    borderSubtle: args.border || profile?.dividerColor || "#d8e0e8",
  } satisfies ScientificDiagramTheme;
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

function renderEncoderDecoderBands(geometry: DiagramGeometryLayer[], theme: ScientificDiagramTheme) {
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

export function renderScientificDiagramModule(args: {
  spec: ScientificDiagramSpec;
  theme: ScientificDiagramTheme;
}) {
  const spec = normalizeScientificDiagramSpec(args.spec);
  const geometry = buildLayerGeometry(spec);
  const connectorStroke = withHexAlpha(args.theme.accentPrimary, 0.34);
  const skipStroke = withHexAlpha(args.theme.accentPrimary, 0.5);
  const nodeFill = withHexAlpha(args.theme.accentPrimary, 0.12);
  const nodeStroke = withHexAlpha(args.theme.accentPrimary, 0.82);
  const noteBackground = withHexAlpha(args.theme.surfaceSecondary, 0.92);
  const leftNote = spec.sideNotes.find((note) => note.side === "left") ?? null;
  const rightNote = spec.sideNotes.find((note) => note.side === "right") ?? null;
  const networkBackground =
    spec.connectivity === "encoder-decoder"
      ? renderEncoderDecoderBands(geometry, args.theme)
      : "";
  const primaryConnections = renderAdjacentConnections(geometry, connectorStroke);
  const residualConnections =
    spec.connectivity === "residual"
      ? renderResidualSkipConnections(geometry, skipStroke)
      : "";

  return `<div class="scientific-diagram-shell" data-html-visual-kind="chart-frame" data-html-fit-role="content" data-html-module-kind="${SCIENTIFIC_DIAGRAM_MODULE_KIND}" data-html-module-label="${escapeHtml(
    SCIENTIFIC_DIAGRAM_LABEL,
  )}" ${SCIENTIFIC_DIAGRAM_SPEC_ATTRIBUTE}="${escapeHtml(
    serializeScientificDiagramSpec(spec),
  )}" style="position:relative;border:1px solid ${withHexAlpha(
    args.theme.borderSubtle,
    0.94,
  )};border-radius:32px;background:${args.theme.surfacePrimary};padding:24px 32px 28px;min-height:560px;display:flex;flex-direction:column;gap:18px;overflow:hidden;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;">
      <div>
        <div class="scientific-diagram-kicker" style="margin-bottom:10px;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:${args.theme.accentSecondary};">Research figure</div>
        <h3 class="scientific-diagram-title" style="margin:0;font-size:30px;line-height:1.15;font-weight:600;color:${args.theme.textPrimary};max-width:860px;">${escapeHtml(
          spec.title,
        )}</h3>
        <p class="scientific-diagram-top-label" style="margin:10px 0 0 0;font-size:15px;line-height:1.5;color:${args.theme.textMuted};">${escapeHtml(
          spec.topLabel,
        )}</p>
      </div>
      <div style="display:inline-flex;align-items:center;padding:8px 12px;border:1px solid ${withHexAlpha(
        args.theme.borderSubtle,
        0.92,
      )};background:${withHexAlpha(args.theme.surfaceSecondary, 0.72)};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${args.theme.accentPrimary};">
        ${escapeHtml(formatConnectivityLabel(spec.connectivity))}
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
        spec.title,
      )}" style="display:block;width:100%;height:360px;">
        ${networkBackground}
        ${primaryConnections}
        ${residualConnections}
        ${renderNodes(geometry, nodeFill, nodeStroke)}
      </svg>
      ${geometry
        .map(
          (entry) =>
            `<p class="scientific-diagram-layer-label" style="position:absolute;top:0;left:calc(${entry.labelLeftPercent}% - 68px);width:136px;margin:0;text-align:center;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:${args.theme.textMuted};">${escapeHtml(
              entry.layer.label,
            )}</p>`,
        )
        .join("")}
      <p class="scientific-diagram-bottom-label" style="position:absolute;left:50%;bottom:0;transform:translateX(-50%);margin:0;font-size:14px;line-height:1.4;color:${args.theme.textMuted};text-align:center;">${escapeHtml(
        spec.bottomLabel,
      )}</p>
    </div>
    <p class="scientific-diagram-caption" style="margin:0;border-top:1px solid ${withHexAlpha(
      args.theme.borderSubtle,
      0.96,
    )};padding-top:14px;font-size:15px;line-height:1.55;color:${args.theme.textMuted};">${escapeHtml(
      spec.caption,
    )}</p>
  </div>`;
}

export function resizeScientificDiagramLayers(spec: ScientificDiagramSpec, nextLayerCount: number) {
  const normalized = normalizeScientificDiagramSpec(spec);
  const connectivity = normalized.connectivity;
  const bounds = getDiagramLayerCountBounds(connectivity);
  const requested =
    connectivity === "encoder-decoder"
      ? clamp(Math.round(nextLayerCount), bounds.min, bounds.max) | 1
      : clamp(Math.round(nextLayerCount), bounds.min, bounds.max);
  const nextLayers = remapLayersForConnectivity(normalized, connectivity, requested);
  return normalizeScientificDiagramSpec({
    ...normalized,
    layers: nextLayers,
  });
}

export function switchScientificDiagramConnectivity(
  spec: ScientificDiagramSpec,
  nextConnectivity: NeuralNetworkDiagramConnectivity,
) {
  const normalized = normalizeScientificDiagramSpec(spec);
  const nextLayers = remapLayersForConnectivity(normalized, nextConnectivity);
  return normalizeScientificDiagramSpec({
    ...normalized,
    connectivity: nextConnectivity,
    caption:
      normalized.caption === getConnectivityCaption(normalized.connectivity)
        ? getConnectivityCaption(nextConnectivity)
        : normalized.caption,
    topLabel:
      normalized.topLabel === getConnectivityTopLabel(normalized.connectivity)
        ? getConnectivityTopLabel(nextConnectivity)
        : normalized.topLabel,
    bottomLabel:
      normalized.bottomLabel === getConnectivityBottomLabel(normalized.connectivity)
        ? getConnectivityBottomLabel(nextConnectivity)
        : normalized.bottomLabel,
    layers: nextLayers,
  });
}

export function getScientificDiagramLayerCountBounds(
  connectivity: NeuralNetworkDiagramConnectivity,
) {
  return getDiagramLayerCountBounds(connectivity);
}
