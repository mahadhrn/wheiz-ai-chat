# Wheiz

A React Native app built with Expo Router and Supabase.

### Tech stack
- **Client**: React Native, Expo, Expo Router
- **Backend**: Supabase (Postgres, Auth, Storage, Edge Functions)
- **Auth/Storage**: `@supabase/supabase-js` with SecureStore/localStorage session persistence
- **Notifications**: `expo-notifications` (FCM/APNs)

### Prerequisites
- Node.js 18+ and npm (or Yarn/PNPM)
- Expo CLI (installed automatically via `npx expo`)
- A Supabase project (URL + anon key)
- For iOS: Xcode + CocoaPods
- For Android: Android Studio + SDKs
- Optional for web: modern browser

### Clone and install
```bash
# clone
git clone <your-repo-url> wheiz && cd wheiz

# install deps
npm install
```

### Environment variables
This app reads Supabase credentials from Expo public env vars.
Create a `.env` file in the project root:
```bash
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```
Notes:
- These are referenced in `lib/supabase.ts` as `process.env.EXPO_PUBLIC_SUPABASE_URL` and `process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- Expo will auto-load `.env` at runtime (no extra config needed on SDK 52+).

### Supabase setup (optional but recommended)
If you plan to use the provided database schema and Edge Functions:

1) Install Supabase CLI
```bash
npm i -D supabase
```

2) Link your project
```bash
npx supabase link --project-ref <your-project-ref>
```

3) Apply migrations
Migrations live in `supabase/migrations/`.
```bash
npx supabase db push
```

4) Deploy Edge Functions (if you intend to use them)
Functions live under `supabase/functions/` (e.g. `send-message-notification`, `send-event-notification`, `send-event-reminders`).
```bash
npx supabase functions deploy send-message-notification
npx supabase functions deploy send-event-notification
npx supabase functions deploy send-event-reminders
```

5) Set any required DB secrets/policies in the Supabase dashboard as needed for your app flows.

### Running the app
```bash
# start the Expo dev server
npm run dev
```
Then:
- Press `i` for iOS simulator (macOS only)
- Press `a` for Android emulator
- Scan the QR with Expo Go on your device
- Open the web build at the URL shown in the terminal (if supported)

### Linting
```bash
npm run lint
```

### Build
- Web (static export):
```bash
npm run build:web
```
- Native builds: use EAS (`eas.json` is included). You’ll need to install and configure EAS first:
```bash
npm install -g eas-cli
# login to Expo
eas login
# configure project (one time)
eas build:configure
# trigger a build
eas build -p ios   # or android
```

### Notifications (high level)
- Android requires a valid `google-services.json` and FCM setup in Firebase.
- iOS requires APNs credentials set up via Expo/Apple and permission prompts handled at runtime.
- See `expo-notifications` docs for configuration details.

### File map (selected)
- `app/` — Expo Router routes (tabs, auth, chat)
- `lib/supabase.ts` — Supabase client with platform-aware session storage
- `types/supabase.ts` — Generated DB types (adjust per your schema)
- `supabase/` — Migrations and Edge Functions

### Troubleshooting
- Missing env vars: You’ll see "Missing Supabase environment variables" at startup. Ensure `.env` exists and you restarted the dev server.
- Simulator fails to open: Ensure Xcode/Android Studio are installed and the emulator is running.
- Network errors on device: Make sure your device and dev machine are on the same network.

### Scripts reference
- `npm run dev` — Start Expo
- `npm run build:web` — Static web export
- `npm run lint` — Run linter

---

Happy building! If you need help, open an issue or check Expo and Supabase docs.
