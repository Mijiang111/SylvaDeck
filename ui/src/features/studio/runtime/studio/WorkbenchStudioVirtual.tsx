import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export function WorkbenchStudioVirtualList<T>({
  items,
  itemKey,
  estimateSize,
  overscan = 6,
  threshold = 10,
  height,
  className,
  renderItem,
}: {
  items: T[];
  itemKey: (item: T, index: number) => string;
  estimateSize: number;
  overscan?: number;
  threshold?: number;
  height: number | string;
  className?: string;
  renderItem: (item: T, index: number) => ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const shouldVirtualize = items.length > threshold;
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  if (!shouldVirtualize) {
    return (
      <div className={className} style={{ maxHeight: height }}>
        {items.map((item, index) => (
          <div key={itemKey(item, index)}>{renderItem(item, index)}</div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className={className}
      style={{ height, overflowY: "auto", overscrollBehavior: "contain" }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: "relative",
          width: "100%",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={itemKey(items[virtualItem.index], virtualItem.index)}
            style={{
              left: 0,
              position: "absolute",
              top: 0,
              transform: `translateY(${virtualItem.start}px)`,
              width: "100%",
            }}
          >
            {renderItem(items[virtualItem.index], virtualItem.index)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function WorkbenchStudioVirtualRail<T>({
  items,
  itemKey,
  estimateSize,
  overscan = 8,
  threshold = 10,
  className,
  renderItem,
}: {
  items: T[];
  itemKey: (item: T, index: number) => string;
  estimateSize: number;
  overscan?: number;
  threshold?: number;
  className?: string;
  renderItem: (item: T, index: number) => ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const shouldVirtualize = items.length > threshold;
  const virtualizer = useVirtualizer({
    count: items.length,
    horizontal: true,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  if (!shouldVirtualize) {
    return (
      <div className={className}>
        <div className="flex min-w-max items-center gap-2">
          {items.map((item, index) => (
            <div key={itemKey(item, index)}>{renderItem(item, index)}</div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className={className}
      style={{ overflowX: "auto", overflowY: "hidden", overscrollBehavior: "contain" }}
    >
      <div
        style={{
          height: "100%",
          position: "relative",
          width: `${virtualizer.getTotalSize()}px`,
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={itemKey(items[virtualItem.index], virtualItem.index)}
            style={{
              left: 0,
              position: "absolute",
              top: 0,
              transform: `translateX(${virtualItem.start}px)`,
            }}
          >
            {renderItem(items[virtualItem.index], virtualItem.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
