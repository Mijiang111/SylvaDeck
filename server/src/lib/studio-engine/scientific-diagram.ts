import type {
  ConceptualScientificDiagramFamily,
  ConceptualScientificDiagramNode,
  ConceptualScientificDiagramSpec,
  DeckThinkingMode,
  NeuralNetworkDiagramConnectivity,
  NeuralNetworkDiagramLayer,
  NeuralNetworkDiagramLayerRole,
  NeuralNetworkDiagramSpec,
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
const SCIENTIFIC_VISUAL_DECK_PATTERN =
  /\b(scientific[- ]visual|scientific diagram|scientific figure|figure[- ]led|research[- ]paper|nature figure|diagram exploration|mechanism diagram|conceptual science mechanism)\b|(?:科研图|科学图|科学机制图|机制图谱|图解原型|概念机制|发表级|论文图|图示原型|每页.*科学图|每页.*机制图)/i;
const SCIENTIFIC_GENERAL_CUE_PATTERN =
  /\b(perovskite|solar cell|battery degradation|lithium|sei|dendrite|catalysis|energy profile|quantum dot|band gap|exciton|tokamak|fusion|carbon cycle|groundwater|aquifer|contaminant plume|earthquake|fault rupture|additive manufacturing|melt pool|semiconductor packaging|chiplet|interposer|tsv|hbm)\b|(?:钙钛矿|太阳能电池|锂离子|电池退化|枝晶|异相催化|能量剖面|量子点|带隙|激子|托卡马克|聚变|碳循环|地下水|污染羽流|含水层|地震|断层|增材制造|熔池|半导体封装|芯粒|中介层|硅通孔|高带宽内存)/i;

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
  layer: NeuralNetworkDiagramLayer;
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

function formatConnectivityLabel(connectivity: NeuralNetworkDiagramConnectivity) {
  if (connectivity === "encoder-decoder") {
    return "Encoder-decoder";
  }
  if (connectivity === "residual") {
    return "Residual";
  }
  return "Dense";
}

export function hasScientificDiagramCue(text: string) {
  return (
    SCIENTIFIC_DIAGRAM_CUE_PATTERN.test(text) ||
    SCIENTIFIC_VISUAL_DECK_PATTERN.test(text) ||
    SCIENTIFIC_GENERAL_CUE_PATTERN.test(text)
  );
}

function hasScientificVisualDeckCue(text: string) {
  return SCIENTIFIC_VISUAL_DECK_PATTERN.test(text);
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

function resolveNeuralFlowDiagramFamily(text: string): ConceptualScientificDiagramFamily | null {
  if (/\b(induction head|previous-token|previous token|copy head|match-and-copy|prefix match)\b|(?:归纳头|前一词元|前序词元|复制头|前缀匹配)/i.test(text)) {
    return "induction-head";
  }
  if (/\b(multi[- ]head attention|attention routing|attention score|q\s*\/\s*k\s*\/\s*v|qkv|query|key|value)\b|(?:多头注意力|注意力路由|注意力矩阵|查询|键|值)/i.test(text)) {
    return "attention-routing";
  }
  if (/\b(transformer residual|residual stream|layer norm|mlp write|attention read)\b|(?:残差流|Transformer.*读写|注意力读|MLP写入|层归一化)/i.test(text)) {
    return "transformer-residual";
  }
  if (/\b(graph attention|gat\b|attention[- ]weighted message)\b|(?:图注意力|边注意力|注意力消息)/i.test(text)) {
    return "gat-attention";
  }
  if (/\b(graphsage|sample[- ]aggregate|sampled neighbors)\b|(?:采样聚合|邻居采样)/i.test(text)) {
    return "graphsage-aggregate";
  }
  if (/\b(gnn|graph neural|message passing|neighbor message|node update|edge message)\b|(?:图神经网络|消息传递|邻域消息|节点更新|边消息)/i.test(text)) {
    return "gnn-message-passing";
  }
  if (/\b(lstm|cell state|forget gate|input gate|output gate)\b|(?:长短期记忆|细胞状态|遗忘门|输入门|输出门)/i.test(text)) {
    return "lstm-gates";
  }
  if (/\b(gru|reset gate|update gate)\b|(?:重置门|更新门|门控循环单元)/i.test(text)) {
    return "gru-gates";
  }
  if (/\b(rnn|recurrent|hidden state|time[- ]unrolled|unrolled cells)\b|(?:循环神经网络|隐状态|时间展开|递归)/i.test(text)) {
    return "rnn-unroll";
  }
  if (/\b(unet\+\+|u[- ]?net\+\+|nested.*skip|dense skip pathway|deep supervision)\b|(?:嵌套.*跳连|稠密跳连|深监督|语义差距)/i.test(text)) {
    return "unet-nested-skip";
  }
  if (/\b(feature pyramid|fpn|top[- ]down pathway|lateral connection|p[2-5])\b|(?:特征金字塔|自顶向下|横向连接|多尺度融合)/i.test(text)) {
    return "feature-pyramid";
  }
  if (/\b(u[- ]?net|encoder[- ]decoder skip|same[- ]scale skip|segmentation mask)\b|(?:U-Net|编码器.*解码器.*跳连|同尺度跳连|分割掩膜)/i.test(text)) {
    return "unet-skip";
  }
  if (/\b(resnet|residual block|identity skip|identity highway|residual branch|f\(x\))\b|(?:残差高速路|恒等跳连|残差分支)/i.test(text)) {
    return "residual-flow";
  }
  if (/\b(cnn|convolution|receptive field|feature map|kernel|pooling|downsampling)\b|(?:卷积|感受野|特征图|卷积核|池化|下采样)/i.test(text)) {
    return "cnn-receptive-field";
  }
  if (/\b(mlp|dense layer|fully connected|forward propagation|activation gate|logits?)\b|(?:多层感知机|全连接|前向传播|激活门|logits?)/i.test(text)) {
    return "mlp-flow";
  }
  return null;
}

function resolveConceptualDiagramFamily(text: string): ConceptualScientificDiagramFamily | null {
  const neuralFlowFamily = resolveNeuralFlowDiagramFamily(text);
  if (neuralFlowFamily) {
    return neuralFlowFamily;
  }
  if (SCIENTIFIC_DIAGRAM_CUE_PATTERN.test(text)) {
    return null;
  }
  if (/\b(perovskite|solar cell|layered stack|etl|htl|electrode)\b|(?:钙钛矿|太阳能电池|层状|透明电极|电子传输层|空穴传输层|金属电极)/i.test(text)) {
    return "layer-stack";
  }
  if (/\b(battery degradation|lithium|sei|plating|dendrite|capacity fade)\b|(?:锂离子|电池退化|锂沉积|枝晶|容量衰减)/i.test(text)) {
    return "mechanism-pathway";
  }
  if (/\b(quantum dot|band gap|exciton|emission|surface trap|passivation)\b|(?:量子点|带隙|激子|发光|表面陷阱|钝化)/i.test(text)) {
    return "band-physics";
  }
  if (/\b(tokamak|fusion|toroidal|plasma|divertor|magnetic field)\b|(?:托卡马克|聚变|环形|等离子体|偏滤器|磁场)/i.test(text)) {
    return "toroidal-system";
  }
  if (/\b(carbon cycle|climate|feedback|atmosphere|ocean|vegetation|soil carbon)\b|(?:碳循环|气候|反馈|大气|海洋|植被|土壤碳)/i.test(text)) {
    return "feedback-cycle";
  }
  if (/\b(groundwater|aquifer|plume|earthquake|fault|rupture|seismic|aftershock)\b|(?:地下水|含水层|污染羽流|地震|断层|破裂|余震)/i.test(text)) {
    return "cross-section";
  }
  if (/\b(catalysis|energy profile|reaction coordinate|transition state|adsorption|desorption|energy barrier|activation barrier)\b|(?:催化|能量剖面|反应坐标|过渡态|吸附|脱附|能垒)/i.test(text)) {
    return "energy-profile";
  }
  if (/\b(additive manufacturing|melt pool|laser|powder bed|thermal gradient|porosity|grain growth)\b|(?:增材制造|熔池|激光|粉末床|热梯度|孔隙|晶粒)/i.test(text)) {
    return "process-physics";
  }
  if (/\b(semiconductor packaging|chiplet|interposer|tsv|hbm|package substrate|signal routing)\b|(?:半导体封装|芯粒|中介层|硅通孔|HBM|高带宽内存|封装基板|信号布线)/i.test(text)) {
    return "hardware-architecture";
  }
  return "mechanism-pathway";
}

function formatFamilyLabel(family: ScientificDiagramSpec["family"]) {
  switch (family) {
    case "neural-network":
      return "Neural topology";
    case "mlp-flow":
      return "MLP flow";
    case "cnn-receptive-field":
      return "CNN receptive field";
    case "residual-flow":
      return "Residual flow";
    case "unet-skip":
      return "U-Net skip";
    case "unet-nested-skip":
      return "UNet++";
    case "feature-pyramid":
      return "Feature pyramid";
    case "transformer-residual":
      return "Residual stream";
    case "attention-routing":
      return "Attention routing";
    case "induction-head":
      return "Induction head";
    case "rnn-unroll":
      return "RNN unroll";
    case "lstm-gates":
      return "LSTM gates";
    case "gru-gates":
      return "GRU gates";
    case "gnn-message-passing":
      return "Message passing";
    case "graphsage-aggregate":
      return "GraphSAGE";
    case "gat-attention":
      return "Graph attention";
    case "layer-stack":
      return "Layer stack";
    case "mechanism-pathway":
      return "Mechanism chain";
    case "energy-profile":
      return "Energy profile";
    case "band-physics":
      return "Band physics";
    case "toroidal-system":
      return "Toroidal system";
    case "feedback-cycle":
      return "Feedback cycle";
    case "cross-section":
      return "Cross-section";
    case "process-physics":
      return "Process physics";
    case "hardware-architecture":
      return "Architecture";
    default:
      return "Research figure";
  }
}

function node(
  id: string,
  label: string,
  detail = "",
  emphasis: ConceptualScientificDiagramNode["emphasis"] = "secondary",
): ConceptualScientificDiagramNode {
  return { id, label, detail, emphasis };
}

function buildConceptualDefaults(family: ConceptualScientificDiagramFamily, text: string) {
  switch (family) {
    case "mlp-flow":
      return {
        topLabel: "输入向量逐层变换为输出 logits",
        bottomLabel: "线性变换与非线性激活交替压缩、展开表征",
        nodes: [
          node("input", "输入向量", "特征进入网络", "secondary"),
          node("dense-1", "全连接层", "加权求和", "flow"),
          node("activation", "激活门", "非线性筛选", "primary"),
          node("dense-2", "隐藏表征", "组合特征", "flow"),
          node("logits", "logits 输出", "类别证据", "primary"),
        ],
        legendItems: ["蓝色：信号流", "深色：表征状态", "琥珀：非线性门控"],
      };
    case "cnn-receptive-field":
      return {
        topLabel: "局部感受野在特征图中逐步汇聚为语义证据",
        bottomLabel: "卷积核扫描局部区域，池化扩大有效上下文",
        nodes: [
          node("image", "输入图像", "局部像素块", "secondary"),
          node("kernel", "卷积核", "共享权重扫描", "primary"),
          node("map", "特征图", "边缘/纹理响应", "flow"),
          node("pool", "池化", "下采样聚合", "flow"),
          node("evidence", "类别证据", "高层响应", "primary"),
        ],
        legendItems: ["方框：感受野", "蓝色：特征传递", "浅格：feature map"],
      };
    case "residual-flow":
      return {
        topLabel: "主干信号沿恒等路径跨过残差分支",
        bottomLabel: "残差块只学习增量 F(x)，再与输入相加",
        nodes: [
          node("x", "输入 x", "主干信号", "secondary"),
          node("branch", "F(x) 分支", "卷积/MLP变换", "flow"),
          node("skip", "恒等跳连", "保留原信号", "primary"),
          node("add", "相加节点", "x + F(x)", "primary"),
          node("out", "输出", "稳定深层训练", "secondary"),
        ],
        legendItems: ["粗线：identity highway", "细线：残差分支", "圆点：加法融合"],
      };
    case "unet-skip":
      return {
        topLabel: "编码器压缩语义，解码器通过同尺度跳连恢复细节",
        bottomLabel: "低层空间细节绕过瓶颈，与高层语义融合",
        nodes: [
          node("encoder", "编码器", "下采样语义", "flow"),
          node("bottleneck", "瓶颈", "全局上下文", "primary"),
          node("decoder", "解码器", "上采样恢复", "flow"),
          node("skip", "同尺度跳连", "细节直达", "primary"),
          node("mask", "分割掩膜", "像素级输出", "secondary"),
        ],
        legendItems: ["左侧：contracting path", "右侧：expanding path", "横线：skip transfer"],
      };
    case "unet-nested-skip":
      return {
        topLabel: "嵌套稠密跳连逐步缩小编码器与解码器语义差距",
        bottomLabel: "中间节点形成多级特征桥，并可接深监督输出",
        nodes: [
          node("encoder", "编码节点", "低层细节", "secondary"),
          node("bridge", "嵌套桥", "逐级语义对齐", "primary"),
          node("dense", "稠密跳连", "多路径融合", "flow"),
          node("decoder", "解码节点", "恢复空间", "flow"),
          node("heads", "深监督", "多尺度输出", "primary"),
        ],
        legendItems: ["网格：嵌套节点", "蓝线：dense skip", "短支路：监督头"],
      };
    case "feature-pyramid":
      return {
        topLabel: "自底向上语义与自顶向下高层上下文在多尺度融合",
        bottomLabel: "横向连接把同尺度 backbone 特征注入金字塔层",
        nodes: [
          node("c", "C2-C5 backbone", "自底向上", "secondary"),
          node("topdown", "Top-down", "上采样语义", "primary"),
          node("lateral", "横向连接", "同尺度融合", "flow"),
          node("pyramid", "P2-P5", "多尺度特征", "primary"),
          node("heads", "检测/分割头", "任务输出", "secondary"),
        ],
        legendItems: ["左列：backbone", "右列：pyramid", "横线：lateral fusion"],
      };
    case "transformer-residual":
      return {
        topLabel: "每层从 residual stream 读取信息，再把更新写回同一通道",
        bottomLabel: "注意力与 MLP 像两个写入模块，持续累积 token 表征",
        nodes: [
          node("tokens", "Token embeddings", "初始表征", "secondary"),
          node("stream", "Residual stream", "共享工作区", "primary"),
          node("attn", "Attention read/write", "跨 token 路由", "flow"),
          node("mlp", "MLP write", "局部变换", "flow"),
          node("norm", "LayerNorm", "稳定读写", "secondary"),
        ],
        legendItems: ["长条：residual stream", "蓝色：attention", "琥珀：MLP 写入"],
      };
    case "attention-routing":
      return {
        topLabel: "Q/K 匹配决定注意力权重，V 路径携带被路由的信息",
        bottomLabel: "多个 head 并行读取不同关系，最后合并写回输出投影",
        nodes: [
          node("qkv", "Q/K/V 投影", "三路拆分", "secondary"),
          node("scores", "注意力矩阵", "相关性权重", "primary"),
          node("heads", "多头路由", "并行关系", "flow"),
          node("concat", "Concat", "合并 head", "flow"),
          node("out", "输出投影", "写回表征", "primary"),
        ],
        legendItems: ["矩阵：attention score", "曲线：head route", "深色：写回"],
      };
    case "induction-head":
      return {
        topLabel: "两层 attention head 接力完成前缀匹配与复制",
        bottomLabel: "previous-token head 写入位移上下文，induction head 找到重复前缀并复制后继信号",
        nodes: [
          node("prev", "Previous-token head", "写入前一 token", "flow"),
          node("stream", "Residual stream", "携带位移线索", "primary"),
          node("match", "Induction matcher", "匹配重复前缀", "primary"),
          node("copy", "OV copy path", "复制后继 token", "flow"),
          node("logits", "Next-token logits", "提升预测", "secondary"),
        ],
        legendItems: ["第一步：写入", "第二步：匹配", "第三步：复制输出"],
      };
    case "rnn-unroll":
      return {
        topLabel: "同一个循环单元沿时间展开，隐状态携带历史信息",
        bottomLabel: "每一步读取当前输入与上一时刻 hidden state",
        nodes: [
          node("x", "xₜ 输入", "当前 token", "secondary"),
          node("hprev", "hₜ₋₁", "历史状态", "flow"),
          node("cell", "RNN cell", "共享参数", "primary"),
          node("h", "hₜ", "更新记忆", "primary"),
          node("y", "yₜ 输出", "逐步预测", "secondary"),
        ],
        legendItems: ["横向：时间", "回路：hidden state", "重复块：共享参数"],
      };
    case "lstm-gates":
      return {
        topLabel: "Cell state 作为长程通道，门控决定遗忘、写入与输出",
        bottomLabel: "forget/input/output gate 分别控制记忆擦除、候选写入和暴露",
        nodes: [
          node("cell", "Cell state", "长程通道", "primary"),
          node("forget", "遗忘门", "擦除旧信息", "risk"),
          node("input", "输入门", "写入候选", "flow"),
          node("candidate", "候选记忆", "新内容", "secondary"),
          node("output", "输出门", "暴露 hidden", "flow"),
        ],
        legendItems: ["长线：cell state", "门：sigmoid 控制", "加号：记忆更新"],
      };
    case "gru-gates":
      return {
        topLabel: "GRU 用 reset 与 update 两个门在旧记忆和新候选之间插值",
        bottomLabel: "结构比 LSTM 更紧凑，直接更新 hidden state",
        nodes: [
          node("hprev", "旧 hidden", "历史记忆", "secondary"),
          node("reset", "Reset gate", "控制候选读取", "risk"),
          node("candidate", "候选 hidden", "新信息", "flow"),
          node("update", "Update gate", "新旧插值", "primary"),
          node("h", "新 hidden", "更新状态", "primary"),
        ],
        legendItems: ["z：更新门", "r：重置门", "混合线：状态插值"],
      };
    case "gnn-message-passing":
      return {
        topLabel: "邻居节点沿边发送消息，目标节点聚合后更新表征",
        bottomLabel: "同一层中图结构不变，但节点 embedding 被同步刷新",
        nodes: [
          node("target", "目标节点", "待更新", "primary"),
          node("neighbors", "邻居节点", "消息来源", "secondary"),
          node("messages", "边消息", "ψ 函数", "flow"),
          node("aggregate", "聚合", "sum/mean/max", "primary"),
          node("update", "节点更新", "φ 函数", "flow"),
        ],
        legendItems: ["箭头：message", "圆心：target", "环：neighborhood"],
      };
    case "graphsage-aggregate":
      return {
        topLabel: "GraphSAGE 采样邻居并聚合，再与自身向量拼接变换",
        bottomLabel: "采样降低邻居规模，使归纳式节点表示可扩展",
        nodes: [
          node("sample", "邻居采样", "固定扇出", "secondary"),
          node("aggregate", "聚合器", "mean/max/LSTM", "primary"),
          node("self", "自身向量", "保留身份", "flow"),
          node("concat", "拼接", "self + neigh", "flow"),
          node("embed", "新 embedding", "归纳表示", "primary"),
        ],
        legendItems: ["虚线：sampled neighbors", "双路：self/neigh", "深色：新表征"],
      };
    case "gat-attention":
      return {
        topLabel: "GAT 为每条边学习注意力权重，再加权聚合邻居消息",
        bottomLabel: "多头注意力稳定不同关系的局部加权传播",
        nodes: [
          node("edges", "边权重 αᵢⱼ", "学习相关性", "primary"),
          node("heads", "多头注意力", "并行权重", "flow"),
          node("neighbors", "邻居消息", "特征来源", "secondary"),
          node("weighted", "加权求和", "聚合消息", "primary"),
          node("node", "更新节点", "新表征", "flow"),
        ],
        legendItems: ["线宽：attention", "颜色：head", "中心：updated node"],
      };
    case "layer-stack":
      return {
        topLabel: "层状器件结构与载流子定向迁移",
        bottomLabel: "光吸收后，电子与空穴沿选择性传输层分流",
        nodes: [
          node("transparent-electrode", "透明电极", "允许入射光进入", "secondary"),
          node("etl", "电子传输层", "电子定向提取", "flow"),
          node("absorber", "钙钛矿吸收层", "产生电子-空穴对", "primary"),
          node("htl", "空穴传输层", "空穴定向提取", "flow"),
          node("metal-electrode", "金属电极", "完成外部收集", "secondary"),
        ],
        legendItems: ["黄色：入射光", "蓝色：电子路径", "玫色：空穴路径"],
      };
    case "energy-profile":
      return {
        topLabel: "反应沿表面位点逐步跨越能垒",
        bottomLabel: "峰值对应过渡态，谷值对应相对稳定中间体",
        nodes: [
          node("reactants", "反应物", "进入表面附近", "secondary"),
          node("adsorbed", "吸附态", "与活性位点结合", "flow"),
          node("transition", "过渡态", "最高势垒位置", "primary"),
          node("intermediate", "中间体", "表面重排后稳定", "flow"),
          node("product", "脱附产物", "释放活性位点", "secondary"),
        ],
        legendItems: ["深色曲线：相对能量", "强调峰：活化能垒", "浅色点：表面状态"],
      };
    case "band-physics":
      return {
        topLabel: "尺寸、能级与表面态共同影响发光路径",
        bottomLabel: "小尺寸带隙更宽，壳层钝化降低表面陷阱竞争",
        nodes: [
          node("small", "小尺寸", "较宽带隙 / 蓝移", "primary"),
          node("mid", "中尺寸", "中等发射能量", "flow"),
          node("large", "大尺寸", "较窄带隙 / 红移", "secondary"),
          node("trap", "表面陷阱", "非辐射损失通道", "risk"),
          node("shell", "壳层钝化", "减少缺陷竞争", "flow"),
        ],
        legendItems: ["竖向间距：带隙", "虚线：陷阱态路径", "外圈：钝化壳层"],
      };
    case "toroidal-system":
      return {
        topLabel: "环形磁约束将高温等离子体限制在主腔体内",
        bottomLabel: "加热、磁场与偏滤器共同维持约束边界",
        nodes: [
          node("plasma", "等离子体环", "主约束对象", "primary"),
          node("coils", "磁场线圈", "形成环向约束", "flow"),
          node("heating", "加热系统", "维持高温", "secondary"),
          node("divertor", "偏滤器", "处理边界粒子与热流", "risk"),
          node("alpha", "α粒子回馈", "自加热循环", "flow"),
        ],
        legendItems: ["蓝色：磁场约束", "橙色：加热路径", "灰色：腔体边界"],
      };
    case "feedback-cycle":
      return {
        topLabel: "碳库之间的通量变化可放大或缓冲变暖反馈",
        bottomLabel: "大气、海洋、陆地与人为排放构成闭环系统",
        nodes: [
          node("atmosphere", "大气", "CO₂浓度变化", "primary"),
          node("ocean", "海洋", "吸收与释放", "flow"),
          node("vegetation", "植被", "光合作用固定", "flow"),
          node("soil", "土壤碳", "分解释放", "secondary"),
          node("emissions", "化石排放", "外部输入", "risk"),
          node("warming", "升温反馈", "改变通量强度", "risk"),
        ],
        legendItems: ["实线：碳通量", "虚线：反馈影响", "强调点：外部输入"],
      };
    case "cross-section":
      if (/(earthquake|fault|rupture|seismic|aftershock|地震|断层|破裂|余震)/i.test(text)) {
        return {
          topLabel: "锁定断层释放累积应力后形成破裂前锋",
          bottomLabel: "破裂传播触发地震波、地表位移与余震带",
          nodes: [
            node("surface", "地表", "位移响应", "secondary"),
            node("locked", "锁定断层段", "应力累积", "risk"),
            node("front", "破裂前锋", "沿断层传播", "primary"),
            node("waves", "地震波外传", "能量释放", "flow"),
            node("aftershock", "余震带", "后续调整", "secondary"),
          ],
          legendItems: ["斜线：断层面", "红色：破裂前锋", "蓝色：波前"],
        };
      }
      return {
        topLabel: "污染源在水力梯度驱动下形成地下水羽流",
        bottomLabel: "监测井与阻隔屏障用于识别和限制扩散路径",
        nodes: [
          node("source", "污染源", "释放溶质", "risk"),
          node("aquifer", "含水层", "主要迁移通道", "primary"),
          node("gradient", "水力梯度", "驱动羽流移动", "flow"),
          node("plume", "羽流扩散", "浓度逐步稀释", "primary"),
          node("wells", "监测井", "采样识别边界", "secondary"),
          node("barrier", "修复屏障", "限制下游扩散", "flow"),
        ],
        legendItems: ["蓝色：地下水流", "琥珀：污染羽流", "竖线：监测/阻隔"],
      };
    case "process-physics":
      return {
        topLabel: "激光能量输入形成熔池并驱动快速凝固组织",
        bottomLabel: "热梯度影响晶粒生长，气孔路径构成缺陷风险",
        nodes: [
          node("laser", "激光束", "局部能量输入", "primary"),
          node("powder", "粉末床", "待熔化材料", "secondary"),
          node("pool", "熔池", "液相区域", "primary"),
          node("thermal", "热梯度", "控制凝固方向", "flow"),
          node("grain", "晶粒生长", "形成组织纹理", "flow"),
          node("porosity", "孔隙缺陷", "未排出气体风险", "risk"),
        ],
        legendItems: ["橙色：热输入", "蓝色：热梯度", "暗点：孔隙风险"],
      };
    case "hardware-architecture":
      return {
        topLabel: "异构芯粒通过中介层和基板完成高密度互连",
        bottomLabel: "TSV、HBM与热路径共同决定封装可扩展性",
        nodes: [
          node("chiplets", "Chiplets", "计算/功能裸片", "primary"),
          node("interposer", "Interposer", "高密度互连层", "flow"),
          node("tsv", "TSV", "垂直互连", "flow"),
          node("hbm", "HBM stack", "高带宽内存", "primary"),
          node("substrate", "封装基板", "外部连接", "secondary"),
          node("thermal", "热路径", "散热约束", "risk"),
        ],
        legendItems: ["深色：芯粒", "蓝色：信号路径", "琥珀：热路径"],
      };
    case "mechanism-pathway":
    default:
      return {
        topLabel: "副反应沿界面链条逐步放大失效风险",
        bottomLabel: "活性锂损失、阻抗上升与枝晶风险共同推动容量衰减",
        nodes: [
          node("anode", "负极界面", "主要退化起点", "primary"),
          node("sei", "SEI持续生长", "消耗活性锂", "flow"),
          node("plating", "锂沉积", "局部电流失衡", "risk"),
          node("dendrite", "枝晶风险", "可能刺穿隔膜", "risk"),
          node("fade", "容量衰减", "可逆容量缩减", "primary"),
        ],
        legendItems: ["蓝色：Li+迁移", "琥珀：界面副反应", "深色：失效结果"],
      };
  }
}

function buildConceptualDiagramSpec(args: {
  family: ConceptualScientificDiagramFamily;
  sourceText: string;
  subject?: string | null;
  page: Pick<PageRecipe, "pageTitle" | "heroClaim" | "objective" | "takeaway" | "supportBullets" | "evidenceBullets">;
}): ScientificDiagramSpec {
  const defaults = buildConceptualDefaults(args.family, args.sourceText);
  return {
    family: args.family,
    title: toSentenceLabel(args.page.pageTitle || args.page.heroClaim, "Scientific mechanism"),
    caption: toSentenceLabel(
      args.page.takeaway || args.page.objective || args.page.heroClaim,
      `${defaults.nodes[0]?.label ?? "Main mechanism"} anchors the conceptual figure.`,
    ),
    topLabel: toSentenceLabel(args.page.objective, defaults.topLabel),
    bottomLabel: toSentenceLabel(args.subject || args.page.takeaway, defaults.bottomLabel),
    nodes: defaults.nodes,
    legendItems: defaults.legendItems,
    sideNotes: buildSideNotes(args.page),
    stylePreset: "paper-white",
  };
}

export function shouldUseScientificDiagramLane(args: {
  thinkingMode: DeckThinkingMode;
  brief: string;
  totalPages: number;
}) {
  if (args.thinkingMode !== "academic-research") {
    return false;
  }

  if (hasScientificVisualDeckCue(args.brief)) {
    return hasScientificDiagramCue(args.brief);
  }

  return args.totalPages <= 5 && hasScientificDiagramCue(args.brief);
}

export function isScientificDiagramFigurePage(args: {
  pageNumber: number;
  totalPages: number;
  brief?: string;
  forceAllPages?: boolean;
}) {
  if (args.forceAllPages || (args.brief && hasScientificVisualDeckCue(args.brief))) {
    return true;
  }
  if (args.totalPages >= 6) {
    return true;
  }
  return args.totalPages <= 1 ? args.pageNumber === 1 : args.pageNumber === 2;
}

export function buildScientificDiagramSpec(args: {
  brief: string;
  subject?: string | null;
  page: Pick<PageRecipe, "pageTitle" | "heroClaim" | "objective" | "takeaway" | "supportBullets" | "evidenceBullets">;
}): ScientificDiagramSpec {
  const pageText = normalizeText(
    [
      args.subject ?? "",
      args.page.pageTitle,
      args.page.heroClaim,
      args.page.objective,
      args.page.takeaway,
      ...args.page.supportBullets,
      ...args.page.evidenceBullets,
    ].join(" "),
  );
  const sourceText = normalizeText(
    [
      pageText,
      args.brief,
    ].join(" "),
  );
  const conceptualFamily =
    resolveConceptualDiagramFamily(pageText) ?? resolveConceptualDiagramFamily(sourceText);
  if (conceptualFamily) {
    return buildConceptualDiagramSpec({
      family: conceptualFamily,
      sourceText,
      subject: args.subject,
      page: args.page,
    });
  }

  const neuralSourceText = pageText || sourceText;
  const connectivity = resolveScientificDiagramConnectivity(neuralSourceText);
  const layerCount = parseLayerCount(neuralSourceText, connectivity);
  const inputCount = parseInputNodeCount(neuralSourceText);
  const outputCount = parseOutputNodeCount(neuralSourceText);
  const hiddenCount = parseHiddenNodeCount(neuralSourceText);
  const layers = buildDiagramLayers({
    connectivity,
    text: neuralSourceText,
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

function buildLayerGeometry(spec: NeuralNetworkDiagramSpec): DiagramGeometryLayer[] {
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

function colorForNode(node: ConceptualScientificDiagramNode, theme: ScientificDiagramRenderTheme) {
  if (node.emphasis === "primary") {
    return theme.accentPrimary;
  }
  if (node.emphasis === "risk") {
    return "#b66a35";
  }
  if (node.emphasis === "flow") {
    return "#4f87a6";
  }
  return theme.textMuted;
}

function renderSvgText(args: {
  x: number;
  y: number;
  text: string;
  size?: number;
  weight?: number;
  anchor?: "start" | "middle" | "end";
  fill: string;
}) {
  return `<text x="${args.x}" y="${args.y}" text-anchor="${args.anchor ?? "middle"}" font-size="${args.size ?? 18}" font-weight="${args.weight ?? 600}" fill="${args.fill}">${escapeHtml(args.text)}</text>`;
}

function renderPillLabel(args: {
  x: number;
  y: number;
  width: number;
  node: ConceptualScientificDiagramNode;
  theme: ScientificDiagramRenderTheme;
}) {
  const color = colorForNode(args.node, args.theme);
  return `<g>
    <rect x="${args.x - args.width / 2}" y="${args.y - 23}" width="${args.width}" height="46" rx="23" fill="${withHexAlpha(color, 0.08)}" stroke="${withHexAlpha(color, 0.56)}" stroke-width="1.5" />
    ${renderSvgText({ x: args.x, y: args.y + 6, text: args.node.label, size: 16, fill: color })}
  </g>`;
}

function renderConceptualLayerStack(spec: ConceptualScientificDiagramSpec, theme: ScientificDiagramRenderTheme) {
  const layerHeight = 48;
  const startY = 78;
  const layers = spec.nodes.slice(0, 5);
  const fills = ["#dbeaf4", "#cfe0ee", "#516a88", "#e2cde0", "#a08a78"];
  return `
    <rect x="98" y="48" width="470" height="292" rx="24" fill="${withHexAlpha(theme.surfaceSecondary, 0.72)}" stroke="${theme.borderSubtle}" />
    ${layers
      .map((entry, index) => {
        const y = startY + index * layerHeight;
        const fill = fills[index] ?? theme.surfaceSecondary;
        const textFill = index === 2 || index === 4 ? "#ffffff" : theme.textPrimary;
        return `<g>
          <rect x="158" y="${y}" width="350" height="${layerHeight}" rx="${index === 0 || index === layers.length - 1 ? 12 : 4}" fill="${fill}" stroke="${withHexAlpha(theme.textMuted, 0.2)}" />
          ${renderSvgText({ x: 333, y: y + 30, text: entry.label, size: index === 2 ? 20 : 17, fill: textFill })}
        </g>`;
      })
      .join("")}
    <path d="M 250 38 C 210 78, 218 128, 286 168" fill="none" stroke="#d9a92f" stroke-width="4" stroke-linecap="round" marker-end="url(#scientific-arrow)" />
    <circle cx="250" cy="38" r="15" fill="${withHexAlpha("#d9a92f", 0.25)}" stroke="#d9a92f" />
    <path d="M 520 150 L 720 86" stroke="#4f87a6" stroke-width="3" marker-end="url(#scientific-arrow)" />
    <path d="M 520 232 L 720 306" stroke="#b65f88" stroke-width="3" marker-end="url(#scientific-arrow)" />
    ${renderPillLabel({ x: 764, y: 86, width: 180, node: node("electron", "电子路径", "", "flow"), theme })}
    ${renderPillLabel({ x: 764, y: 306, width: 180, node: node("hole", "空穴路径", "", "risk"), theme })}
  `;
}

function renderConceptualPathway(spec: ConceptualScientificDiagramSpec, theme: ScientificDiagramRenderTheme) {
  const nodes = spec.nodes.slice(0, 5);
  const positions = nodes.map((entry, index) => ({
    node: entry,
    x: 118 + index * 166,
    y: index % 2 === 0 ? 168 : 210,
  }));
  return `
    <path d="M 82 292 H 820" stroke="${withHexAlpha(theme.borderSubtle, 0.95)}" stroke-width="2" />
    ${positions
      .slice(0, -1)
      .map((entry, index) => {
        const next = positions[index + 1]!;
        return `<path d="M ${entry.x + 52} ${entry.y} C ${entry.x + 92} ${entry.y}, ${next.x - 92} ${next.y}, ${next.x - 52} ${next.y}" fill="none" stroke="${withHexAlpha(theme.accentPrimary, 0.45)}" stroke-width="2.6" marker-end="url(#scientific-arrow)" />`;
      })
      .join("")}
    ${positions
      .map((entry, index) => {
        const color = colorForNode(entry.node, theme);
        return `<g>
          <circle cx="${entry.x}" cy="${entry.y}" r="${index === 0 || index === positions.length - 1 ? 52 : 44}" fill="${withHexAlpha(color, 0.12)}" stroke="${color}" stroke-width="2.4" />
          ${renderSvgText({ x: entry.x, y: entry.y + 6, text: entry.node.label, size: 15, fill: color })}
          ${entry.node.detail ? renderSvgText({ x: entry.x, y: entry.y + 76, text: entry.node.detail, size: 12, weight: 500, fill: theme.textMuted }) : ""}
        </g>`;
      })
      .join("")}
  `;
}

function renderConceptualEnergyProfile(spec: ConceptualScientificDiagramSpec, theme: ScientificDiagramRenderTheme) {
  const nodes = spec.nodes.slice(0, 5);
  const points = [
    [86, 278],
    [238, 180],
    [420, 76],
    [610, 190],
    [790, 258],
  ];
  return `
    <path d="M 64 52 V 318 H 828" fill="none" stroke="${withHexAlpha(theme.textMuted, 0.72)}" stroke-width="2" />
    ${renderSvgText({ x: 40, y: 68, text: "相对能量", size: 13, fill: theme.textMuted, anchor: "start" })}
    ${renderSvgText({ x: 740, y: 348, text: "反应坐标", size: 13, fill: theme.textMuted, anchor: "start" })}
    <path d="M 86 278 C 150 250, 172 190, 238 180 S 350 74, 420 76 S 536 190, 610 190 S 724 248, 790 258" fill="none" stroke="${theme.accentPrimary}" stroke-width="5" stroke-linecap="round" />
    <path d="M 420 80 V 284" stroke="#b66a35" stroke-width="2" stroke-dasharray="7 7" />
    ${points
      .map(([x, y], index) => {
        const entry = nodes[index] ?? node(`n-${index}`, `Step ${index + 1}`);
        const color = colorForNode(entry, theme);
        return `<g>
          <circle cx="${x}" cy="${y}" r="${index === 2 ? 13 : 10}" fill="${withHexAlpha(color, 0.18)}" stroke="${color}" stroke-width="2.2" />
          ${renderSvgText({ x, y: y - 22, text: entry.label, size: 14, fill: color })}
        </g>`;
      })
      .join("")}
    ${renderSvgText({ x: 468, y: 180, text: "活化能垒", size: 15, fill: "#b66a35", anchor: "start" })}
  `;
}

function renderConceptualBandPhysics(spec: ConceptualScientificDiagramSpec, theme: ScientificDiagramRenderTheme) {
  const colors = ["#4f87d9", "#6aa879", "#d28b45"];
  return `
    ${[0, 1, 2]
      .map((index) => {
        const x = 118 + index * 178;
        const gap = 118 - index * 28;
        const entry = spec.nodes[index] ?? node(`size-${index}`, ["小尺寸", "中尺寸", "大尺寸"][index] ?? "尺寸");
        return `<g>
          <rect x="${x - 48}" y="76" width="96" height="214" rx="22" fill="${withHexAlpha(colors[index]!, 0.08)}" stroke="${withHexAlpha(colors[index]!, 0.5)}" />
          <line x1="${x - 34}" y1="${146 - gap / 2}" x2="${x + 34}" y2="${146 - gap / 2}" stroke="${colors[index]}" stroke-width="5" />
          <line x1="${x - 34}" y1="${146 + gap / 2}" x2="${x + 34}" y2="${146 + gap / 2}" stroke="${colors[index]}" stroke-width="5" />
          <path d="M ${x} ${146 + gap / 2 - 6} V ${146 - gap / 2 + 6}" stroke="${colors[index]}" stroke-width="2.2" marker-end="url(#scientific-arrow)" />
          ${renderSvgText({ x, y: 326, text: entry.label, size: 15, fill: theme.textPrimary })}
        </g>`;
      })
      .join("")}
    <circle cx="662" cy="156" r="78" fill="${withHexAlpha(theme.accentPrimary, 0.12)}" stroke="${theme.accentPrimary}" stroke-width="3" />
    <circle cx="662" cy="156" r="104" fill="none" stroke="${withHexAlpha(theme.accentPrimary, 0.35)}" stroke-width="5" />
    ${renderSvgText({ x: 662, y: 162, text: spec.nodes[4]?.label ?? "壳层钝化", size: 18, fill: theme.accentPrimary })}
    <path d="M 602 72 C 636 112, 688 110, 724 78" fill="none" stroke="#b66a35" stroke-width="2.4" stroke-dasharray="7 7" marker-end="url(#scientific-arrow)" />
    ${renderSvgText({ x: 662, y: 56, text: spec.nodes[3]?.label ?? "表面陷阱", size: 15, fill: "#b66a35" })}
  `;
}

function renderConceptualToroidalSystem(spec: ConceptualScientificDiagramSpec, theme: ScientificDiagramRenderTheme) {
  return `
    <ellipse cx="452" cy="184" rx="264" ry="126" fill="${withHexAlpha(theme.surfaceSecondary, 0.8)}" stroke="${theme.borderSubtle}" stroke-width="3" />
    <ellipse cx="452" cy="184" rx="170" ry="74" fill="${withHexAlpha(theme.accentPrimary, 0.14)}" stroke="${theme.accentPrimary}" stroke-width="4" />
    <ellipse cx="452" cy="184" rx="72" ry="30" fill="${theme.surfacePrimary}" stroke="${theme.borderSubtle}" stroke-width="3" />
    ${Array.from({ length: 8 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 8;
      const x = 452 + Math.cos(angle) * 236;
      const y = 184 + Math.sin(angle) * 112;
      return `<ellipse cx="${x}" cy="${y}" rx="24" ry="48" fill="${withHexAlpha("#4f87a6", 0.13)}" stroke="#4f87a6" stroke-width="2" transform="rotate(${(angle * 180) / Math.PI} ${x} ${y})" />`;
    }).join("")}
    ${renderPillLabel({ x: 452, y: 184, width: 180, node: spec.nodes[0] ?? node("plasma", "等离子体环", "", "primary"), theme })}
    ${renderPillLabel({ x: 174, y: 70, width: 170, node: spec.nodes[2] ?? node("heating", "加热系统", "", "secondary"), theme })}
    <path d="M 238 82 C 300 106, 330 130, 352 162" stroke="#d28b45" stroke-width="3" fill="none" marker-end="url(#scientific-arrow)" />
    ${renderPillLabel({ x: 724, y: 306, width: 160, node: spec.nodes[3] ?? node("divertor", "偏滤器", "", "risk"), theme })}
  `;
}

function renderConceptualFeedbackCycle(spec: ConceptualScientificDiagramSpec, theme: ScientificDiagramRenderTheme) {
  const nodes = spec.nodes.slice(0, 6);
  const cx = 452;
  const cy = 184;
  const rx = 276;
  const ry = 122;
  const positions = nodes.map((entry, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / nodes.length;
    return {
      node: entry,
      x: cx + Math.cos(angle) * rx,
      y: cy + Math.sin(angle) * ry,
    };
  });
  return `
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${withHexAlpha(theme.borderSubtle, 0.8)}" stroke-width="2" stroke-dasharray="8 8" />
    ${positions
      .map((entry, index) => {
        const next = positions[(index + 1) % positions.length]!;
        return `<path d="M ${entry.x} ${entry.y} C ${cx} ${cy - 58}, ${cx} ${cy + 58}, ${next.x} ${next.y}" fill="none" stroke="${withHexAlpha(theme.accentPrimary, 0.32)}" stroke-width="2" marker-end="url(#scientific-arrow)" />`;
      })
      .join("")}
    ${positions
      .map((entry) => renderPillLabel({ x: entry.x, y: entry.y, width: 132, node: entry.node, theme }))
      .join("")}
  `;
}

function renderConceptualCrossSection(spec: ConceptualScientificDiagramSpec, theme: ScientificDiagramRenderTheme) {
  const isFault = spec.nodes.some((entry) => /断层|破裂|地震/.test(entry.label));
  if (isFault) {
    return `
      <path d="M 62 132 C 214 118, 310 148, 462 130 S 690 116, 836 138" fill="none" stroke="${theme.textMuted}" stroke-width="3" />
      <path d="M 118 310 L 648 92" stroke="#8c6046" stroke-width="9" stroke-linecap="round" />
      <path d="M 482 160 L 648 92" stroke="#b66a35" stroke-width="6" stroke-linecap="round" marker-end="url(#scientific-arrow)" />
      ${renderPillLabel({ x: 214, y: 236, width: 170, node: spec.nodes[1] ?? node("locked", "锁定断层段", "", "risk"), theme })}
      ${renderPillLabel({ x: 578, y: 128, width: 150, node: spec.nodes[2] ?? node("front", "破裂前锋", "", "primary"), theme })}
      <circle cx="666" cy="150" r="54" fill="none" stroke="${withHexAlpha("#4f87a6", 0.45)}" stroke-width="3" />
      <circle cx="666" cy="150" r="92" fill="none" stroke="${withHexAlpha("#4f87a6", 0.24)}" stroke-width="3" />
      ${renderSvgText({ x: 706, y: 258, text: spec.nodes[3]?.label ?? "地震波外传", size: 15, fill: "#4f87a6" })}
    `;
  }
  return `
    <rect x="58" y="82" width="792" height="72" fill="#edf3f6" stroke="${theme.borderSubtle}" />
    <rect x="58" y="154" width="792" height="92" fill="#dce9ef" stroke="${theme.borderSubtle}" />
    <rect x="58" y="246" width="792" height="74" fill="#eadfcf" stroke="${theme.borderSubtle}" />
    <path d="M 174 166 C 278 144, 414 166, 548 192 S 742 224, 814 204" fill="none" stroke="#d29a45" stroke-width="42" stroke-linecap="round" opacity="0.45" />
    <path d="M 86 206 H 804" stroke="#4f87a6" stroke-width="3" marker-end="url(#scientific-arrow)" />
    ${renderPillLabel({ x: 142, y: 122, width: 138, node: spec.nodes[0] ?? node("source", "污染源", "", "risk"), theme })}
    ${renderPillLabel({ x: 412, y: 198, width: 150, node: spec.nodes[3] ?? node("plume", "羽流扩散", "", "primary"), theme })}
    ${[620, 708].map((x) => `<line x1="${x}" y1="96" x2="${x}" y2="300" stroke="${theme.textMuted}" stroke-width="3" /><circle cx="${x}" cy="106" r="9" fill="${theme.surfacePrimary}" stroke="${theme.textMuted}" stroke-width="2" />`).join("")}
    ${renderSvgText({ x: 672, y: 70, text: spec.nodes[4]?.label ?? "监测井", size: 15, fill: theme.textMuted })}
  `;
}

function renderConceptualProcessPhysics(spec: ConceptualScientificDiagramSpec, theme: ScientificDiagramRenderTheme) {
  return `
    <rect x="72" y="260" width="760" height="52" rx="12" fill="#dfe5e8" stroke="${theme.borderSubtle}" />
    ${Array.from({ length: 52 }, (_, index) => {
      const x = 92 + (index % 26) * 28;
      const y = 280 + Math.floor(index / 26) * 18;
      return `<circle cx="${x}" cy="${y}" r="4" fill="${withHexAlpha(theme.textMuted, 0.55)}" />`;
    }).join("")}
    <path d="M 302 44 L 404 254 L 504 44 Z" fill="${withHexAlpha("#d28b45", 0.16)}" stroke="#d28b45" stroke-width="2" />
    <ellipse cx="404" cy="260" rx="126" ry="38" fill="${withHexAlpha("#d28b45", 0.42)}" stroke="#b66a35" stroke-width="3" />
    ${renderPillLabel({ x: 404, y: 76, width: 150, node: spec.nodes[0] ?? node("laser", "激光束", "", "primary"), theme })}
    ${renderPillLabel({ x: 404, y: 332, width: 128, node: spec.nodes[2] ?? node("pool", "熔池", "", "primary"), theme })}
    <path d="M 550 246 C 610 210, 674 184, 746 154" stroke="#4f87a6" stroke-width="3" fill="none" marker-end="url(#scientific-arrow)" />
    ${renderPillLabel({ x: 736, y: 132, width: 146, node: spec.nodes[3] ?? node("thermal", "热梯度", "", "flow"), theme })}
    <circle cx="606" cy="266" r="10" fill="#6f5c54" />
    ${renderSvgText({ x: 650, y: 276, text: spec.nodes[5]?.label ?? "孔隙缺陷", size: 14, fill: "#6f5c54", anchor: "start" })}
  `;
}

function renderConceptualHardware(spec: ConceptualScientificDiagramSpec, theme: ScientificDiagramRenderTheme) {
  return `
    <rect x="92" y="278" width="720" height="54" rx="12" fill="#c9d4dd" stroke="${theme.textMuted}" stroke-width="2" />
    <rect x="132" y="218" width="640" height="52" rx="10" fill="#dfeaf2" stroke="${theme.borderSubtle}" stroke-width="2" />
    ${[0, 1, 2].map((index) => `<rect x="${178 + index * 132}" y="138" width="104" height="72" rx="12" fill="${withHexAlpha(theme.accentPrimary, 0.18)}" stroke="${theme.accentPrimary}" stroke-width="2.4" />`).join("")}
    ${Array.from({ length: 4 }, (_, index) => `<rect x="612" y="${82 + index * 31}" width="118" height="26" rx="6" fill="${withHexAlpha("#6c7f91", 0.18)}" stroke="#6c7f91" />`).join("")}
    ${[230, 362, 494, 648].map((x) => `<line x1="${x}" y1="210" x2="${x}" y2="270" stroke="#4f87a6" stroke-width="4" />`).join("")}
    <path d="M 204 132 H 704" stroke="#4f87a6" stroke-width="3" marker-end="url(#scientific-arrow)" />
    <path d="M 668 208 C 688 236, 700 258, 714 288" stroke="#d28b45" stroke-width="3" fill="none" marker-end="url(#scientific-arrow)" />
    ${renderPillLabel({ x: 302, y: 108, width: 142, node: spec.nodes[0] ?? node("chiplets", "Chiplets", "", "primary"), theme })}
    ${renderPillLabel({ x: 672, y: 56, width: 150, node: spec.nodes[3] ?? node("hbm", "HBM stack", "", "primary"), theme })}
    ${renderSvgText({ x: 452, y: 254, text: spec.nodes[1]?.label ?? "Interposer", size: 16, fill: theme.accentPrimary })}
    ${renderSvgText({ x: 452, y: 314, text: spec.nodes[4]?.label ?? "封装基板", size: 15, fill: theme.textMuted })}
  `;
}

function renderConceptualMlpFlow(spec: ConceptualScientificDiagramSpec, theme: ScientificDiagramRenderTheme) {
  const columns = [
    { x: 92, count: 4, label: spec.nodes[0]?.label ?? "输入向量" },
    { x: 250, count: 6, label: spec.nodes[1]?.label ?? "全连接层" },
    { x: 430, count: 5, label: spec.nodes[2]?.label ?? "激活门" },
    { x: 610, count: 4, label: spec.nodes[3]?.label ?? "隐藏表征" },
    { x: 790, count: 3, label: spec.nodes[4]?.label ?? "logits 输出" },
  ];
  const nodesFor = (x: number, count: number) =>
    Array.from({ length: count }, (_, index) => {
      const y = 100 + (index * 170) / Math.max(1, count - 1);
      return { x, y };
    });
  return `
    ${columns
      .slice(0, -1)
      .map((column, index) => {
        const next = columns[index + 1]!;
        return nodesFor(column.x, Math.min(column.count, 5))
          .flatMap((left) =>
            nodesFor(next.x, Math.min(next.count, 5)).map(
              (right) => `<line x1="${left.x + 18}" y1="${left.y}" x2="${right.x - 18}" y2="${right.y}" stroke="${withHexAlpha(theme.accentPrimary, 0.11)}" stroke-width="1.4" />`,
            ),
          )
          .join("");
      })
      .join("")}
    ${columns
      .map((column, index) =>
        nodesFor(column.x, column.count)
          .map(
            (entry) =>
              `<circle cx="${entry.x}" cy="${entry.y}" r="${index === 2 ? 19 : 15}" fill="${withHexAlpha(index === 2 ? "#b66a35" : theme.accentPrimary, index === 2 ? 0.18 : 0.12)}" stroke="${index === 2 ? "#b66a35" : theme.accentPrimary}" stroke-width="2" />`,
          )
          .join("") +
        renderSvgText({ x: column.x, y: 326, text: column.label, size: 14, fill: index === 2 ? "#b66a35" : theme.textPrimary }),
      )
      .join("")}
    <path d="M 100 52 H 804" stroke="${theme.accentPrimary}" stroke-width="3" marker-end="url(#scientific-arrow)" />
    ${renderSvgText({ x: 452, y: 42, text: "前向信号流", size: 15, fill: theme.accentPrimary })}
  `;
}

function renderConceptualCnnFlow(spec: ConceptualScientificDiagramSpec, theme: ScientificDiagramRenderTheme) {
  return `
    <rect x="68" y="86" width="180" height="180" rx="18" fill="${withHexAlpha(theme.surfaceSecondary, 0.9)}" stroke="${theme.borderSubtle}" />
    ${Array.from({ length: 6 }, (_, index) => `<line x1="${68 + index * 30}" y1="86" x2="${68 + index * 30}" y2="266" stroke="${withHexAlpha(theme.textMuted, 0.18)}" />`).join("")}
    ${Array.from({ length: 6 }, (_, index) => `<line x1="68" y1="${86 + index * 30}" x2="248" y2="${86 + index * 30}" stroke="${withHexAlpha(theme.textMuted, 0.18)}" />`).join("")}
    <rect x="128" y="146" width="72" height="72" fill="${withHexAlpha("#d9a92f", 0.22)}" stroke="#d9a92f" stroke-width="3" />
    ${renderSvgText({ x: 158, y: 304, text: spec.nodes[0]?.label ?? "输入图像", size: 15, fill: theme.textPrimary })}
    <path d="M 248 176 C 308 120, 342 118, 392 148" stroke="${theme.accentPrimary}" stroke-width="3" fill="none" marker-end="url(#scientific-arrow)" />
    <rect x="396" y="124" width="92" height="92" rx="18" fill="${withHexAlpha(theme.accentPrimary, 0.11)}" stroke="${theme.accentPrimary}" stroke-width="2.4" />
    ${renderSvgText({ x: 442, y: 176, text: spec.nodes[1]?.label ?? "卷积核", size: 16, fill: theme.accentPrimary })}
    ${[0, 1, 2].map((index) => `<rect x="${568 + index * 34}" y="${94 + index * 24}" width="156" height="112" rx="14" fill="${withHexAlpha("#4f87a6", 0.1 + index * 0.04)}" stroke="#4f87a6" />`).join("")}
    ${renderSvgText({ x: 662, y: 262, text: spec.nodes[2]?.label ?? "特征图", size: 16, fill: "#4f87a6" })}
    <path d="M 720 162 H 824" stroke="${theme.accentPrimary}" stroke-width="3" marker-end="url(#scientific-arrow)" />
    ${renderPillLabel({ x: 804, y: 86, width: 160, node: spec.nodes[3] ?? node("pool", "池化", "", "flow"), theme })}
    ${renderPillLabel({ x: 804, y: 292, width: 160, node: spec.nodes[4] ?? node("evidence", "类别证据", "", "primary"), theme })}
  `;
}

function renderConceptualResidualFlow(spec: ConceptualScientificDiagramSpec, theme: ScientificDiagramRenderTheme) {
  return `
    <path d="M 90 190 H 800" stroke="${withHexAlpha(theme.accentPrimary, 0.8)}" stroke-width="7" stroke-linecap="round" marker-end="url(#scientific-arrow)" />
    <path d="M 194 190 C 260 80, 486 80, 558 188" stroke="#4f87a6" stroke-width="3.2" fill="none" marker-end="url(#scientific-arrow)" />
    <rect x="300" y="88" width="170" height="82" rx="20" fill="${withHexAlpha("#4f87a6", 0.12)}" stroke="#4f87a6" stroke-width="2.4" />
    ${renderSvgText({ x: 385, y: 136, text: spec.nodes[1]?.label ?? "F(x) 分支", size: 17, fill: "#4f87a6" })}
    <circle cx="570" cy="190" r="26" fill="${withHexAlpha("#b66a35", 0.16)}" stroke="#b66a35" stroke-width="3" />
    ${renderSvgText({ x: 570, y: 198, text: "+", size: 28, fill: "#b66a35" })}
    ${renderPillLabel({ x: 118, y: 190, width: 108, node: spec.nodes[0] ?? node("x", "输入 x"), theme })}
    ${renderPillLabel({ x: 356, y: 254, width: 170, node: spec.nodes[2] ?? node("skip", "恒等跳连", "", "primary"), theme })}
    ${renderPillLabel({ x: 760, y: 190, width: 128, node: spec.nodes[4] ?? node("out", "输出"), theme })}
  `;
}

function renderConceptualUnetSkip(spec: ConceptualScientificDiagramSpec, theme: ScientificDiagramRenderTheme) {
  const left = [
    [132, 92, 150, 48],
    [182, 158, 124, 48],
    [232, 224, 98, 48],
  ];
  const right = [
    [620, 224, 98, 48],
    [670, 158, 124, 48],
    [720, 92, 150, 48],
  ];
  return `
    ${left.map(([x, y, w, h], index) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${withHexAlpha(theme.accentPrimary, 0.1 + index * 0.03)}" stroke="${theme.accentPrimary}" />`).join("")}
    ${right.map(([x, y, w, h], index) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${withHexAlpha("#4f87a6", 0.16 - index * 0.02)}" stroke="#4f87a6" />`).join("")}
    <rect x="390" y="286" width="120" height="56" rx="16" fill="${withHexAlpha("#b66a35", 0.14)}" stroke="#b66a35" />
    <path d="M 198 140 L 244 206 L 292 272 L 390 314 L 620 248 L 732 182 L 794 116" stroke="${withHexAlpha(theme.textMuted, 0.45)}" stroke-width="2.4" fill="none" />
    ${left.map(([x, y, w], index) => `<path d="M ${x + w} ${y + 24} H ${right[2 - index]![0]}" stroke="${theme.accentPrimary}" stroke-width="3" stroke-dasharray="8 6" marker-end="url(#scientific-arrow)" />`).join("")}
    ${renderSvgText({ x: 205, y: 58, text: spec.nodes[0]?.label ?? "编码器", size: 17, fill: theme.accentPrimary })}
    ${renderSvgText({ x: 450, y: 322, text: spec.nodes[1]?.label ?? "瓶颈", size: 17, fill: "#b66a35" })}
    ${renderSvgText({ x: 740, y: 58, text: spec.nodes[2]?.label ?? "解码器", size: 17, fill: "#4f87a6" })}
    ${renderSvgText({ x: 452, y: 128, text: spec.nodes[3]?.label ?? "同尺度跳连", size: 15, fill: theme.accentPrimary })}
  `;
}

function renderConceptualUnetNested(spec: ConceptualScientificDiagramSpec, theme: ScientificDiagramRenderTheme) {
  const cells = Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: 4 - row }, (_, col) => ({
      x: 170 + col * 150 + row * 46,
      y: 88 + row * 68,
      row,
      col,
    })),
  ).flat();
  return `
    ${cells
      .map((cell) => `<rect x="${cell.x}" y="${cell.y}" width="82" height="42" rx="12" fill="${withHexAlpha(cell.col === 0 ? theme.accentPrimary : "#4f87a6", 0.1 + cell.row * 0.02)}" stroke="${cell.col === 0 ? theme.accentPrimary : "#4f87a6"}" />`)
      .join("")}
    ${cells
      .filter((cell) => cell.col < 3 - cell.row)
      .map((cell) => `<path d="M ${cell.x + 82} ${cell.y + 21} H ${cell.x + 150}" stroke="${withHexAlpha(theme.accentPrimary, 0.52)}" stroke-width="2.4" marker-end="url(#scientific-arrow)" />`)
      .join("")}
    ${cells
      .filter((cell) => cell.row < 3 && cell.col < 3 - cell.row)
      .map((cell) => `<path d="M ${cell.x + 41} ${cell.y + 42} C ${cell.x + 70} ${cell.y + 70}, ${cell.x + 104} ${cell.y + 70}, ${cell.x + 150} ${cell.y + 89}" stroke="#4f87a6" stroke-width="2" fill="none" stroke-dasharray="6 6" />`)
      .join("")}
    ${renderSvgText({ x: 230, y: 56, text: spec.nodes[0]?.label ?? "编码节点", size: 16, fill: theme.accentPrimary })}
    ${renderSvgText({ x: 504, y: 56, text: spec.nodes[1]?.label ?? "嵌套桥", size: 16, fill: "#4f87a6" })}
    ${renderPillLabel({ x: 738, y: 304, width: 150, node: spec.nodes[4] ?? node("heads", "深监督", "", "primary"), theme })}
  `;
}

function renderConceptualFeaturePyramid(spec: ConceptualScientificDiagramSpec, theme: ScientificDiagramRenderTheme) {
  return `
    ${[0, 1, 2, 3].map((index) => `<rect x="130" y="${80 + index * 62}" width="${250 - index * 34}" height="38" rx="10" fill="${withHexAlpha(theme.accentPrimary, 0.1 + index * 0.03)}" stroke="${theme.accentPrimary}" />`).join("")}
    ${[0, 1, 2, 3].map((index) => `<rect x="${610 + index * 18}" y="${80 + index * 62}" width="${210 - index * 24}" height="38" rx="10" fill="${withHexAlpha("#4f87a6", 0.18 - index * 0.02)}" stroke="#4f87a6" />`).join("")}
    ${[0, 1, 2, 3].map((index) => `<path d="M ${380 - index * 34} ${99 + index * 62} H ${610 + index * 18}" stroke="${withHexAlpha(theme.textMuted, 0.42)}" stroke-width="2.6" marker-end="url(#scientific-arrow)" />`).join("")}
    <path d="M 738 292 C 714 238, 694 180, 676 96" stroke="#b66a35" stroke-width="3" fill="none" marker-end="url(#scientific-arrow)" />
    ${renderSvgText({ x: 220, y: 344, text: spec.nodes[0]?.label ?? "C2-C5 backbone", size: 16, fill: theme.accentPrimary })}
    ${renderSvgText({ x: 708, y: 344, text: spec.nodes[3]?.label ?? "P2-P5", size: 16, fill: "#4f87a6" })}
    ${renderSvgText({ x: 484, y: 62, text: spec.nodes[2]?.label ?? "横向连接", size: 15, fill: theme.textMuted })}
  `;
}

function renderConceptualTransformerResidual(spec: ConceptualScientificDiagramSpec, theme: ScientificDiagramRenderTheme) {
  return `
    <rect x="86" y="170" width="728" height="52" rx="26" fill="${withHexAlpha(theme.accentPrimary, 0.1)}" stroke="${theme.accentPrimary}" stroke-width="2.4" />
    ${renderSvgText({ x: 450, y: 202, text: spec.nodes[1]?.label ?? "Residual stream", size: 18, fill: theme.accentPrimary })}
    ${[0, 1, 2].map((index) => `<rect x="${164 + index * 200}" y="72" width="134" height="58" rx="16" fill="${withHexAlpha("#4f87a6", 0.13)}" stroke="#4f87a6" />`).join("")}
    ${[0, 1, 2].map((index) => `<path d="M ${230 + index * 200} 130 V 170" stroke="#4f87a6" stroke-width="2.8" marker-end="url(#scientific-arrow)" />`).join("")}
    ${[0, 1].map((index) => `<rect x="${264 + index * 248}" y="264" width="132" height="56" rx="16" fill="${withHexAlpha("#b66a35", 0.13)}" stroke="#b66a35" />`).join("")}
    <path d="M 330 264 V 222" stroke="#b66a35" stroke-width="2.8" marker-end="url(#scientific-arrow)" />
    <path d="M 578 264 V 222" stroke="#b66a35" stroke-width="2.8" marker-end="url(#scientific-arrow)" />
    ${renderSvgText({ x: 230, y: 108, text: "Attention", size: 15, fill: "#4f87a6" })}
    ${renderSvgText({ x: 430, y: 108, text: "Read", size: 15, fill: "#4f87a6" })}
    ${renderSvgText({ x: 630, y: 108, text: "Write", size: 15, fill: "#4f87a6" })}
    ${renderSvgText({ x: 330, y: 300, text: "MLP", size: 15, fill: "#b66a35" })}
    ${renderSvgText({ x: 578, y: 300, text: "LayerNorm", size: 15, fill: "#b66a35" })}
  `;
}

function renderConceptualAttentionRouting(spec: ConceptualScientificDiagramSpec, theme: ScientificDiagramRenderTheme) {
  return `
    ${["Q", "K", "V"].map((label, index) => `<rect x="${96 + index * 118}" y="104" width="74" height="54" rx="14" fill="${withHexAlpha(theme.accentPrimary, 0.12)}" stroke="${theme.accentPrimary}" />${renderSvgText({ x: 133 + index * 118, y: 138, text: label, size: 20, fill: theme.accentPrimary })}`).join("")}
    <rect x="432" y="70" width="168" height="168" rx="16" fill="${withHexAlpha("#4f87a6", 0.08)}" stroke="#4f87a6" />
    ${Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, col) => `<rect x="${450 + col * 28}" y="${88 + row * 28}" width="22" height="22" fill="${withHexAlpha("#4f87a6", 0.08 + ((row + col) % 5) * 0.04)}" />`).join("")).join("")}
    ${renderSvgText({ x: 516, y: 264, text: spec.nodes[1]?.label ?? "注意力矩阵", size: 15, fill: "#4f87a6" })}
    ${[0, 1, 2].map((index) => `<path d="M 600 124 C ${650 + index * 16} ${74 + index * 60}, ${710 + index * 12} ${74 + index * 60}, 782 ${108 + index * 46}" stroke="${index === 1 ? "#b66a35" : theme.accentPrimary}" stroke-width="2.8" fill="none" marker-end="url(#scientific-arrow)" />`).join("")}
    ${renderPillLabel({ x: 794, y: 108, width: 132, node: node("h1", "Head 1", "", "flow"), theme })}
    ${renderPillLabel({ x: 794, y: 190, width: 132, node: node("h2", "Head 2", "", "risk"), theme })}
    ${renderPillLabel({ x: 794, y: 272, width: 132, node: spec.nodes[4] ?? node("out", "输出投影", "", "primary"), theme })}
  `;
}

function renderConceptualInductionHead(spec: ConceptualScientificDiagramSpec, theme: ScientificDiagramRenderTheme) {
  const tokens = ["A", "B", "…", "A", "?"];
  return `
    ${tokens.map((label, index) => `<rect x="${106 + index * 118}" y="88" width="76" height="52" rx="14" fill="${withHexAlpha(theme.surfaceSecondary, 0.9)}" stroke="${theme.borderSubtle}" />${renderSvgText({ x: 144 + index * 118, y: 122, text: label, size: 20, fill: theme.textPrimary })}`).join("")}
    <rect x="112" y="178" width="620" height="40" rx="20" fill="${withHexAlpha(theme.accentPrimary, 0.1)}" stroke="${theme.accentPrimary}" />
    ${renderSvgText({ x: 422, y: 204, text: spec.nodes[1]?.label ?? "Residual stream", size: 15, fill: theme.accentPrimary })}
    <path d="M 262 140 C 288 176, 338 176, 380 218" stroke="#4f87a6" stroke-width="3" fill="none" marker-end="url(#scientific-arrow)" />
    ${renderPillLabel({ x: 338, y: 276, width: 190, node: spec.nodes[0] ?? node("prev", "Previous-token head", "", "flow"), theme })}
    <path d="M 616 140 C 548 252, 344 244, 262 142" stroke="#b66a35" stroke-width="3" fill="none" stroke-dasharray="8 6" marker-end="url(#scientific-arrow)" />
    ${renderPillLabel({ x: 616, y: 276, width: 176, node: spec.nodes[2] ?? node("match", "Induction matcher", "", "primary"), theme })}
    <path d="M 654 140 C 704 184, 738 218, 800 250" stroke="${theme.accentPrimary}" stroke-width="3" fill="none" marker-end="url(#scientific-arrow)" />
    ${renderPillLabel({ x: 790, y: 250, width: 142, node: spec.nodes[3] ?? node("copy", "OV copy path", "", "flow"), theme })}
  `;
}

function renderConceptualRnnUnroll(spec: ConceptualScientificDiagramSpec, theme: ScientificDiagramRenderTheme) {
  return `
    ${[0, 1, 2, 3].map((index) => `<rect x="${116 + index * 176}" y="148" width="104" height="78" rx="18" fill="${withHexAlpha(theme.accentPrimary, 0.1)}" stroke="${theme.accentPrimary}" />${renderSvgText({ x: 168 + index * 176, y: 193, text: "RNN", size: 17, fill: theme.accentPrimary })}`).join("")}
    ${[0, 1, 2].map((index) => `<path d="M ${220 + index * 176} 186 H ${292 + index * 176}" stroke="${theme.accentPrimary}" stroke-width="3" marker-end="url(#scientific-arrow)" />`).join("")}
    ${[0, 1, 2, 3].map((index) => `<path d="M ${168 + index * 176} 270 V 226" stroke="#4f87a6" stroke-width="2.8" marker-end="url(#scientific-arrow)" />${renderSvgText({ x: 168 + index * 176, y: 294, text: `x${index + 1}`, size: 14, fill: "#4f87a6" })}`).join("")}
    ${[0, 1, 2, 3].map((index) => `<path d="M ${168 + index * 176} 148 V 96" stroke="#b66a35" stroke-width="2.4" marker-end="url(#scientific-arrow)" />${renderSvgText({ x: 168 + index * 176, y: 78, text: `y${index + 1}`, size: 14, fill: "#b66a35" })}`).join("")}
    ${renderSvgText({ x: 452, y: 118, text: spec.nodes[1]?.label ?? "隐状态递归", size: 15, fill: theme.textMuted })}
  `;
}

function renderConceptualLstmGates(spec: ConceptualScientificDiagramSpec, theme: ScientificDiagramRenderTheme) {
  return `
    <path d="M 86 132 H 814" stroke="${theme.accentPrimary}" stroke-width="7" stroke-linecap="round" marker-end="url(#scientific-arrow)" />
    ${renderSvgText({ x: 450, y: 102, text: spec.nodes[0]?.label ?? "Cell state", size: 17, fill: theme.accentPrimary })}
    ${[
      [188, "遗忘门", "#b66a35"],
      [370, "输入门", "#4f87a6"],
      [552, "候选记忆", theme.textMuted],
      [734, "输出门", "#4f87a6"],
    ].map(([x, label, color]) => `<rect x="${Number(x) - 62}" y="206" width="124" height="62" rx="18" fill="${withHexAlpha(String(color), 0.12)}" stroke="${color}" />${renderSvgText({ x: Number(x), y: 244, text: String(label), size: 15, fill: String(color) })}<path d="M ${x} 206 V 138" stroke="${color}" stroke-width="2.8" marker-end="url(#scientific-arrow)" />`).join("")}
    <circle cx="480" cy="132" r="22" fill="${withHexAlpha("#b66a35", 0.15)}" stroke="#b66a35" stroke-width="2.6" />
    ${renderSvgText({ x: 480, y: 140, text: "+", size: 24, fill: "#b66a35" })}
    ${renderSvgText({ x: 452, y: 322, text: "门控决定哪些记忆被保留、写入和输出", size: 15, fill: theme.textMuted })}
  `;
}

function renderConceptualGruGates(spec: ConceptualScientificDiagramSpec, theme: ScientificDiagramRenderTheme) {
  return `
    ${renderPillLabel({ x: 132, y: 188, width: 134, node: spec.nodes[0] ?? node("hprev", "旧 hidden"), theme })}
    ${renderPillLabel({ x: 324, y: 116, width: 142, node: spec.nodes[1] ?? node("reset", "Reset gate", "", "risk"), theme })}
    ${renderPillLabel({ x: 324, y: 260, width: 150, node: spec.nodes[2] ?? node("candidate", "候选 hidden", "", "flow"), theme })}
    ${renderPillLabel({ x: 548, y: 188, width: 148, node: spec.nodes[3] ?? node("update", "Update gate", "", "primary"), theme })}
    ${renderPillLabel({ x: 768, y: 188, width: 126, node: spec.nodes[4] ?? node("h", "新 hidden", "", "primary"), theme })}
    <path d="M 198 188 C 248 154, 270 130, 252 116" stroke="#b66a35" stroke-width="3" fill="none" marker-end="url(#scientific-arrow)" />
    <path d="M 198 188 C 248 222, 270 248, 252 260" stroke="#4f87a6" stroke-width="3" fill="none" marker-end="url(#scientific-arrow)" />
    <path d="M 400 260 C 454 242, 486 222, 486 188" stroke="#4f87a6" stroke-width="3" fill="none" marker-end="url(#scientific-arrow)" />
    <path d="M 622 188 H 700" stroke="${theme.accentPrimary}" stroke-width="4" marker-end="url(#scientific-arrow)" />
    ${renderSvgText({ x: 452, y: 56, text: "新旧状态插值", size: 16, fill: theme.textMuted })}
  `;
}

function renderConceptualGnnMessage(spec: ConceptualScientificDiagramSpec, theme: ScientificDiagramRenderTheme) {
  const neighbors = [
    [246, 86],
    [162, 196],
    [268, 304],
    [438, 296],
    [500, 120],
  ];
  return `
    <circle cx="348" cy="190" r="50" fill="${withHexAlpha(theme.accentPrimary, 0.14)}" stroke="${theme.accentPrimary}" stroke-width="3" />
    ${renderSvgText({ x: 348, y: 198, text: spec.nodes[0]?.label ?? "目标节点", size: 16, fill: theme.accentPrimary })}
    ${neighbors.map(([x, y], index) => `<circle cx="${x}" cy="${y}" r="30" fill="${withHexAlpha("#4f87a6", 0.1)}" stroke="#4f87a6" stroke-width="2" /><path d="M ${x} ${y} L ${348 + (x < 348 ? -42 : 42)} ${190 + (y < 190 ? -24 : 24)}" stroke="#4f87a6" stroke-width="${index === 4 ? 3.4 : 2.4}" marker-end="url(#scientific-arrow)" />`).join("")}
    ${renderPillLabel({ x: 674, y: 126, width: 150, node: spec.nodes[3] ?? node("aggregate", "聚合", "", "primary"), theme })}
    ${renderPillLabel({ x: 674, y: 254, width: 156, node: spec.nodes[4] ?? node("update", "节点更新", "", "flow"), theme })}
    <path d="M 398 190 H 596" stroke="${theme.accentPrimary}" stroke-width="3" marker-end="url(#scientific-arrow)" />
    <path d="M 674 152 V 228" stroke="${theme.accentPrimary}" stroke-width="3" marker-end="url(#scientific-arrow)" />
  `;
}

function renderConceptualGraphSage(spec: ConceptualScientificDiagramSpec, theme: ScientificDiagramRenderTheme) {
  return `
    <circle cx="150" cy="188" r="38" fill="${withHexAlpha(theme.accentPrimary, 0.13)}" stroke="${theme.accentPrimary}" stroke-width="3" />
    ${[0, 1, 2, 3, 4].map((index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 5;
      const x = 150 + Math.cos(angle) * 92;
      const y = 188 + Math.sin(angle) * 92;
      return `<circle cx="${x}" cy="${y}" r="20" fill="${withHexAlpha("#4f87a6", 0.12)}" stroke="#4f87a6" /><path d="M ${x} ${y} L ${150 + Math.cos(angle) * 42} ${188 + Math.sin(angle) * 42}" stroke="#4f87a6" stroke-width="2" stroke-dasharray="5 5" />`;
    }).join("")}
    ${renderPillLabel({ x: 364, y: 116, width: 150, node: spec.nodes[0] ?? node("sample", "邻居采样"), theme })}
    ${renderPillLabel({ x: 364, y: 260, width: 150, node: spec.nodes[1] ?? node("aggregate", "聚合器", "", "primary"), theme })}
    ${renderPillLabel({ x: 570, y: 188, width: 138, node: spec.nodes[3] ?? node("concat", "拼接", "", "flow"), theme })}
    ${renderPillLabel({ x: 770, y: 188, width: 160, node: spec.nodes[4] ?? node("embed", "新 embedding", "", "primary"), theme })}
    <path d="M 230 188 C 280 142, 308 126, 292 116" stroke="#4f87a6" stroke-width="3" marker-end="url(#scientific-arrow)" fill="none" />
    <path d="M 230 188 C 280 232, 308 250, 292 260" stroke="${theme.accentPrimary}" stroke-width="3" marker-end="url(#scientific-arrow)" fill="none" />
    <path d="M 438 260 C 494 248, 512 220, 512 188" stroke="${theme.accentPrimary}" stroke-width="3" marker-end="url(#scientific-arrow)" fill="none" />
    <path d="M 640 188 H 696" stroke="${theme.accentPrimary}" stroke-width="3" marker-end="url(#scientific-arrow)" />
  `;
}

function renderConceptualGatAttention(spec: ConceptualScientificDiagramSpec, theme: ScientificDiagramRenderTheme) {
  const neighbors = [
    [220, 90, 2],
    [130, 220, 5],
    [300, 306, 3],
    [500, 116, 7],
    [530, 280, 4],
  ];
  return `
    <circle cx="372" cy="196" r="48" fill="${withHexAlpha(theme.accentPrimary, 0.15)}" stroke="${theme.accentPrimary}" stroke-width="3" />
    ${renderSvgText({ x: 372, y: 204, text: spec.nodes[4]?.label ?? "更新节点", size: 16, fill: theme.accentPrimary })}
    ${neighbors.map(([x, y, w], index) => `<circle cx="${x}" cy="${y}" r="26" fill="${withHexAlpha("#4f87a6", 0.1)}" stroke="#4f87a6" /><path d="M ${x} ${y} L ${372 + (x < 372 ? -40 : 40)} ${196 + (y < 196 ? -25 : 25)}" stroke="${index % 2 ? "#b66a35" : "#4f87a6"}" stroke-width="${w}" opacity="0.72" marker-end="url(#scientific-arrow)" />`).join("")}
    ${renderPillLabel({ x: 724, y: 120, width: 162, node: spec.nodes[0] ?? node("edges", "边权重 αᵢⱼ", "", "primary"), theme })}
    ${renderPillLabel({ x: 724, y: 254, width: 162, node: spec.nodes[1] ?? node("heads", "多头注意力", "", "flow"), theme })}
    <path d="M 420 196 H 638" stroke="${theme.accentPrimary}" stroke-width="3" marker-end="url(#scientific-arrow)" />
    ${renderSvgText({ x: 372, y: 58, text: "线宽表示注意力权重", size: 15, fill: theme.textMuted })}
  `;
}

function renderConceptualDiagramVisual(spec: ConceptualScientificDiagramSpec, theme: ScientificDiagramRenderTheme) {
  switch (spec.family) {
    case "mlp-flow":
      return renderConceptualMlpFlow(spec, theme);
    case "cnn-receptive-field":
      return renderConceptualCnnFlow(spec, theme);
    case "residual-flow":
      return renderConceptualResidualFlow(spec, theme);
    case "unet-skip":
      return renderConceptualUnetSkip(spec, theme);
    case "unet-nested-skip":
      return renderConceptualUnetNested(spec, theme);
    case "feature-pyramid":
      return renderConceptualFeaturePyramid(spec, theme);
    case "transformer-residual":
      return renderConceptualTransformerResidual(spec, theme);
    case "attention-routing":
      return renderConceptualAttentionRouting(spec, theme);
    case "induction-head":
      return renderConceptualInductionHead(spec, theme);
    case "rnn-unroll":
      return renderConceptualRnnUnroll(spec, theme);
    case "lstm-gates":
      return renderConceptualLstmGates(spec, theme);
    case "gru-gates":
      return renderConceptualGruGates(spec, theme);
    case "gnn-message-passing":
      return renderConceptualGnnMessage(spec, theme);
    case "graphsage-aggregate":
      return renderConceptualGraphSage(spec, theme);
    case "gat-attention":
      return renderConceptualGatAttention(spec, theme);
    case "layer-stack":
      return renderConceptualLayerStack(spec, theme);
    case "energy-profile":
      return renderConceptualEnergyProfile(spec, theme);
    case "band-physics":
      return renderConceptualBandPhysics(spec, theme);
    case "toroidal-system":
      return renderConceptualToroidalSystem(spec, theme);
    case "feedback-cycle":
      return renderConceptualFeedbackCycle(spec, theme);
    case "cross-section":
      return renderConceptualCrossSection(spec, theme);
    case "process-physics":
      return renderConceptualProcessPhysics(spec, theme);
    case "hardware-architecture":
      return renderConceptualHardware(spec, theme);
    case "mechanism-pathway":
    default:
      return renderConceptualPathway(spec, theme);
  }
}

function renderConceptualDiagramShell(args: {
  spec: ConceptualScientificDiagramSpec;
  theme: ScientificDiagramRenderTheme;
}) {
  const serializedSpec = escapeHtml(JSON.stringify(args.spec));
  const noteBackground = withHexAlpha(args.theme.surfaceSecondary, 0.92);
  const leftNote = args.spec.sideNotes.find((note) => note.side === "left") ?? null;
  const rightNote = args.spec.sideNotes.find((note) => note.side === "right") ?? null;
  return `<div class="scientific-diagram-shell" data-html-visual-kind="chart-frame" data-html-fit-role="content" data-html-module-kind="${SCIENTIFIC_DIAGRAM_MODULE_KIND}" data-html-module-label="${escapeHtml(
    SCIENTIFIC_DIAGRAM_LABEL,
  )}" ${SCIENTIFIC_DIAGRAM_SPEC_ATTRIBUTE}="${serializedSpec}" style="position:relative;border:1px solid ${withHexAlpha(
    args.theme.borderSubtle,
    0.94,
  )};border-radius:32px;background:${args.theme.surfacePrimary};padding:24px 32px 28px;min-height:560px;display:flex;flex-direction:column;gap:16px;overflow:hidden;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;">
      <div>
        <div class="scientific-diagram-kicker" style="margin-bottom:10px;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:${args.theme.accentSecondary};">Research figure</div>
        <h3 class="scientific-diagram-title" style="margin:0;font-size:30px;line-height:1.15;font-weight:600;color:${args.theme.textPrimary};max-width:900px;">${escapeHtml(
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
        ${escapeHtml(formatFamilyLabel(args.spec.family))}
      </div>
    </div>
    <div class="scientific-diagram-figure" style="position:relative;flex:1;min-height:380px;padding:6px 0 0;">
      <svg class="scientific-diagram-concept" viewBox="0 0 900 380" role="img" aria-label="${escapeHtml(
        args.spec.title,
      )}" style="display:block;width:100%;height:380px;">
        <defs>
          <marker id="scientific-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="${args.theme.accentPrimary}" />
          </marker>
        </defs>
        ${renderConceptualDiagramVisual(args.spec, args.theme)}
      </svg>
      ${
        leftNote
          ? `<p class="scientific-diagram-side-note scientific-diagram-side-note-left" style="position:absolute;left:0;top:8px;width:164px;margin:0;padding:11px 13px;border:1px solid ${withHexAlpha(
              args.theme.borderSubtle,
              0.88,
            )};background:${noteBackground};font-size:13px;line-height:1.45;color:${args.theme.textMuted};">${escapeHtml(
              leftNote.text,
            )}</p>`
          : ""
      }
      ${
        rightNote
          ? `<p class="scientific-diagram-side-note scientific-diagram-side-note-right" style="position:absolute;right:0;top:36px;width:164px;margin:0;padding:11px 13px;border:1px solid ${withHexAlpha(
              args.theme.borderSubtle,
              0.88,
            )};background:${noteBackground};font-size:13px;line-height:1.45;color:${args.theme.textMuted};">${escapeHtml(
              rightNote.text,
            )}</p>`
          : ""
      }
      <p class="scientific-diagram-bottom-label" style="position:absolute;left:50%;bottom:4px;transform:translateX(-50%);margin:0;font-size:14px;line-height:1.4;color:${args.theme.textMuted};text-align:center;">${escapeHtml(
        args.spec.bottomLabel,
      )}</p>
    </div>
    <div class="scientific-diagram-legend" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;border-top:1px solid ${withHexAlpha(
      args.theme.borderSubtle,
      0.96,
    )};padding-top:12px;font-size:12px;line-height:1.3;color:${args.theme.textMuted};">
      ${args.spec.legendItems
        .slice(0, 4)
        .map(
          (item, index) =>
            `<span style="display:inline-flex;align-items:center;gap:7px;"><span style="width:9px;height:9px;border-radius:50%;background:${
              index === 0 ? args.theme.accentPrimary : index === 1 ? "#4f87a6" : index === 2 ? "#b66a35" : args.theme.textMuted
            };display:inline-block;"></span>${escapeHtml(item)}</span>`,
        )
        .join("")}
    </div>
    <p class="scientific-diagram-caption" style="margin:0;font-size:15px;line-height:1.5;color:${args.theme.textMuted};">${escapeHtml(
      args.spec.caption,
    )}</p>
  </div>`;
}

export function renderScientificDiagramShell(args: {
  spec: ScientificDiagramSpec;
  theme: ScientificDiagramRenderTheme;
}) {
  if (args.spec.family !== "neural-network") {
    return renderConceptualDiagramShell({
      spec: args.spec,
      theme: args.theme,
    });
  }

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
