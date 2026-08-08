"use client";
import { signIn } from "next-auth/react";

export default function InloggenPagina() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "white", borderRadius: 16, border: "1px solid #E4E0D4", padding: 32, textAlign: "center", maxWidth: 360 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "#1E2A22", marginBottom: 4 }}>Chiro Hoepertingen</h1>
        <p style={{ fontSize: 14, color: "#6B6B5F", marginBottom: 24 }}>Financiënplatform</p>
        <button
          onClick={() => signIn("discord", { callbackUrl: "/" })}
          style={{
            width: "100%",
            background: "#5865F2",
            color: "white",
            fontWeight: 500,
            border: "none",
            borderRadius: 8,
            padding: "10px 0",
            cursor: "pointer",
          }}
        >
          Inloggen met Discord
        </button>
      </div>
    </div>
  );
}
