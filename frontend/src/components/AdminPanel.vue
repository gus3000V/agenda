<template>
  <div>
    <!-- COMPONENTE DE BLOQUEO -->
    <div v-if="!isAuthenticated" class="bloqueo-container">
      <h2>Panel de Administración - Acceso Restringido</h2>
      <form @submit.prevent="guardarPin">
        <label for="pin">Ingrese el PIN de Operación:</label>
        <input 
          id="pin" 
          type="password" 
          v-model="pinInput" 
          placeholder="****" 
          required 
        />
        <button type="submit">Desbloquear Panel</button>
      </form>
    </div>

    <!-- PANEL PRINCIPAL (Lógica y consumo de la API) -->
    <div v-else class="panel-container">
      <header>
        <h2>Gestión de Consultorio</h2>
        <button @click="cerrarSesion">Cerrar Sesión (Borrar PIN)</button>
      </header>

      <!-- Los botones/UI para accionar las funciones irán aquí posteriormente -->
      <button @click="cargarHorarios">Refrescar Citas</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../api'; // Importamos la instancia interceptada de axios

// Estados reactivos
const isAuthenticated = ref(false);
const pinInput = ref('');
const horarios = ref([]);

// Ciclo de vida: Verificar si ya estamos autenticados al montar
onMounted(() => {
  const guardado = localStorage.getItem('admin_pin');
  if (guardado) {
    isAuthenticated.value = true;
    cargarHorarios(); // Opcional: Cargar de inmediato si ya hay PIN
  }
});

// Lógica de Bloqueo
const guardarPin = () => {
  if (pinInput.value.trim() !== '') {
    localStorage.setItem('admin_pin', pinInput.value);
    isAuthenticated.value = true;
    pinInput.value = '';
    cargarHorarios();
  }
};

const cerrarSesion = () => {
  localStorage.removeItem('admin_pin');
  isAuthenticated.value = false;
  horarios.value = [];
};

// --- CONSUMO DE ENDPOINTS ---

/**
 * 1. Obtener listado de horarios cruzados con pacientes
 * GET /api/admin/horarios
 */
const cargarHorarios = async () => {
  try {
    const response = await api.get('/horarios');
    horarios.value = response.data;
    console.log('Citas cargadas:', horarios.value);
  } catch (error) {
    console.error('Error al cargar horarios:', error);
    // Si nos rebotan por PIN incorrecto
    if (error.response?.status === 403) {
      alert('El PIN es inválido. Acceso denegado.');
      cerrarSesion(); 
    }
  }
};

/**
 * 2. Crear un paciente y un horario en la misma transacción
 * POST /api/admin/paciente-y-cita
 */
const registrarNuevaCita = async (datos) => {
  // La UI debería construir un objeto 'datos' como este:
  // { nombre, f_nacimiento, nombre_tutor, telefono, inicio, final }
  try {
    const response = await api.post('/paciente-y-cita', datos);
    console.log('Cita y paciente registrados:', response.data);
    
    // Refrescamos la lista local de horarios
    await cargarHorarios();
    return response.data;
  } catch (error) {
    console.error('Error al registrar nueva cita:', error);
    throw error;
  }
};

/**
 * 3. Actualizar el estado de un horario
 * PUT /api/admin/horario/:id/estado
 */
const modificarEstado = async (idHorario, nuevoEstado) => {
  // nuevoEstado debe ser 'aceptado' o 'rechazado'
  try {
    const response = await api.put(`/horario/${idHorario}/estado`, { estado: nuevoEstado });
    console.log('Estado actualizado exitosamente:', response.data);
    
    // Podríamos recargar toda la lista o actualizar solo el elemento reactivo modificado:
    await cargarHorarios();
  } catch (error) {
    console.error(`Error al marcar como ${nuevoEstado}:`, error);
    alert('Ocurrió un error al cambiar el estado.');
  }
};
</script>
