export function addDaysFrom(baseIso: string, days: number) {
  const [year, month, day] = baseIso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function nextWeekFrom(baseIso: string, weekStart: 0 | 1) {
  const [year, month, day] = baseIso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const target = weekStart;
  const until = ((7 + target - date.getDay()) % 7) || 7;
  date.setDate(date.getDate() + until);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function nextMonthFrom(baseIso: string) {
  const [year, month] = baseIso.split('-').map(Number);
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
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

