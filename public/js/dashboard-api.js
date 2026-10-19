// Use the configured API or the project EC2 API, regardless of the page host.
window.DashboardAPI = {
  base: typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://34.236.42.23/api',
  async request(path, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) { location.href = 'login.html'; throw new Error('กรุณาเข้าสู่ระบบ'); }
    const response = await fetch(this.base + path, {
      ...options,
      headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers}
    });
    if (response.status === 401) {
      localStorage.removeItem('token'); localStorage.removeItem('user');
      location.href = 'login.html'; throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(typeof error.detail === 'string' ? error.detail : 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่');
    }
    return response.status === 204 ? null : response.json();
  }
};

// Shared result dialog for profile saves and workload mutations.
window.showDashboardResult = (message, kind = 'success') => {
  let dialog = document.getElementById('dashboard-result');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'dashboard-result';
    dialog.className = 'dashboard-result';
    dialog.setAttribute('aria-labelledby', 'dashboard-result-title');
    dialog.setAttribute('aria-describedby', 'dashboard-result-message');
    const icon = document.createElement('div');
    icon.className = 'result-icon'; icon.setAttribute('aria-hidden', 'true');
    const title = document.createElement('h2'); title.id = 'dashboard-result-title';
    const description = document.createElement('p'); description.id = 'dashboard-result-message';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'ตกลง';
    close.autofocus = true;
    close.addEventListener('click', () => dialog.close());
    dialog.append(icon, title, description, close);
    document.body.append(dialog);
  }
  const failed = kind === 'error';
  dialog.dataset.kind = failed ? 'error' : 'success';
  dialog.querySelector('.result-icon').textContent = failed ? '!' : '✓';
  dialog.querySelector('h2').textContent = failed ? 'ดำเนินการไม่สำเร็จ' : 'ดำเนินการสำเร็จ';
  dialog.querySelector('p').textContent = message;
  if (!dialog.open) dialog.showModal();
};
