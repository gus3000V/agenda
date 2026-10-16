<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { startOfWeek, addDays, parseISO, format } from 'date-fns';
import { getHorarios, getPacientes, login, logout, hasSession, clearSession } from './services/apiService';
import LoginPanel from './components/LoginPanel.vue';
import SidebarPanel from './components/SidebarPanel.vue';
import CalendarGrid from './components/CalendarGrid.vue';

const isAuthenticated = ref(false);
const loginError = ref('');
const loading = ref(false);
const dataError = ref('');
const horarios = ref([]);
const pacientes = ref([]);
const startDate = ref(startOfWeek(new Date(), { weekStartsOn: 1 }));
const days = computed(() => Array.from({ length: 7 }).map((_, i) => addDays(startDate.value, i)));

const placementMode = ref(false);
const placementPatient = ref(null);
const placementEspecialidad = ref('fonoaudiologia');
const placementOptions = ref({});
const editing = ref(false);

let pollingInterval = null;

const startPolling = () => {
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(() => {
    // Evitar interrumpir al usuario si está arrastrando o agendando
    const isAnyDragging = horarios.value.some(h => h.isDragging);
    if (!editing.value && !placementMode.value && !isAnyDragging) {
      fetchData();
    }
  }, 5000); // 5 segundos
};

onMounted(() => {
  window.addEventListener('session-expired', resetSession);
  if (hasSession()) {
    isAuthenticated.value = true;
    fetchData();
    startPolling();
  }
});

const handleLogin = async (pin) => {
  if (loading.value) return;
  loading.value = true; loginError.value = '';
  try {
    await login(pin);
    isAuthenticated.value = true;
    await fetchData(); startPolling();
  } catch (error) { loginError.value = error.message; }
  finally { loading.value = false; }
};
const resetSession = () => {
  clearSession(); isAuthenticated.value = false;
  horarios.value = []; pacientes.value = []; cancelPlacement();
  if (pollingInterval) clearInterval(pollingInterval);
};
const handleLogout = async () => {
  try { await logout(); } catch { /* Locally close even if offline. */ }
  resetSession();
};
onUnmounted(() => {
  if (pollingInterval) clearInterval(pollingInterval);
  window.removeEventListener('session-expired', resetSession);
});

const fetchData = async () => {
  const requestedWeek = startDate.value.getTime();
  try {
    const dataHorarios = await getHorarios(format(startDate.value, 'yyyy-MM-dd'), format(addDays(startDate.value, 7), 'yyyy-MM-dd'));
    if (!dataHorarios) {
      alert('PIN Inválido');
      handleLogout();
      return;
    }
    if (!isAuthenticated.value || requestedWeek !== startDate.value.getTime()) return;
    dataError.value = '';
    horarios.value = dataHorarios.map(h => ({
      ...h,
      inicio: parseISO(h.inicio),
      final: parseISO(h.final)
    }));

    const dataPacientes = await getPacientes();
    if (isAuthenticated.value) pacientes.value = dataPacientes;
  } catch (error) {
    dataError.value = error.message;
  }
};

watch(startDate, () => { if (isAuthenticated.value) fetchData(); });
const changeWeek = offset => { if (!placementMode.value && !editing.value) startDate.value = addDays(startDate.value, offset * 7); };
const startPlacement = (patient, especialidad = 'fonoaudiologia', options = {}) => {
  placementOptions.value = options;
  placementPatient.value = patient;
  placementEspecialidad.value = especialidad;
  placementMode.value = true;
};

const cancelPlacement = () => {
  placementMode.value = false;
  placementPatient.value = null;
  placementEspecialidad.value = 'fonoaudiologia';
};
</script>

<template>
  <LoginPanel v-if="!isAuthenticated" :error="loginError" :loading="loading" @login="handleLogin" />
  
  <div v-else class="h-dvh flex bg-gray-50 overflow-hidden relative">
    <div v-if="dataError" role="alert" class="absolute bottom-0 left-0 right-0 z-50 bg-red-100 p-3 text-red-800">{{ dataError }}</div>
    <SidebarPanel class="print:hidden"
      :pacientes="pacientes"
      :placement-mode="placementMode"
      :placement-patient="placementPatient"
      @start-placement="startPlacement"
      @cancel-placement="cancelPlacement"
      @patient-created="p => pacientes.push(p)"
    />
    <CalendarGrid 
      :horarios="horarios"
      :days="days"
      :start-date="startDate"
      :placement-mode="placementMode"
      :placement-patient="placementPatient"
      :placement-especialidad="placementEspecialidad"
      :placement-options="placementOptions"
      @change-week="changeWeek"
      @editing="editing = $event"
      @logout="handleLogout"
      @refresh-data="fetchData"
      @cancel-placement="cancelPlacement"
    />
  </div>
</template>
