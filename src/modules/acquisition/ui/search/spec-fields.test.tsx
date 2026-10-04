import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";

import { SpecFields } from "./spec-fields";
import type { SearchDraft, SourceOption } from "./types";

const SOURCES: SourceOption[] = [
  {
    id: "google-places",
    label: "Google Places",
    description: "Businesses from Maps.",
    markets: ["NIGERIA", "INTERNATIONAL"],
    status: "ENABLED",
    disabledReason: null,
    costPerCallMicros: 1000,
  },
  {
    id: "myjobmag",
    label: "MyJobMag",
    description: "Nigerian job feeds.",
    markets: ["NIGERIA"],
    status: "DISABLED",
    disabledReason: "Awaiting feed-use confirmation.",
    costPerCallMicros: 0,
  },
];

function Harness(): React.ReactElement {
  const [draft, setDraft] = useState<SearchDraft>({
    market: "NIGERIA",
    ngLocation: "",
    intlLocation: "",
    keywords: [],
    sources: [],
    limit: 50,
  });
  return (
    <TooltipProvider>
      <SpecFields draft={draft} onChange={(p) => { setDraft((d) => ({ ...d, ...p })); }} sourceOptions={SOURCES} />
    </TooltipProvider>
  );
}

describe("SpecFields market toggle", () => {
  it("shows one location for Nigeria and two for Both", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByRole("combobox", { name: /nigerian location/i })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /international location/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Both" }));

    expect(screen.getByRole("combobox", { name: /nigerian location/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /international location/i })).toBeInTheDocument();
  });

  it("shows a disabled source with its reason", () => {
    render(<Harness />);
    expect(screen.getByText("MyJobMag")).toBeInTheDocument();
    expect(screen.getByText(/awaiting feed-use confirmation/i)).toBeInTheDocument();
  });
});
