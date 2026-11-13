(() => {
  'use strict';

  // ---------- settings: API URL + key (from config, URL hash, or this device) ----------
  const LS = { api: 'fc.apiUrl', key: 'fc.key' };
  const store = {
    get: (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
    del: (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };

  function readHash() {
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (h.get('key')) store.set(LS.key, h.get('key'));
    if (h.get('api')) store.set(LS.api, h.get('api'));
    if (h.get('key') || h.get('api')) history.replaceState(null, '', location.pathname + location.search);
  }
  const apiUrl = () => store.get(LS.api) || (window.FC_CONFIG && window.FC_CONFIG.apiUrl) || '';
  const apiKey = () => store.get(LS.key);

  const $ = (id) => document.getElementById(id);
  const setText = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };

  // ---------- formatting ----------
  const pd = d3.utcParse('%Y-%m-%d');
  const fmtInt = d3.format(',.0f');
  const fmt = (v, kind) => {
    if (v === null || v === undefined || v === '' || Number.isNaN(v)) return '—';
    if (kind === 'date') { const d = pd(String(v)); return d ? d3.utcFormat('%b %-d')(d) : String(v); }
    if (typeof v !== 'number') return String(v);
    if (kind === 'int') return fmtInt(v);
    if (kind === '1') return v.toFixed(1);
    if (kind === 'signed1') return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
    return String(v);
  };

  // ---------- sheet grid → rows ----------
  const isNum = /^-?\d{1,3}(,\d{3})+(\.\d+)?$|^-?\d+(\.\d+)?$/;
  function toRows(values) {
    if (!values || !values.length) return [];
    const cols = values[0].map(String);
    return values.slice(1)
      .filter((r) => r[0] != null && String(r[0]).trim() !== '')
      .map((r) => {
        const o = {};
        cols.forEach((c, i) => {
          const v = r[i];
          if (v === undefined || v === null || v === '') o[c] = null;
          else if (typeof v === 'string' && isNum.test(v.trim())) o[c] = Number(v.trim().replace(/,/g, ''));
          else o[c] = v;
        });
        return o;
      });
  }

  // ---------- calculations (same as the Claude dashboard) ----------
  const num = (v) => (typeof v === 'number' ? v : null);
  const pos = (v) => (typeof v === 'number' && v > 0 ? v : null);
  const tOf = (d) => Date.parse(d + 'T00:00:00Z');
  const DAY = 864e5;
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const round = (x, k) => (x == null ? null : Math.round(x * 10 ** k) / 10 ** k);

  function targetsFrom(profile) {
    const get = (f) => { const r = profile.find((p) => String(p.Field).trim() === f); return r ? r.Value : null; };
    return {
      calories: num(get('Daily calorie target (kcal)')),
      protein: num(get('Daily protein target (g)')),
      water: num(get('Daily water target (L)')),
      steps: num(get('Daily steps target')),
      sleep: num(get('Sleep target (hrs)')),
      startWeight: num(get('Starting weight (kg)')),
      goalWeight: num(get('Goal weight (kg)')),
      targetDate: get('Target date'),
    };
  }

  function daysFrom(daily) {
    const rows = daily
      .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(String(r.Date)))
      .map((r) => ({
        date: r.Date,
        weight: pos(r['Weight (kg)']),
        water: num(r['Water (L)']),
        steps: num(r['Steps']),
        sleep: num(r['Sleep (hrs)']),
        calories: pos(r['Calories In (kcal)']),
        protein: pos(r['Protein (g)']),
        workout: r['Workout Done (Y/N)'] || null,
      }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    rows.forEach((r) => {
      const end = tOf(r.date);
      const w = rows.filter((x) => x.weight != null && tOf(x.date) <= end && tOf(x.date) > end - 7 * DAY).map((x) => x.weight);
      r.weight7 = w.length ? round(avg(w), 2) : null;
    });
    return rows;
  }

  function localToday() {
    const n = new Date();
    const p = (x) => String(x).padStart(2, '0');
    return n.getFullYear() + '-' + p(n.getMonth() + 1) + '-' + p(n.getDate());
  }

  function summarize(days, T) {
    const today = localToday();
    const done = days.filter((d) => d.date < today);
    const todayRow = days.find((d) => d.date === today) || null;
    const out = { todayRow, windowEnd: null, week: [], adherence: [] };
    if (done.length) {
      const endDate = done[done.length - 1].date;
      const end = tOf(endDate);
      const week = done.filter((d) => tOf(d.date) > end - 7 * DAY);
      const prev = done.filter((d) => tOf(d.date) <= end - 7 * DAY && tOf(d.date) > end - 14 * DAY);
      const vals = (rs, f) => rs.map((x) => x[f]).filter((x) => x != null);
      const w7 = round(avg(vals(week, 'weight')), 1);
      const wp = round(avg(vals(prev, 'weight')), 1);
      Object.assign(out, {
        windowEnd: endDate,
        week,
        avgWeight7: w7,
        weightChangeWeek: w7 != null && wp != null ? round(w7 - wp, 1) : null,
        changeVsStart: w7 != null && T.startWeight != null ? round(w7 - T.startWeight, 1) : null,
        toGo: w7 != null && T.goalWeight != null ? round(w7 - T.goalWeight, 1) : null,
        workouts7: week.filter((d) => d.workout === 'Y').length,
      });
      const defs = [
        ['Calories', 'calories', T.calories, 'kcal', 'max', 0],
        ['Protein', 'protein', T.protein, 'g', 'min', 0],
        ['Steps', 'steps', T.steps, 'steps', 'min', 0],
        ['Sleep', 'sleep', T.sleep, 'hrs', 'min', 1],
        ['Water', 'water', T.water, 'L', 'min', 1],
      ];
      out.adherence = defs.map(([metric, f, target, unit, dir, k]) => {
        const v = vals(week, f);
        return {
          metric, unit, target, k,
          average: round(avg(v), k),
          daysOnTarget: target == null ? null : v.filter((x) => (dir === 'max' ? x <= target : x >= target)).length,
          daysLogged: v.length,
        };
      });
    }
    return out;
  }

  function sessionsFrom(workout) {
    const groups = new Map();
    workout.filter((w) => String(w['Planned / Actual'] || '').trim() === 'Actual').forEach((w) => {
      const key = w.Date + '|' + w.Session;
      if (!groups.has(key)) groups.set(key, { date: w.Date, session: w.Session, exercises: 0, volume: 0, minutes: 0, km: 0 });
      const g = groups.get(key);
      g.exercises += 1;
      g.volume += num(w['Volume (kg)']) || 0;
      g.minutes += num(w['Duration (min)']) || 0;
      g.km += num(w['Distance (km)']) || 0;
    });
    return [...groups.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  // ---------- charts ----------
  function tooltip(el) {
    const tip = document.createElement('div');
    tip.className = 'fc-tip';
    tip.hidden = true;
    el.appendChild(tip);
    return {
      show(ev, lines) {
        tip.replaceChildren(...lines.filter(Boolean).map((l, i) => { const d = document.createElement('div'); if (i === 0) d.className = 'fc-tip-d'; d.textContent = l; return d; }));
        tip.hidden = false;
        const box = el.getBoundingClientRect();
        let x = ev.clientX - box.left + 12;
        if (x + tip.offsetWidth > box.width) x = Math.max(0, ev.clientX - box.left - tip.offsetWidth - 12);
        tip.style.left = x + 'px';
        tip.style.top = Math.max(0, ev.clientY - box.top - 10) + 'px';
      },
      hide() { tip.hidden = true; },
    };
  }

  function leftMargin(svg, y, tickFmt, ticks) {
    const g = svg.append('g').attr('class', 'fc-axis').call(d3.axisLeft(y).ticks(ticks).tickFormat(tickFmt));
    let w = 0;
    g.selectAll('text').each(function () { w = Math.max(w, this.getComputedTextLength()); });
    g.remove();
    return Math.ceil(w) + 12;
  }

  function empty(el, msg) {
    el.replaceChildren();
    const p = document.createElement('p');
    p.className = 'fc-meta';
    p.textContent = msg;
    el.appendChild(p);
  }

  function barChart(el, rows, o) {
    el.replaceChildren();
    rows = rows.filter((r) => r[o.field] != null);
    if (!rows.length) return empty(el, 'Nothing logged yet');
    const W = Math.max(280, el.clientWidth || 600), H = 220;
    const m = { t: 16, r: 12, b: 26, l: 40 };
    const ymax = Math.max(d3.max(rows, (r) => r[o.field]), o.target || 0) * 1.08;
    const y = d3.scaleLinear([0, ymax], [H - m.b, m.t]).nice();
    const tickFmt = ymax >= 10000 ? d3.format('~s') : d3.format(',~f');
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
      .attr('role', 'img').attr('aria-label', `${o.label} per day compared with the daily target`);
    m.l = leftMargin(svg, y, tickFmt, 4);
    const dates = rows.map((r) => r.date);
    const x = d3.scaleBand(dates, [m.l, W - m.r]).padding(0.25);
    svg.append('g').attr('class', 'fc-axis').attr('transform', `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(4).tickFormat(tickFmt).tickSize(-(W - m.l - m.r)).tickPadding(6));
    const step = Math.max(1, Math.ceil(dates.length / Math.max(1, Math.floor((W - m.l - m.r) / 52))));
    svg.append('g').attr('class', 'fc-axis').attr('transform', `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).tickValues(dates.filter((d, i) => (dates.length - 1 - i) % step === 0))
        .tickFormat((d) => d3.utcFormat('%b %-d')(pd(d))).tickSize(0).tickPadding(8));
    const hit = (v) => o.target == null || (o.dir === 'max' ? v <= o.target : v >= o.target);
    const fv = (v) => (o.field === 'sleep' ? v.toFixed(1) : fmtInt(v));
    const tip = tooltip(el);
    svg.append('g').selectAll('rect').data(rows).join('rect')
      .attr('x', (r) => x(r.date)).attr('width', x.bandwidth())
      .attr('y', (r) => y(r[o.field])).attr('height', (r) => y(0) - y(r[o.field])).attr('rx', 2)
      .style('fill', (r) => (hit(r[o.field]) ? 'var(--main)' : o.dir === 'max' ? 'var(--bad)' : 'var(--muted-mark)'))
      .on('pointerenter pointermove', (ev, r) => tip.show(ev, [
        d3.utcFormat('%a %b %-d')(pd(r.date)), `${o.label}: ${fv(r[o.field])} ${o.unit}`,
        o.target != null ? `Target: ${fv(o.target)} ${o.unit}` : '']))
      .on('pointerleave', () => tip.hide());
    if (o.target != null) {
      svg.append('line').attr('class', 'fc-ref').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(o.target)).attr('y2', y(o.target));
      svg.append('text').attr('class', 'fc-reflabel').attr('x', W - m.r).attr('y', y(o.target) - 5).attr('text-anchor', 'end').text(`Target ${fv(o.target)}`);
    }
  }

  function weightChart(el, days, T) {
    el.replaceChildren();
    const rows = days.filter((r) => r.weight != null);
    if (!rows.length) return empty(el, 'No weigh-ins yet');
    const W = Math.max(280, el.clientWidth || 600), H = 240;
    const m = { t: 16, r: 14, b: 26, l: 40 };
    const vals = rows.flatMap((r) => [r.weight, r.weight7]).concat(T.startWeight != null ? [T.startWeight] : []).filter((v) => v != null);
    const y = d3.scaleLinear([d3.min(vals) - 0.5, d3.max(vals) + 0.5], [H - m.b, m.t]).nice();
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
      .attr('role', 'img').attr('aria-label', 'Daily weight and 7-day average weight in kilograms over time');
    m.l = leftMargin(svg, y, d3.format('.1f'), 5);
    const dates = rows.map((r) => r.date);
    const pad = rows.length === 1 ? DAY : 0;
    const x = d3.scaleUtc([new Date(+pd(dates[0]) - pad), new Date(+pd(dates[dates.length - 1]) + pad)], [m.l + 8, W - m.r - 8]);
    svg.append('g').attr('class', 'fc-axis').attr('transform', `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('.1f')).tickSize(-(W - m.l - m.r)).tickPadding(6));
    const step = Math.max(1, Math.ceil(dates.length / Math.max(1, Math.floor((W - m.l - m.r) / 52))));
    svg.append('g').attr('class', 'fc-axis').attr('transform', `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).tickValues(dates.filter((d, i) => (dates.length - 1 - i) % step === 0).map(pd))
        .tickFormat(d3.utcFormat('%b %-d')).tickSize(0).tickPadding(8));
    if (T.startWeight != null) {
      svg.append('line').attr('class', 'fc-ref').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(T.startWeight)).attr('y2', y(T.startWeight));
      svg.append('text').attr('class', 'fc-reflabel').attr('x', W - m.r).attr('y', y(T.startWeight) - 5).attr('text-anchor', 'end').text(`Start ${T.startWeight.toFixed(1)} kg`);
    }
    svg.append('g').selectAll('circle').data(rows).join('circle')
      .attr('cx', (r) => x(pd(r.date))).attr('cy', (r) => y(r.weight)).attr('r', 3.5).style('fill', 'var(--muted-mark)');
    const avgRows = rows.filter((r) => r.weight7 != null);
    svg.append('path').datum(avgRows).attr('d', d3.line().x((r) => x(pd(r.date))).y((r) => y(r.weight7)))
      .style('fill', 'none').style('stroke', 'var(--main)').style('stroke-width', 2.5);
    const last = avgRows[avgRows.length - 1];
    if (last) svg.append('circle').attr('cx', x(pd(last.date))).attr('cy', y(last.weight7)).attr('r', 4).style('fill', 'var(--main)');
    const tip = tooltip(el);
    const focus = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).style('stroke', 'var(--ref)').style('opacity', 0);
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).style('fill', 'transparent')
      .on('pointerenter pointermove', (ev) => {
        const t = x.invert(d3.pointer(ev)[0]);
        const r = d3.least(rows, (d) => Math.abs(pd(d.date) - t));
        focus.attr('x1', x(pd(r.date))).attr('x2', x(pd(r.date))).style('opacity', 1);
        tip.show(ev, [d3.utcFormat('%a %b %-d')(pd(r.date)), `Weight: ${r.weight.toFixed(2)} kg`, r.weight7 != null ? `7-day avg: ${r.weight7.toFixed(2)} kg` : '']);
      })
      .on('pointerleave', () => { tip.hide(); focus.style('opacity', 0); });
  }

  // ---------- render ----------
  let state = null;

  function signedClass(id, v) {
    const el = $(id);
    if (!el) return;
    el.classList.remove('fc-good', 'fc-bad');
    if (typeof v === 'number' && v !== 0) el.classList.add(v < 0 ? 'fc-good' : 'fc-bad');
  }

  function lede(s, T) {
    const p = $('lede');
    p.replaceChildren();
    if (s.avgWeight7 == null) { p.textContent = 'Log a few morning weigh-ins and your 7-day trend will appear here.'; return; }
    const b = (txt, cls) => { const e = document.createElement('b'); e.textContent = txt; if (cls) e.className = cls; return e; };
    const chg = s.changeVsStart;
    p.append(
      'Over the 7 days to ', b(fmt(s.windowEnd, 'date')), ', your average weight was ', b(fmt(s.avgWeight7, '1')), ' kg, ',
      b(fmt(chg, 'signed1'), chg < 0 ? 'fc-good' : chg > 0 ? 'fc-bad' : ''), ' kg against your ', b(fmt(T.startWeight, '1')),
      ' kg start, with ', b(fmt(s.toGo, '1')), ' kg to go to your ', b(fmt(T.goalWeight, '1')), ' kg goal',
      T.targetDate ? ' by ' : '', T.targetDate ? b(String(T.targetDate)) : '', '.'
    );
  }

  function tableRows(tbodyId, rows, cells) {
    const tb = $(tbodyId);
    tb.replaceChildren(...rows.map((r) => {
      const tr = document.createElement('tr');
      cells(r).forEach(([txt, num]) => { const td = document.createElement('td'); td.textContent = txt; if (num) td.className = 'fc-num'; tr.appendChild(td); });
      return tr;
    }));
  }

  function render() {
    if (!state) return;
    const { days, T, s, sessions } = state;
    lede(s, T);

    const tr = s.todayRow;
    $('today').hidden = !tr;
    if (tr) {
      setText('t-cal', fmt(tr.calories || 0, 'int'));
      setText('t-calleft', T.calories != null ? fmt(T.calories - (tr.calories || 0), 'int') : '—');
      setText('t-caltarget', fmt(T.calories, 'int'));
      setText('t-pro', fmt(tr.protein || 0, 'int'));
      setText('t-proleft', T.protein != null ? fmt(T.protein - (tr.protein || 0), 'int') : '—');
      setText('t-protarget', fmt(T.protein, 'int'));
      setText('t-water', fmt(tr.water || 0, '1'));
      setText('t-watertarget', fmt(T.water, '1'));
    }

    setText('w-end', fmt(s.windowEnd, 'date'));
    setText('w-weight', fmt(s.avgWeight7, '1'));
    setText('w-weightchg', fmt(s.weightChangeWeek, 'signed1'));
    signedClass('w-weightchg', s.weightChangeWeek);
    const a = Object.fromEntries(s.adherence.map((r) => [r.metric, r]));
    const meta = (r, tfmt, unit) => (r ? `Target ${fmt(r.target, tfmt)}${unit} · on target ${fmt(r.daysOnTarget, 'int')}/${fmt(r.daysLogged, 'int')} days` : '—');
    setText('w-cal', fmt(a.Calories && a.Calories.average, 'int'));
    setText('w-cal-meta', meta(a.Calories, 'int', ''));
    setText('w-pro', fmt(a.Protein && a.Protein.average, 'int'));
    setText('w-pro-meta', meta(a.Protein, 'int', ' g'));
    setText('w-steps', fmt(a.Steps && a.Steps.average, 'int'));
    setText('w-steps-meta', meta(a.Steps, 'int', ''));
    setText('w-sleep', fmt(a.Sleep && a.Sleep.average, '1'));
    setText('w-sleep-meta', meta(a.Sleep, '1', ''));
    setText('w-workouts', fmt(s.workouts7, 'int'));
    setText('w-water', fmt(a.Water && a.Water.average, '1'));

    weightChart($('chart-weight'), days, T);
    barChart($('chart-calories'), days, { field: 'calories', target: T.calories, dir: 'max', unit: 'kcal', label: 'Calories' });
    barChart($('chart-protein'), days, { field: 'protein', target: T.protein, dir: 'min', unit: 'g', label: 'Protein' });
    barChart($('chart-steps'), days, { field: 'steps', target: T.steps, dir: 'min', unit: 'steps', label: 'Steps' });
    barChart($('chart-sleep'), days, { field: 'sleep', target: T.sleep, dir: 'min', unit: 'hrs', label: 'Sleep' });

    tableRows('tb-adherence', s.adherence, (r) => {
      const f = r.k ? '1' : 'int';
      return [[r.metric], [fmt(r.average, f), 1], [fmt(r.target, f), 1], [r.unit], [fmt(r.daysOnTarget, 'int'), 1], [fmt(r.daysLogged, 'int'), 1]];
    });
    tableRows('tb-sessions', sessions.slice(0, 12), (r) => [
      [fmt(r.date, 'date')], [r.session], [fmt(r.exercises, 'int'), 1],
      [r.volume ? fmt(r.volume, 'int') : '—', 1], [r.minutes ? fmt(r.minutes, 'int') : '—', 1], [r.km ? r.km.toFixed(2) : '—', 1],
    ]);
  }

  // ---------- load ----------
  function showSetup(msg) {
    $('setup').hidden = false;
    $('content').hidden = true;
    $('in-api').value = apiUrl();
    $('in-key').value = apiKey();
    $('lede').textContent = 'Connect your Google Sheet to see your numbers.';
    const e = $('error');
    e.hidden = !msg;
    e.textContent = msg || '';
  }

  async function load() {
    if (!apiUrl() || !apiKey()) return showSetup('');
    document.body.classList.add('is-loading');
    $('refresh').disabled = true;
    try {
      const url = apiUrl() + (apiUrl().includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(apiKey());
      const res = await fetch(url, { redirect: 'follow', cache: 'no-store' });
      if (!res.ok) throw new Error(`The sheet endpoint answered ${res.status}.`);
      const data = await res.json();
      if (data.error === 'unauthorized') throw new Error('That key was refused. Check it matches DASHBOARD_KEY in your Apps Script properties.');
      if (data.error) throw new Error(String(data.error));
      const T = targetsFrom(toRows(data.profile));
      const days = daysFrom(toRows(data.daily));
      state = { T, days, s: summarize(days, T), sessions: sessionsFrom(toRows(data.workout)) };
      $('setup').hidden = true;
      $('content').hidden = false;
      render();
      const at = data.fetchedAt ? new Date(data.fetchedAt) : new Date();
      setText('updated', 'Updated ' + at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    } catch (err) {
      const msg = err instanceof TypeError ? "Couldn't reach the sheet. Check the web app URL and that it's deployed with access set to Anyone." : err.message;
      if (state) setText('updated', msg); else showSetup(msg);
    } finally {
      document.body.classList.remove('is-loading');
      $('refresh').disabled = false;
    }
  }

  readHash();
  $('refresh').addEventListener('click', load);
  $('save').addEventListener('click', () => {
    store.set(LS.api, $('in-api').value.trim());
    store.set(LS.key, $('in-key').value.trim());
    load();
  });
  $('forget').addEventListener('click', () => { store.del(LS.key); store.del(LS.api); state = null; showSetup(''); });
  let rw;
  window.addEventListener('resize', () => { clearTimeout(rw); rw = setTimeout(render, 150); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state) load(); });
  load();
})();
