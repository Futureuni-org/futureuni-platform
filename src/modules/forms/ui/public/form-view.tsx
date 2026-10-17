"use client";

/**
 * The public form (docs/specs/module-forms.md §6).
 *
 * Three pages of questions, plus the thank-you panel that replaces the content
 * on submit. No left rail: the FUTUREUNI lockup sits top-left of the form on
 * desktop and the appearance toggle top-right; on mobile a sticky navy band
 * carries both. The step indicator is a horizontal tab strip built on the
 * platform's own `Tabs` primitive, so the active-tab underline reads as
 * native. The 13 sections in the form definition are grouped into three
 * pages here — the definition itself is unchanged, so the stored brief and
 * its plain-text render stay the same.
 *
 * Four promises to the prospect:
 *
 *  1. Nothing is lost: every change is written to this device, so closing the
 *     tab is safe (localStorage per slug + version).
 *  2. Nothing is hidden: required questions are marked, moving on stops at an
 *     empty one, submitting from any page jumps to the first missing field.
 *  3. Their place is kept: the page is in the URL, so Back walks back and a
 *     refresh returns here.
 *  4. There is always a way to reach us: the thank-you panel renders the
 *     brief as copyable text and the WhatsApp + email handoff — also shown
 *     when sending fails, so the form is never a dead end.
 *
 * Saved answers are read with `useSyncExternalStore` the way the sidebar reads
 * its collapsed state: storage is an external system, so the server renders
 * an empty form and this device's own answers arrive at hydration without a
 * state-setting effect.
 */

import Image from "next/image";
import { useCallback, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check, Mail, MessageCircle } from "lucide-react";

import {
  isBlankAnswer,
  type FormAnswer,
  type FormAnswers,
  type FormDefinition,
} from "@/contracts/forms";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";

import {
  answeredCount,
  missingRequired,
  normalizeAnswers,
  questionCount,
} from "../../core/answers";
import { Field } from "./fields";
import { MobileBand } from "./mobile-band";
import { ThemeSwitch } from "./theme-switch";
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

/**
 * The three pages the 13 sections are grouped into. Section keys come from
 * `src/modules/forms/definitions/ai-music-video-brief.ts`; a definition
 * section not listed here would be unreachable, which `assertPagesCover`
 * catches in development.
 */
const PAGES = [
  {
    key: "page-1",
    label: "You and the song",
    sectionKeys: ["your-details", "the-song", "the-track"],
  },
  {
    key: "page-2",
    label: "The video",
    sectionKeys: [
      "length",
      "your-vision",
      "references",
      "creative-style",
      "you-in-the-video",
      "story-or-performance",
    ],
  },
  {
    key: "page-3",
    label: "The details",
    sectionKeys: ["scenes-and-world", "please-do-not-include", "delivery", "anything-else"],
  },
] as const satisfies readonly { key: string; label: string; sectionKeys: readonly string[] }[];

const REQUIRED_MESSAGE = "We need this one to start.";

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

/**
 * In development, catch a section that no page claims (and therefore cannot be reached). Each
 * page is also expected to claim only sections the definition declares.
 */
function assertPagesCover(definition: FormDefinition): void {
  if (process.env.NODE_ENV === "production") return;
  const defined = new Set(definition.sections.map((section) => section.key));
  const grouped = new Set<string>(PAGES.flatMap((page) => page.sectionKeys));
  for (const key of defined) {
    if (!grouped.has(key)) {
      console.error(`[forms] section "${key}" is not on any page; add it to PAGES.`);
    }
  }
  for (const key of grouped) {
    if (!defined.has(key)) {
      console.error(`[forms] page claims unknown section "${key}".`);
    }
  }
}

/** Never changes, so `useSyncExternalStore` returns the client snapshot once. */
function noopSubscribe(): () => void {
  return () => undefined;
}

export function FormView({ definition, submit }: FormViewProps) {
  assertPagesCover(definition);
  const totalPages = PAGES.length;

  // Group the definition's sections by the page they belong to.
  const pageSections = useMemo(
    () =>
      PAGES.map((page) => ({
        page,
        sections: page.sectionKeys
          .map((key) => definition.sections.find((section) => section.key === key))
          .filter(<T,>(value: T | undefined): value is T => value !== undefined),
      })),
    [definition],
  );

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

  // The open page comes from the URL, so Back walks back through the pages.
  const urlStep = useUrlStep();
  const pageIndex = useMemo(() => {
    if (urlStep === null) return 0;
    const found = PAGES.findIndex((page) => page.key === urlStep);
    return found === -1 ? 0 : found;
  }, [urlStep]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

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

  /** Required field keys that are still blank, on one page. */
  function missingOnPage(index: number, from: FormAnswers): readonly string[] {
    const group = pageSections[index];
    if (group === undefined) return [];
    return group.sections.flatMap((section) =>
      section.fields
        .filter((field) => field.required === true && isBlankAnswer(from[field.key]))
        .map((field) => field.key),
    );
  }

  function focusFirstError(keys: readonly string[]): void {
    const first = keys[0];
    if (first === undefined) return;
    const container = formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`);
    container?.scrollIntoView({ block: "center", behavior: "smooth" });
    container?.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true });
  }

  function goToPage(index: number): void {
    const bounded = Math.max(0, Math.min(index, totalPages - 1));
    const key = (PAGES[bounded] ?? PAGES[0]).key;
    openStep(key);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onNext(): void {
    const cleaned = normalizeAnswers(definition, answers);
    const missing = missingOnPage(pageIndex, cleaned);
    if (missing.length > 0) {
      setErrors(Object.fromEntries(missing.map((key) => [key, REQUIRED_MESSAGE])));
      focusFirstError(missing);
      return;
    }
    setErrors({});
    goToPage(pageIndex + 1);
  }

  /**
   * The final submit. Only the Finish-and-send button calls this — the <form> onSubmit is a
   * no-op (see below). That matters because when the user clicks Next on page 2, React reuses
   * the Next button's DOM node to render the Finish button after goToPage() flips `isLastPage`,
   * and in that millisecond the browser can see a `type="submit"` button and submit the form
   * before the user ever sees page 3. Keeping submit explicit, with its own onClick, fixes it.
   */
  function onFinalSubmit(): void {
    if (sending) return;

    const cleaned = normalizeAnswers(definition, answers);
    const missing = missingRequired(definition, cleaned);
    if (missing.length > 0) {
      // Send the user to the first page that still has a blank required answer.
      const firstKey = missing[0]?.key;
      const target = PAGES.findIndex((page) =>
        page.sectionKeys.some((sectionKey) =>
          definition.sections
            .find((section) => section.key === sectionKey)
            ?.fields.some((field) => field.key === firstKey),
        ),
      );
      setErrors(Object.fromEntries(missing.map((field) => [field.key, REQUIRED_MESSAGE])));
      if (target !== -1) goToPage(target);
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
        const target = PAGES.findIndex((page) =>
          page.sectionKeys.some((sectionKey) =>
            definition.sections
              .find((section) => section.key === sectionKey)
              ?.fields.some((field) => fields.includes(field.key)),
          ),
        );
        if (target !== -1) goToPage(target);
        return;
      }
      setFailure(result.error.message);
    });
  }

  /** Per-page completeness marks for the tab strip. */
  const pageState = useMemo(
    () =>
      pageSections.map((group) => {
        const allRequiredFilled = group.sections.every((section) =>
          section.fields.every(
            (field) => field.required !== true || !isBlankAnswer(answers[field.key]),
          ),
        );
        const everyFilled = group.sections.every((section) =>
          section.fields.every((field) => !isBlankAnswer(answers[field.key])),
        );
        return { allRequiredFilled, everyFilled };
      }),
    [pageSections, answers],
  );

  const activePageKey = (PAGES[pageIndex] ?? PAGES[0]).key;
  const isLastPage = pageIndex === totalPages - 1;
  const currentPage = pageSections[pageIndex];

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <MobileBand answered={answered} total={total} className="md:hidden" />

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 py-6 md:px-10 md:py-14">
        {/* Desktop header: logo top-left, toggle top-right. Hidden on mobile — the navy band carries both there. */}
        <header className="hidden items-center justify-between md:flex">
          <span className="flex items-center gap-3">
            <Image
              src="/brand/futureuni-mark.png"
              alt=""
              width={28}
              height={36}
              priority
              className="h-10 w-auto"
            />
            <span className="font-display text-xl font-semibold tracking-[0.02em] text-heading">
              FUTUREUNI
            </span>
          </span>
          <ThemeSwitch tone="page" />
        </header>

        {sent ? (
          <Outcome
            tone="success"
            title={definition.closing.title}
            body={definition.closing.body}
            definition={definition}
          />
        ) : (
          <>
            {failure !== null && (
              <Outcome
                tone="failure"
                title="We could not send that from here"
                body={[
                  failure,
                  "Nothing you wrote is lost — it is still saved on this device. Reach us on WhatsApp or by email below and we will take it from there.",
                ]}
                definition={definition}
              />
            )}

            {/* The masthead sits above the tab strip, same shape on both viewports. */}
            <header className="flex flex-col gap-4">
              <h1 className="font-display text-[clamp(2rem,1.5rem+1.6vw,2.75rem)] leading-[1.08] font-semibold tracking-[-0.02em] text-heading">
                {definition.title}
              </h1>
              {pageIndex === 0 &&
                definition.intro.map((paragraph) => (
                  <p key={paragraph} className="max-w-prose text-base text-muted md:text-lg">
                    {paragraph}
                  </p>
                ))}
              {pageIndex === 0 && definition.expectation !== undefined && (
                <p className="max-w-prose rounded-md bg-zone px-4 py-3 text-sm text-foreground">
                  {definition.expectation}
                </p>
              )}
            </header>

            <Tabs
              value={activePageKey}
              onValueChange={(value) => {
                const index = PAGES.findIndex((page) => page.key === value);
                if (index !== -1) goToPage(index);
              }}
            >
              <TabsList className="w-full overflow-x-auto">
                {PAGES.map((page, index) => {
                  const state = pageState[index];
                  const done = state?.allRequiredFilled === true && state.everyFilled;
                  return (
                    <TabsTrigger
                      key={page.key}
                      value={page.key}
                      className="flex items-center gap-2"
                    >
                      <span className="font-mono text-xs text-muted tabular-nums">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>{page.label}</span>
                      {done && <Check aria-hidden className="size-3.5 text-primary" />}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>

            <form
              ref={formRef}
              onSubmit={(event) => {
                // Enter inside a field would otherwise fire the browser's default form submit.
                // The wizard's actions live on the Next and Finish buttons; this just blocks it.
                event.preventDefault();
              }}
              noValidate
              className="flex flex-col gap-12"
              aria-labelledby="page-title"
            >
              <section className="flex flex-col gap-2">
                <p className="font-mono text-xs font-semibold tracking-[0.14em] text-primary uppercase">
                  Step {String(pageIndex + 1).padStart(2, "0")} ·{" "}
                  {String(totalPages).padStart(2, "0")}
                </p>
                <h2
                  id="page-title"
                  className="font-display text-2xl font-semibold text-heading md:text-3xl"
                >
                  {PAGES[pageIndex]?.label}
                </h2>
              </section>

              {currentPage?.sections.map((section) => (
                <section key={section.key} className="flex flex-col gap-5">
                  <header className="flex flex-col gap-2">
                    <h3 className="font-display text-xl font-semibold text-heading">
                      {section.title}
                    </h3>
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
                    <p
                      className="reading-rule max-w-prose pl-4 text-sm text-muted"
                      data-active="true"
                    >
                      {section.note}
                    </p>
                  )}
                </section>
              ))}

              <StepNav
                hydrated={hydrated}
                sending={sending}
                showBack={pageIndex > 0}
                isLastPage={isLastPage}
                onBack={() => {
                  goToPage(pageIndex - 1);
                }}
                onNext={onNext}
                onFinalSubmit={onFinalSubmit}
              />
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function StepNav({
  hydrated,
  sending,
  showBack,
  isLastPage,
  onBack,
  onNext,
  onFinalSubmit,
}: {
  hydrated: boolean;
  sending: boolean;
  showBack: boolean;
  isLastPage: boolean;
  onBack: () => void;
  onNext: () => void;
  onFinalSubmit: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 border-t border-border pt-6">
      <div className="flex flex-wrap items-center gap-3">
        {showBack && (
          <Button variant="secondary" size="lg" onClick={onBack} disabled={!hydrated}>
            <ArrowLeft aria-hidden className="size-4" />
            Back
          </Button>
        )}
        {isLastPage ? (
          <Button
            key="finish"
            type="button"
            size="lg"
            loading={sending}
            disabled={!hydrated}
            onClick={onFinalSubmit}
          >
            {sending ? "Sending" : "Finish and send"}
          </Button>
        ) : (
          <Button key="next" type="button" size="lg" onClick={onNext} disabled={!hydrated}>
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

function Outcome({
  tone,
  title,
  body,
  definition,
}: {
  tone: "success" | "failure";
  title: string;
  body: readonly string[];
  definition: FormDefinition;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6 rounded-lg border p-6 sm:p-8",
        // Brand violet on success; danger on failure. The success panel sits in company colour,
        // not green — the brief has arrived, this is a confirmation on the brand, not a system OK.
        tone === "success"
          ? "border-primary bg-primary-soft text-primary-soft-foreground"
          : "border-danger bg-danger-soft",
      )}
    >
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-2xl font-semibold text-heading sm:text-3xl">{title}</h1>
        {body.map((paragraph) => (
          <p key={paragraph} className="max-w-prose">
            {paragraph}
          </p>
        ))}
      </div>

      <Handoff definition={definition} />
    </div>
  );
}

/** Digits-only, no leading `+`, for `wa.me/<number>`. "+44 7538 598770" → "447538598770". */
function waNumber(whatsapp: string): string {
  return whatsapp.replace(/\D+/g, "");
}

/**
 * The click-to-chat URL (https://wa.me/<number>?text=…). Prefills a one-line greeting that names
 * the form, so a prospect whose submit failed, or who wants to add something, lands in WhatsApp
 * with a message they can send straight away and take over from.
 */
function waHref(whatsapp: string, formTitle: string): string {
  const message = `Hi FUTUREUNI — I just filled in the ${formTitle}.`;
  return `https://wa.me/${waNumber(whatsapp)}?text=${encodeURIComponent(message)}`;
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
          <a
            // Tap-to-chat: opens WhatsApp (app on mobile, web.whatsapp.com on desktop) with a
            // greeting ready to send. The prospect takes over from there.
            href={waHref(whatsapp, definition.title)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            WhatsApp <span className="font-mono tabular-nums">{whatsapp}</span>
          </a>
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
