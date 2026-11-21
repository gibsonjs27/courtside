# Courtside

A responsive, single-player basketball tracker built with React, TypeScript and Vite. The public page shows a player profile, season averages, a scoring trend and approved game results. The admin workspace supports live play logging, undo, score and period controls, post-game box scores, private notes and explicit publication.

## Try the demo

Use Node.js 24 and pnpm 11.25.0. Leave both Supabase variables empty.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL printed in the terminal. Select **Admin** to start a live game or enter a box score. Finalize a live game and choose **Approve & publish** to see its stats appear in the profile. The fictional Jordan Miller and five sample games are included. Demo changes stay in this browser's IndexedDB and do not transfer to production.

To try reloading offline, use `pnpm build` and `pnpm preview`. Open the preview online first and wait for the service worker to finish caching before going offline. The Vite development server does not register a service worker.

## Connect Supabase

1. Create a Supabase project. In **SQL Editor**, run the contents of [the migration](supabase/migrations/202611210001_courtside.sql) once. Check that it finishes successfully.
2. In **Authentication → Users**, create a confirmed email/password user for the scorekeeper and copy its User UID. Disable public sign-ups in Authentication if you do not need them. Only allowlisted users can access tracker data.
3. In SQL Editor, insert the scorekeeper and a public profile. Replace the placeholder UUID, then enter the player details you want visitors to see. A first name, nickname or initials work in the profile.

   ```sql
   insert into public.tracker_admins (user_id)
   values ('00000000-0000-0000-0000-000000000000');

   insert into public.public_profile (id, name, team, number, position, season)
   values (1, 'Jordan M.', 'Westfield Wolves', '24', 'Guard', '2026–27 Season')
   on conflict (id) do update set
     name = excluded.name, team = excluded.team, number = excluded.number,
     position = excluded.position, season = excluded.season;
   ```

4. Copy `.env.example` to `.env.local`. Set `VITE_SUPABASE_URL` to the project URL and `VITE_SUPABASE_PUBLISHABLE_KEY` to the project's publishable key. The values are bundled into the site. Keep the secret and service-role keys out of the frontend and GitHub repository.
5. Run `pnpm dev`. In **Admin**, sign in with the account from step 2. Save a private game, open the profile in a separate browser profile, then verify the game appears only after approval. Use **Unpublish** to remove its public snapshot.

[Supabase password authentication](https://supabase.com/docs/guides/auth/passwords) · [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)

## Deploy to GitHub Pages

1. Copy the project files into the root of a GitHub repository, including hidden files and `.github/workflows/pages.yml`. The workflow builds from `main` or can be run manually.
2. For production, add both Supabase values in **Settings → Secrets and variables → Actions → Variables**. Leave both unset for a public demo. A change to repository variables takes effect on the next build.
3. Under **Settings → Pages**, select **GitHub Actions** as the source. Push to `main` or run **Publish Courtside** from the Actions tab. GitHub shows the URL in the deployment job. Relative assets and hash navigation support a project path such as `https://USER.github.io/REPO/`.

[GitHub Pages publishing options](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## Data and offline behavior

- Public reads are limited to `public_profile` and `approved_games`. Approved snapshots contain the opponent, date, final team score, points, rebounds, assists, steals and blocks. Private events, shooting counts, turnovers, fouls and notes stay in owner-scoped game records. Edits are private until you republish.
- Open production once and sign in online before a game. Keep the admin workspace available when expecting a loss of internet. IndexedDB stores edits and pending commands together and replays the queue when the app is open online with a valid session. If an offline reload cannot restore the session, reconnect and sign in again to resume syncing.
- Server revisions prevent a second device from silently overwriting a game. A conflicting command pauses the queue. Export pending changes, then discard the pending queue and re-enter the needed changes against the latest server version. Treat the export as private. Use one scoring device per game when possible.
- The browser retains cached data and unsynced edits on the scoring device. Use a trusted browser profile. Clearing its site data removes unsynced edits. Previously cached public stats can remain visible offline until the visitor reconnects.
- The season display aggregates currently approved games. This starter is set up for a single player and active season.
