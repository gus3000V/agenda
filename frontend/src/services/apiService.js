const BASE_URL = (import.meta.env.API_URL || '/api/admin').replace(/\/$/, '');
const AUTH_URL = BASE_URL.replace(/\/admin$/, '/auth');
let token = sessionStorage.getItem('admin_session') || '';
// Remove credentials stored by earlier versions.
localStorage.removeItem('admin_pin');
export const hasSession = () => Boolean(token);
export const clearSession = () => { token = ''; sessionStorage.removeItem('admin_session'); };
async function request(url, method = 'GET', body) {
  const res = await fetch(url, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (res.status !== 204 && !res.headers.get('content-type')?.includes('application/json')) {
    throw new Error('El servidor devolvió una página en lugar de la API. Revisa API_URL del frontend y que el backend tenga /api/auth/login desplegado.');
  }
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) {
    if (res.status === 401 && !url.endsWith('/login')) {
      clearSession(); window.dispatchEvent(new Event('session-expired'));
    }
    throw new Error(data?.error || 'No se pudo completar la solicitud.');
  }
  return data;
}
export async function login(pin) {
  const data = await request(`${AUTH_URL}/login`, 'POST', { pin });
  if (typeof data?.token !== 'string' || !data.token) throw new Error('Respuesta de inicio de sesión inválida. Revisa la versión desplegada del backend.');
  token = data.token; sessionStorage.setItem('admin_session', token);
}
export async function logout() {
  try { await request(`${AUTH_URL}/logout`, 'POST'); } finally { clearSession(); }
}
export const getHorarios = () => request(`${BASE_URL}/horarios`);
export const getPacientes = () => request(`${BASE_URL}/pacientes`);
export const createPaciente = paciente => request(`${BASE_URL}/pacientes`, 'POST', paciente);
export const createHorario = (id_paciente, inicio, especialidad = 'fonoaudiologia') => request(`${BASE_URL}/horario`, 'POST', { id_paciente, inicio, especialidad });
export const updateHorarioEstado = (id, estado) => request(`${BASE_URL}/horario/${id}/estado`, 'PUT', { estado });
export const updateHorarioInicio = (id, inicio) => request(`${BASE_URL}/horario/${id}`, 'PUT', { inicio });
export const deleteHorario = id => request(`${BASE_URL}/horario/${id}`, 'DELETE');
