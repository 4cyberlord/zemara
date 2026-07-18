# Videorc Trademark and Brand Policy

The Videorc source code is licensed under the [AGPL-3.0](LICENSE). This policy
covers what that license does **not** grant: the "Videorc" name, the Videorc
logo, and the application icon (`apps/desktop/build-resources/icon.icns`,
`icon.ico`, and the logo assets used on videorc.com). These identify the
official project maintained by Uros Miric (TheOrcDev) and are not licensed for
reuse in derived works.

## What you can do without asking

- **Build, run, modify, and study** the code for yourself — the AGPL covers all
  of that, branding included, as long as you are not distributing.
- **Redistribute unmodified official builds or an unmodified source checkout**
  with the branding intact.
- **Refer to Videorc by name** to describe compatibility or origin (nominative
  use): "MyStudio is a fork of Videorc" or "based on Videorc" is fine and
  appreciated.
- **Write about Videorc** — articles, videos, reviews, tutorials — using the
  name and screenshots.

## What you must do when distributing a modified version

If you distribute a build with any modification (including a rebuild from
patched source), you must:

1. **Use your own name and icon.** Do not call the app "Videorc" or anything
   confusingly similar, and do not ship the Videorc logo or app icon.
2. **Use your own bundle identifier.** Do not ship `dev.theorcdev.videorc` —
   colliding identifiers corrupt users' settings, permissions (TCC), and
   update state.
3. **Register your own platform OAuth applications** (YouTube, Twitch, X)
   instead of shipping the client IDs in `crates/videorc-backend/src/oauth.rs`.
   Those identify the official app to the platforms; your fork's traffic on
   them can get the official app rate-limited or suspended. Build-time
   `VIDEORC_BUNDLED_*` and runtime `VIDEORC_*_CLIENT_ID` overrides exist
   exactly for this.
4. **Run your own update feed and backend host.** The official update feed and
   `videorc.com` API serve the official app only.
5. **Not imply endorsement.** Don't present your build as official, and don't
   use the Videorc brand in your fork's marketing beyond the nominative use
   described above.

And, per the AGPL itself: provide your modified source to your users.

## Why this exists

Videorc is open core: the code is genuinely free, and the project is funded by
the hosted premium services behind it. The one thing we reserve is the identity
— so that "Videorc" always means the official, signed, supported app. Questions
or edge cases: theorcdev@gmail.com.
