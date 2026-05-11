import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "./pages/Contexts/ThemeContext";
import { AuthProvider } from "./pages/Contexts/AuthContext.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  //<React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  //</React.StrictMode>
);