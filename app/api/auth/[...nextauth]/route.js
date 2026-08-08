import NextAuth from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import { supabaseAdmin } from "@/lib/supabase";

async function fetchGuildRoles(accessToken) {
  const guildId = process.env.DISCORD_GUILD_ID;
  const res = await fetch(
    `https://discord.com/api/users/@me/guilds/${guildId}/member`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return [];
  const member = await res.json();
  return member.roles || [];
}

async function resolvePlatformRecht(roleIds) {
  if (!roleIds.length) return "lid";
  const { data, error } = await supabaseAdmin
    .from("discord_role_mapping")
    .select("discord_role_id, platform_recht")
    .in("discord_role_id", roleIds);
  if (error || !data || data.length === 0) return "lid";
  if (data.some((r) => r.platform_recht === "admin")) return "admin";
  if (data.some((r) => r.platform_recht === "financieel_verantwoordelijke"))
    return "financieel_verantwoordelijke";
  return "lid";
}

async function upsertUser({ discordId, discordUsername, naam, email }) {
  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("discord_id", discordId)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from("users")
      .update({ discord_username: discordUsername, naam, email, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data: created, error } = await supabaseAdmin
    .from("users")
    .insert({ discord_id: discordId, discord_username: discordUsername, naam, email })
    .select("id")
    .single();

  if (error) throw error;
  return created.id;
}

const handler = NextAuth({
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      authorization: {
        params: { scope: "identify email guilds.members.read" },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const roleIds = await fetchGuildRoles(account.access_token);
        const platformRecht = await resolvePlatformRecht(roleIds);
        const userId = await upsertUser({
          discordId: profile.id,
          discordUsername: `${profile.username}`,
          naam: profile.global_name || profile.username,
          email: profile.email,
        });
        token.discordId = profile.id;
        token.platformRecht = platformRecht;
        token.userId = userId;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.discordId = token.discordId;
      session.user.platformRecht = token.platformRecht;
      session.user.userId = token.userId;
      return session;
    },
  },
  pages: {
    signIn: "/inloggen",
  },
});

export { handler as GET, handler as POST };
