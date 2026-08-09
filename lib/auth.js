import DiscordProvider from "next-auth/providers/discord";
import { supabaseAdmin } from "@/lib/supabase";

// Zorgt dat elke inlogger een rij heeft in de 'users'-tabel, en geeft het
// platformrecht van die gebruiker terug (nu beheerd via het platform zelf,
// niet meer via Discord-rollen).
async function upsertUser({ discordId, discordUsername, naam, email }) {
  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id, platform_recht, verantwoordelijkheden, groep")
    .eq("discord_id", discordId)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from("users")
      .update({
        discord_username: discordUsername,
        naam,
        email,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return { id: existing.id, platformRecht: existing.platform_recht, verantwoordelijkheden: existing.verantwoordelijkheden, groep: existing.groep };
  }

  // Was deze persoon al handmatig aangemaakt (vóór hun eerste keer inloggen)?
  // Dan koppelen we die rij nu aan hun echte Discord-account, in plaats van
  // een dubbel profiel aan te maken.
  const { data: placeholder } = await supabaseAdmin
    .from("users")
    .select("id, platform_recht, verantwoordelijkheden, groep")
    .ilike("discord_username", discordUsername)
    .like("discord_id", "handmatig_%")
    .maybeSingle();

  if (placeholder) {
    await supabaseAdmin
      .from("users")
      .update({ discord_id: discordId, discord_username: discordUsername, naam, email, updated_at: new Date().toISOString() })
      .eq("id", placeholder.id);
    return { id: placeholder.id, platformRecht: placeholder.platform_recht, verantwoordelijkheden: placeholder.verantwoordelijkheden, groep: placeholder.groep };
  }

  const { data: created, error } = await supabaseAdmin
    .from("users")
    .insert({ discord_id: discordId, discord_username: discordUsername, naam, email })
    .select("id, platform_recht, verantwoordelijkheden, groep")
    .single();

  if (error) throw error;
  return { id: created.id, platformRecht: created.platform_recht, verantwoordelijkheden: created.verantwoordelijkheden, groep: created.groep };
}

export const authOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      authorization: { params: { scope: "identify email" } },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const { id, platformRecht, verantwoordelijkheden, groep } = await upsertUser({
          discordId: profile.id,
          discordUsername: profile.username,
          naam: profile.global_name || profile.username,
          email: profile.email,
        });
        token.discordId = profile.id;
        token.userId = id;
        token.platformRecht = platformRecht;
        token.verantwoordelijkheden = verantwoordelijkheden;
        token.groep = groep;
      } else if (token.userId) {
        // Actuele platformrecht/verantwoordelijkheden/groep ophalen, zodat een
        // wijziging door een admin snel doorwerkt zonder opnieuw in te loggen.
        const { data } = await supabaseAdmin
          .from("users")
          .select("platform_recht, verantwoordelijkheden, groep")
          .eq("id", token.userId)
          .maybeSingle();
        if (data) {
          token.platformRecht = data.platform_recht;
          token.verantwoordelijkheden = data.verantwoordelijkheden;
          token.groep = data.groep;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.discordId = token.discordId;
      session.user.userId = token.userId;
      session.user.platformRecht = token.platformRecht;
      session.user.verantwoordelijkheden = token.verantwoordelijkheden || [];
      session.user.groep = token.groep || null;
      return session;
    },
  },
  pages: { signIn: "/inloggen" },
};
