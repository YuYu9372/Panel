const calendarWidget = {
  el: null,
  interval: 600000,

  init() {
    this.el = document.getElementById('calendar');
    this.el.innerHTML = `
      <div class="widget-heading">
        <div>
          <div class="widget-kicker">SCHEDULE</div>
          <h2>Calendar</h2>
        </div>
        <svg class="cal-glyph" viewBox="0 0 24 24" aria-hidden="true" fill="none"
             stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
          <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
        </svg>
      </div>
      <div class="cal-timeline"><div class="cal-empty">Loading…</div></div>
    `;
    this.update();
  },

  describe(event) {
    if (event.all_day) {
      const [y, m, d] = (event.start || '').split('-').map(Number);
      const date = new Date(y, (m || 1) - 1, d || 1);
      return {
        dayKey: event.start,
        dayLabel: date.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        timeLabel: 'All day',
      };
    }
    const date = new Date(event.start);
    return {
      dayKey: date.toDateString(),
      dayLabel: date.toLocaleDateString([], { month: 'short', day: 'numeric' }),
      timeLabel: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
  },

  render(events) {
    const timeline = this.el.querySelector('.cal-timeline');
    if (events === null) {
      timeline.innerHTML = '<div class="cal-empty">Calendar unavailable</div>';
      return;
    }
    if (!events.length) {
      timeline.innerHTML = '<div class="cal-empty">No upcoming events</div>';
      return;
    }

    timeline.replaceChildren();
    let lastDay = null;
    events.forEach((event) => {
      const info = this.describe(event);
      const showDay = info.dayKey !== lastDay;
      lastDay = info.dayKey;

      const item = document.createElement('div');
      item.className = 'cal-item';
      item.innerHTML = `
        <div class="cal-when">
          <span class="cal-date">${showDay ? info.dayLabel : ''}</span>
          <span class="cal-time"></span>
        </div>
        <div class="cal-rail"><span class="cal-node"></span></div>
        <div class="cal-body">
          <div class="cal-title"></div>
          <div class="cal-cal"></div>
        </div>
      `;
      item.querySelector('.cal-time').textContent = info.timeLabel;
      item.querySelector('.cal-title').textContent = event.title;
      item.querySelector('.cal-cal').textContent = event.calendar || '';
      timeline.appendChild(item);
    });
  },

  async update() {
    try {
      const response = await fetch('/api/calendar');
      const data = await response.json();
      this.render(data.events);
    } catch {
      this.render(null);
    }
  },
};
