import {
  zonedDateTimeToUtc,
  zonedParts,
} from "../notifications/time";

const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;

export function localDateTimeToUtc(
  localDateTime: string,
  timezone: string,
) {
  const match = LOCAL_DATE_TIME_PATTERN.exec(localDateTime);
  if (!match) throw new Error("LOCAL_DATE_TIME_INVALID");
  const [, year, month, day, hour, minute] = match;
  const date = zonedDateTimeToUtc(
    `${year}-${month}-${day}`,
    `${hour}:${minute}`,
    timezone,
  );
  const roundTrip = zonedParts(date, timezone);
  if (
    roundTrip.year !== Number(year) ||
    roundTrip.month !== Number(month) ||
    roundTrip.day !== Number(day) ||
    roundTrip.hour !== Number(hour) ||
    roundTrip.minute !== Number(minute)
  ) {
    throw new Error("LOCAL_DATE_TIME_NONEXISTENT");
  }
  return date;
}

export function isLocalDateTime(value: string) {
  return LOCAL_DATE_TIME_PATTERN.test(value);
}
