const DEFAULT_REFRESH_POLICY = Object.freeze({
  schemaVersion: 1,
  timezone: 'local',
  dayMinutesSource: 'settings',
  night: Object.freeze({
    start: '00:00',
    end: '06:00',
    refreshMinutes: 30,
  }),
  manualRefresh: true,
});

const MIN_REFRESH_MINUTES = 1;
const MAX_REFRESH_MINUTES = 1440;
let bundledRefreshPolicy = DEFAULT_REFRESH_POLICY;

function ensureRefreshObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function ensureRefreshKeys(value, keys, label) {
  ensureRefreshObject(value, label);
  const expected = new Set(keys);
  if (Object.keys(value).some((key) => !expected.has(key))) {
    throw new Error(`${label} contains an unsupported field.`);
  }
  if (keys.some((key) => !(key in value))) {
    throw new Error(`${label} is missing a required field.`);
  }
}

function parseLocalTime(value, label) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error(`${label} must use 24-hour HH:MM format.`);
  }
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function validateRefreshPolicy(value) {
  ensureRefreshKeys(
    value,
    ['schemaVersion', 'timezone', 'dayMinutesSource', 'night', 'manualRefresh'],
    'Refresh policy',
  );
  if (value.schemaVersion !== 1) throw new Error('Unsupported refresh policy schema.');
  if (value.timezone !== 'local') throw new Error('Refresh policy timezone must be local.');
  if (value.dayMinutesSource !== 'settings') {
    throw new Error('Day refresh time must come from settings.');
  }
  if (value.manualRefresh !== true) throw new Error('Manual refresh must remain enabled.');
  ensureRefreshKeys(value.night, ['start', 'end', 'refreshMinutes'], 'Night refresh policy');
  const start = parseLocalTime(value.night.start, 'Night start');
  const end = parseLocalTime(value.night.end, 'Night end');
  if (start === end) throw new Error('Night refresh period cannot cover a full day.');
  if (!Number.isInteger(value.night.refreshMinutes)
      || value.night.refreshMinutes < MIN_REFRESH_MINUTES
      || value.night.refreshMinutes > MAX_REFRESH_MINUTES) {
    throw new Error('Night refresh time is outside the supported range.');
  }
  return {
    schemaVersion: 1,
    timezone: 'local',
    dayMinutesSource: 'settings',
    night: {
      start: value.night.start,
      end: value.night.end,
      refreshMinutes: value.night.refreshMinutes,
    },
    manualRefresh: true,
  };
}

function minutesIntoLocalDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function isNightRefreshTime(date, policy = bundledRefreshPolicy) {
  const minute = minutesIntoLocalDay(date);
  const start = parseLocalTime(policy.night.start, 'Night start');
  const end = parseLocalTime(policy.night.end, 'Night end');
  if (start < end) return minute >= start && minute < end;
  return minute >= start || minute < end;
}

function validateConfiguredMinutes(value) {
  if (!Number.isInteger(value)
      || value < MIN_REFRESH_MINUTES
      || value > MAX_REFRESH_MINUTES) {
    throw new Error('Configured refresh time is outside the supported range.');
  }
  return value;
}

function refreshMinutesAt(date, configuredMinutes, policy = bundledRefreshPolicy) {
  validateConfiguredMinutes(configuredMinutes);
  return isNightRefreshTime(date, policy)
    ? policy.night.refreshMinutes
    : configuredMinutes;
}

function localTimeOnDay(date, dayOffset, minuteOfDay) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + dayOffset,
    Math.floor(minuteOfDay / 60),
    minuteOfDay % 60,
    0,
    0,
  );
}

function nextPolicyBoundary(date, policy) {
  const boundaries = [
    parseLocalTime(policy.night.start, 'Night start'),
    parseLocalTime(policy.night.end, 'Night end'),
  ];
  let next = null;
  for (let dayOffset = 0; dayOffset <= 2; dayOffset += 1) {
    for (const minute of boundaries) {
      const candidate = localTimeOnDay(date, dayOffset, minute);
      if (candidate.getTime() > date.getTime()
          && (!next || candidate.getTime() < next.getTime())) {
        next = candidate;
      }
    }
  }
  return next;
}

function nextRefreshTime(date, configuredMinutes, policy = bundledRefreshPolicy) {
  const minutes = refreshMinutesAt(date, configuredMinutes, policy);
  const intervalMilliseconds = minutes * 60 * 1000;
  const dayStart = localTimeOnDay(date, 0, 0);
  const elapsed = date.getTime() - dayStart.getTime();
  const aligned = new Date(
    dayStart.getTime() + (Math.floor(elapsed / intervalMilliseconds) + 1) * intervalMilliseconds,
  );
  const boundary = nextPolicyBoundary(date, policy);
  return boundary && boundary.getTime() < aligned.getTime() ? boundary : aligned;
}

function millisecondsUntilNextRefresh(date, configuredMinutes, policy = bundledRefreshPolicy) {
  return Math.max(1000, nextRefreshTime(date, configuredMinutes, policy).getTime() - date.getTime());
}

async function loadRefreshPolicy(fetcher = fetch) {
  try {
    const response = await fetcher('/config/refresh-policy.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Refresh policy returned ${response.status}.`);
    bundledRefreshPolicy = validateRefreshPolicy(await response.json());
  } catch {
    bundledRefreshPolicy = DEFAULT_REFRESH_POLICY;
  }
  return bundledRefreshPolicy;
}

function getBundledRefreshPolicy() {
  return bundledRefreshPolicy;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_REFRESH_POLICY,
    getBundledRefreshPolicy,
    isNightRefreshTime,
    loadRefreshPolicy,
    millisecondsUntilNextRefresh,
    nextRefreshTime,
    refreshMinutesAt,
    validateRefreshPolicy,
  };
}
