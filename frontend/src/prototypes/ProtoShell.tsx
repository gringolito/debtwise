// PROTOTYPE, throwaway: the "Orvalho nítido" shell. From 900px it keeps the glass sidebar; under
// it, the destinations move to a floating Liquid Glass tab bar with Ajustes as its own glass
// button, the way iOS 26 pairs a tab bar with an accessory button.
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

interface Destination {
  to: LinkProps["to"];
  label: string;
  short?: string;
  icon: LucideIcon;
}

const primary: Destination[] = [
  { to: "/", label: "Início", icon: HouseIcon },
  { to: "/financiamento", label: "Financiamento", short: "Financ.", icon: LandmarkIcon },
  { to: "/investimentos", label: "Investimentos", short: "Invest.", icon: TrendingUpIcon },
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
    <aside className="proto-sidebar sticky top-0 h-svh w-60 shrink-0 flex-col gap-6 glass-sidebar px-4 py-6">
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

function TabLink({ to, label, short, icon: Icon }: Destination) {
  return (
    <li>
      <Link to={to} activeOptions={{ exact: to === "/" }} className="proto-tab" aria-label={label}>
        <Icon aria-hidden="true" strokeWidth={1.75} className="size-[22px]" />
        <span aria-hidden="true">{short ?? label}</span>
      </Link>
    </li>
  );
}

function TabBar() {
  return (
    <nav aria-label="Principal" className="proto-tabbar">
      <ul className="proto-tabbar-capsule">
        {[...primary, market].map((destination) => (
          <TabLink key={destination.label} {...destination} />
        ))}
      </ul>
      <Link to={settings.to} className="proto-tabbar-accessory" aria-label={settings.label}>
        <SettingsIcon aria-hidden="true" strokeWidth={1.75} className="size-[22px]" />
      </Link>
    </nav>
  );
}

export function ProtoShell({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex min-h-svh">
      <Sidebar />
      <main className="proto-main flex-1">
        <div className="mx-auto w-full max-w-content">{children ?? <Outlet />}</div>
      </main>
      <TabBar />
    </div>
  );
}
