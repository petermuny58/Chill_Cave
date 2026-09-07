// components/ScheduleWidget.tsx
import React, { useEffect, useState } from 'react';
import { fetchAiringSchedule, displayTitle, AiringScheduleEntry } from '../services';

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export default function ScheduleWidget() {
  const [dayOffset, setDayOffset] = useState(0); // 0 = today
  const [entries, setEntries] = useState<AiringScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + (i - 3)); // 3 days before today .. 3 days after
    return d;
  });

  useEffect(() => {
    const target = new Date();
    target.setDate(target.getDate() + dayOffset);
    const from = Math.floor(startOfDay(target).getTime() / 1000);
    const to = from + 86400;

    setLoading(true);
    fetchAiringSchedule(from, to)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [dayOffset]);

  return (
    <div className="schedule-widget">
      <div className="schedule-widget__days">
        {days.map((d, i) => {
          const offset = i - 3;
          const isActive = offset === dayOffset;
          return (
            <button
              key={i}
              type="button"
              className={`schedule-widget__day ${isActive ? 'is-active' : ''}`}
              onClick={() => setDayOffset(offset)}
            >
              <span className="schedule-widget__day-name">
                {d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}
              </span>
              <span className="schedule-widget__day-num">{d.getDate()}</span>
            </button>
          );
        })}
      </div>

      <div className="schedule-widget__list">
        {loading ? (
          <p className="schedule-widget__empty">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="schedule-widget__empty">No releases today.</p>
        ) : (
          entries.map((e) => (
            <a key={e.id} className="schedule-widget__item" href={`/anime/${e.media.id}`}>
              <span>{displayTitle(e.media)}</span>
              <span className="schedule-widget__ep">EP {e.episode}</span>
            </a>
          ))
        )}
      </div>
    </div>
  );
}