import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { Textarea } from "@/components/ui/textarea";
import { WorkbenchStudioVirtualList } from "./WorkbenchStudioVirtual";

type InspectorAction = {
  id: string;
  label: string;
  onPress: () => void;
  tone?: "default" | "danger";
};

export type InspectorField =
  | {
      id: string;
      kind: "text" | "textarea";
      label: string;
      value: string;
      placeholder?: string;
      description?: string;
      onChange: (value: string) => void;
      debounceMs?: number;
    }
  | {
      id: string;
      kind: "number";
      label: string;
      value: number;
      min?: number;
      max?: number;
      step?: number;
      description?: string;
      onChange: (value: number) => void;
      debounceMs?: number;
    }
  | {
      id: string;
      kind: "range";
      label: string;
      value: number;
      min: number;
      max: number;
      step?: number;
      description?: string;
      onChange: (value: number) => void;
    }
  | {
      id: string;
      kind: "color";
      label: string;
      value: string;
      description?: string;
      onChange: (value: string) => void;
    }
  | {
      id: string;
      kind: "select";
      label: string;
      value: string;
      description?: string;
      options: Array<{
        value: string;
        label: string;
      }>;
      onChange: (value: string) => void;
    }
  | {
      id: string;
      kind: "readonly";
      label: string;
      value: string;
      description?: string;
    }
  | {
      id: string;
      kind: "actions";
      label: string;
      description?: string;
      actions: InspectorAction[];
    };

export type InspectorSection = {
  id: string;
  title: string;
  description?: string;
  fields: InspectorField[];
};

export type InspectorSchema = {
  id: string;
  title: string;
  description?: string;
  sections: InspectorSection[];
  emptyState?: string;
};

type FlatInspectorRow =
  | {
      id: string;
      kind: "section";
      title: string;
      description?: string;
    }
  | {
      id: string;
      kind: "field";
      field: InspectorField;
    };

function useDebouncedValue<T>(value: T, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [delay, value]);

  return debouncedValue;
}

function DebouncedTextInput({
  identity,
  value,
  placeholder,
  onChange,
  multiline = false,
  debounceMs = 280,
}: {
  identity: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  debounceMs?: number;
}) {
  const [draft, setDraft] = useState(value);
  const identityRef = useRef(identity);
  const skipCommitRef = useRef(false);
  const debouncedDraft = useDebouncedValue(draft, debounceMs);

  useEffect(() => {
    if (identityRef.current !== identity) {
      identityRef.current = identity;
      skipCommitRef.current = true;
    }
    setDraft(value);
  }, [identity, value]);

  useEffect(() => {
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      return;
    }
    if (debouncedDraft !== value) {
      onChange(debouncedDraft);
    }
  }, [debouncedDraft, onChange, value]);

  if (multiline) {
    return (
      <Textarea
        value={draft}
        data-testid={`inspector-textarea-${identity}`}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDraft(event.target.value)}
        placeholder={placeholder}
        className="min-h-[120px] border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-3 py-3 text-[13px] leading-6 text-[var(--studio-ink)] placeholder:text-[var(--studio-muted)]"
      />
    );
  }

  return (
    <input
      value={draft}
      data-testid={`inspector-text-${identity}`}
      onChange={(event) => setDraft(event.target.value)}
      placeholder={placeholder}
      className="h-10 w-full border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-3 text-[13px] text-[var(--studio-ink)] outline-none transition focus:border-[rgba(0,242,255,0.35)]"
    />
  );
}

function DebouncedNumberInput({
  identity,
  value,
  min,
  max,
  step = 1,
  onChange,
  debounceMs = 220,
}: {
  identity: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  debounceMs?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  const identityRef = useRef(identity);
  const skipCommitRef = useRef(false);
  const debouncedDraft = useDebouncedValue(draft, debounceMs);

  useEffect(() => {
    if (identityRef.current !== identity) {
      identityRef.current = identity;
      skipCommitRef.current = true;
    }
    setDraft(String(value));
  }, [identity, value]);

  useEffect(() => {
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      return;
    }
    const nextValue = Number(debouncedDraft);
    if (!Number.isFinite(nextValue) || nextValue === value) {
      return;
    }
    onChange(nextValue);
  }, [debouncedDraft, onChange, value]);

  return (
    <input
      type="number"
      value={draft}
      data-testid={`inspector-number-${identity}`}
      min={min}
      max={max}
      step={step}
      onChange={(event) => setDraft(event.target.value)}
      className="h-10 w-full border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-3 text-[13px] text-[var(--studio-ink)] outline-none transition focus:border-[rgba(0,242,255,0.35)]"
    />
  );
}

function renderField(field: InspectorField): ReactNode {
  if (field.kind === "text") {
    return (
      <DebouncedTextInput
        identity={field.id}
        value={field.value}
        placeholder={field.placeholder}
        onChange={field.onChange}
        debounceMs={field.debounceMs}
      />
    );
  }

  if (field.kind === "textarea") {
    return (
      <DebouncedTextInput
        identity={field.id}
        value={field.value}
        placeholder={field.placeholder}
        onChange={field.onChange}
        debounceMs={field.debounceMs}
        multiline
      />
    );
  }

  if (field.kind === "number") {
    return (
      <DebouncedNumberInput
        identity={field.id}
        value={field.value}
        min={field.min}
        max={field.max}
        step={field.step}
        onChange={field.onChange}
        debounceMs={field.debounceMs}
      />
    );
  }

  if (field.kind === "range") {
    return (
      <div className="flex items-center gap-3">
        <input
          type="range"
          data-testid={`inspector-range-${field.id}`}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={field.value}
          onChange={(event) => field.onChange(Number(event.target.value))}
          className="h-2 flex-1 accent-[#00f2ff]"
        />
        <div className="w-12 text-right text-[12px] font-semibold tabular-nums text-[var(--studio-muted-strong)]">
          {field.value}
        </div>
      </div>
    );
  }

  if (field.kind === "color") {
    return (
      <div className="flex items-center gap-3">
        <input
          type="color"
          data-testid={`inspector-color-picker-${field.id}`}
          value={field.value || "#ffffff"}
          onChange={(event) => field.onChange(event.target.value)}
          className="h-10 w-12 border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-1 py-1"
        />
        <input
          value={field.value}
          data-testid={`inspector-color-value-${field.id}`}
          onChange={(event) => field.onChange(event.target.value)}
          className="h-10 flex-1 border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-3 text-[13px] text-[var(--studio-ink)] outline-none transition focus:border-[rgba(0,242,255,0.35)]"
        />
      </div>
    );
  }

  if (field.kind === "select") {
    return (
      <select
        value={field.value}
        data-testid={`inspector-select-${field.id}`}
        onChange={(event) => field.onChange(event.target.value)}
        className="h-10 w-full border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-3 text-[13px] text-[var(--studio-ink)] outline-none transition focus:border-[rgba(0,242,255,0.35)]"
      >
        {field.options.map((option) => (
          <option key={`${field.id}-${option.value || "empty"}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.kind === "readonly") {
    return (
      <div className="border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-3 py-3 text-[13px] leading-6 text-[var(--studio-muted-strong)]">
        {field.value}
      </div>
    );
  }

  if (field.kind !== "actions") {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {field.actions.map((action: InspectorAction) => (
        <button
          key={action.id}
          type="button"
          onClick={action.onPress}
          data-testid={`inspector-action-${action.id}`}
          className={[
            "inline-flex h-9 items-center border px-3 text-[11px] font-medium tracking-[0.02em] transition",
            action.tone === "danger"
              ? "border-[rgba(255,120,120,0.28)] text-[#ffc4c4] hover:bg-[rgba(255,120,120,0.08)]"
              : "border-[var(--studio-line)] text-[var(--studio-ink)] hover:border-[rgba(0,242,255,0.22)] hover:bg-[rgba(0,242,255,0.06)]",
          ].join(" ")}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

function flattenSchema(schema: InspectorSchema): FlatInspectorRow[] {
  return schema.sections.flatMap((section) => [
    {
      id: `${section.id}-section`,
      kind: "section" as const,
      title: section.title,
      description: section.description,
    },
    ...section.fields.map((field) => ({
      id: field.id,
      kind: "field" as const,
      field,
    })),
  ]);
}

export function WorkbenchStudioInspector({
  schema,
}: {
  schema: InspectorSchema | null;
}) {
  if (!schema) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-[var(--studio-line-soft)] pb-3">
          <div className="text-[14px] font-semibold text-[var(--studio-ink)]">Nothing selected</div>
        </div>
        <div className="pt-3 text-[13px] leading-6 text-[var(--studio-muted-strong)]">
          Pick a page, block, visual module, or layout zone to edit it here.
        </div>
      </div>
    );
  }

  const rows = flattenSchema(schema);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-[var(--studio-line-soft)] pb-3">
        <div className="text-[14px] font-semibold text-[var(--studio-ink)]">{schema.title}</div>
        {schema.description ? (
          <div className="mt-1 text-[12px] leading-5 text-[var(--studio-muted-strong)]">{schema.description}</div>
        ) : null}
      </div>

      <WorkbenchStudioVirtualList
        items={rows}
        itemKey={(item) => item.id}
        estimateSize={86}
        threshold={9}
        height="100%"
        className="pr-1 pt-2"
        renderItem={(item) => {
          if (item.kind === "section") {
            return (
              <div className="border-b border-[var(--studio-line-soft)] py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                  {item.title}
                </div>
                {item.description ? (
                  <div className="mt-1 text-[12px] leading-5 text-[var(--studio-muted-strong)]">
                    {item.description}
                  </div>
                ) : null}
              </div>
            );
          }

          const field = item.field;
          return (
            <div className="border-b border-[var(--studio-line-soft)] py-3">
              <div className="mb-2">
                <div className="text-[12px] font-semibold text-[var(--studio-ink)]">{field.label}</div>
                {field.description ? (
                  <div className="mt-1 text-[12px] leading-5 text-[var(--studio-muted-strong)]">
                    {field.description}
                  </div>
                ) : null}
              </div>
              {renderField(field)}
            </div>
          );
        }}
      />
    </div>
  );
}
