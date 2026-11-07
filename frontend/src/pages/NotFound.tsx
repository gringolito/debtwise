import { Link } from "@tanstack/react-router";
import { Wordmark } from "@/components/layout/Wordmark";
import { Button } from "@/components/ui/button";

export function NotFound() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center px-4">
      <Wordmark className="absolute top-8 left-10" />
      <main className="flex max-w-120 flex-col items-center text-center">
        <p aria-hidden="true" className="mb-4 text-hero-figure text-tertiary-foreground">
          404
        </p>
        <h1 className="mb-3 text-large-title">Esta página não existe</h1>
        <p className="mb-8 text-muted-foreground">O endereço pode ter mudado.</p>
        <Button asChild>
          <Link to="/">Voltar ao início</Link>
        </Button>
      </main>
    </div>
  );
}
