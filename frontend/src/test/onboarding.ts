import { fireEvent, screen } from "@testing-library/react";

/** Goes through the onboarding from its welcome to "Concluir", leaving every step as it opens. */
export async function completeOnboarding() {
  fireEvent.click(await screen.findByRole("button", { name: "Configurar meu financiamento" }));
  for (let step = 1; step < 6; step++) {
    await screen.findByText(`Passo ${step} de 6`);
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  }
  fireEvent.click(await screen.findByRole("button", { name: "Concluir" }));
}
