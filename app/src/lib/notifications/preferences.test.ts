import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFERENCES_STORAGE_KEY,
  NotificationPreferences,
  NotificationPreferencesStorage,
  isValidTimeString,
  isWithinQuietHours,
  loadNotificationPreferences,
  saveNotificationPreferences,
  shouldSuppressNotification,
  validateNotificationPreferences,
} from "./preferences";

function prefs(overrides: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return {
    digestFrequency: "weekly",
    quietHours: { enabled: true, start: "22:00", end: "07:00" },
    ...overrides,
  };
}

// テスト用のシンプルなメモリ内Storageモック（実際のwindow.localStorageと同じgetItem/setItemだけを実装）
function createMemoryStorage(initial: Record<string, string> = {}): NotificationPreferencesStorage {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

describe("isValidTimeString", () => {
  it("accepts valid HH:mm strings across the full 24-hour range", () => {
    expect(isValidTimeString("00:00")).toBe(true);
    expect(isValidTimeString("09:30")).toBe(true);
    expect(isValidTimeString("23:59")).toBe(true);
  });

  it("rejects out-of-range hours and minutes", () => {
    expect(isValidTimeString("24:00")).toBe(false);
    expect(isValidTimeString("12:60")).toBe(false);
    expect(isValidTimeString("-1:00")).toBe(false);
  });

  it("rejects malformed strings", () => {
    expect(isValidTimeString("9:30")).toBe(false); // 桁数不足（0埋めが必須）
    expect(isValidTimeString("09:30:00")).toBe(false);
    expect(isValidTimeString("")).toBe(false);
    expect(isValidTimeString("not-a-time")).toBe(false);
  });
});

describe("validateNotificationPreferences", () => {
  it("passes for the default preferences", () => {
    expect(validateNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES)).toEqual({ valid: true, errors: [] });
  });

  it("accepts all three digest frequencies", () => {
    expect(validateNotificationPreferences(prefs({ digestFrequency: "weekly" })).valid).toBe(true);
    expect(validateNotificationPreferences(prefs({ digestFrequency: "monthly" })).valid).toBe(true);
    expect(validateNotificationPreferences(prefs({ digestFrequency: "off" })).valid).toBe(true);
  });

  it("rejects an invalid digest frequency", () => {
    const result = validateNotificationPreferences(
      prefs({ digestFrequency: "daily" as unknown as NotificationPreferences["digestFrequency"] })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("digestFrequency"))).toBe(true);
  });

  it("rejects an out-of-range quietHours.start", () => {
    const result = validateNotificationPreferences(
      prefs({ quietHours: { enabled: true, start: "25:00", end: "07:00" } })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("quietHours.start"))).toBe(true);
  });

  it("rejects a malformed quietHours.end", () => {
    const result = validateNotificationPreferences(
      prefs({ quietHours: { enabled: true, start: "22:00", end: "7am" } })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("quietHours.end"))).toBe(true);
  });

  it("collects multiple errors at once rather than stopping at the first", () => {
    const result = validateNotificationPreferences({
      digestFrequency: "invalid" as unknown as NotificationPreferences["digestFrequency"],
      quietHours: { enabled: true, start: "bad", end: "also-bad" },
    });
    expect(result.errors).toHaveLength(3);
  });
});

describe("isWithinQuietHours - same-day range (start < end)", () => {
  const quietHours = { start: "09:00", end: "17:00" };

  it("includes the start boundary", () => {
    expect(isWithinQuietHours(quietHours, "09:00")).toBe(true);
  });

  it("excludes the end boundary", () => {
    expect(isWithinQuietHours(quietHours, "17:00")).toBe(false);
  });

  it("includes a time strictly inside the range", () => {
    expect(isWithinQuietHours(quietHours, "12:30")).toBe(true);
  });

  it("excludes a time strictly outside the range", () => {
    expect(isWithinQuietHours(quietHours, "20:00")).toBe(false);
    expect(isWithinQuietHours(quietHours, "00:00")).toBe(false);
  });
});

describe("isWithinQuietHours - overnight wraparound range (start > end)", () => {
  const quietHours = { start: "22:00", end: "07:00" };

  it("includes the start boundary (late evening)", () => {
    expect(isWithinQuietHours(quietHours, "22:00")).toBe(true);
  });

  it("includes times after midnight, before the end boundary", () => {
    expect(isWithinQuietHours(quietHours, "00:00")).toBe(true);
    expect(isWithinQuietHours(quietHours, "06:59")).toBe(true);
  });

  it("excludes the end boundary (early morning)", () => {
    expect(isWithinQuietHours(quietHours, "07:00")).toBe(false);
  });

  it("excludes daytime hours between end and start", () => {
    expect(isWithinQuietHours(quietHours, "12:00")).toBe(false);
    expect(isWithinQuietHours(quietHours, "21:59")).toBe(false);
  });
});

describe("isWithinQuietHours - start === end (documented as 'always quiet')", () => {
  it("treats every time of day as within quiet hours", () => {
    const quietHours = { start: "08:00", end: "08:00" };
    expect(isWithinQuietHours(quietHours, "08:00")).toBe(true);
    expect(isWithinQuietHours(quietHours, "00:00")).toBe(true);
    expect(isWithinQuietHours(quietHours, "23:59")).toBe(true);
  });
});

describe("shouldSuppressNotification", () => {
  it("does not suppress when quietHours.enabled is false, even at a time that would otherwise be quiet", () => {
    const input = {
      preferences: prefs({ quietHours: { enabled: false, start: "22:00", end: "07:00" } }),
      timestamp: new Date(2026, 6, 31, 23, 30),
    };
    expect(shouldSuppressNotification(input)).toBe(false);
  });

  it("suppresses during an overnight quiet window (23:30, window 22:00-07:00)", () => {
    const input = {
      preferences: prefs({ quietHours: { enabled: true, start: "22:00", end: "07:00" } }),
      timestamp: new Date(2026, 6, 31, 23, 30),
    };
    expect(shouldSuppressNotification(input)).toBe(true);
  });

  it("suppresses just after midnight within an overnight quiet window (00:15, window 22:00-07:00)", () => {
    const input = {
      preferences: prefs({ quietHours: { enabled: true, start: "22:00", end: "07:00" } }),
      timestamp: new Date(2026, 6, 31, 0, 15),
    };
    expect(shouldSuppressNotification(input)).toBe(true);
  });

  it("does not suppress during daytime outside an overnight quiet window", () => {
    const input = {
      preferences: prefs({ quietHours: { enabled: true, start: "22:00", end: "07:00" } }),
      timestamp: new Date(2026, 6, 31, 14, 0),
    };
    expect(shouldSuppressNotification(input)).toBe(false);
  });

  it("never suppresses an overdue reminder, even inside quiet hours", () => {
    const input = {
      preferences: prefs({ quietHours: { enabled: true, start: "22:00", end: "07:00" } }),
      timestamp: new Date(2026, 6, 31, 23, 30),
      urgency: "overdue" as const,
    };
    expect(shouldSuppressNotification(input)).toBe(false);
  });

  it("suppresses a due-soon (non-overdue) reminder inside quiet hours", () => {
    const input = {
      preferences: prefs({ quietHours: { enabled: true, start: "22:00", end: "07:00" } }),
      timestamp: new Date(2026, 6, 31, 23, 30),
      urgency: "due-soon" as const,
    };
    expect(shouldSuppressNotification(input)).toBe(true);
  });

  it("fails open (does not suppress) when quietHours contains invalid time strings", () => {
    const input = {
      preferences: prefs({ quietHours: { enabled: true, start: "not-a-time", end: "07:00" } }),
      timestamp: new Date(2026, 6, 31, 23, 30),
    };
    expect(shouldSuppressNotification(input)).toBe(false);
  });
});

describe("loadNotificationPreferences", () => {
  it("returns defaults when storage is null/undefined", () => {
    expect(loadNotificationPreferences(null)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(loadNotificationPreferences(undefined)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("returns defaults when nothing has been saved yet", () => {
    const storage = createMemoryStorage();
    expect(loadNotificationPreferences(storage)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("returns defaults when the stored value is not valid JSON", () => {
    const storage = createMemoryStorage({ [NOTIFICATION_PREFERENCES_STORAGE_KEY]: "{not json" });
    expect(loadNotificationPreferences(storage)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("returns defaults when the stored value fails validation", () => {
    const storage = createMemoryStorage({
      [NOTIFICATION_PREFERENCES_STORAGE_KEY]: JSON.stringify({
        digestFrequency: "daily",
        quietHours: { enabled: true, start: "99:99", end: "07:00" },
      }),
    });
    expect(loadNotificationPreferences(storage)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("round-trips a value previously saved with saveNotificationPreferences", () => {
    const storage = createMemoryStorage();
    const custom = prefs({ digestFrequency: "monthly", quietHours: { enabled: true, start: "21:00", end: "06:00" } });

    saveNotificationPreferences(storage, custom);

    expect(loadNotificationPreferences(storage)).toEqual(custom);
  });

  it("returns defaults when storage.getItem throws (e.g. a disabled/corrupted storage backend)", () => {
    const throwingStorage: NotificationPreferencesStorage = {
      getItem: () => {
        throw new Error("storage unavailable");
      },
      setItem: () => {},
    };
    expect(() => loadNotificationPreferences(throwingStorage)).not.toThrow();
    expect(loadNotificationPreferences(throwingStorage)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("returns defaults when the stored value is valid JSON but not an object (e.g. a bare string or number)", () => {
    const storage = createMemoryStorage({ [NOTIFICATION_PREFERENCES_STORAGE_KEY]: JSON.stringify("weekly") });
    expect(loadNotificationPreferences(storage)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });
});

describe("saveNotificationPreferences", () => {
  it("does not throw and does not write when the value is invalid", () => {
    const storage = createMemoryStorage();
    const invalid = prefs({ quietHours: { enabled: true, start: "bad", end: "07:00" } });

    expect(() => saveNotificationPreferences(storage, invalid)).not.toThrow();
    expect(storage.getItem(NOTIFICATION_PREFERENCES_STORAGE_KEY)).toBeNull();
  });

  it("silently ignores a storage that throws on setItem (e.g. private browsing)", () => {
    const throwingStorage: NotificationPreferencesStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("storage disabled");
      },
    };

    expect(() => saveNotificationPreferences(throwingStorage, DEFAULT_NOTIFICATION_PREFERENCES)).not.toThrow();
  });

  it("does nothing when storage is null/undefined", () => {
    expect(() => saveNotificationPreferences(null, DEFAULT_NOTIFICATION_PREFERENCES)).not.toThrow();
    expect(() => saveNotificationPreferences(undefined, DEFAULT_NOTIFICATION_PREFERENCES)).not.toThrow();
  });
});
