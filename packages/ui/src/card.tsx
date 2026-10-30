import type { ReactNode } from "react";

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="sl-card">
      {title && <h2 className="sl-card-title">{title}</h2>}
      {children}
    </section>
  );
}
