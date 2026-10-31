import { Button, Drawer } from "@slayply/ui";
import { useState } from "react";

/** The job description as one line (size and an Edit button); the text itself opens in a drawer. */
export function JobTextRow({
  jd,
  max,
  onChange,
  initialOpen = false,
}: {
  jd: string;
  max: number;
  onChange: (text: string) => void;
  /** Starts with the drawer open (for tests). */
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const empty = jd.trim() === "";
  return (
    <div className="job-text-row">
      <span>
        {empty
          ? "No job description yet"
          : `Job description · ${jd.length.toLocaleString("en-US")} characters`}
      </span>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {empty ? "Add" : "Edit"}
      </Button>
      <Drawer open={open} title="Job description" onClose={() => setOpen(false)}>
        <label htmlFor="jd">Job description</label>
        <textarea
          id="jd"
          rows={10}
          maxLength={max}
          value={jd}
          onChange={(event) => onChange(event.target.value)}
        />
      </Drawer>
    </div>
  );
}
