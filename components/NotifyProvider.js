"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";

// Eén gedeelde laag voor toasts (vervangt alert()) en een bevestigingsmodal
// (vervangt confirm()) zodat geen enkele pagina nog blokkerende browser-
// popups gebruikt. Toast en confirm horen samen bij dezelfde "meldingen"-
// verantwoordelijkheid, vandaar één provider i.p.v. twee losse.
const ToastContext = createContext(null);
const ConfirmContext = createContext(null);

let volgendeId = 1;

export function NotifyProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmVraag, setConfirmVraag] = useState(null);
  const resolveRef = useRef(null);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    ({ type = "info", message, action, duration }) => {
      const id = volgendeId++;
      const duur = duration ?? (type === "error" ? 5000 : action ? 5000 : 3000);
      setToasts((prev) => [...prev, { id, type, message, action, duration: duur }]);
      if (!action) {
        setTimeout(() => dismiss(id), duur);
      }
      return id;
    },
    [dismiss]
  );

  const toast = {
    success: (message) => show({ type: "success", message }),
    error: (message) => show({ type: "error", message: message || "Er ging iets mis." }),
    info: (message) => show({ type: "info", message }),
    // Toont "Ongedaan maken" met een aftellende voortgangsbalk. De aanroeper
    // heeft de UI al optimistisch bijgewerkt (bv. rij verwijderd uit state);
    // onCommit voert de echte serveractie pas uit als de tijd verstrijkt.
    undoable: ({ message, onUndo, onCommit, duration = 4500 }) => {
      const id = show({
        type: "undo",
        message,
        duration,
        action: {
          label: "Ongedaan maken",
          onClick: () => {
            clearTimeout(timer);
            dismiss(id);
            onUndo?.();
          },
        },
      });
      const timer = setTimeout(() => {
        dismiss(id);
        onCommit?.();
      }, duration);
    },
  };

  const confirm = useCallback(({ title = "Bevestigen", message, danger = false, bevestigLabel = "Bevestigen" }) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setConfirmVraag({ title, message, danger, bevestigLabel });
    });
  }, []);

  const antwoord = (ok) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setConfirmVraag(null);
  };

  return (
    <ToastContext.Provider value={toast}>
      <ConfirmContext.Provider value={confirm}>
        {children}

        <div className="toast-stack no-print">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast-${t.type}`}>
              <span>{t.message}</span>
              {t.action && (
                <button className="toast-action" onClick={t.action.onClick}>
                  {t.action.label}
                </button>
              )}
              <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Sluiten">✕</button>
              {t.action && <div className="toast-bar" style={{ animationDuration: `${t.duration}ms` }} />}
            </div>
          ))}
        </div>

        {confirmVraag && (
          <div className="confirm-overlay no-print" onClick={() => antwoord(false)}>
            <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{confirmVraag.title}</div>
              <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>{confirmVraag.message}</p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => antwoord(false)}>Annuleren</button>
                <button className={confirmVraag.danger ? "btn-danger-solid" : "btn-primary"} onClick={() => antwoord(true)}>
                  {confirmVraag.bevestigLabel}
                </button>
              </div>
            </div>
          </div>
        )}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
