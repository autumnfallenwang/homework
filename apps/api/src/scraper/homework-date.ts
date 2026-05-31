// Homework date helpers now live in @homework/shared (the web needs them too).
// Re-export so the scraper/fetch code keeps importing from "../scraper/homework-date.js".
export {
  dueDateToIso,
  hwDateToIso,
  inferDueDateIso,
  type ResolvedDueDate,
  resolveDueDate,
} from "@homework/shared";
