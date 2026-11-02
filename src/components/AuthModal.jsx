import { useState } from "react";
import Modal from "./Modal.jsx";
import LoginForm from "./LoginForm.jsx";
import RegisterForm from "./RegisterForm.jsx";

export default function AuthModal({ initialMode = "login", onClose, onAuthenticated }) {
  const [mode, setMode] = useState(initialMode);

  const handleSuccess = () => {
    onAuthenticated?.();
    onClose();
  };

  return (
    <Modal title={mode === "login" ? "Log in" : "Create your account"} onClose={onClose}>
      {mode === "login" ? (
        <LoginForm
          onSuccess={handleSuccess}
          onSwitchToRegister={() => setMode("register")}
        />
      ) : (
        <RegisterForm
          onSuccess={handleSuccess}
          onSwitchToLogin={() => setMode("login")}
        />
      )}
    </Modal>
  );
}
