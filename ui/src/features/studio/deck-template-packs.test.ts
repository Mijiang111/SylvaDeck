import test from "node:test";
import assert from "node:assert/strict";
import {
  appendDeckTemplatePackPublishArtifact,
  loadDeckTemplatePacks,
  saveDeckTemplatePack,
  validateDeckTemplatePack,
} from "./deck-template-packs";
import type { DeckTemplatePack } from "./types";

function createPack(overrides?: Partial<DeckTemplatePack>): DeckTemplatePack {
  return {
    id: "deck-pack.test.alpha",
    label: "Imported alpha deck",
    sourceFileName: "alpha-deck.pptx",
    pageWidth: 1600,
    pageHeight: 900,
    pages: [
      {
        id: "pack-page-1",
        pageNumber: 1,
        title: "Cover page",
        background: "#FFFFFF",
        sourceObjects: [],
        semanticSlots: [
          {
            id: "slot-title",
            kind: "ai-text",
            label: "Page title",
            role: "page-title",
            sourceObjectIds: ["object-title"],
            required: true,
            canHide: false,
            notes: "Recovered from imported title region.",
          },
        ],
        semanticDecorations: [],
        unresolvedObjectIds: [],
        warnings: [],
        pageRole: "cover",
        reusablePattern: "editorial cover",
        briefHint: "Use this page to establish the deck premise.",
        editableRule: "semantic-only",
      },
    ],
    publishArtifacts: [],
    createdAt: "2026-04-19T00:00:00.000Z",
    updatedAt: "2026-04-19T00:00:00.000Z",
    ...overrides,
  };
}

function installWindowLocalStorage() {
  const store = new Map<string, string>();
  const previousWindow = (globalThis as { window?: unknown }).window;

  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem(key: string) {
        return store.has(key) ? store.get(key)! : null;
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
      removeItem(key: string) {
        store.delete(key);
      },
      clear() {
        store.clear();
      },
    },
  };

  return () => {
    if (typeof previousWindow === "undefined") {
      delete (globalThis as { window?: unknown }).window;
      return;
    }
    (globalThis as { window?: unknown }).window = previousWindow;
  };
}

test("validateDeckTemplatePack blocks unresolved objects and missing semantic slots", () => {
  const validation = validateDeckTemplatePack(
    createPack({
      pages: [
        {
          id: "pack-page-1",
          pageNumber: 1,
          title: "Needs review",
          background: "#FFFFFF",
          sourceObjects: [],
          semanticSlots: [],
          semanticDecorations: [],
          unresolvedObjectIds: ["object-unsupported"],
          warnings: [
            {
              id: "warning-1",
              severity: "blocking",
              message: "Unsupported SmartArt still needs manual review.",
              sourceObjectIds: ["object-unsupported"],
            },
          ],
          pageRole: "content",
          reusablePattern: "review page",
          briefHint: "Resolve ambiguous imports before publish.",
          editableRule: "semantic-only",
        },
      ],
    }),
  );

  assert.equal(validation.blockingIssues.length, 3);
  assert.equal(
    validation.blockingIssues.some((issue) => issue.includes("unresolved object")),
    true,
  );
  assert.equal(
    validation.blockingIssues.some((issue) => issue.includes("at least one editable semantic slot")),
    true,
  );
});

test("deck pack storage round-trips and publish artifacts preserve status", () => {
  const restoreWindow = installWindowLocalStorage();

  try {
    const saved = saveDeckTemplatePack(createPack());
    assert.equal(loadDeckTemplatePacks().length, 1);
    assert.equal(loadDeckTemplatePacks()[0]?.id, saved.id);

    const published = appendDeckTemplatePackPublishArtifact({
      packId: saved.id,
      versionNote: "First import baseline",
    });

    assert.ok(published);
    assert.equal(published?.publishArtifacts.length, 1);
    assert.equal(published?.publishArtifacts[0]?.result, "published");
    assert.equal(loadDeckTemplatePacks()[0]?.publishArtifacts[0]?.versionNote, "First import baseline");
  } finally {
    restoreWindow();
  }
});
