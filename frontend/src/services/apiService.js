const BASE_URL = import.meta.env.API_URL || 'https://agenda-sw74.onrender.com/api/admin';

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'x-api-key': localStorage.getItem('admin_pin') || ''
});

export const getHorarios = async () => {
  const res = await fetch(`${BASE_URL}/horarios`, { headers: getHeaders() });
  if (res.status === 403) return null; // Indicator for invalid PIN
  return await res.json();
};

export const getPacientes = async () => {
  const res = await fetch(`${BASE_URL}/pacientes`, { headers: getHeaders() });
  return await res.json();
};

export const createPaciente = async (paciente) => {
  const res = await fetch(`${BASE_URL}/pacientes`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(paciente)
  });
  return await res.json();
};

export const createHorario = async (id_paciente, inicioDateString) => {
  const res = await fetch(`${BASE_URL}/horario`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ id_paciente, inicio: inicioDateString })
  });
  return await res.json();
};

export const updateHorarioEstado = async (id_horario, estado) => {
  const res = await fetch(`${BASE_URL}/horario/${id_horario}/estado`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ estado })
  });
  if (!res.ok) throw new Error('Error al actualizar estado');
  return true;
};

export const updateHorarioInicio = async (id_horario, inicioDateString) => {
  const res = await fetch(`${BASE_URL}/horario/${id_horario}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ inicio: inicioDateString })
  });
  if (!res.ok) throw new Error('Error al actualizar inicio');
  return true;
};

export const deleteHorario = async (id_horario) => {
  const res = await fetch(`${BASE_URL}/horario/${id_horario}`, {
    method: 'DELETE',
    headers: getHeaders()
  });
  if (!res.ok) throw new Error('Error al eliminar');
  return true;
};
