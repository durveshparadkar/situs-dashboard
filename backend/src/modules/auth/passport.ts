// passport.ts
//
// Configures the Google OAuth2 strategy for Passport. This does NOT
// create users or issue JWTs itself — it only verifies the identity
// with Google and hands back a minimal profile object. The actual
// user lookup/creation happens in authService.loginWithGoogle,
// called from auth.controller.ts's googleCallback handler.
//
// session: false is used everywhere this strategy is invoked (see
// auth.routes.ts), so serializeUser/deserializeUser are not needed —
// we don't maintain server-side sessions, only our own JWT cookies.

import passport from "passport";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_CALLBACK_URL =
  process.env.GOOGLE_CALLBACK_URL ||
  "https://api.situsrevenue.com/api/auth/google/callback";

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.warn(
    "⚠️  GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — Google login will fail until these env vars are configured on Render."
  );
}

passport.use(
  new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: GOOGLE_CALLBACK_URL,
    },
    (
      _accessToken: string,
      _refreshToken: string,
      profile: Profile,
      done: (error: unknown, user?: any) => void
    ) => {
      try {
        const email = profile.emails?.[0]?.value;

        if (!email) {
          return done(new Error("Google account has no accessible email"));
        }

        // Minimal shape consumed by authController.googleCallback ->
        // authService.loginWithGoogle. We deliberately don't touch
        // the database here — that's the service layer's job.
        const googleUser = {
          googleId: profile.id,
          email,
          fullName: profile.displayName || "",
        };

        return done(null, googleUser);
      } catch (err) {
        return done(err);
      }
    }
  )
);

export default passport;