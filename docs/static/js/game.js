// The "Tap the Star" game, progress saving, and the leaderboard sidebar.
(() => {
  const sb = window.sb;
  const $ = id => document.getElementById(id);

  const ROUND_SECONDS = 15;
  const TARGET_SIZE = 64;

  let currentUser = null;
  let score = 0;
  let timeLeft = ROUND_SECONDS;
  let timer = null;
  let roundActive = false;

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
  });

  /* ---------- Database: profiles ---------- */
  async function refreshAll() {
    await Promise.all([loadMyProfile(), loadLeaderboard()]);
  }

  async function loadMyProfile() {
    const { data, error } = await sb.from('profiles')
      .select('username, points, games_played, best_score')
      .eq('id', currentUser.id)
      .single();
    if (error || !data) return;

    $('welcome').textContent = '@' + data.username;
    $('my-points').textContent = data.points;
    $('my-games').textContent = data.games_played;
    $('my-best').textContent = data.best_score;
  }

  async function loadLeaderboard() {
    const { data, error } = await sb.from('profiles')
      .select('id, username, points')
      .order('points', { ascending: false })
      .limit(50);
    if (error || !data) return;

    const topPoints = Math.max(...data.map(p => p.points), 1);
    const list = $('leaderboard');
    list.innerHTML = '';

    data.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'player' + (p.id === currentUser?.id ? ' me' : '');

      const rank = document.createElement('div');
      rank.className = 'rank';
      rank.textContent = i + 1;

      const info = document.createElement('div');
      info.className = 'pinfo';

      const prow = document.createElement('div');
      prow.className = 'prow';
      const name = document.createElement('span');
      name.className = 'pname';
      name.textContent = '@' + p.username;   // textContent keeps usernames safe
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

  async function saveRound(points) {
    const { data: p, error } = await sb.from('profiles')
      .select('points, games_played, best_score')
      .eq('id', currentUser.id)
      .single();
    if (error || !p) return false;

    const { error: updateError } = await sb.from('profiles').update({
      points: p.points + points,
      games_played: p.games_played + 1,
      best_score: Math.max(p.best_score, points)
    }).eq('id', currentUser.id);

    if (updateError) return false;
    await refreshAll();
    return true;
  }

  /* ---------- Game ---------- */
  function resetGame() {
    score = 0;
    timeLeft = ROUND_SECONDS;
    roundActive = false;
    $('score').textContent = 0;
    $('time').textContent = ROUND_SECONDS;
    document.querySelectorAll('.target').forEach(t => t.remove());

    $('overlay-title').textContent = 'Tap the Star';
    $('overlay-text').textContent = `You have ${ROUND_SECONDS} seconds. Each hit scores one point.`;
    $('start-btn').textContent = 'Start round';
    $('start-btn').onclick = startRound;
    $('overlay').classList.remove('hidden');
  }

  function startRound() {
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

    const saved = await saveRound(score);
    $('overlay-text').textContent = saved
      ? `Saved! You scored ${score} point${score === 1 ? '' : 's'}.`
      : 'Could not save your score. Check your connection and try again.';
  }
})();