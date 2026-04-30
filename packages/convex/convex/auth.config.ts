/**
 * Convex Auth configuration -- declares which JWT issuers Convex trusts.
 *
 * Identity is now provided by Clerk. The web app mints a JWT via Clerk's
 * "convex" JWT template (audience = "convex"), and Convex validates the
 * signature against Clerk's JWKS automatically once the issuer matches
 * `CLERK_ISSUER_URL`. The Fastify Bridge verifies the same token with
 * `jose` -- one token, two consumers.
 */

export default {
  providers: [
    {
      domain: process.env.CLERK_ISSUER_URL,
      applicationID: 'convex',
    },
  ],
}
