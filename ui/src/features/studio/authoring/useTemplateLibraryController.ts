import { useEffect, useMemo, useState } from "react";
import { MODULE_LIBRARY_COLLECTIONS } from "@/features/studio/config";
import type { ModuleRegistryEntry } from "@/features/studio/types";
import { isLibraryCollectionMatch } from "./helpers";
import {
  MAX_RECENT_MODULES,
  MODULE_LIBRARY_RECENTS_STORAGE_KEY,
} from "./authoring-constants";

type UseTemplateLibraryControllerInput = {
  availableModules: ModuleRegistryEntry[];
  draft: ModuleRegistryEntry;
};

export function useTemplateLibraryController({
  availableModules,
  draft,
}: UseTemplateLibraryControllerInput) {
  const [searchQuery, setSearchQuery] = useState("");
  const [recentModuleIds, setRecentModuleIds] = useState<string[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    try {
      const raw = window.localStorage.getItem(
        MODULE_LIBRARY_RECENTS_STORAGE_KEY
      );
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : [];
    } catch {
      return [];
    }
  });
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCollection, setSelectedCollection] =
    useState<(typeof MODULE_LIBRARY_COLLECTIONS)[number]["id"]>("featured");

  const filteredModules = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return availableModules
      .filter((entry) => isLibraryCollectionMatch(entry, selectedCollection))
      .filter((entry) => {
        if (!query) return true;
        const haystack = [
          entry.label,
          entry.description,
          entry.semanticRole,
          entry.family,
          entry.category,
          ...entry.useCases,
          ...entry.searchTerms,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });
  }, [availableModules, searchQuery, selectedCollection]);

  const recentModules = useMemo(
    () =>
      recentModuleIds
        .map(
          (moduleId) =>
            availableModules.find((entry) => entry.id === moduleId) ?? null
        )
        .filter((entry): entry is ModuleRegistryEntry => Boolean(entry)),
    [availableModules, recentModuleIds]
  );

  const recommendedBaseModules = useMemo(() => {
    const scoredEntries = availableModules
      .filter((entry) => entry.id !== draft.id)
      .map((entry) => ({
        entry,
        score:
          (entry.family === draft.family ? 3 : 0) +
          (entry.category === draft.category ? 2 : 0) +
          (entry.kind === draft.kind ? 2 : 0) +
          (isLibraryCollectionMatch(entry, "featured") ? 2 : 0) +
          (entry.scope === "core" ? 1 : 0),
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.entry.label.localeCompare(right.entry.label)
      );

    const preferred = scoredEntries
      .filter(
        ({ entry, score }) => score > 0 && !recentModuleIds.includes(entry.id)
      )
      .map(({ entry }) => entry);
    const fallback = scoredEntries
      .filter(({ entry }) => !recentModuleIds.includes(entry.id))
      .map(({ entry }) => entry);

    return [...preferred, ...fallback]
      .filter(
        (entry, index, collection) =>
          collection.findIndex((candidate) => candidate.id === entry.id) ===
          index
      )
      .slice(0, 4);
  }, [
    availableModules,
    draft.category,
    draft.family,
    draft.id,
    draft.kind,
    recentModuleIds,
  ]);

  function markRecent(moduleId: string) {
    setRecentModuleIds((current) =>
      [moduleId, ...current.filter((entryId) => entryId !== moduleId)].slice(
        0,
        MAX_RECENT_MODULES
      )
    );
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        MODULE_LIBRARY_RECENTS_STORAGE_KEY,
        JSON.stringify(recentModuleIds.slice(0, MAX_RECENT_MODULES))
      );
    } catch {
      // Keep the in-memory recents list usable when storage is unavailable.
    }
  }, [recentModuleIds]);

  return {
    isOpen,
    searchQuery,
    selectedCollection,
    filteredModules,
    recentModules,
    recommendedBaseModules,
    setSearchQuery,
    setSelectedCollection,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    markRecent,
  };
}
