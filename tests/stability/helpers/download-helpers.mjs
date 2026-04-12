import fs from "node:fs/promises";
import JSZip from "jszip";

function decodeXmlEntities(text) {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

export async function readDownloadedText(download) {
  const filePath = await download.path();
  if (!filePath) {
    throw new Error("Download did not resolve to a local file path.");
  }
  return fs.readFile(filePath, "utf8");
}

export async function readDownloadedPptx(download) {
  const filePath = await download.path();
  if (!filePath) {
    throw new Error("PPTX download did not resolve to a local file path.");
  }
  const raw = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(raw);
  const slideEntries = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const slideXml = await Promise.all(
    slideEntries.map(async (name) => ({
      name,
      xml: await zip.file(name).async("string"),
    })),
  );
  const slideTexts = slideXml.map(({ name, xml }) => ({
    name,
    text: Array.from(xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g))
      .map((match) => decodeXmlEntities(match[1] ?? ""))
      .join(" "),
  }));
  return {
    slideCount: slideEntries.length,
    slideTexts,
    combinedText: slideTexts.map((entry) => entry.text).join(" "),
  };
}
