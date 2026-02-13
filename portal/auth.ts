import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"
import { getUsersContainer } from "@/app/lib/cosmosClient"
import type { UserDocument } from "@/app/lib/models"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      // On initial sign-in or when session is updated, look up isAdmin from Cosmos DB
      if (user?.email || trigger === "update") {
        const email = user?.email || token.email;
        if (email) {
          try {
            const container = getUsersContainer();
            const { resources } = await container.items
              .query<UserDocument>({
                query: "SELECT c.isAdmin FROM c WHERE c.email = @email",
                parameters: [{ name: "@email", value: email }],
              })
              .fetchAll();
            token.isAdmin = resources[0]?.isAdmin === true;
          } catch {
            token.isAdmin = false;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.isAdmin = token.isAdmin === true;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isProtected = ["/dashboard", "/admin", "/bracket"].some((path) =>
        nextUrl.pathname.startsWith(path)
      );
      if (isProtected && !isLoggedIn) {
        return Response.redirect(new URL("/", nextUrl));
      }
      return true;
    },
  },
})
