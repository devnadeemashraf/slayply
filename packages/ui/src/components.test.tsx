import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./button.js";
import { Card } from "./card.js";
import { Chip } from "./chip.js";
import { EmptyState } from "./empty-state.js";
import { Field } from "./field.js";
import { StickerBadge } from "./sticker-badge.js";
import { Switch } from "./switch.js";
import { nextIndex, TabPanel, Tabs } from "./tabs.js";

const noop = () => {};
const HOSTILE = "<img src=x onerror=1>";

describe("Button", () => {
  it("is a non-submitting button by default and carries its variant", () => {
    const html = renderToString(<Button variant="secondary">Save</Button>);
    expect(html).toContain('type="button"');
    expect(html).toContain("sl-btn-secondary");
    expect(html).toMatchSnapshot();
  });

  it("defaults to the primary variant and can be disabled", () => {
    const html = renderToString(<Button disabled>Go</Button>);
    expect(html).toContain("sl-btn-primary");
    expect(html).toContain("disabled");
  });

  it("escapes hostile children", () => {
    expect(renderToString(<Button>{HOSTILE}</Button>)).not.toContain("<img");
  });
});

describe("Chip", () => {
  it("is plain text when it has no click handler", () => {
    const html = renderToString(<Chip>Remote</Chip>);
    expect(html).toContain("<span");
    expect(html).not.toContain("<button");
    expect(html).toMatchSnapshot();
  });

  it("is a toggle button with aria-pressed when clickable", () => {
    const html = renderToString(
      <Chip onClick={noop} selected>
        Remote
      </Chip>,
    );
    expect(html).toContain("<button");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toMatchSnapshot();
  });

  it("escapes hostile text", () => {
    expect(renderToString(<Chip>{HOSTILE}</Chip>)).not.toContain("<img");
  });
});

describe("StickerBadge", () => {
  it("always shows its text and carries a tone class", () => {
    const html = renderToString(<StickerBadge tone="ok">High chance</StickerBadge>);
    expect(html).toContain("High chance");
    expect(html).toContain("sl-sticker-ok");
    expect(html).toMatchSnapshot();
  });

  it("defaults to the neutral tone", () => {
    expect(renderToString(<StickerBadge>New</StickerBadge>)).toContain("sl-sticker-neutral");
  });
});

describe("Card", () => {
  it("renders a titled section", () => {
    const html = renderToString(
      <Card title="Fit">
        <p>body</p>
      </Card>,
    );
    expect(html).toContain("<h2");
    expect(html).toContain("Fit");
    expect(html).toContain("body");
    expect(html).toMatchSnapshot();
  });

  it("omits the heading when there is no title", () => {
    expect(renderToString(<Card>body</Card>)).not.toContain("<h2");
  });
});

describe("Field", () => {
  it("ties the label to the input", () => {
    const html = renderToString(<Field label="Company" defaultValue="Acme" />);
    const id = /<input[^>]*id="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeDefined();
    expect(html).toContain(`for="${id}"`);
    expect(html).toMatchSnapshot();
  });

  it("renders a textarea when multiline", () => {
    expect(renderToString(<Field label="Notes" multiline />)).toContain("<textarea");
  });

  it("marks the input invalid and announces the error", () => {
    const html = renderToString(<Field label="Key" error="Enter your API key." />);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Enter your API key.");
    const described = /aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(described).toBeDefined();
    expect(html).toContain(`id="${described}"`);
    expect(html).toMatchSnapshot();
  });

  it("shows a hint without marking the field invalid", () => {
    const html = renderToString(<Field label="Key" hint="Stored in this browser only." />);
    expect(html).toContain("Stored in this browser only.");
    expect(html).not.toContain("aria-invalid");
  });

  it("escapes a hostile error", () => {
    expect(renderToString(<Field label="Key" error={HOSTILE} />)).not.toContain("<img");
  });
});

describe("Switch", () => {
  it("exposes role=switch with its state and label", () => {
    const html = renderToString(<Switch checked onChange={noop} label="Direct Mode" />);
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("Direct Mode");
    expect(html).toMatchSnapshot();
  });

  it("reports off when unchecked", () => {
    expect(renderToString(<Switch checked={false} onChange={noop} label="x" />)).toContain(
      'aria-checked="false"',
    );
  });
});

describe("Tabs", () => {
  const tabs = [
    { id: "a", label: "Alpha" },
    { id: "b", label: "Beta" },
    { id: "c", label: "Gamma" },
  ];

  it("selects one tab and links tabs to panels by id", () => {
    const html = renderToString(
      <Tabs label="Sections" tabs={tabs} active="b" onSelect={noop} idPrefix="demo" />,
    );
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html.match(/tabindex="-1"/g)).toHaveLength(2);
    expect(html).toContain('aria-controls="demo-panel-a"');
    expect(html).toContain('id="demo-tab-b"');
    expect(html).toMatchSnapshot();
  });

  it("moves with arrows, wraps, and jumps with Home and End", () => {
    expect(nextIndex(3, 0, "ArrowRight")).toBe(1);
    expect(nextIndex(3, 2, "ArrowRight")).toBe(0);
    expect(nextIndex(3, 0, "ArrowLeft")).toBe(2);
    expect(nextIndex(3, 1, "Home")).toBe(0);
    expect(nextIndex(3, 1, "End")).toBe(2);
    expect(nextIndex(3, 1, "Enter")).toBeNull();
    expect(nextIndex(0, 0, "ArrowRight")).toBeNull();
  });
});

describe("TabPanel", () => {
  it("keeps an inactive panel's content mounted but hidden", () => {
    const html = renderToString(
      <TabPanel id="a" active={false}>
        <p>draft in progress</p>
      </TabPanel>,
    );
    expect(html).toContain("draft in progress");
    expect(html).toContain("hidden");
  });

  it("shows the active panel and links it back to its tab", () => {
    const html = renderToString(
      <TabPanel id="a" active={true} idPrefix="demo">
        <p>visible</p>
      </TabPanel>,
    );
    expect(html).not.toContain("hidden");
    expect(html).toContain('id="demo-panel-a"');
    expect(html).toContain('aria-labelledby="demo-tab-a"');
  });
});

describe("EmptyState", () => {
  it("shows a title, a body and an optional action", () => {
    const html = renderToString(
      <EmptyState title="No job yet" action={<Button>Capture</Button>}>
        Open a posting and hit Capture.
      </EmptyState>,
    );
    expect(html).toContain("No job yet");
    expect(html).toContain("Open a posting");
    expect(html).toContain("Capture");
    expect(html).toMatchSnapshot();
  });

  it("works without an action", () => {
    expect(renderToString(<EmptyState title="Empty">text</EmptyState>)).toContain("Empty");
  });
});
