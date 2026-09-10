<script setup>
import { ref, computed, nextTick, watch } from 'vue';
import { createPaciente } from '../services/apiService';

const props = defineProps({
  pacientes: Array,
  placementMode: Boolean,
  placementPatient: Object
});

const emit = defineEmits(['start-placement', 'cancel-placement', 'patient-created']);

const step = ref(1); 
const searchName = ref('');
const isSubmitting = ref(false);
const isMobileOpen = ref(false);

const newPatientForm = ref({
  f_nacimiento: '',
  nombre_tutor: '',
  telefono: ''
});

const inputNombre = ref(null);
const inputFecha = ref(null);
const inputTutor = ref(null);
const inputTelefono = ref(null);

const filteredPacientes = computed(() => {
  if (!searchName.value.trim()) return [];
  return props.pacientes.filter(p => p.nombre.toLowerCase().includes(searchName.value.toLowerCase()));
});

watch(searchName, () => {
  if (step.value > 1) {
    step.value = 1;
  }
});

watch(() => props.placementMode, (newVal) => {
  if (!newVal) {
    step.value = 1;
    searchName.value = '';
    newPatientForm.value = { f_nacimiento: '', nombre_tutor: '', telefono: '' };
    nextTick(() => inputNombre.value?.focus());
  }
});

const onNombreEnter = () => {
  if (props.placementMode) return;
  if (filteredPacientes.value.length > 0) {
    inputNombre.value?.blur();
    isMobileOpen.value = false;
    emit('start-placement', filteredPacientes.value[0]);
  } else if (searchName.value.trim().length > 0) {
    step.value = 2;
    nextTick(() => inputFecha.value?.focus());
  }
};

const onFechaInput = (e) => {
  let val = e.target.value.replace(/\D/g, ''); // Solo números
  if (val.length > 8) val = val.slice(0, 8);
  if (val.length >= 5) {
    val = `${val.slice(0, 2)}/${val.slice(2, 4)}/${val.slice(4)}`;
  } else if (val.length >= 3) {
    val = `${val.slice(0, 2)}/${val.slice(2)}`;
  }
  newPatientForm.value.f_nacimiento = val;
};

const onFechaEnter = () => {
  if (props.placementMode) return;
  const val = newPatientForm.value.f_nacimiento;
  if (val.length === 10) {
    const [dd, mm, yyyy] = val.split('/');
    const dateObj = new Date(`${yyyy}-${mm}-${dd}T12:00:00`);
    if (isNaN(dateObj.getTime())) return;
    
    const hoy = new Date();
    let age = hoy.getFullYear() - dateObj.getFullYear();
    const m = hoy.getMonth() - dateObj.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < dateObj.getDate())) {
      age--;
    }

    if (age >= 18) {
      step.value = 4;
      newPatientForm.value.nombre_tutor = ''; // No requiere tutor
      nextTick(() => inputTelefono.value?.focus());
    } else {
      step.value = 3;
      nextTick(() => inputTutor.value?.focus());
    }
  }
};

const onTutorEnter = () => {
  if (props.placementMode) return;
  step.value = 4;
  nextTick(() => inputTelefono.value?.focus());
};

const onTelefonoEnter = async () => {
  if (props.placementMode || isSubmitting.value) return;
  isSubmitting.value = true;
  try {
    const [dd, mm, yyyy] = newPatientForm.value.f_nacimiento.split('/');
    const dbFecha = `${yyyy}-${mm}-${dd}`;

    const newPatient = await createPaciente({
      nombre: searchName.value.trim(),
      f_nacimiento: dbFecha,
      nombre_tutor: newPatientForm.value.nombre_tutor,
      telefono: newPatientForm.value.telefono
    });
    emit('patient-created', newPatient);
    inputTelefono.value?.blur();
    isMobileOpen.value = false;
    emit('start-placement', newPatient);
  } catch (e) {
    console.error(e);
    alert('Error al crear paciente');
  } finally {
    isSubmitting.value = false;
  }
};

const onSelectPatient = (patient) => {
  if (props.placementMode) return;
  isMobileOpen.value = false;
  emit('start-placement', patient);
};

const cancelPlacement = () => {
  emit('cancel-placement');
  step.value = 1;
  searchName.value = '';
  newPatientForm.value = { f_nacimiento: '', nombre_tutor: '', telefono: '' };
  nextTick(() => inputNombre.value?.focus());
};
</script>

<template>
  <!-- Botón FAB Flotante Móvil -->
  <button v-if="!placementMode && !isMobileOpen" 
    @click="isMobileOpen = true"
    class="md:hidden fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-2xl flex items-center justify-center z-40 hover:bg-blue-700 active:scale-95 transition-transform">
    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
  </button>

  <!-- Overlay de fondo oscuro en Móvil -->
  <div v-if="isMobileOpen" @click="isMobileOpen = false" class="md:hidden fixed inset-0 bg-gray-900/50 z-40 backdrop-blur-sm transition-opacity"></div>

  <!-- Panel -->
  <aside :class="[
    'bg-white flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.1)] md:shadow-sm z-50 transition-transform duration-300 rounded-t-2xl md:rounded-none',
    'fixed inset-x-0 bottom-0 max-h-[85vh] md:relative md:w-80 md:max-h-none md:border-r md:border-gray-200',
    isMobileOpen ? 'translate-y-0' : 'translate-y-full md:translate-y-0'
  ]">
    <div class="p-4 border-b border-gray-200 flex justify-between items-center shrink-0">
      <div>
        <h2 class="text-xl font-bold text-gray-800">Agendar Cita</h2>
        <p class="text-xs text-gray-500 mt-1">Presiona Enter para avanzar</p>
      </div>
      <button @click="isMobileOpen = false" class="md:hidden text-gray-400 hover:text-gray-700 p-2 rounded-full">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
      </button>
    </div>

    <div class="p-4 overflow-y-auto flex-1" :class="{'opacity-50 pointer-events-none': placementMode}">
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Nombre del Paciente</label>
          <input type="text" v-model="searchName" @keydown.enter="onNombreEnter" ref="inputNombre"
                 placeholder="Escribe y presiona Enter..."
                 class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-base md:text-sm">
          
          <ul class="border border-gray-200 rounded-md mt-1 max-h-32 overflow-y-auto shadow-sm" v-if="step === 1 && searchName && filteredPacientes.length > 0">
            <li v-for="p in filteredPacientes" :key="p.id_paciente"
                @click="onSelectPatient(p)"
                class="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-0 text-sm">
              <div class="font-medium">{{ p.nombre }}</div>
            </li>
          </ul>
        </div>

        <div v-if="step >= 2">
          <label class="block text-sm font-medium text-gray-700 mb-1">Fecha de Nacimiento *</label>
          <input type="text" :value="newPatientForm.f_nacimiento" @input="onFechaInput" @keydown.enter="onFechaEnter" ref="inputFecha"
                 placeholder="DD/MM/AAAA"
                 class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-yellow-50 text-base md:text-sm">
        </div>

        <div v-if="step >= 3">
          <label class="block text-sm font-medium text-gray-700 mb-1">Nombre del Tutor (opcional)</label>
          <input type="text" v-model="newPatientForm.nombre_tutor" @keydown.enter="onTutorEnter" ref="inputTutor"
                 placeholder="Enter para omitir"
                 class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-yellow-50 text-base md:text-sm">
        </div>

        <div v-if="step >= 4">
          <label class="block text-sm font-medium text-gray-700 mb-1">Teléfono/Celular (opcional)</label>
          <input type="text" v-model="newPatientForm.telefono" @keydown.enter="onTelefonoEnter" ref="inputTelefono"
                 placeholder="Enter para guardar"
                 class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-yellow-50 text-base md:text-sm">
        </div>
      </div>
    </div>

    <div v-if="placementMode" class="mt-auto p-4 bg-blue-50 border-t border-blue-100 shrink-0">
      <div class="text-sm text-blue-800 font-medium mb-2">
        Agendando a: <br> <span class="font-bold text-blue-900">{{ placementPatient?.nombre }}</span>
      </div>
      <p class="text-xs text-blue-700 mb-3">Haz clic en el horario deseado en el calendario para confirmar.</p>
      <button @click="cancelPlacement" class="w-full bg-white border border-blue-200 text-blue-700 text-sm font-medium py-2 rounded-md hover:bg-blue-100">
        Cancelar
      </button>
    </div>
  </aside>
</template>
