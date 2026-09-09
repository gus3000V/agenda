<script setup>
import { ref, watch, onUnmounted } from 'vue';
import { format, differenceInDays, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import EventBlock from './EventBlock.vue';
import { useDragAndDrop } from '../composables/useDragAndDrop';
import { pxPerHour, pxPerMinute, blockDuration, getPatientColor } from '../utils/constants';
import { updateHorarioEstado, updateHorarioInicio, deleteHorario, createHorario } from '../services/apiService';

const props = defineProps({
  horarios: Array,
  days: Array,
  startDate: Date,
  placementMode: Boolean,
  placementPatient: Object
});

const emit = defineEmits(['logout', 'refresh-data', 'cancel-placement']);

const scrollContainer = ref(null);
const showDeleteId = ref(null);

const {
  draggingHorario,
  dragGhost,
  hoverLineTop,
  bindGlobalEvents,
  unbindGlobalEvents,
  onMouseDown,
  getNewDateFromGhost,
  cleanUpDrag,
  onDayMouseMove,
  onDayMouseLeave
} = useDragAndDrop(ref(props.days), scrollContainer);

watch(() => props.placementMode, (newVal) => {
  if (newVal) {
    dragGhost.value.visible = true; // force ghost visibility logic
    bindGlobalEvents();
  } else {
    unbindGlobalEvents();
    cleanUpDrag();
  }
});

const handleMouseDown = (event, horario) => {
  if (props.placementMode) return;
  showDeleteId.value = null;
  onMouseDown(event, horario);
  bindGlobalEvents();
  document.addEventListener('mouseup', handleMouseUp);
};

const toLocalISOString = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
};

const handleMouseUp = async () => {
  document.removeEventListener('mouseup', handleMouseUp);
  unbindGlobalEvents();

  if (draggingHorario.value && dragGhost.value.visible) {
    const newDate = getNewDateFromGhost();
    const horarioId = draggingHorario.value.id_horario;
    
    // Optimistic UI update
    draggingHorario.value.inicio = newDate;
    
    try {
      await updateHorarioInicio(horarioId, toLocalISOString(newDate));
      emit('refresh-data');
    } catch (e) {
      console.error(e);
      alert('Error al guardar el horario');
      emit('refresh-data');
    }
  }
  cleanUpDrag();
};

const handleDayMouseMove = (event, dayIndex) => {
  if (draggingHorario.value || props.placementMode) return; // handled globally
  onDayMouseMove(event);
};

const handleDayMouseLeave = () => {
  onDayMouseLeave();
};

const handleGridClick = async (event, dayIndex) => {
  if (!props.placementMode || !props.placementPatient) return;
  
  unbindGlobalEvents();
  
  const newDate = getNewDateFromGhost();
  const patientId = props.placementPatient.id_paciente;
  
  cleanUpDrag();
  
  try {
    await createHorario(patientId, toLocalISOString(newDate));
    emit('refresh-data');
    emit('cancel-placement'); // This resets the flow on sidebar
  } catch (e) {
    console.error(e);
    alert('Error al agendar cita');
  }
};

const handleCambiarEstado = async (horario, nuevoEstado) => {
  try {
    await updateHorarioEstado(horario.id_horario, nuevoEstado);
    horario.estado = nuevoEstado; // Optimistic update
  } catch (error) {
    console.error('Error:', error);
    alert('Error al actualizar estado');
  }
};

const handleConfirmDelete = async (id) => {
  try {
    await deleteHorario(id);
    showDeleteId.value = null;
    emit('refresh-data');
  } catch (e) {
    console.error(e);
    alert('Error al eliminar reserva');
  }
};

onUnmounted(() => {
  unbindGlobalEvents();
  document.removeEventListener('mouseup', handleMouseUp);
});
</script>

<template>
  <div class="flex-1 flex flex-col min-w-0" :class="{'cursor-crosshair': placementMode}">
    <!-- Overlay invisible para cerrar el tooltip de eliminar -->
    <div v-if="showDeleteId !== null" @mousedown.stop="showDeleteId = null" class="fixed inset-0 z-50"></div>
    
    <header class="bg-white shadow px-4 py-3 flex items-center justify-between z-20">
      <div>
        <h1 class="text-xl font-bold text-gray-800">Calendario</h1>
        <div class="text-sm text-gray-500">Semana del {{ format(days[0], 'dd/MM/yyyy') }}</div>
      </div>
      <button @click="emit('logout')" class="text-sm text-red-600 hover:text-red-800 font-medium">Cerrar Sesión</button>
    </header>

    <div class="flex-1 flex overflow-hidden p-4">
      <div class="flex-1 bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col overflow-hidden">
        
        <div class="flex border-b border-gray-200 bg-gray-50 z-10 sticky top-0 pl-16">
          <div v-for="(day, index) in days" :key="index" class="flex-1 py-3 text-center border-l border-gray-200">
            <div class="font-semibold text-gray-700 capitalize">{{ format(day, 'EEEE', { locale: es }) }}</div>
            <div class="text-sm text-gray-500">{{ format(day, 'dd/MM/yyyy') }}</div>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto relative grid-container" ref="scrollContainer">
          <div class="flex">
            <div class="w-16 flex-none bg-gray-50 border-r border-gray-200 relative" :style="{ height: `${24 * pxPerHour}px` }">
              <div v-for="hour in 24" :key="hour" 
                   class="absolute w-full text-right pr-2 text-xs text-gray-500 -mt-2.5"
                   :style="{ top: `${(hour - 1) * pxPerHour}px` }">
                {{ String(hour - 1).padStart(2, '0') }}:00
              </div>
            </div>

            <div class="flex flex-1 relative">
              <div v-for="(day, dayIndex) in days" :key="dayIndex"
                   class="flex-1 border-l border-gray-200 relative day-column"
                   :style="{ height: `${24 * pxPerHour}px` }"
                   @mousemove="handleDayMouseMove($event, dayIndex)"
                   @mouseleave="handleDayMouseLeave"
                   @click="handleGridClick($event, dayIndex)">
                
                <EventBlock 
                  v-for="horario in horarios.filter(h => differenceInDays(startOfDay(h.inicio), startOfDay(day)) === 0 && h.estado !== 'rechazado')"
                  :key="horario.id_horario"
                  :horario="horario"
                  :start-date="startDate"
                  :show-delete-id="showDeleteId"
                  @mousedown="handleMouseDown"
                  @cambiar-estado="handleCambiarEstado"
                  @delete-click="id => showDeleteId = id"
                  @confirm-delete="handleConfirmDelete"
                />

                <div v-if="hoverLineTop !== -1"
                     class="absolute w-full h-px bg-red-500 pointer-events-none z-30 transition-all duration-75"
                     :style="{ top: `${hoverLineTop}px` }">
                  <div class="absolute -left-12 -top-2.5 text-sm text-red-600 font-bold bg-white px-1 rounded shadow-sm border border-red-100">
                    {{ String(Math.floor(hoverLineTop / pxPerHour)).padStart(2, '0') }}:{{ String(Math.floor((hoverLineTop % pxPerHour) / pxPerMinute)).padStart(2, '0') }}
                  </div>
                </div>

                <div v-if="dragGhost.visible && dragGhost.dayIndex === dayIndex"
                     class="absolute left-1 right-1 rounded border-dashed opacity-80 pointer-events-none z-20 flex flex-col p-1 text-xs"
                     :style="{ 
                       top: `${dragGhost.top}px`, 
                       height: `${blockDuration * pxPerMinute}px`,
                       backgroundColor: placementMode ? getPatientColor(placementPatient?.id_paciente).bg : getPatientColor(draggingHorario?.id_paciente).bg,
                       borderColor: placementMode ? getPatientColor(placementPatient?.id_paciente).border : getPatientColor(draggingHorario?.id_paciente).border,
                       color: placementMode ? getPatientColor(placementPatient?.id_paciente).text : getPatientColor(draggingHorario?.id_paciente).text,
                       borderWidth: '2px'
                     }">
                     <div class="font-bold">{{ placementMode ? placementPatient?.nombre : draggingHorario?.nombre }}</div>
                     <div class="opacity-90">
                       {{ String(Math.floor(dragGhost.top / pxPerHour)).padStart(2, '0') }}:{{ String(Math.floor((dragGhost.top % pxPerHour) / pxPerMinute)).padStart(2, '0') }}
                       -
                       {{ String(Math.floor((dragGhost.top + blockDuration * pxPerMinute) / pxPerHour)).padStart(2, '0') }}:{{ String(Math.floor(((dragGhost.top + blockDuration * pxPerMinute) % pxPerHour) / pxPerMinute)).padStart(2, '0') }}
                     </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.day-column {
  background-image: 
    linear-gradient(to bottom, #d1d5db 1px, transparent 1px),
    linear-gradient(to bottom, #e5e7eb 1px, transparent 1px),
    linear-gradient(to bottom, #f3f4f6 1px, transparent 1px);
  background-size: 
    100% 120px,
    100% 20px,
    100% 10px;
  background-position: 
    0 0, 0 0, 0 0;
}

.day-column:hover {
  background-color: #fafafa;
}
</style>
