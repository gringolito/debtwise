import { fireEvent, screen, within } from "@testing-library/react";

/** Closes the welcome that opens once the onboarding registers the mortgage. */
export async function closeWelcome() {
  const welcome = await screen.findByRole("dialog", { name: "Financiamento configurado!" });
  fireEvent.click(within(welcome).getByRole("button", { name: "Continuar" }));
}

/**
 * Goes through the onboarding from its welcome to "Concluir", leaving every step as it opens, and
 * closes the welcome that follows.
 */
export async function completeOnboarding() {
  fireEvent.click(await screen.findByRole("button", { name: "Configurar meu financiamento" }));
  for (let step = 1; step < 6; step++) {
    await screen.findByText(`Passo ${step} de 6`);
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  }
  fireEvent.click(await screen.findByRole("button", { name: "Concluir" }));
  await closeWelcome();
}
