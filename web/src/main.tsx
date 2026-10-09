import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Leaflet's stylesheet rides with the map module (MapView.tsx), which App
// loads on the first map view — catalog and board arrivals never pay for it.
import "./styles.css";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
