import NextAuth, { customFetch } from "next-auth";
import GitHub from "next-auth/providers/github"
import { ManagedIdentityCredential } from "@azure/identity"
import { getUsersContainer } from "@/app/lib/cosmosClient"
import type { UserDocument } from "@/app/lib/models"
import type { OIDCConfig } from "next-auth/providers"

const isDev = process.env.NODE_ENV === "development";
const tenantId = process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID;
const clientId = process.env.AUTH_MICROSOFT_ENTRA_ID_ID!;

// Acquire a Managed Identity token to use as client_assertion
// for Federated Identity Credential auth with Entra ID
async function getClientAssertion(): Promise<string> {
  console.log("[AUTH] Requesting MI token for api://AzureADTokenExchange...");
  const credential = new ManagedIdentityCredential();
  const result = await credential.getToken("api://AzureADTokenExchange");
  console.log("[AUTH] MI token acquired, expires:", result.expiresOnTimestamp);
  return result.token;
}

// Custom OIDC provider for Entra ID with Federated Identity Credential.
// Auth.js v5 uses oauth4webapi internally and ignores token.request overrides.
// We use the customFetch symbol to intercept the token endpoint request
// and inject the Managed Identity client assertion.
function EntraIDWithFIC() {
  return {
    id: "microsoft-entra-id",
    name: "Microsoft Entra ID",
    type: "oidc" as const,
    clientId,
    clientSecret: "unused",
    issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    authorization: { params: { scope: "openid profile email User.Read" } },
    client: { token_endpoint_auth_method: "none" as const },
    [customFetch]: async (...args: Parameters<typeof fetch>) => {
      const url = new URL(args[0] instanceof Request ? args[0].url : (args[0] as string));

      // Fix OpenID discovery tenant placeholder (same as default MicrosoftEntraID provider)
      if (url.pathname.endsWith(".well-known/openid-configuration")) {
        const response = await fetch(...args);
        const json = await response.json();
        const issuer = json.issuer.replace("{tenantid}", tenantId);
        return Response.json({ ...json, issuer });
      }

      // Intercept token endpoint — inject MI client assertion
      if (url.pathname.endsWith("/oauth2/v2.0/token")) {
        console.log("[AUTH] Intercepting token endpoint, injecting MI client assertion...");
        const assertion = await getClientAssertion();
        const body = args[1]?.body as URLSearchParams;
        body.set("client_id", clientId);
        body.set("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
        body.set("client_assertion", assertion);
        console.log("[AUTH] Client assertion injected, sending token request...");
      }

      return fetch(...args);
    },
    profile(profile: Record<string, string>) {
      return {
        id: profile.sub,
        name: profile.name,
        email: profile.email,
        image: null,
      };
    },
  } satisfies OIDCConfig<Record<string, string>>;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: isDev
    ? [
        GitHub({
          clientId: process.env.AUTH_GITHUB_ID,
          clientSecret: process.env.AUTH_GITHUB_SECRET,
        }),
      ]
    : [EntraIDWithFIC()],
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
      const isProtected = ["/dashboard", "/admin"].some((path) =>
        nextUrl.pathname.startsWith(path)
      );
      if (isProtected && !isLoggedIn) {
        return Response.redirect(new URL("/", nextUrl));
      }
      return true;
    },
  },
})
