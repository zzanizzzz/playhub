// The "Tap the Star" game. Talks to the Flask backend in api/index.py.
(() => {
  const sb = window.sb;
  const $ = id => document.getElementById(id);

  const ROUND_SECONDS = 15;
  const TARGET_SIZE = 64;

  let currentUser = null;
  let roundId = null;
  let score = 0;
  let timeLeft = ROUND_SECONDS;
  let timer = null;
  let roundActive = false;

  /* ---------- Call our backend with the user's login token ---------- */
  async function api(path, method = 'GET', body = null) {
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;

    const response = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
      body: body ? JSON.stringify(body) : null,
    });

    let result = {};
    try { result = await response.json(); } catch (_) { /* empty body */ }
    if (!response.ok) throw new Error(result.error || 'Request failed');
    return result;
  }

  /* ---------- React to login / logout from auth.js ---------- */
  document.addEventListener('playhub:login', async e => {
    currentUser = e.detail;
    resetGame();
    await refreshAll();
  });

  document.addEventListener('playhub:logout', () => {
    currentUser = null;
    clearInterval(timer);
    roundActive = false;
    closeProfile();
  });

  /* ---------- Profile popup buttons ---------- */
  $('my-profile-btn').onclick = () => {
    if (currentUser) openProfile(currentUser.id);
  };
  $('profile-close').onclick = closeProfile;
  $('profile-modal').onclick = e => {
    if (e.target.id === 'profile-modal') closeProfile();
  };

  /* ---------- Loading data ---------- */
  async function refreshAll() {
    try {
      await Promise.all([loadMyStats(), loadLeaderboard()]);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadMyStats() {
    const { profile } = await api(`/api/profiles/${currentUser.id}`);
    $('welcome').textContent = '@' + profile.username;
    $('my-points').textContent = profile.points;
    $('my-games').textContent = profile.games_played;
    $('my-best').textContent = profile.best_score;
  }

  async function loadLeaderboard() {
    const { players } = await api('/api/leaderboard');

    const topPoints = Math.max(...players.map(p => p.points), 1);
    const list = $('leaderboard');
    list.innerHTML = '';

    players.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'player' + (p.id === currentUser?.id ? ' me' : '');
      row.onclick = () => openProfile(p.id);

      const rank = document.createElement('div');
      rank.className = 'rank';
      rank.textContent = i + 1;

      const info = document.createElement('div');
      info.className = 'pinfo';

      const prow = document.createElement('div');
      prow.className = 'prow';
      const name = document.createElement('span');
      name.className = 'pname';
      name.textContent = '@' + p.username;
      const pts = document.createElement('span');
      pts.className = 'pts';
      pts.textContent = p.points;
      prow.append(name, pts);

      const bar = document.createElement('div');
      bar.className = 'bar';
      const fill = document.createElement('div');
      fill.style.width = (p.points / topPoints * 100) + '%';
      bar.appendChild(fill);

      info.append(prow, bar);
      row.append(rank, info);
      list.appendChild(row);
    });
  }

  /* ---------- Profile popup ---------- */
  async function openProfile(userId) {
    $('profile-modal').classList.remove('hidden');
    $('profile-name').textContent = 'Loading...';
    $('profile-history').innerHTML = '';

    try {
      const { profile, history } = await api(`/api/profiles/${userId}`);

      $('profile-name').textContent = '@' + profile.username;
      $('p-points').textContent = profile.points;
      $('p-games').textContent = profile.games_played;
      $('p-best').textContent = profile.best_score;

      const list = $('profile-history');
      if (history.length === 0) {
        const empty = document.createElement('li');
        empty.textContent = 'No rounds played yet.';
        list.appendChild(empty);
      }

      history.forEach(r => {
        const li = document.createElement('li');
        const when = document.createElement('span');
        when.textContent = new Date(r.finished_at).toLocaleString();
        const result = document.createElement('strong');
        result.textContent = r.score + (r.score === 1 ? ' point' : ' points');
        li.append(when, result);
        list.appendChild(li);
      });
    } catch (err) {
      $('profile-name').textContent = 'Could not load profile';
      console.error(err);
    }
  }

  function closeProfile() {
    $('profile-modal').classList.add('hidden');
  }

  /* ---------- Game ---------- */
  function resetGame() {
    score = 0;
    timeLeft = ROUND_SECONDS;
    roundActive = false;
    roundId = null;
    $('score').textContent = 0;
    $('time').textContent = ROUND_SECONDS;
    document.querySelectorAll('.target').forEach(t => t.remove());

    $('overlay-title').textContent = 'Tap the Star';
    $('overlay-text').textContent = `You have ${ROUND_SECONDS} seconds. Each hit scores one point.`;
    $('start-btn').textContent = 'Start round';
    $('start-btn').onclick = startRound;
    $('overlay').classList.remove('hidden');
  }

  async function startRound() {
    const startBtn = $('start-btn');
    startBtn.disabled = true;

    try {
      // The server records the start time. Ask for it before the timer begins.
      const round = await api('/api/rounds/start', 'POST');
      roundId = round.id;
    } catch (err) {
      $('overlay-text').textContent = 'Could not start the round: ' + err.message;
      startBtn.disabled = false;
      return;
    }

    startBtn.disabled = false;
    score = 0;
    timeLeft = ROUND_SECONDS;
    roundActive = true;
    $('score').textContent = 0;
    $('time').textContent = timeLeft;
    $('overlay').classList.add('hidden');
    moveTarget();

    clearInterval(timer);
    timer = setInterval(() => {
      timeLeft--;
      $('time').textContent = timeLeft;
      if (timeLeft <= 0) endRound();
    }, 1000);
  }

  function moveTarget() {
    const box = $('game-box');
    let t = box.querySelector('.target');

    if (!t) {
      t = document.createElement('button');
      t.className = 'target';
      t.type = 'button';
      t.onclick = () => {
        if (!roundActive) return;
        score++;
        $('score').textContent = score;
        moveTarget();
      };
      box.appendChild(t);
    }

    const x = Math.random() * (box.clientWidth - TARGET_SIZE);
    const y = Math.random() * (box.clientHeight - TARGET_SIZE);
    t.style.left = x + 'px';
    t.style.top = y + 'px';
  }

  async function endRound() {
    clearInterval(timer);
    roundActive = false;
    document.querySelectorAll('.target').forEach(t => t.remove());

    $('overlay').classList.remove('hidden');
    $('overlay-title').textContent = 'Round over!';
    $('overlay-text').textContent = `You scored ${score} point${score === 1 ? '' : 's'}. Saving...`;
    $('start-btn').textContent = 'Play again';
    $('start-btn').onclick = startRound;

    try {
      await api(`/api/rounds/${roundId}/finish`, 'POST', { score });
      $('overlay-text').textContent = `Saved! You scored ${score} point${score === 1 ? '' : 's'}.`;
      await refreshAll();
    } catch (err) {
      $('overlay-text').textContent = 'Could not save your score: ' + err.message;
    }
  }
})();