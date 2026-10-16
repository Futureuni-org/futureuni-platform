"use client";

/**
 * The public form (docs/specs/module-forms.md §6): one section per step.
 *
 * Thirty questions on one page reads as homework; a prospect sees how far it goes and closes the
 * tab. One section per step shows only what is being asked right now, and the ledger beside it
 * shows what is left — the same shape as the platform's own navigation.
 *
 * Four promises to the prospect:
 *
 *  1. Nothing is lost: every change is written to this device, so closing the tab is safe.
 *  2. Nothing is hidden: required questions are marked, moving on stops at an empty one, and the
 *     last step shows the whole brief before anything is sent.
 *  3. Their place is kept: the step is in the URL, so Back walks back and a refresh returns here.
 *  4. There is always a way to reach us: when the brief is sent — and also when sending fails —
 *     they get the brief as copyable text plus the WhatsApp and email handoff.
 *
 * Saved answers are read with `useSyncExternalStore` the way the sidebar reads its collapsed
 * state: storage is an external system, so the server renders an empty form and this device's own
 * answers arrive at hydration without a state-setting effect.
 */

import { useCallback, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import type { SyntheticEvent } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, Mail, MessageCircle, Pencil } from "lucide-react";

import {
  isBlankAnswer,
  type FormAnswer,
  type FormAnswers,
  type FormDefinition,
} from "@/contracts/forms";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

import {
  answeredCount,
  missingRequired,
  normalizeAnswers,
  questionCount,
} from "../../core/answers";
import { briefSections, renderBrief } from "../../core/brief";
import { BrandRail, type LedgerStep } from "./brand-rail";
import { Field } from "./fields";
import { openStep, useUrlStep } from "./use-step";

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
const REVIEW_KEY = "check-and-send";

function storageKey(definition: FormDefinition): string {
  return `futureuni-form:${definition.slug}:v${String(definition.version)}`;
}

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
  const sections = definition.sections;
  const reviewIndex = sections.length;

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

  // The open step comes from the URL, so Back walks back through the sections.
  const urlStep = useUrlStep();
  const step = useMemo(() => {
    if (urlStep === null) return 0;
    if (urlStep === REVIEW_KEY) return reviewIndex;
    const found = sections.findIndex((section) => section.key === urlStep);
    return found === -1 ? 0 : found;
  }, [urlStep, sections, reviewIndex]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [visited, setVisited] = useState<ReadonlySet<string>>(new Set<string>());
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const stepRef = useRef<HTMLFormElement>(null);

  // Until React has hydrated, no handler is attached: a tap would be a plain browser submit, which
  // navigates away with the answers in the query string instead of sending the brief. On a slow
  // phone that window is real, so the buttons wait.
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
    const container = stepRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`);
    container?.scrollIntoView({ block: "center", behavior: "smooth" });
    container?.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true });
  }

  function go(index: number, options: { push?: boolean } = {}): void {
    const key = index >= reviewIndex ? REVIEW_KEY : (sections[index]?.key ?? REVIEW_KEY);
    openStep(key, options);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Required answers missing in one section — what stops "Next". */
  function missingIn(index: number, from: FormAnswers): readonly string[] {
    const section = sections[index];
    if (section === undefined) return [];
    return section.fields
      .filter((field) => field.required === true && isBlankAnswer(from[field.key]))
      .map((field) => field.key);
  }

  function onNext(): void {
    const cleaned = normalizeAnswers(definition, answers);
    const missing = missingIn(step, cleaned);
    const section = sections[step];
    if (section !== undefined) {
      setVisited((current) => new Set(current).add(section.key));
    }
    if (missing.length > 0) {
      setErrors(Object.fromEntries(missing.map((key) => [key, REQUIRED_MESSAGE])));
      focusFirstError(missing);
      return;
    }
    setErrors({});
    go(Math.min(step + 1, reviewIndex));
  }

  function onSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (sending) return;
    // Enter inside a field submits the form element. Before the last step that means "next".
    if (step < reviewIndex) {
      onNext();
      return;
    }

    const cleaned = normalizeAnswers(definition, answers);
    const missing = missingRequired(definition, cleaned);
    if (missing.length > 0) {
      // Send them to the first section that still needs something, with the error already on it.
      const firstKey = missing[0]?.key;
      const target = sections.findIndex((section) =>
        section.fields.some((field) => field.key === firstKey),
      );
      setErrors(Object.fromEntries(missing.map((field) => [field.key, REQUIRED_MESSAGE])));
      if (target !== -1) go(target);
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
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      const fields = invalidFields(result.error.details);
      if (fields.length > 0) {
        setErrors(Object.fromEntries(fields.map((key) => [key, REQUIRED_MESSAGE])));
        const target = sections.findIndex((section) =>
          section.fields.some((field) => fields.includes(field.key)),
        );
        if (target !== -1) go(target);
        return;
      }
      setFailure(result.error.message);
    });
  }

  const brief = useMemo(() => renderBrief(definition, answers), [definition, answers]);

  const ledger = useMemo<LedgerStep[]>(
    () =>
      sections.map((section) => {
        const requiredMissing = section.fields.some(
          (field) => field.required === true && isBlankAnswer(answers[field.key]),
        );
        return {
          key: section.key,
          title: section.title,
          complete: section.fields.every((field) => !isBlankAnswer(answers[field.key])),
          flagged: requiredMissing && visited.has(section.key),
        };
      }),
    [sections, answers, visited],
  );

  const section = sections[step];
  const onReview = step >= reviewIndex;

  return (
    <div className="min-h-dvh bg-background text-foreground md:grid md:grid-cols-[20rem_1fr] md:items-start">
      <BrandRail
        formTitle={definition.title}
        steps={ledger}
        current={step}
        answered={answered}
        total={total}
        onOpenStep={(index) => {
          go(index);
        }}
      />

      <main className="px-5 py-8 sm:px-8 md:px-12 md:py-14 lg:px-20">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-10">
          {sent ? (
            <Outcome
              tone="success"
              title={definition.closing.title}
              body={definition.closing.body}
              definition={definition}
              brief={brief}
            />
          ) : (
            <>
              {failure !== null && (
                <Outcome
                  tone="failure"
                  title="We could not send that from here"
                  body={[
                    failure,
                    "Nothing you wrote is lost — it is still saved on this device. Copy the brief below and send it to us, and we will take it from there.",
                  ]}
                  definition={definition}
                  brief={brief}
                />
              )}

              <form
                onSubmit={onSubmit}
                noValidate
                className="flex flex-col gap-10"
                ref={stepRef}
              >
                {onReview ? (
                  <Review
                    definition={definition}
                    answers={answers}
                    onEdit={(index) => {
                      go(index);
                    }}
                  />
                ) : section === undefined ? null : (
                  <section className="flex flex-col gap-8" aria-labelledby="step-title">
                    {step === 0 && (
                      <div className="flex flex-col gap-4 md:hidden">
                        <h2 className="font-display text-2xl font-semibold text-heading">
                          {definition.title}
                        </h2>
                      </div>
                    )}
                    {step === 0 && (
                      <div className="flex flex-col gap-4">
                        {definition.intro.map((paragraph) => (
                          <p key={paragraph} className="max-w-prose text-lg text-foreground">
                            {paragraph}
                          </p>
                        ))}
                        {definition.expectation !== undefined && (
                          <p className="max-w-prose rounded-md bg-zone px-4 py-3 text-muted">
                            {definition.expectation}
                          </p>
                        )}
                      </div>
                    )}
                    <header className="flex flex-col gap-3">
                      <p className="font-mono text-xs font-semibold tracking-[0.14em] text-primary uppercase">
                        {String(step + 1).padStart(2, "0")} / {String(reviewIndex)}
                      </p>
                      <h1
                        id="step-title"
                        className="font-display text-[clamp(1.75rem,1.3rem+1.6vw,2.5rem)] leading-[1.08] font-semibold tracking-[-0.02em] text-heading"
                      >
                        {section.title}
                      </h1>
                      {section.intro !== undefined && (
                        <p className="max-w-prose text-lg text-muted">{section.intro}</p>
                      )}
                    </header>

                    <div className="grid grid-cols-1 gap-7 sm:grid-cols-2">
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
                      <p
                        className="reading-rule max-w-prose pl-4 text-sm text-muted"
                        data-active="true"
                      >
                        {section.note}
                      </p>
                    )}
                  </section>
                )}

                <StepNav
                  step={step}
                  reviewIndex={reviewIndex}
                  hydrated={hydrated}
                  sending={sending}
                  onBack={() => {
                    go(Math.max(step - 1, 0));
                  }}
                  onNext={onNext}
                />
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * Never changes, so `useSyncExternalStore` returns the client snapshot once and never again. It
 * is how this file asks "has the browser taken over yet?" without setting state in an effect.
 */
function noopSubscribe(): () => void {
  return () => undefined;
}

function StepNav({
  step,
  reviewIndex,
  hydrated,
  sending,
  onBack,
  onNext,
}: {
  step: number;
  reviewIndex: number;
  hydrated: boolean;
  sending: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const onReview = step >= reviewIndex;
  return (
    <div className="flex flex-col gap-4 border-t border-border pt-6">
      <div className="flex flex-wrap items-center gap-3">
        {step > 0 && (
          <Button variant="secondary" size="lg" onClick={onBack} disabled={!hydrated}>
            <ArrowLeft aria-hidden className="size-4" />
            Back
          </Button>
        )}
        {onReview ? (
          <Button type="submit" size="lg" loading={sending} disabled={!hydrated}>
            {sending ? "Sending" : "Finish and send"}
          </Button>
        ) : (
          <Button size="lg" onClick={onNext} disabled={!hydrated}>
            Next
            <ArrowRight aria-hidden className="size-4" />
          </Button>
        )}
      </div>
      <p className="text-sm text-muted">
        Your answers save on this device as you go, and go straight to the FUTUREUNI team when you
        send. We do not share them with anyone else.
      </p>
    </div>
  );
}

/** The last step: the whole brief, with a way back into any section. */
function Review({
  definition,
  answers,
  onEdit,
}: {
  definition: FormDefinition;
  answers: FormAnswers;
  onEdit: (index: number) => void;
}) {
  const groups = briefSections(definition, answers);
  return (
    <section className="flex flex-col gap-8" aria-labelledby="step-title">
      <header className="flex flex-col gap-3">
        <p className="font-mono text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          Last step
        </p>
        <h1
          id="step-title"
          className="font-display text-[clamp(1.75rem,1.3rem+1.6vw,2.5rem)] leading-[1.08] font-semibold tracking-[-0.02em] text-heading"
        >
          Check and send
        </h1>
        <p className="max-w-prose text-lg text-muted">
          This is everything you have told us. Change anything that is not right, then send it.
        </p>
      </header>

      <div className="flex flex-col gap-8">
        {groups.map((group, index) => (
          <div key={group.key} className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-lg font-semibold text-heading">{group.title}</h2>
              <button
                type="button"
                onClick={() => {
                  onEdit(index);
                }}
                className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
              >
                <Pencil aria-hidden className="size-3.5" />
                Change
              </button>
            </div>
            <dl className="flex flex-col gap-3 border-t border-border pt-3">
              {group.rows.map((row) => (
                <div key={row.key} className="grid gap-1 sm:grid-cols-[14rem_1fr] sm:gap-4">
                  <dt className="text-sm text-muted">{row.label}</dt>
                  <dd
                    className={
                      row.value === null
                        ? "text-sm text-subtle italic"
                        : "whitespace-pre-wrap text-foreground"
                    }
                  >
                    {row.value ?? "Not answered"}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
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
        <h1 className="font-display text-2xl font-semibold text-heading sm:text-3xl">{title}</h1>
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
