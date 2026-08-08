import DiscordProvider from "next-auth/providers/discord";
import { supabaseAdmin } from "@/lib/supabase";

async function upsertUser({ discordId, discordUsername, naam, email }) {
  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id, platform_recht")
    .eq("discord_id", discordId)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from("users")
      .update({ discord_username: discordUsername, naam, email, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return { id: existing.id, platformRecht: existing.platform_recht };
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
