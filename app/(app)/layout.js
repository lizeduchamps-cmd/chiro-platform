"use client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Layout from "@/components/Layout";

// Eén vaste laag rond alle ingelogde pagina's: de sessiecheck en de zijbalk
// zitten hier centraal, zodat ze niet bij elke paginawissel opnieuw worden
// opgebouwd (dat gaf een korte "lege pagina" flits bij elke klik).
export default function AppLayout({ children }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.push("/inloggen");
  }, [status, router]);

  if (status === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }} className="muted">
        Laden…
      </div>
    );
  }
  if (status === "unauthenticated") return null;

  return <Layout session={session}>{children}</Layout>;
}
