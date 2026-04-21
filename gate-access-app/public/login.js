const form = document.getElementById('login-form');
const errEl = document.getElementById('login-error');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errEl.textContent = '';
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      errEl.textContent = body.error || 'sign-in failed';
      return;
    }
    window.location.href = '/';
  } catch (err) {
    errEl.textContent = err.message;
  }
});
