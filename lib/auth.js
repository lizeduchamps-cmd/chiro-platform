import DiscordProvider from "next-auth/providers/discord";
import { supabaseAdmin } from "@/lib/supabase";

// Zorgt dat elke inlogger een rij heeft in de 'users'-tabel, en geeft het
// platformrecht van die gebruiker terug (nu beheerd via het platform zelf,
// niet meer via Discord-rollen).
async function upsertUser({ discordId, discordUsername, naam, email }) {
  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id, platform_recht")
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
    return { id: existing.id, platformRecht: existing.platform_recht };
  }

  // Was deze persoon al handmatig aangemaakt (vóór hun eerste keer inloggen)?
  // Dan koppelen we die rij nu aan hun echte Discord-account, in plaats van
  // een dubbel profiel aan te maken.
  const { data: placeholder } = await supabaseAdmin
    .from("users")
    .select("id, platform_recht")
    .ilike("discord_username", discordUsername)
    .like("discord_id", "handmatig_%")
    .maybeSingle();

  if (placeholder) {
    await supabaseAdmin
      .from("users")
      .update({ discord_id: discordId, discord_username: discordUsername, naam, email, updated_at: new Date().toISOString() })
      .eq("id", placeholder.id);
    return { id: placeholder.id, platformRecht: placeholder.platform_recht };
  }

  const { data: created, error } = await supabaseAdmin
    .from("users")
    .insert({ discord_id: discordId, discord_username: discordUsername, naam, email })
    .select("id, platform_recht")
    .single();

  if (error) throw error;
  return { id: created.id, platformRecht: created.platform_recht };
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
        const { id, platformRecht } = await upsertUser({
          discordId: profile.id,
          discordUsername: profile.username,
          naam: profile.global_name || profile.username,
          email: profile.email,
        });
        token.discordId = profile.id;
        token.userId = id;
        token.platformRecht = platformRecht;
      } else if (token.userId) {
        // Actuele platformrecht ophalen, zodat een wijziging door een admin
        // snel doorwerkt zonder dat iemand opnieuw moet inloggen.
        const { data } = await supabaseAdmin
          .from("users")
          .select("platform_recht")
          .eq("id", token.userId)
          .maybeSingle();
        if (data) token.platformRecht = data.platform_recht;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.discordId = token.discordId;
      session.user.userId = token.userId;
      session.user.platformRecht = token.platformRecht;
      return session;
    },
  },
  pages: { signIn: "/inloggen" },
};
