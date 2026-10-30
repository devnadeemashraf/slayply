import type { ReactNode } from "react";

export function EmptyState({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="sl-empty">
      <h2 className="sl-empty-title">{title}</h2>
      <p className="sl-empty-body">{children}</p>
      {action}
    </section>
  );
}
