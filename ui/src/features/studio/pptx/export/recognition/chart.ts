import {
  HTML_CHART_SPEC_ATTRIBUTE,
  parseHtmlChartSpec,
} from "@/features/studio/html-report-data-modules";
import { parseNumericValue } from "../style";

export function hasStructuredChartContract(element: Element) {
  return Boolean(
    parseHtmlChartSpec(element.getAttribute(HTML_CHART_SPEC_ATTRIBUTE)) ||
      element.getAttribute("data-export-chart"),
  );
}

export function findChartContractElement(element: HTMLElement) {
  if (hasStructuredChartContract(element)) {
    return element;
  }

  return (
    Array.from(
      element.querySelectorAll<HTMLElement>(
        [`[${HTML_CHART_SPEC_ATTRIBUTE}]`, "[data-export-chart]"].join(","),
      ),
    ).find((candidate) => hasStructuredChartContract(candidate)) ?? null
  );
}

export function hasSvgChartPrimitives(element: HTMLElement) {
  return Boolean(element.querySelector("svg,canvas"));
}

export function hasAbsoluteBarPrimitives(element: HTMLElement) {
  const absoluteBars = Array.from(
    element.querySelectorAll<HTMLElement>("[style*='position:absolute'],[style*='position: absolute']"),
  ).filter((candidate) => {
    const width = parseNumericValue(candidate.style.width || "");
    const height = parseNumericValue(candidate.style.height || "");
    const bottom = candidate.style.bottom;
    const background = candidate.style.backgroundColor || candidate.style.background;
    return Boolean(bottom && background && width >= 16 && height >= 8 && Math.abs(width - height) > 8);
  });

  return absoluteBars.length >= 3;
}

export function hasBubblePointPrimitives(element: HTMLElement) {
  const bubblePoints = Array.from(
    element.querySelectorAll<HTMLElement>("[style*='border-radius:50%'],[style*='border-radius: 50%']"),
  ).filter((candidate) => {
    const width = parseNumericValue(candidate.style.width || "");
    const height = parseNumericValue(candidate.style.height || "");
    return width >= 20 && Math.abs(width - height) <= 18;
  });

  return bubblePoints.length >= 3;
}

export function hasAxisScaffold(element: HTMLElement) {
  const style = element.style;
  const borderLeft = style.borderLeft || style.border;
  const borderBottom = style.borderBottom || style.border;
  return Boolean(borderLeft && borderBottom && parseNumericValue(style.height || "") >= 80);
}

export function hasUnstructuredChartPrimitives(element: HTMLElement) {
  return (
    hasSvgChartPrimitives(element) ||
    hasAbsoluteBarPrimitives(element) ||
    hasBubblePointPrimitives(element)
  );
}

export function findChartPlotElement(frame: HTMLElement) {
  const candidates = Array.from(
    frame.querySelectorAll<HTMLElement>("[style*='position:relative'],[style*='position: relative']"),
  )
    .filter((candidate) => candidate !== frame)
    .map((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const primitiveScore =
        (hasSvgChartPrimitives(candidate) ? 3 : 0) +
        (hasAbsoluteBarPrimitives(candidate) ? 3 : 0) +
        (hasBubblePointPrimitives(candidate) ? 3 : 0) +
        (hasAxisScaffold(candidate) ? 1 : 0);
      return {
        element: candidate,
        rect,
        primitiveScore,
        area: rect.width * rect.height,
      };
    })
    .filter((candidate) => candidate.rect.width >= 140 && candidate.rect.height >= 70 && candidate.primitiveScore > 0)
    .sort((left, right) => {
      if (right.primitiveScore !== left.primitiveScore) {
        return right.primitiveScore - left.primitiveScore;
      }
      return left.area - right.area;
    });

  return candidates[0]?.element ?? null;
}
