import {
  BLOCK_KIND_PRESETS,
  GRID_COLUMNS,
  GRID_GAP,
  GRID_ROWS,
  getDefaultModuleRegistryEntry,
} from "./config";
import type { BlockKind, DragState, LayoutBlock, LayoutPage, ModuleRegistryEntry } from "./types";

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function blocksOverlap(a: LayoutBlock, b: LayoutBlock) {
  const leftA = a.x - 1;
  const rightA = leftA + a.w;
  const topA = a.y - 1;
  const bottomA = topA + a.h;
  const leftB = b.x - 1;
  const rightB = leftB + b.w;
  const topB = b.y - 1;
  const bottomB = topB + b.h;

  return leftA < rightB && leftB < rightA && topA < bottomB && topB < bottomA;
}

function retitleBlock(block: LayoutBlock, nextKind: BlockKind, nextLabel?: string) {
  if (nextLabel) {
    return `${nextLabel} module`;
  }

  const baseTitle = block.title
    .replace(
      /\b(metrics?|bars?|bar chart|trend|line|matrix|logic|flow|gantt|phases?|cards?|summary)\b/gi,
      "",
    )
    .replace(/\s{2,}/g, " ")
    .replace(/[-:]\s*$/, "")
    .trim();

  if (!baseTitle) {
    return `${BLOCK_KIND_PRESETS[nextKind].label} module`;
  }

  return `${baseTitle} ${BLOCK_KIND_PRESETS[nextKind].suffix}`
    .replace(/\s+/g, " ")
    .trim();
}

function resolveEntry(kindOrEntry: BlockKind | ModuleRegistryEntry) {
  return typeof kindOrEntry === "string"
    ? getDefaultModuleRegistryEntry(kindOrEntry)
    : kindOrEntry;
}

export function blockForKind(block: LayoutBlock, nextKind: BlockKind) {
  const entry = getDefaultModuleRegistryEntry(nextKind);
  return blockForModule(block, entry);
}

export function blockForModule(block: LayoutBlock, kindOrEntry: BlockKind | ModuleRegistryEntry) {
  const entry = resolveEntry(kindOrEntry);
  const preset = BLOCK_KIND_PRESETS[entry.kind];
  const x = clamp(block.x, 1, GRID_COLUMNS);
  const y = clamp(block.y, 1, GRID_ROWS);
  const w = clamp(Math.max(block.w, preset.minW), preset.minW, GRID_COLUMNS - x + 1);
  const h = clamp(Math.max(block.h, preset.minH), preset.minH, GRID_ROWS - y + 1);

  return {
    ...block,
    moduleId: entry.id,
    title: retitleBlock(block, entry.kind, entry.label),
    detail: entry.description || preset.detail,
    kind: entry.kind,
    tone: preset.tone,
    minW: preset.minW,
    minH: preset.minH,
    w,
    h,
    visualScale: preset.defaultScale,
  };
}

function findOpenPlacement(blocks: LayoutBlock[], width: number, height: number) {
  for (let y = 1; y <= GRID_ROWS - height + 1; y += 1) {
    for (let x = 1; x <= GRID_COLUMNS - width + 1; x += 1) {
      const candidate: LayoutBlock = {
        id: "candidate",
        title: "",
        detail: "",
        intent: "",
        kind: "metrics",
        tone: "teal",
        x,
        y,
        w: width,
        h: height,
        minW: width,
        minH: height,
        visualScale: 1,
      };

      if (!blocks.some((block) => blocksOverlap(candidate, block))) {
        return { x, y, w: width, h: height };
      }
    }
  }

  return null;
}

export function createBlockForKind(page: LayoutPage, kind: BlockKind) {
  const entry = getDefaultModuleRegistryEntry(kind);
  return createBlockForModule(page, entry);
}

export function createBlockForModule(page: LayoutPage, kindOrEntry: BlockKind | ModuleRegistryEntry) {
  const entry = resolveEntry(kindOrEntry);
  const preset = BLOCK_KIND_PRESETS[entry.kind];
  const placement =
    findOpenPlacement(page.blocks, preset.defaultW, preset.defaultH) ??
    findOpenPlacement(page.blocks, preset.minW, preset.minH) ?? {
      x: 1,
      y: 1,
      w: preset.minW,
      h: preset.minH,
    };

  return {
    id: `${page.id}-${entry.kind}-${Date.now().toString(36)}`,
    moduleId: entry.id,
    title: `${entry.label} module`,
    detail: entry.description || preset.detail,
    intent: "",
    kind: entry.kind,
    tone: preset.tone,
    x: placement.x,
    y: placement.y,
    w: placement.w,
    h: placement.h,
    minW: preset.minW,
    minH: preset.minH,
    visualScale: preset.defaultScale,
  } satisfies LayoutBlock;
}

export function applyDragToPages(
  currentPages: LayoutPage[],
  dragState: DragState,
  clientX: number,
  clientY: number,
) {
  const columnWidth =
    (dragState.canvasWidth - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
  const rowHeight =
    (dragState.canvasHeight - GRID_GAP * (GRID_ROWS - 1)) / GRID_ROWS;
  const deltaColumns = Math.round(
    (clientX - dragState.startX) / (columnWidth + GRID_GAP),
  );
  const deltaRows = Math.round(
    (clientY - dragState.startY) / (rowHeight + GRID_GAP),
  );

  return currentPages.map((page) => {
    if (page.id !== dragState.pageId) {
      return page;
    }

    return {
      ...page,
      blocks: page.blocks.map((block) => {
        if (block.id !== dragState.blockId) {
          return block;
        }

        if (dragState.mode === "move") {
          const x = clamp(
            dragState.initialX + deltaColumns,
            1,
            GRID_COLUMNS - dragState.initialW + 1,
          );
          const y = clamp(
            dragState.initialY + deltaRows,
            1,
            GRID_ROWS - dragState.initialH + 1,
          );
          return { ...block, x, y };
        }

        const w = clamp(
          dragState.initialW + deltaColumns,
          block.minW,
          GRID_COLUMNS - dragState.initialX + 1,
        );
        const h = clamp(
          dragState.initialH + deltaRows,
          block.minH,
          GRID_ROWS - dragState.initialY + 1,
        );
        return { ...block, w, h };
      }),
    };
  });
}

export function updateBlockInPages(
  currentPages: LayoutPage[],
  activePageId: string,
  blockId: string,
  updater: (block: LayoutBlock) => LayoutBlock,
) {
  return currentPages.map((page) => {
    if (page.id !== activePageId) {
      return page;
    }
    return {
      ...page,
      blocks: page.blocks.map((block) =>
        block.id === blockId ? updater(block) : block,
      ),
    };
  });
}

export function addBlockToPages(
  currentPages: LayoutPage[],
  activePageId: string,
  kindOrEntry: BlockKind | ModuleRegistryEntry,
) {
  let addedBlockId: string | null = null;

  const pages = currentPages.map((page) => {
    if (page.id !== activePageId) {
      return page;
    }

    const nextBlock = createBlockForModule(page, kindOrEntry);
    addedBlockId = nextBlock.id;
    return { ...page, blocks: [...page.blocks, nextBlock] };
  });

  return { pages, addedBlockId };
}

export function deleteBlockFromPages(
  currentPages: LayoutPage[],
  activePageId: string,
  blockId: string,
) {
  return currentPages.map((page) =>
    page.id === activePageId
      ? { ...page, blocks: page.blocks.filter((block) => block.id !== blockId) }
      : page,
  );
}

export function findOverlapPairs(page: LayoutPage | null | undefined) {
  if (!page) {
    return [] as Array<[string, string]>;
  }

  const pairs: Array<[string, string]> = [];
  for (let index = 0; index < page.blocks.length; index += 1) {
    for (let next = index + 1; next < page.blocks.length; next += 1) {
      if (blocksOverlap(page.blocks[index], page.blocks[next])) {
        pairs.push([page.blocks[index].id, page.blocks[next].id]);
      }
    }
  }

  return pairs;
}
