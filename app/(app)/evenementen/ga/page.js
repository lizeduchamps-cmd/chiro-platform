"use client";
import { getSession } from "next-auth/react";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/NotifyProvider";
import { SkeletonCard } from "@/components/Skeleton";

// Vaste snelkoppelingen in de zijbalk (bv. "Lazarus", "Taartenslag") linken
// hierheen i.p.v. rechtstreeks naar een evenement-id, want dat id verandert
// elk werkjaar. Zoekt het evenement met die naam op voor het meest recente
// werkjaar en stuurt meteen door naar het kostenoverzicht — bestaat het nog
// niet, dan wordt het automatisch aangemaakt (deze vaste namen komen toch elk
// werkjaar terug), zonder tussenstap.
function EvenementGaInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const naam = searchParams.get("naam") || "";
  const toast = useToast();
  const [laden, setLaden] = useState(true);
  const [melding, setMelding] = useState(null);

  useEffect(() => {
    if (!naam) { setLaden(false); return; }
    (async () => {
      const w = await fetch("/api/werkjaren").then((r) => r.json());
      const actueel = w.werkjaren?.[0];
      if (!actueel) { setMelding("Nog geen werkjaar aangemaakt."); setLaden(false); return; }

      const e = await fetch(`/api/evenementen?werkjaarId=${actueel.id}`).then((r) => r.json());
      const zoek = naam.toLowerCase();
      const evenementen = e.evenementen || [];
      const match = evenementen.find((ev) => ev.naam.toLowerCase() === zoek) || evenementen.find((ev) => ev.naam.toLowerCase().includes(zoek));
      if (match) {
        router.replace(`/evenementen/${match.id}`);
        return;
      }

      const sessie = await getSession();
      if (!["admin", "financieel_verantwoordelijke"].includes(sessie?.user?.platformRecht)) {
        setMelding(`Nog geen evenement "${naam}" voor werkjaar ${actueel.naam}. Vraag een admin of financieel verantwoordelijke om dit aan te maken.`);
        setLaden(false);
        return;
      }

      const res = await fetch("/api/evenementen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ naam, werkjaarId: actueel.id }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        setMelding(`Aanmaken van "${naam}" is mislukt.`);
        setLaden(false);
        return;
      }
      router.replace(`/evenementen/${data.evenement.id}`);
    })();
  }, [naam]);

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
      <p className="muted">{melding}</p>
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
