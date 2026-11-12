import { QueryClient } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createAppRouter } from "./router";
import "./index.css";
import "./prototypes/tokens.css";
import "./prototypes/shell.css";
import "./prototypes/mobile.css";
import "./prototypes/investments.css";
import "./prototypes/decidir.css";
import { PrototypeSwitcher } from "./prototypes/PrototypeSwitcher";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App queryClient={new QueryClient()} router={createAppRouter()} />
    <PrototypeSwitcher />
  </StrictMode>,
);
