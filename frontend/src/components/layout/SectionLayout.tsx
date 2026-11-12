import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { SegmentedControl, SegmentedControlItem } from "@/components/patterns/SegmentedControl";

interface Section {
  to: "/mercado" | "/mercado/titulos" | "/investimentos" | "/investimentos/venda-antecipada";
  label: string;
}

interface SectionLayoutProps {
  label: string;
  sections: Section[];
}

/** A destination split into sections, each its own route, switched by a segmented control. */
export function SectionLayout({ label, sections }: SectionLayoutProps) {
  const pathname = useLocation({ select: (location) => location.pathname.replace(/\/+$/, "") });
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-6">
      <SegmentedControl
        fill
        aria-label={label}
        className="self-start"
        value={pathname}
        onValueChange={(to) => navigate({ to: to as Section["to"] })}
      >
        {sections.map((section) => (
          <SegmentedControlItem key={section.to} value={section.to}>
            {section.label}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      <Outlet />
    </div>
  );
}
