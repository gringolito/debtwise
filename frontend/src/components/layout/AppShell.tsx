import { Link, type LinkProps, Outlet } from "@tanstack/react-router";
import {
  ChartColumnIcon,
  HouseIcon,
  LandmarkIcon,
  type LucideIcon,
  ScaleIcon,
  SettingsIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Wordmark } from "@/components/layout/Wordmark";
import { ProtoShell } from "@/prototypes/ProtoShell";
import { usePrototypeVariant } from "@/prototypes/variant";

interface Destination {
  to: LinkProps["to"];
  label: string;
  icon: LucideIcon;
}

const primary: Destination[] = [
  { to: "/", label: "Início", icon: HouseIcon },
  { to: "/financiamento", label: "Financiamento", icon: LandmarkIcon },
  { to: "/investimentos", label: "Investimentos", icon: TrendingUpIcon },
  { to: "/decidir", label: "Decidir", icon: ScaleIcon },
];

const market: Destination = { to: "/mercado", label: "Mercado", icon: ChartColumnIcon };
const settings: Destination = { to: "/ajustes", label: "Ajustes", icon: SettingsIcon };

function SidebarLink({ to, label, icon: Icon }: Destination) {
  return (
    <li>
      <Link
        to={to}
        activeOptions={{ exact: to === "/" }}
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-callout text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:bg-accent-tint aria-[current=page]:font-medium aria-[current=page]:text-accent"
      >
        <Icon aria-hidden="true" strokeWidth={1.5} className="size-5" />
        {label}
      </Link>
    </li>
  );
}

function Sidebar() {
  return (
    <aside className="sticky top-0 flex h-svh w-60 shrink-0 flex-col gap-6 glass-sidebar px-4 py-6">
      <Wordmark className="px-3 pt-2" />
      <nav aria-label="Principal" className="flex flex-1 flex-col">
        <ul className="flex flex-col gap-1">
          {primary.map((destination) => (
            <SidebarLink key={destination.label} {...destination} />
          ))}
        </ul>
        <hr className="my-2" />
        <ul className="flex flex-1 flex-col gap-1">
          <SidebarLink {...market} />
        </ul>
        <ul>
          <SidebarLink {...settings} />
        </ul>
      </nav>
    </aside>
  );
}

export function AppShell() {
  if (usePrototypeVariant() !== "A") return <ProtoShell />;
  return (
    <div className="flex min-h-svh">
      <Sidebar />
      <main className="flex-1 px-8">
        <div className="mx-auto w-full max-w-content py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
