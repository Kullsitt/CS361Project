// Local Backend serves /api itself; static hosting uses the project EC2 API.
window.DashboardAPI = {
  base: ['localhost', '127.0.0.1'].includes(location.hostname)
    ? '/api' : 'http://34.236.42.23/api',
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
