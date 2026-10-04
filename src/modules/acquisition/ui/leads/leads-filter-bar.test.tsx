import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LeadsFilterBar } from "./leads-filter-bar";

const BASE = "/acquisition/web-development/leads";

// A stand-in for the router: `params` is what the URL holds, `replace` records where the bar
// navigated. Setting `params` and re-rendering is the URL changing for some other reason.
const nav = vi.hoisted(() => {
  const replace = vi.fn();
  return { params: new URLSearchParams(), replace, router: { replace, push: vi.fn() } };
});

vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  usePathname: () => "/acquisition/web-development/leads",
  useSearchParams: () => nav.params,
}));

function bar() {
  return <LeadsFilterBar owners={[]} sources={[]} signalTypes={[]} basePath={BASE} />;
}

function searchBox() {
  return screen.getByRole("searchbox", { name: "Search leads" });
}

/** Long enough for a pending search to have been sent, had it not been dropped. */
function pause() {
  return new Promise((resolve) => setTimeout(resolve, 450));
}

beforeEach(() => {
  nav.params = new URLSearchParams();
  nav.replace.mockReset();
});

describe("leads search box", () => {
  it("sends what was typed to the URL after a pause", async () => {
    render(bar());
    await userEvent.type(searchBox(), "acme");

    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalledWith(`${BASE}?q=acme`, { scroll: false });
    });
    // One navigation for the whole word, not one per keystroke.
    expect(nav.replace).toHaveBeenCalledTimes(1);
  });

  it("keeps the typing when its own search lands in the URL", async () => {
    const view = render(bar());
    await userEvent.type(searchBox(), "ac");
    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalledWith(`${BASE}?q=ac`, { scroll: false });
    });

    nav.params = new URLSearchParams("q=ac");
    view.rerender(bar());
    await userEvent.type(searchBox(), "me");

    expect(searchBox()).toHaveValue("acme");
  });

  it("follows the URL when the search is changed from elsewhere", async () => {
    nav.params = new URLSearchParams("q=acme");
    const view = render(bar());
    expect(searchBox()).toHaveValue("acme");

    // "Clear filters", a saved view or the Back button.
    nav.params = new URLSearchParams();
    view.rerender(bar());

    expect(searchBox()).toHaveValue("");
    await pause();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("drops a search that was waiting to be sent when the URL changes elsewhere", async () => {
    const view = render(bar());
    await userEvent.type(searchBox(), "zzz");

    nav.params = new URLSearchParams("q=saved");
    view.rerender(bar());

    expect(searchBox()).toHaveValue("saved");
    await pause();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});

describe("score range", () => {
  it("doesn't navigate when a box is left unchanged", async () => {
    nav.params = new URLSearchParams("scoreMin=40");
    render(bar());

    await userEvent.click(screen.getByLabelText("Minimum score"));
    await userEvent.tab();

    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("applies a changed value when the box is left", async () => {
    render(bar());

    await userEvent.type(screen.getByLabelText("Minimum score"), "70");
    await userEvent.tab();

    expect(nav.replace).toHaveBeenCalledWith(`${BASE}?scoreMin=70`, { scroll: false });
  });
});

describe("clear filters", () => {
  it("is offered only when one of the list's own filters is on", () => {
    nav.params = new URLSearchParams("utm_source=email");
    const view = render(bar());
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();

    nav.params = new URLSearchParams("group=replied");
    view.rerender(bar());
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });
});
