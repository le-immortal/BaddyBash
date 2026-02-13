import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id"
import { ManagedIdentityCredential } from "@azure/identity"
import { getUsersContainer } from "@/app/lib/cosmosClient"
import type { UserDocument } from "@/app/lib/models"

const isDev = process.env.NODE_ENV === "development";

// Acquire a Managed Identity token to use as client_assertion
// for Federated Identity Credential auth with Entra ID
async function getClientAssertion(): Promise<string> {
  try {
    console.log("[AUTH] Requesting MI token for api://AzureADTokenExchange...");
    const credential = new ManagedIdentityCredential();
    const result = await credential.getToken("api://AzureADTokenExchange");
    console.log("[AUTH] MI token acquired successfully, expires:", result.expiresOnTimestamp);
    return result.token;
  } catch (err) {
    console.error("[AUTH] Failed to get MI token:", err);
    throw err;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: isDev
    ? [
        GitHub({
          clientId: process.env.AUTH_GITHUB_ID,
          clientSecret: process.env.AUTH_GITHUB_SECRET,
        }),
      ]
    : [
        MicrosoftEntraID({
          clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
          clientSecret: "unused", // required by Auth.js type but not sent
          issuer: `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}/v2.0`,
          token: {
            async request({ params, provider }: { params: URLSearchParams; provider: { callbackUrl: string } }) {
              console.log("[AUTH] Token exchange starting...");
              console.log("[AUTH] Callback URL:", provider.callbackUrl);
              const assertion = await getClientAssertion();
              const body = new URLSearchParams({
                grant_type: "authorization_code",
                code: params.get("code")!,
                redirect_uri: provider.callbackUrl,
                client_id: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
                client_assertion_type:
                  "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
                client_assertion: assertion,
              });
              // Include code_verifier for PKCE if present
              const codeVerifier = params.get("code_verifier");
              if (codeVerifier) body.set("code_verifier", codeVerifier);

              console.log("[AUTH] Sending token request to Entra ID...");
              const response = await fetch(
                `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}/oauth2/v2.0/token`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body,
                }
              );
              const tokens = await response.json();
              if (!response.ok) {
                console.error("[AUTH] Token exchange failed:", response.status, JSON.stringify(tokens));
                throw new Error(
                  `Token request failed: ${tokens.error_description || tokens.error}`
                );
              }
              console.log("[AUTH] Token exchange successful!");
              return { tokens };
            },
          },
        }),
      ],
  callbacks: {
    async signIn({ user, account }) {
      // Allow GitHub/Dev login without domain restriction
      if (isDev || account?.provider === "github") return true;

      if (!user.email) return false;
      // Enforce Microsoft domain restriction in production
      if (!user.email.endsWith('@microsoft.com')) {
        return false;
      }
      return true;
    },
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
