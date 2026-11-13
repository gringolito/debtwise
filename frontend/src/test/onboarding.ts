import { fireEvent, screen, within } from "@testing-library/react";

/** Closes the welcome that opens once the onboarding registers the mortgage. */
export async function closeWelcome() {
  const welcome = await screen.findByRole("dialog", { name: "Financiamento configurado!" });
  fireEvent.click(within(welcome).getByRole("button", { name: "Continuar" }));
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/**
 * Goes through the onboarding from its welcome to "Concluir", answering every step with valid
 * terms, since a step with a field left empty does not go on, and closes the welcome that follows.
 */
export async function completeOnboarding() {
  const next = () => fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.click(await screen.findByRole("button", { name: "Configurar meu financiamento" }));

  await screen.findByText("Passo 1 de 6");
  fill("Data do contrato", "10/12/2023");
  fill("Valor financiado", "60.000,00");
  fill("Prazo", "6");
  fill("Primeira prestação", "10/01/2024");
  next();

  await screen.findByText("Passo 2 de 6");
  next();

  await screen.findByText("Passo 3 de 6");
  fireEvent.click(screen.getByRole("radio", { name: "TR" }));
  next();

  await screen.findByText("Passo 4 de 6");
  fill("Taxa de juros anual", "9,5");
  next();

  await screen.findByText("Passo 5 de 6");
  fill("Valor de avaliação", "100.000,00");
  fill("MIP · Morte e invalidez", "0,0258");
  fill("DFI · Danos ao imóvel", "0,01");
  next();

  fireEvent.click(await screen.findByRole("button", { name: "Concluir" }));
  await closeWelcome();
}
