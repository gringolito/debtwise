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
  /** The label in the phone's tab bar, where the full one doesn't fit. */
  short?: string;
  icon: LucideIcon;
}

const primary: Destination[] = [
  { to: "/", label: "Início", icon: HouseIcon },
  { to: "/comparar", label: "Comparar", icon: ScaleIcon },
  { to: "/financiamento", label: "Financiamento", short: "Financ.", icon: LandmarkIcon },
  { to: "/investimentos", label: "Investimentos", short: "Invest.", icon: TrendingUpIcon },
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
    <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col gap-6 glass-sidebar px-4 py-6 md:flex">
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
      <Link
        to={to}
        activeOptions={{ exact: to === "/" }}
        className="flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-full text-caption text-muted-foreground aria-[current=page]:bg-accent-tint aria-[current=page]:text-accent"
      >
        <Icon aria-hidden="true" strokeWidth={1.75} className="size-5.5" />
        {short ? (
          <>
            <span aria-hidden="true">{short}</span>
            <span className="sr-only">{label}</span>
          </>
        ) : (
          label
        )}
      </Link>
    </li>
  );
}

/** Under md, the destinations float at the bottom in a glass bar, with Ajustes as its own button. */
function TabBar() {
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-3 bottom-tab-bar z-40 flex items-center gap-2 md:hidden"
    >
      <ul className="grid flex-1 grid-cols-5 rounded-full glass-bar p-1">
        {[...primary, market].map((destination) => (
          <TabLink key={destination.label} {...destination} />
        ))}
      </ul>
      <Link
        to={settings.to}
        aria-label={settings.label}
        className="grid size-15 shrink-0 place-items-center rounded-full glass-bar text-muted-foreground aria-[current=page]:bg-accent-tint aria-[current=page]:text-accent"
      >
        <SettingsIcon aria-hidden="true" strokeWidth={1.75} className="size-5.5" />
      </Link>
    </nav>
  );
}

/** AppShell frames every page with the destinations: a sidebar from md, a tab bar under it. */
export function AppShell({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex min-h-svh">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 pt-6 pb-tab-bar md:px-8 md:py-10">
        <div className="mx-auto w-full max-w-content">{children ?? <Outlet />}</div>
      </main>
      <TabBar />
    </div>
  );
}
