"use client";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import Layout from "@/components/Layout";

export default function Dashboard() {
  const { data: session, status } = useSession();

  if (status === "loading") return <p style={{ padding: 32 }}>Laden…</p>;
  if (status === "unauthenticated") redirect("/inloggen");

  return (
    <Layout session={session}>
      <div style={{ padding: 32 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "#1E2A22" }}>
          Welkom, {session.user.name}
        </h1>
        <p style={{ color: "#6B6B5F", fontSize: 14 }}>
          Discord ID: {session.user.discordId} · Platformrecht:{" "}
          <strong>{session.user.platformRecht}</strong>
        </p>
        <p style={{ color: "#9A9A8C", fontSize: 12, marginTop: 24 }}>
          Gebruik de zijbalk links om tussen Kasboek, CSV Upload en (als admin)
          Gebruikersbeheer te wisselen.
        </p>
      </div>
    </Layout>
  );
}
