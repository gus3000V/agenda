<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { startOfWeek, addDays, parseISO } from 'date-fns';
import { getHorarios, getPacientes } from './services/apiService';
import LoginPanel from './components/LoginPanel.vue';
import SidebarPanel from './components/SidebarPanel.vue';
import CalendarGrid from './components/CalendarGrid.vue';

const isAuthenticated = ref(false);
const horarios = ref([]);
const pacientes = ref([]);
const startDate = ref(startOfWeek(new Date(), { weekStartsOn: 1 }));
const days = computed(() => Array.from({ length: 7 }).map((_, i) => addDays(startDate.value, i)));

const placementMode = ref(false);
const placementPatient = ref(null);

let pollingInterval = null;

const startPolling = () => {
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(() => {
    // Evitar interrumpir al usuario si está arrastrando o agendando
    const isAnyDragging = horarios.value.some(h => h.isDragging);
    if (!placementMode.value && !isAnyDragging) {
      fetchData();
    }
  }, 5000); // 5 segundos
};

onMounted(() => {
  if (localStorage.getItem('admin_pin')) {
    isAuthenticated.value = true;
    fetchData();
    startPolling();
  }
});

const handleLogin = (pin) => {
  localStorage.setItem('admin_pin', pin);
  isAuthenticated.value = true;
  fetchData();
  startPolling();
};

const handleLogout = () => {
  localStorage.removeItem('admin_pin');
  isAuthenticated.value = false;
  if (pollingInterval) clearInterval(pollingInterval);
};

onUnmounted(() => {
  if (pollingInterval) clearInterval(pollingInterval);
});

const fetchData = async () => {
  try {
    const dataHorarios = await getHorarios();
    if (!dataHorarios) {
      alert('PIN Inválido');
      handleLogout();
      return;
    }
    horarios.value = dataHorarios.map(h => ({
      ...h,
      inicio: parseISO(h.inicio),
      final: parseISO(h.final)
    }));

    pacientes.value = await getPacientes();
  } catch (error) {
    console.error('Error fetching data:', error);
  }
};

const startPlacement = (patient) => {
  placementPatient.value = patient;
  placementMode.value = true;
};

const cancelPlacement = () => {
  placementMode.value = false;
  placementPatient.value = null;
};
</script>

<template>
  <LoginPanel v-if="!isAuthenticated" @login="handleLogin" />
  
  <div v-else class="h-screen flex bg-gray-50 overflow-hidden relative">
    <SidebarPanel 
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
      @logout="handleLogout"
      @refresh-data="fetchData"
      @cancel-placement="cancelPlacement"
    />
  </div>
</template>
