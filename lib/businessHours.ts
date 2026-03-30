const BUSINESS_TIMEZONE = "Asia/Bishkek";
const OPEN_HOUR = 9;
const OPEN_MINUTE = 30;
const CLOSE_HOUR = 21;
const CLOSE_MINUTE = 30;

const OPEN_TOTAL_MINUTES = OPEN_HOUR * 60 + OPEN_MINUTE;
const CLOSE_TOTAL_MINUTES = CLOSE_HOUR * 60 + CLOSE_MINUTE;

type Clock = { hour: number; minute: number };

function getClockInTimezone(date: Date, timeZone: string): Clock {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return { hour, minute };
}

function toMinutes(clock: Clock) {
  return clock.hour * 60 + clock.minute;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatClock(clock: Clock) {
  return `${pad2(clock.hour)}:${pad2(clock.minute)}`;
}

export function getBusinessHoursStatus(now = new Date()) {
  const localClock = getClockInTimezone(now, BUSINESS_TIMEZONE);
  const nowTotalMinutes = toMinutes(localClock);
  const isOpen = nowTotalMinutes >= OPEN_TOTAL_MINUTES && nowTotalMinutes < CLOSE_TOTAL_MINUTES;

  const minutesUntilOpen = isOpen
    ? 0
    : nowTotalMinutes < OPEN_TOTAL_MINUTES
      ? OPEN_TOTAL_MINUTES - nowTotalMinutes
      : 24 * 60 - nowTotalMinutes + OPEN_TOTAL_MINUTES;

  const minutesUntilClose = isOpen ? CLOSE_TOTAL_MINUTES - nowTotalMinutes : 0;

  return {
    isOpen,
    timezone: BUSINESS_TIMEZONE,
    openTime: `${pad2(OPEN_HOUR)}:${pad2(OPEN_MINUTE)}`,
    closeTime: `${pad2(CLOSE_HOUR)}:${pad2(CLOSE_MINUTE)}`,
    nowTime: formatClock(localClock),
    minutesUntilOpen,
    minutesUntilClose,
  };
}

export function getBusinessHoursClosedMessage() {
  return "Заказы принимаем ежедневно с 09:30 до 21:30";
}
