export const pxPerHour = 120;
export const pxPerMinute = pxPerHour / 60; // 2px por minuto
export const blockDuration = 45; // 45 minutos

export const getPatientColor = (id_paciente) => {
  if (!id_paciente) return { bg: '#e0e7ff', border: '#4f46e5', text: '#312e81' };
  const hue = (id_paciente * 137.508) % 360; 
  return {
    bg: `hsl(${hue}, 70%, 90%)`,
    border: `hsl(${hue}, 70%, 50%)`,
    text: `hsl(${hue}, 70%, 20%)`
  };
};
export const getEspecialidadColor = (especialidad) => {
  if (especialidad === 'cosmetologia') {
    return { bg: '#fdf4ff', border: '#d946ef', text: '#86198f' }; // Pink/Purple hues
  }
  // Default fonoaudiologia
  return { bg: '#e0f2fe', border: '#0ea5e9', text: '#075985' }; // Blue hues
};
