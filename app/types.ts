export interface ExercisePrescription {
  id: string;
  kg: number;
  sets: number;
  min: number;
  max: number;
  rest: number;
}
export interface Exercise extends ExercisePrescription {
  name: string;
  en: string;
  muscle: string;
  secondary: string;
  load: "單鈴" | "雙鈴" | "徒手";
  side: boolean;
  timed: boolean;
  start: string;
  action: string;
  safety: string;
  alternative: string;
  demo: string;
}
export interface WorkoutPlan {
  id: string;
  name: string;
  items: ExercisePrescription[];
}
export type WorkoutDay = string;
export interface CompletedSet {
  kg: number;
  reps: number;
  right: number;
  status: "待做" | "完成" | "跳過";
  at: number;
  rir: string;
  note: string;
}
export interface ExerciseSession {
  e: Exercise;
  logs: CompletedSet[];
}
export interface TimerState {
  seconds: number;
  end: number;
  left: number;
  mode: "run" | "pause" | "done" | "idle";
}
export interface WorkoutSession {
  id: string;
  plan: string;
  name: string;
  start: number;
  end: number;
  paused: number;
  pauseAt: number;
  index: number;
  note: string;
  status: string;
  timer: TimerState | null;
  items: ExerciseSession[];
}
export interface UserSettings {
  theme: string;
  reduce: boolean;
  auto: boolean;
  sound: boolean;
  carry: boolean;
  rir: boolean;
  unit: "kg" | "lb";
  rest: number;
  step: number;
  streak: number;
}
export interface BackupMetadata {
  app: string;
  appVersion: string;
  schemaVersion: number;
  exportedAt: string;
}
export interface Workspace {
  version: number;
  exercises: Exercise[];
  plans: WorkoutPlan[];
  cycle: WorkoutDay[];
  cursor: number;
  due: string;
  events: { id: string; date: string; label: string }[];
  history: WorkoutSession[];
  active: WorkoutSession | null;
  settings: UserSettings;
}
