import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { EvidenceArtifact } from "./detail-types";
import { buildSlides, EvidenceGallery } from "./evidence-gallery";

// next/image needs the Next runtime; a plain element is enough to assert on.
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span role="img" aria-label={alt} data-src={src} />
  ),
}));

const mobile: EvidenceArtifact = {
  url: "https://files.test/m.png",
  label: "Mobile home page",
  viewport: "mobile",
};
const desktop: EvidenceArtifact = {
  url: "https://files.test/d.png",
  label: "Desktop home page",
  viewport: "desktop",
};
const CLAIM = "Largest Contentful Paint is 7.2s on mobile";

async function open(name: RegExp) {
  await userEvent.click(screen.getByRole("button", { name }));
  return screen.findByRole("dialog");
}

describe("buildSlides", () => {
  it("leads with a side-by-side comparison when both viewports were captured", () => {
    const slides = buildSlides([mobile, desktop]);
    expect(slides.map((s) => s.kind)).toEqual(["compare", "single", "single"]);
  });

  it("keeps single captures as they are", () => {
    expect(buildSlides([mobile]).map((s) => s.kind)).toEqual(["single"]);
    expect(buildSlides([])).toEqual([]);
  });
});

describe("EvidenceGallery", () => {
  it("renders nothing when a finding has no screenshots", () => {
    const { container } = render(<EvidenceGallery artifacts={[]} claim={CLAIM} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("opens the comparison with mobile and desktop side by side", async () => {
    render(<EvidenceGallery artifacts={[mobile, desktop]} claim={CLAIM} />);
    const dialog = await open(/mobile and desktop compared/i);
    expect(within(dialog).getByText(CLAIM)).toBeInTheDocument();
    expect(within(dialog).getByText("Mobile")).toBeInTheDocument();
    expect(within(dialog).getByText("Desktop")).toBeInTheDocument();
    expect(within(dialog).getByText(/1 of 3/)).toBeInTheDocument();
  });

  it("steps through the screenshots with the arrow keys", async () => {
    render(<EvidenceGallery artifacts={[mobile, desktop]} claim={CLAIM} />);
    const dialog = await open(/mobile and desktop compared/i);

    await userEvent.keyboard("{ArrowRight}");
    expect(within(dialog).getByText(/Mobile home page · 2 of 3/)).toBeInTheDocument();

    await userEvent.keyboard("{ArrowRight}");
    expect(within(dialog).getByText(/Desktop home page · 3 of 3/)).toBeInTheDocument();

    // It stops at the last slide rather than wrapping.
    await userEvent.keyboard("{ArrowRight}");
    expect(within(dialog).getByText(/3 of 3/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Next screenshot" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    await userEvent.keyboard("{ArrowLeft}");
    expect(within(dialog).getByText(/2 of 3/)).toBeInTheDocument();
  });

  it("jumps to the first and last screenshot with Home and End", async () => {
    render(<EvidenceGallery artifacts={[mobile, desktop]} claim={CLAIM} />);
    const dialog = await open(/mobile and desktop compared/i);

    await userEvent.keyboard("{End}");
    expect(within(dialog).getByText(/3 of 3/)).toBeInTheDocument();
    await userEvent.keyboard("{Home}");
    expect(within(dialog).getByText(/1 of 3/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Previous screenshot" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("closes with Escape", async () => {
    render(<EvidenceGallery artifacts={[mobile]} claim={CLAIM} />);
    await open(/open screenshot: mobile home page/i);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
