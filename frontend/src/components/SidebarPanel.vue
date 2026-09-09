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
  <aside class="w-80 bg-white border-r border-gray-200 flex flex-col shadow-sm z-40">
    <div class="p-4 border-b border-gray-200">
      <h2 class="text-xl font-bold text-gray-800">Agendar Cita</h2>
      <p class="text-xs text-gray-500 mt-1">Presiona Enter para avanzar</p>
    </div>

    <div class="p-4" :class="{'opacity-50 pointer-events-none': placementMode}">
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Nombre del Paciente</label>
          <input type="text" v-model="searchName" @keydown.enter="onNombreEnter" ref="inputNombre"
                 placeholder="Escribe y presiona Enter..."
                 class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
          
          <ul class="border border-gray-200 rounded-md mt-1 max-h-32 overflow-y-auto" v-if="step === 1 && searchName && filteredPacientes.length > 0">
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
                 class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-yellow-50">
        </div>

        <div v-if="step >= 3">
          <label class="block text-sm font-medium text-gray-700 mb-1">Nombre del Tutor (opcional)</label>
          <input type="text" v-model="newPatientForm.nombre_tutor" @keydown.enter="onTutorEnter" ref="inputTutor"
                 placeholder="Enter para omitir"
                 class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-yellow-50">
        </div>

        <div v-if="step >= 4">
          <label class="block text-sm font-medium text-gray-700 mb-1">Teléfono/Celular (opcional)</label>
          <input type="text" v-model="newPatientForm.telefono" @keydown.enter="onTelefonoEnter" ref="inputTelefono"
                 placeholder="Enter para guardar"
                 class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-yellow-50">
        </div>
      </div>
    </div>

    <div v-if="placementMode" class="mt-auto p-4 bg-blue-50 border-t border-blue-100">
      <div class="text-sm text-blue-800 font-medium mb-2">
        Agendando a: <br> <span class="font-bold text-blue-900">{{ placementPatient?.nombre }}</span>
      </div>
      <p class="text-xs text-blue-700 mb-3">Haz clic en el horario deseado en el calendario para confirmar.</p>
      <button @click="cancelPlacement" class="w-full bg-white border border-blue-200 text-blue-700 text-sm font-medium py-1.5 rounded-md hover:bg-blue-100">
        Cancelar
      </button>
    </div>
  </aside>
</template>
