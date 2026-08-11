"use client";
import { useSession } from "next-auth/react";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/NotifyProvider";
import { SkeletonCard } from "@/components/Skeleton";

// Vaste snelkoppelingen in de zijbalk (bv. "Lazarus", "Taartenslag") linken
// hierheen i.p.v. rechtstreeks naar een evenement-id, want dat id verandert
// elk werkjaar. Zoekt het evenement met die naam op voor het meest recente
// werkjaar en stuurt door — bestaat het nog niet, dan kan je het meteen
// aanmaken.
function EvenementGaInner() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const naam = searchParams.get("naam") || "";
  const toast = useToast();
  const [laden, setLaden] = useState(true);
  const [werkjaar, setWerkjaar] = useState(null);
  const [bezig, setBezig] = useState(false);

  const magAanmaken = ["admin", "financieel_verantwoordelijke"].includes(session?.user?.platformRecht);

  useEffect(() => {
    if (!naam) { setLaden(false); return; }
    (async () => {
      const w = await fetch("/api/werkjaren").then((r) => r.json());
      const actueel = w.werkjaren?.[0];
      if (!actueel) { setLaden(false); return; }
      setWerkjaar(actueel);

      const e = await fetch(`/api/evenementen?werkjaarId=${actueel.id}`).then((r) => r.json());
      const zoek = naam.toLowerCase();
      const evenementen = e.evenementen || [];
      const match = evenementen.find((ev) => ev.naam.toLowerCase() === zoek) || evenementen.find((ev) => ev.naam.toLowerCase().includes(zoek));
      if (match) {
        router.replace(`/evenementen/${match.id}`);
        return;
      }
      setLaden(false);
    })();
  }, [naam]);

  const aanmaken = async () => {
    setBezig(true);
    const res = await fetch("/api/evenementen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ naam, werkjaarId: werkjaar?.id }),
    });
    const data = await res.json();
    setBezig(false);
    if (data.error) return toast.error(data.error);
    router.replace(`/evenementen/${data.evenement.id}`);
  };

  if (laden) {
    return (
      <div style={{ padding: 32, maxWidth: 500 }}>
        <SkeletonCard lines={2} />
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 500 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>{naam || "Evenement"}</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        {werkjaar
          ? `Nog geen evenement met deze naam voor werkjaar ${werkjaar.naam}.`
          : "Nog geen werkjaar aangemaakt."}
      </p>
      {werkjaar && (
        magAanmaken ? (
          <button className="btn-primary" disabled={bezig} onClick={aanmaken}>
            {bezig ? "Bezig..." : `+ "${naam}" aanmaken voor ${werkjaar.naam}`}
          </button>
        ) : (
          <p className="muted" style={{ fontStyle: "italic" }}>
            Vraag een admin of financieel verantwoordelijke om dit evenement aan te maken.
          </p>
        )
      )}
    </div>
  );
}

export default function EvenementGa() {
  return (
    <Suspense fallback={<div style={{ padding: 32, maxWidth: 500 }}><SkeletonCard lines={2} /></div>}>
      <EvenementGaInner />
    </Suspense>
  );
}
