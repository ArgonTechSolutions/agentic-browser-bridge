const form = document.getElementById('login');
form.onsubmit = async event => {
  event.preventDefault(); const button = form.querySelector('button'); button.disabled = true;
  const input = document.getElementById('password');
  try {
    const response = await fetch('/api/login', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-ABB-Control': '1'}, body: JSON.stringify({password: input.value})});
    input.value = '';
    if (!response.ok) throw Error((await response.json()).error || 'Sign-in failed.');
    sessionStorage.setItem('abb-show-reminder', '1');
    location.replace('/');
  } catch (e) { document.getElementById('error').textContent = e.message; }
  finally { input.value = ''; button.disabled = false; }
};
