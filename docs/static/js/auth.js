// Handles login, signup, logout and keeping the session.
// Other scripts listen for the 'playhub:login' and 'playhub:logout' events.
(() => {
  const sb = window.sb;
  const $ = id => document.getElementById(id);

  let currentUser = null;
  let mode = 'login';

  /* ---------- Switch between Log in and Sign up ---------- */
  $('switch-btn').onclick = () => {
    mode = mode === 'login' ? 'signup' : 'login';
    const signup = mode === 'signup';

    $('username').classList.toggle('hidden', !signup);
    $('username').required = signup;
    $('password').autocomplete = signup ? 'new-password' : 'current-password';
    $('auth-btn').textContent = signup ? 'Sign up' : 'Log in';
    $('tagline').textContent = signup ? 'Create an account to play' : 'Log in to start playing';
    $('switch-btn').textContent = signup
      ? 'Already have an account? Log in'
      : "Don't have an account? Sign up";

    $('auth-msg').textContent = '';
    $('auth-msg').className = 'msg';
  };

  /* ---------- Submit login or signup ---------- */
  $('auth-form').onsubmit = async e => {
    e.preventDefault();
    const btn = $('auth-btn');
    const msg = $('auth-msg');
    const email = $('email').value.trim();
    const password = $('password').value;

    msg.className = 'msg';
    btn.disabled = true;

    try {
      if (mode === 'signup') {
        const username = $('username').value.trim();
        if (username.length < 3) throw new Error('Username must be at least 3 characters.');

        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: { data: { username } }
        });
        if (error) throw error;

        // If email confirmation is OFF in Supabase, data.session exists
        // and onAuthStateChange below opens the game automatically.
        if (!data.session) {
          msg.classList.add('ok');
          msg.textContent = 'Account created! Check your email to confirm, then log in.';
          $('switch-btn').click();
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // onAuthStateChange below opens the game.
      }
    } catch (err) {
      msg.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  };

  /* ---------- Logout ---------- */
  $('logout-btn').onclick = async () => {
    await sb.auth.signOut();
  };

  /* ---------- Session handling ----------
     Runs on page load and on every login/logout.
     A logged-in user goes straight to the game and never sees the login form. */
  sb.auth.onAuthStateChange((event, session) => {
    if (session) {
      // Ignore token refreshes so the game does not reset mid-round.
      if (!currentUser || currentUser.id !== session.user.id) {
        currentUser = session.user;
        showApp();
        document.dispatchEvent(new CustomEvent('playhub:login', { detail: currentUser }));
      }
    } else if (currentUser) {
      currentUser = null;
      showAuth();
      document.dispatchEvent(new Event('playhub:logout'));
    }
  });

  function showApp() {
    $('auth-screen').classList.add('hidden');
    $('app-screen').classList.remove('hidden');
  }

  function showAuth() {
    $('app-screen').classList.add('hidden');
    $('auth-screen').classList.remove('hidden');
    $('email').value = '';
    $('password').value = '';
  }
})();