"use client";

/**
 * The public form (docs/specs/module-forms.md §6).
 *
 * One scrolling column of numbered sections — the shape the approved prototype proved, rebuilt on
 * the platform's design system. Three promises to the prospect:
 *
 *  1. Nothing is lost: every change is written to this device, so closing the tab is safe.
 *  2. Nothing is hidden: the required questions are marked, and submitting scrolls to the first
 *     one that is still empty rather than failing quietly.
 *  3. There is always a way to reach us: when the brief is sent — and also when sending fails —
 *     the prospect gets the brief as copyable text plus the WhatsApp and email handoff.
 *
 * The saved answers are read with `useSyncExternalStore`, the way the sidebar reads its collapsed
 * state: storage is an external system, so the server renders an empty form and this device's own
 * answers arrive at hydration without a state-setting effect.
 */

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type SyntheticEvent,
} from "react";
import { Check, Copy, Mail, MessageCircle } from "lucide-react";

import type { FormAnswer, FormAnswers, FormDefinition } from "@/contracts/forms";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

import {
  answeredCount,
  missingRequired,
  normalizeAnswers,
  questionCount,
} from "../../core/answers";
import { renderBrief } from "../../core/brief";
import { Field } from "./fields";

export type SubmitFormResponse =
  | { ok: true; data: { submissionId: string } }
  | { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } };

export interface FormViewProps {
  definition: FormDefinition;
  /** The server action on the public page. Plain data in, plain data out. */
  submit: (input: {
    slug: string;
    version: number;
    answers: FormAnswers;
  }) => Promise<SubmitFormResponse>;
}

const REQUIRED_MESSAGE = "We need this one to start.";

function storageKey(definition: FormDefinition): string {
  return `futureuni-form:${definition.slug}:v${String(definition.version)}`;
}

/**
 * Never changes, so `useSyncExternalStore` returns the client snapshot once and never again. It
 * is how this file asks "has the browser taken over yet?" without setting state in an effect.
 */
const noopSubscribe = (): (() => void) => () => undefined;

/** Another tab may hold the same form open; its writes reach this one as a storage event. */
function subscribeStorage(listener: () => void): () => void {
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener("storage", listener);
  };
}

/**
 * The raw saved value — a string or null, not a parsed object: `useSyncExternalStore` compares
 * snapshots by identity, and a fresh object on every read would re-render forever.
 */
function readSaved(definition: FormDefinition): string | null {
  try {
    return window.localStorage.getItem(storageKey(definition));
  } catch {
    // A private window or blocked storage: the form works, it just won't remember.
    return null;
  }
}

function writeSaved(definition: FormDefinition, answers: FormAnswers): void {
  try {
    window.localStorage.setItem(storageKey(definition), JSON.stringify(answers));
  } catch {
    // Remembering is a convenience, never a requirement.
  }
}

function clearSaved(definition: FormDefinition): void {
  try {
    window.localStorage.removeItem(storageKey(definition));
  } catch {
    // Nothing to clean up.
  }
}

/** The keys the action reported as unanswered, if it reported any. */
function invalidFields(details: Record<string, unknown> | undefined): readonly string[] {
  const fields = details?.fields;
  return Array.isArray(fields)
    ? fields.filter((key): key is string => typeof key === "string")
    : [];
}

export function FormView({ definition, submit }: FormViewProps) {
  // What this device remembers. Null on the server, so the first paint never depends on storage.
  const savedRaw = useSyncExternalStore(
    subscribeStorage,
    () => readSaved(definition),
    () => null,
  );
  const saved = useMemo<FormAnswers>(() => {
    if (savedRaw === null) return {};
    try {
      return normalizeAnswers(definition, JSON.parse(savedRaw));
    } catch {
      return {};
    }
  }, [definition, savedRaw]);

  // What the prospect has typed in this session. It wins over what was saved.
  const [edited, setEdited] = useState<FormAnswers | null>(null);
  const answers = edited ?? saved;

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // Until React has hydrated this form, its onSubmit handler is not attached: a tap on the button
  // would be a plain browser submit, which navigates away with the answers in the query string
  // instead of sending the brief. On a slow phone that window is real, so the button waits.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const total = useMemo(() => questionCount(definition), [definition]);
  const answered = answeredCount(definition, answers);

  const setAnswer = useCallback(
    (key: string, value: FormAnswer) => {
      setEdited((current) => {
        const next = { ...(current ?? saved), [key]: value };
        writeSaved(definition, next);
        return next;
      });
      setErrors((current) =>
        current[key] === undefined
          ? current
          : Object.fromEntries(Object.entries(current).filter(([field]) => field !== key)),
      );
    },
    [definition, saved],
  );

  function focusFirstError(keys: readonly string[]): void {
    const first = keys[0];
    if (first === undefined) return;
    const container = formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`);
    container?.scrollIntoView({ block: "center", behavior: "smooth" });
    container?.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true });
  }

  function onSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (sending) return;

    const cleaned = normalizeAnswers(definition, answers);
    const missing = missingRequired(definition, cleaned);
    if (missing.length > 0) {
      setErrors(Object.fromEntries(missing.map((field) => [field.key, REQUIRED_MESSAGE])));
      focusFirstError(missing.map((field) => field.key));
      return;
    }

    setFailure(null);
    startSending(async () => {
      const result = await submit({
        slug: definition.slug,
        version: definition.version,
        answers: cleaned,
      });

      if (result.ok) {
        clearSaved(definition);
        setSent(true);
        return;
      }

      const fields = invalidFields(result.error.details);
      if (fields.length > 0) {
        setErrors(Object.fromEntries(fields.map((key) => [key, REQUIRED_MESSAGE])));
        focusFirstError(fields);
        return;
      }
      setFailure(result.error.message);
    });
  }

  const brief = useMemo(() => renderBrief(definition, answers), [definition, answers]);
  const errorCount = Object.keys(errors).length;

  if (sent) {
    return (
      <Outcome
        tone="success"
        title={definition.closing.title}
        body={definition.closing.body}
        definition={definition}
        brief={brief}
      />
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {failure !== null && (
        <Outcome
          tone="failure"
          title="We could not send that from here"
          body={[
            failure,
            "Nothing you wrote is lost — it is still on this page and saved on this device. Copy the brief below and send it to us, and we will take it from there.",
          ]}
          definition={definition}
          brief={brief}
        />
      )}

      <p className="text-sm text-muted" aria-live="polite">
        <span className="font-mono tabular-nums">
          {answered} of {total}
        </span>{" "}
        answered
        {answered > 0 && " · saved on this device"}
      </p>

      <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-12">
        {definition.sections.map((section, index) => (
          <section
            key={section.key}
            className="flex flex-col gap-5"
            aria-labelledby={`s-${section.key}`}
          >
            <header className="flex flex-col gap-2">
              <p className="font-mono text-xs font-semibold tracking-[0.12em] text-primary uppercase">
                {String(index + 1).padStart(2, "0")} / {String(definition.sections.length)}
              </p>
              <h2
                id={`s-${section.key}`}
                className="font-display text-2xl font-semibold text-heading"
              >
                {section.title}
              </h2>
              {section.intro !== undefined && (
                <p className="max-w-prose text-muted">{section.intro}</p>
              )}
            </header>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {section.fields.map((field) => (
                <Field
                  key={field.key}
                  field={field}
                  value={answers[field.key]}
                  error={errors[field.key] ?? null}
                  onChange={(value) => {
                    setAnswer(field.key, value);
                  }}
                />
              ))}
            </div>

            {section.note !== undefined && (
              <p className="max-w-prose rounded-md bg-zone px-4 py-3 text-sm text-foreground">
                {section.note}
              </p>
            )}
          </section>
        ))}

        <div className="flex flex-col gap-4 border-t border-border pt-8">
          {errorCount > 0 && (
            <p role="alert" className="text-sm font-medium text-danger">
              {errorCount === 1
                ? "One required question still needs an answer."
                : `${String(errorCount)} required questions still need an answer.`}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" loading={sending} disabled={!hydrated}>
              {sending ? "Sending" : "Finish and send"}
            </Button>
            <ClearButton
              onClear={() => {
                setEdited({});
                setErrors({});
                clearSaved(definition);
                formRef.current?.scrollIntoView({ block: "start" });
              }}
            />
          </div>
          <p className="text-sm text-muted">
            Your answers go straight to the FUTUREUNI team. We do not share them with anyone else.
          </p>
        </div>
      </form>
    </div>
  );
}

/** Two taps to clear, so a full brief is never wiped by accident. */
function ClearButton({ onClear }: { onClear: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button
        variant="ghost"
        onClick={() => {
          setConfirming(true);
        }}
      >
        Clear the form
      </Button>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <Button
        variant="danger"
        onClick={() => {
          setConfirming(false);
          onClear();
        }}
      >
        Clear everything
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          setConfirming(false);
        }}
      >
        Keep my answers
      </Button>
    </span>
  );
}

function Outcome({
  tone,
  title,
  body,
  definition,
  brief,
}: {
  tone: "success" | "failure";
  title: string;
  body: readonly string[];
  definition: FormDefinition;
  brief: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6 rounded-lg border p-6 sm:p-8",
        tone === "success" ? "border-success bg-success-soft" : "border-danger bg-danger-soft",
      )}
    >
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-semibold text-heading">{title}</h2>
        {body.map((paragraph) => (
          <p key={paragraph} className="max-w-prose text-foreground">
            {paragraph}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <label htmlFor="brief-out" className="text-sm font-medium text-heading">
          Your copy of the brief
        </label>
        <textarea
          id="brief-out"
          readOnly
          value={brief}
          rows={12}
          className="w-full rounded-md border border-input bg-surface px-3 py-2 font-mono text-sm text-foreground"
        />
        <CopyButton text={brief} />
      </div>

      <Handoff definition={definition} />
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      className="self-start"
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => {
              setCopied(false);
            }, 2_000);
          })
          .catch(() => {
            setCopied(false);
          });
      }}
    >
      {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
      {copied ? "Copied" : "Copy the brief"}
    </Button>
  );
}

function Handoff({ definition }: { definition: FormDefinition }) {
  const { whatsapp, email } = definition.closing;
  if (whatsapp === undefined && email === undefined) return null;
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-5 text-sm">
      <p className="font-medium text-heading">Reach us here</p>
      {whatsapp !== undefined && (
        <p className="flex items-center gap-2 text-foreground">
          <MessageCircle aria-hidden className="size-4 text-muted" />
          WhatsApp <span className="font-mono tabular-nums">{whatsapp}</span>
        </p>
      )}
      {email !== undefined && (
        <p className="flex items-center gap-2 text-foreground">
          <Mail aria-hidden className="size-4 text-muted" />
          <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${email}`}>
            {email}
          </a>
        </p>
      )}
    </div>
  );
}
