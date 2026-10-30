import { subscribeToRaceEvents } from "@skatingx/firebase-client";

/**
 * The one place the plan page's race-week hook reaches the Race Day subscriber. It is a separate
 * file so the hook can load it with `import()`: Race Day's reader, codec and validation are about
 * 24 kB that the plan page must not download while the feature is off.
 */
export const subscribeRaceWeekEvents = subscribeToRaceEvents;
