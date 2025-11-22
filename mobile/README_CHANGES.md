# Baku Reserve – Concierge UX Refresh (Nov 2025)

## Home (Discover tab)

- Tight scroll budget enforced by `ScrollBudget` (≈2 screen heights) and `MAX_HOME_SECTIONS = 5`.
- Order: `TopContextBar` → search launcher → single hero row → optional My Bookings tile → optional Featured Experiences. Optional concierge teaser only appears when `ui.homeConciergeLink` is true and there is spare budget.
- Search launcher is a pressable card with haptics. Tapping routes to Explore/Search and fires `home_search_tap`.
- `Most booked` v `Trending` hero swaps via `experiments.homeHeroSwap` (defaults to “Most booked tonight”). Each hero row has a “See all” CTA that routes to the new `RestaurantCollection` screen.
- Hero + Trending carousels now pull 10–15 randomly sampled restaurants from the live 53-venue catalog (no more fake “preview” cards).
- Bookings tile pulls the next reservation (if authenticated) via `useUpcomingReservation` and links to the Bookings tab.

## Explore

- Concierge sits above the fold: large `ConciergeEntryCard` with curated prompts. Tapping (or selecting a prompt) opens the dedicated `Concierge` screen powered by `ConciergeAssistantCard`.
- Trending row remains on Explore (single carousel, 10–15 items) with a See-all CTA.
- `Events near you` rows only render when real data is available (kept empty for now per spec).
- “Browse by vibe” grid uses the curated `BROWSE_CATEGORIES` (2×3/2×4) and routes to `RestaurantCollection` with the selected category filter.
- The vibe grid is now fixed at 3×3 (nine moods) with compact icons for quicker scanning.
- No vertical “all restaurants” list on Explore; deep browsing happens via See-all routes.

## Availability signals & menu handling

- `features.availabilitySignals` (or `ui.availabilitySignals`) controls the ethical urgency badge. When enabled, the restaurant detail screen fetches live availability for the current day. The “Almost full” chip shows only when <20% of tables remain for the next relevant slot, and analytics emit `availability_signal_view`.
- “View menu” opens in the in-app browser (`expo-web-browser`) with graceful fallbacks to `Linking` and friendly alerts when URLs are missing.
- Major actions (open search, concierge, “See availability”) now send light haptics.

## New navigation surfaces

- `Concierge` stack screen hosts the conversational assistant.
- `RestaurantCollection` stack screen lists “See all” results for hero/trending/category flows while keeping tabs to four entries.

## Feature flags / experiments

- `ui.homeConciergeLink` toggles the subtle “Open Concierge in Explore” link on Home.
- `experiments.homeHeroSwap` swaps the hero row between “Most booked tonight” and “Trending this week”. Only one hero renders at a time.
- `features.availabilitySignals` (or `ui.availabilitySignals`) enables “Almost full”.
- `RestaurantDirectoryProvider` caches the restaurant list so Home/Explore/Concierge share one fetch (faster landing experience).

## Tests & QA

- Added unit coverage for `ScrollBudget` (`npm test -- --runTestsByPath __tests__/scrollBudget.test.tsx`).
- Existing integration tests continue to run via `npm test -- --runInBand`.
- Capture updated screenshots (light/dark + Large text) via Expo Go before pushing PRs; drop them under `artifacts/` or attach to the PR.
