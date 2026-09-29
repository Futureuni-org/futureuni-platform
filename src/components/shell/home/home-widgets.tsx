import "server-only";

import { Section } from "@/components/patterns/section";
import { EmptyState } from "@/components/patterns/states";
import type { CurrentUser } from "@/platform/auth";
import { canFromUser } from "@/platform/auth";
import { getEnabledModules, getHomeWidgets } from "@/platform/registry";

import { WIDGET_REGISTRY, type WidgetProps } from "./widget-registry";

/**
 * Renders every enabled module's home widgets. Widget bodies live in `widget-registry.ts` (Phase 4
 * ships placeholder acquisition widgets; Phase 19 re-points them at the real services).
 *
 * Widget errors are isolated (AC-10.3): each one is wrapped in an ErrorBoundary-esque try/catch
 * so a broken widget can't take down the whole home.
 */
export async function HomeWidgets({ user }: { user: CurrentUser }) {
  const modules = await getEnabledModules();
  const widgets = getHomeWidgets(modules).filter((widget) =>
    canFromUser(user, widget.permission as never),
  );

  if (widgets.length === 0) {
    return (
      <Section eyebrow="Your work" title="Widgets">
        <EmptyState
          title="No widgets yet"
          description="Modules register widgets here as they come online."
        />
      </Section>
    );
  }

  return (
    <Section eyebrow="Your work" title="Widgets" emphasized>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {widgets.map((widget) => (
          <WidgetFrame key={widget.id} widget={widget} user={user} />
        ))}
      </div>
    </Section>
  );
}

async function WidgetFrame({
  widget,
  user,
}: {
  widget: { id: string; module: string; title: string; description?: string | undefined };
  user: CurrentUser;
}) {
  const Renderer = WIDGET_REGISTRY[widget.id];
  const props: WidgetProps = widget.description === undefined
    ? { user, title: widget.title }
    : { user, title: widget.title, description: widget.description };
  const body =
    Renderer === undefined ? (
      <EmptyState
        title="Widget not yet available"
        description={`\`${widget.id}\` will render when its module registers a renderer.`}
      />
    ) : (
      // The renderer is trusted server code; we still isolate to keep sibling widgets alive.
      await safeRender(async () => Renderer(props))
    );
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="font-display text-base font-semibold text-heading">{widget.title}</p>
        {widget.description !== undefined && (
          <p className="text-sm text-muted">{widget.description}</p>
        )}
      </div>
      {body}
    </div>
  );
}

async function safeRender(render: () => Promise<React.ReactNode>): Promise<React.ReactNode> {
  try {
    return await render();
  } catch (error) {
    return (
      <EmptyState
        title="This widget failed to load"
        description={error instanceof Error ? error.message : "Unexpected error"}
      />
    );
  }
}
