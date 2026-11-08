import { useState } from "react";
import Modal from "./Modal.jsx";
import LoginForm from "./LoginForm.jsx";
import RegisterForm from "./RegisterForm.jsx";
import { useTranslation } from "../i18n/useTranslation.js";

export default function AuthModal({ initialMode = "login", onClose, onAuthenticated }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState(initialMode);

  const handleSuccess = () => {
    onAuthenticated?.();
    onClose();
  };

  return (
    <Modal title={mode === "login" ? t("Log in") : t("Create your account")} onClose={onClose}>
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
