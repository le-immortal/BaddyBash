import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
  ],
  callbacks: {
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
