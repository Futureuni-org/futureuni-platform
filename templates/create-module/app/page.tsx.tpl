import type { Metadata } from "next";

import { ExamplePanel } from "@/modules/__MODULE_ID__/ui/example-panel";

export const metadata: Metadata = { title: "__MODULE_NAME__" };

/** __MODULE_NAME__'s landing page (__ROUTE_PREFIX__). Replace it with the module's first screen. */
export default function __MODULE_COMPONENT__Page() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-3xl text-heading">__MODULE_NAME__</h1>
      <div className="mt-6">
        <ExamplePanel title="Getting started">
          Write the spec in docs/specs/module-__MODULE_ID__.md, then build this screen.
        </ExamplePanel>
      </div>
    </main>
  );
}
