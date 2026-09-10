import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

// One page, one bundle: /  → the Ask Aya workplan.
createRoot(document.getElementById("root")).render(<App />);
