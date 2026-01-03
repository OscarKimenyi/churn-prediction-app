// src/index.js
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css"; // keep your custom CSS if any
import "bootstrap/dist/js/bootstrap.bundle.min.js"; // includes Popper.js
import "bootstrap/dist/css/bootstrap.min.css"; // ← main Bootstrap styles
import "bootstrap-icons/font/bootstrap-icons.css"; // ← optional icons

import App from "./App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
