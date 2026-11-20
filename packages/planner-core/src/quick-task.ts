export function addDaysFrom(baseIso: string, days: number) {
  const date = new Date(`${baseIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function nextWeekFrom(baseIso: string, weekStart: 0 | 1) {
  const weekday = new Date(`${baseIso}T00:00:00.000Z`).getUTCDay();
  const until = ((7 + weekStart - weekday) % 7) || 7;
  return addDaysFrom(baseIso, until);
}

export function nextMonthFrom(baseIso: string) {
  const date = new Date(`${baseIso}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1, 1);
  return date.toISOString().slice(0, 10);
}

export function parseQuickTask(value: string, locale: 'nl' | 'en', today: string, weekStart: 0 | 1) {
  let title = value.trim();
  let plannedDate: string | undefined;
  const patterns: Array<[RegExp, () => string]> = locale === 'nl'
    ? [
        [/\s+(morgen)$/i, () => addDaysFrom(today, 1)],
        [/\s+(volgende week)$/i, () => nextWeekFrom(today, weekStart)],
        [/\s+(volgende maand)$/i, () => nextMonthFrom(today)],
        [/\s+(vandaag)$/i, () => today],
      ]
    : [
        [/\s+(tomorrow)$/i, () => addDaysFrom(today, 1)],
        [/\s+(next week)$/i, () => nextWeekFrom(today, weekStart)],
        [/\s+(next month)$/i, () => nextMonthFrom(today)],
        [/\s+(today)$/i, () => today],
      ];
  for (const [pattern, getDate] of patterns) {
    if (pattern.test(title)) {
      title = title.replace(pattern, '').trim();
      plannedDate = getDate();
      break;
    }
  }
  return { title, plannedDate };
}

