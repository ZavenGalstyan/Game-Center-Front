import { useState } from "react";
import Modal from "./Modal.jsx";
import LoginForm from "./LoginForm.jsx";
import RegisterForm from "./RegisterForm.jsx";

export default function AuthModal({ initialMode = "login", onClose }) {
  const [mode, setMode] = useState(initialMode);

  return (
    <Modal title={mode === "login" ? "Log in" : "Create your account"} onClose={onClose}>
      {mode === "login" ? (
        <LoginForm
          onSuccess={onClose}
          onSwitchToRegister={() => setMode("register")}
        />
      ) : (
        <RegisterForm
          onSuccess={onClose}
          onSwitchToLogin={() => setMode("login")}
        />
      )}
    </Modal>
  );
}
