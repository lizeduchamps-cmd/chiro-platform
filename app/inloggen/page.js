"use client";
import { signIn } from "next-auth/react";

export default function InloggenPagina() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="card" style={{ borderRadius: 16, padding: 32, textAlign: "center", maxWidth: 360 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Chiro Hoepertingen</h1>
        <p className="muted" style={{ fontSize: 14, marginBottom: 24 }}>Financiënplatform</p>
        <button
          onClick={() => signIn("discord", { callbackUrl: "/" })}
          style={{
            width: "100%",
            background: "#5865F2",
            color: "white",
            fontWeight: 500,
            border: "none",
            padding: "10px 0",
          }}
        >
          Inloggen met Discord
        </button>
      </div>
    </div>
  );
}
