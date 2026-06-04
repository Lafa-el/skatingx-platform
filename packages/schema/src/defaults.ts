import { DEFAULT_ATHLETE_ID } from "./constants";
import type { AthleteProfile } from "./athlete";
import type { DateString } from "./common";
import type { Gamification } from "./gamification";
import type { TrainingState, WeeklyTemplateByDay } from "./training";
import type { UserSettings } from "./user";

export const EMPTY_WEEKLY_TEMPLATE: WeeklyTemplateByDay = {
  monday: "",
  tuesday: "",
  wednesday: "",
  thursday: "",
  friday: "",
  saturday: "",
  sunday: "",
};

export function todayDateString(date = new Date()): DateString {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function createDefaultUserSettings(): Omit<
  UserSettings,
  "createdAt" | "updatedAt"
> {
  return {
    activeAthleteId: DEFAULT_ATHLETE_ID,
    language: "zh",
    theme: "system",
    isPro: false,
    parentPinEnabled: false,
  };
}

export function createDefaultAthleteProfile(
  athleteId: string = DEFAULT_ATHLETE_ID,
): Omit<AthleteProfile, "createdAt" | "updatedAt"> {
  return {
    athleteId,
    displayName: "Lindsay Lin",
    birthDate: "2015-01-14",
    sport: "short_track_speed_skating",
    country: "USA",
  };
}

export function createDefaultGamification(): Omit<
  Gamification,
  "updatedAt"
> {
  return {
    points: 0,
    streakDays: 0,
    completedDays: [],
  };
}

export const DEFAULT_POINTS_PER_TASK = 20;
export const DEFAULT_DAILY_BONUS_POINTS = 50;

export function createDefaultTrainingState(): Omit<TrainingState, "updatedAt"> {
  return {
    todayTasks: [],
    weeklyTemplate: { ...EMPTY_WEEKLY_TEMPLATE },
    lastLoginDate: todayDateString(),
    pointsPerTask: DEFAULT_POINTS_PER_TASK,
    dailyBonusPoints: DEFAULT_DAILY_BONUS_POINTS,
  };
}
