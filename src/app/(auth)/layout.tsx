import Image from "next/image";

import { cn } from "@/lib/cn";

/**
 * Split layout for every /login, /invite, /reset and /setup-2fa page. Deep-navy brand panel on
 * the left (visible from md+), lavender/surface form area on the right. Collapses to a single
 * column below md. No card-in-a-box.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="grid min-h-dvh grid-cols-1 bg-background md:grid-cols-[2fr_3fr]">
      <aside
        aria-hidden
        className={cn(
          "hidden bg-heading text-primary-foreground md:flex md:flex-col md:justify-between",
          "px-10 py-12 lg:px-14",
        )}
      >
        <div className="flex items-center gap-3">
          <Image
            src="/brand/futureuni-mark.png"
            alt=""
            width={36}
            height={48}
            className="h-12 w-auto"
          />
          <span className="font-display text-xl font-semibold tracking-[0.02em] text-primary-foreground">
            FUTUREUNI
          </span>
        </div>
        <p className="max-w-md font-display text-[clamp(2rem,1.4rem+2vw,3rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-primary-foreground">
          The internal platform where FUTUREUNI keeps its work moving.
        </p>
        <p className="text-sm text-primary-foreground/70">
          Staff sign-in. If you don&apos;t have an account, ask an administrator for an invite.
        </p>
      </aside>
      <section className="flex flex-col justify-center px-6 py-12 sm:px-10 lg:px-16">
        <div className="mx-auto flex w-full max-w-md flex-col gap-8">
          <div className="flex items-center gap-3 md:hidden">
            <Image
              src="/brand/futureuni-mark.png"
              alt=""
              width={28}
              height={36}
              className="h-9 w-auto"
            />
            <span className="font-display text-lg font-semibold tracking-[0.02em] text-heading">
              FUTUREUNI
            </span>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
