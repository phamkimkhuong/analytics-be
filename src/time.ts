import { VIETNAM_OFFSET_MINUTES } from "./constants.js";

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

function shiftedUtcDate(date: Date, offsetMinutes: number): Date {
  return new Date(date.getTime() + offsetMinutes * 60 * 1000);
}

export function formatVietnamIso(date: Date): string {
  const shifted = shiftedUtcDate(date, VIETNAM_OFFSET_MINUTES);
  return [
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`,
    `.${pad(shifted.getUTCMilliseconds(), 3)}+07:00`,
  ].join("");
}

export function makeSnapshotId(date: Date): string {
  const shifted = shiftedUtcDate(date, VIETNAM_OFFSET_MINUTES);
  return [
    `${shifted.getUTCFullYear()}${pad(shifted.getUTCMonth() + 1)}${pad(shifted.getUTCDate())}`,
    `-${pad(shifted.getUTCHours())}${pad(shifted.getUTCMinutes())}${pad(shifted.getUTCSeconds())}+0700`,
  ].join("");
}
