"use client";
import { useSession, signOut } from "next-auth/react";
import { redirect } from "next/navigation";

export default function Dashboard() {
  const { data: session, status } = useSession();

  if (status === "loading") return <p style={{ padding: 32 }}>Laden…</p>;
  if (status === "unauthenticated") redirect("/inloggen");

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: "#1E2A22" }}>
        Welkom, {session.user.name}
      </h1>
      <p style={{ color: "#6B6B5F", fontSize: 14 }}>
        Discord ID: {session.user.discordId} · Platformrecht:{" "}
        <strong>{session.user.platformRecht}</strong>
      </p>
      {session.user.platformRecht === "admin" && (
        <p style={{ marginTop: 16 }}>
          <a href="/beheer/gebruikers" style={{ color: "#2F4A3C", fontWeight: 600 }}>
            → Gebruikers &amp; rollen beheren
          </a>
        </p>
      )}
      <p style={{ color: "#9A9A8C", fontSize: 12, marginTop: 24 }}>
        Dit is de eerste werkende versie: login + rechten-koppeling staan. De
        schermen voor kasboek, fv en rollenbeheer bouwen we hierop verder.
      </p>
      <button onClick={() => signOut()} style={{ marginTop: 16 }}>
        Uitloggen
      </button>
    </div>
  );
}
