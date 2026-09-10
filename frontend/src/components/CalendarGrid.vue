<script setup>
import { ref, watch, onUnmounted } from 'vue';
import { format, differenceInDays, startOfDay, set } from 'date-fns';
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

const isTouchModeActive = () => {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
};

// Unified Mobile UX State
const mobileAction = ref({
  type: null,
  horario: null,
  patient: null,
  step: 1,
  pendingDate: null
});

watch(() => props.placementMode, (newVal) => {
  if (newVal) {
    if (isTouchModeActive()) {
      mobileAction.value = {
        type: 'PLACE',
        patient: props.placementPatient,
        step: 2,
        pendingDate: null
      };
    } else {
      dragGhost.value.visible = true; 
      bindGlobalEvents();
    }
  } else {
    unbindGlobalEvents();
    cleanUpDrag();
    mobileAction.value.type = null;
  }
});

const handleBlockClick = (event, horario) => {
  if (isTouchModeActive() && !props.placementMode) {
    if (mobileAction.value.type !== null) return;
    
    mobileAction.value = {
      type: 'MOVE',
      horario: horario,
      step: 1,
      pendingDate: null
    };
  }
};

const handleMouseDown = (event, horario) => {
  if (props.placementMode || isTouchModeActive()) return;
  showDeleteId.value = null;
  onMouseDown(event, horario);
  bindGlobalEvents();
  document.addEventListener('mouseup', handleMouseUp);
};

const cancelMobileAction = () => {
  if (mobileAction.value.type === 'PLACE') {
    emit('cancel-placement');
  }
  mobileAction.value.type = null;
  dragGhost.value.visible = false;
};

const confirmMobileAction = async () => {
  if (!mobileAction.value.pendingDate) return;
  
  const isoStr = toLocalISOString(mobileAction.value.pendingDate);
  
  if (mobileAction.value.type === 'MOVE') {
    const id = mobileAction.value.horario.id_horario;
    mobileAction.value.type = null;
    dragGhost.value.visible = false;
    try {
      await updateHorarioInicio(id, isoStr);
      emit('refresh-data');
    } catch (e) {
      console.error(e);
      alert('Error al mover cita');
    }
  } else if (mobileAction.value.type === 'PLACE') {
    const pId = mobileAction.value.patient.id_paciente;
    mobileAction.value.type = null;
    dragGhost.value.visible = false;
    try {
      await createHorario(pId, isoStr);
      emit('refresh-data');
      emit('cancel-placement');
    } catch (e) {
      console.error(e);
      alert('Error al agendar cita');
    }
  }
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
    
    cleanUpDrag();
    try {
      await updateHorarioInicio(horarioId, toLocalISOString(newDate));
      emit('refresh-data');
    } catch (e) {
      console.error(e);
      alert('Error al guardar el horario');
      emit('refresh-data');
    }
  } else {
    cleanUpDrag();
  }
};

const handleDayMouseMove = (event, dayIndex) => {
  if (draggingHorario.value || props.placementMode || isTouchModeActive()) return; 
  onDayMouseMove(event);
};

const handleDayMouseLeave = () => {
  onDayMouseLeave();
};

const handleGridClick = async (event, dayIndex) => {
  // Mobile touch handling
  if (isTouchModeActive()) {
    if (mobileAction.value.type && mobileAction.value.step === 2) {
      const rect = event.currentTarget.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const snapPixels = 5 * pxPerMinute;
      const snappedY = Math.max(0, Math.round(y / snapPixels) * snapPixels);
      const totalMinutes = snappedY / pxPerMinute;
      
      mobileAction.value.pendingDate = set(props.days[dayIndex], {
        hours: Math.floor(totalMinutes / 60),
        minutes: totalMinutes % 60,
        seconds: 0,
        milliseconds: 0
      });

      let height = 45 * pxPerMinute;
      if (mobileAction.value.type === 'MOVE') {
        const ms = mobileAction.value.horario.final.getTime() - mobileAction.value.horario.inicio.getTime();
        height = (ms / 60000) * pxPerMinute;
      }
      
      dragGhost.value = {
        visible: true,
        top: snappedY,
        dayIndex: dayIndex,
        height: height
      };
    }
    return;
  }

  // Desktop mouse handling
  if (!props.placementMode || !props.placementPatient) return;
  
  unbindGlobalEvents();
  const newDate = getNewDateFromGhost();
  const patientId = props.placementPatient.id_paciente;
  cleanUpDrag();
  try {
    await createHorario(patientId, toLocalISOString(newDate));
    emit('refresh-data');
    emit('cancel-placement');
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
    
    <header class="bg-white shadow px-4 py-3 flex items-center justify-between z-20 shrink-0">
      <div>
        <h1 class="text-xl font-bold text-gray-800">Calendario</h1>
        <div class="text-sm text-gray-500">Semana del {{ format(days[0], 'dd/MM/yyyy') }}</div>
      </div>
      <button @click="emit('logout')" class="text-sm text-red-600 hover:text-red-800 font-medium">Cerrar Sesión</button>
    </header>

    <div class="flex-1 flex overflow-hidden p-0 md:p-4">
      <div class="flex-1 bg-white md:border md:border-gray-200 md:rounded-lg md:shadow-sm flex flex-col overflow-hidden relative">
        
        <div class="flex-1 overflow-auto relative grid-container snap-x snap-mandatory scroll-pl-14 md:scroll-pl-16" ref="scrollContainer">
          
          <!-- Sticky Header -->
          <div class="flex border-b border-gray-200 bg-gray-50 z-30 sticky top-0 w-max min-w-full">
            <div class="w-14 md:w-16 flex-none bg-gray-50 sticky left-0 z-40 border-r border-gray-200"></div>
            <div v-for="(day, index) in days" :key="index" class="w-[calc(100vw-3.5rem)] sm:w-48 md:flex-1 min-w-[200px] py-2 md:py-3 text-center border-l border-gray-200 snap-start">
              <div class="font-semibold text-gray-700 capitalize text-sm md:text-base">{{ format(day, 'EEEE', { locale: es }) }}</div>
              <div class="text-xs md:text-sm text-gray-500">{{ format(day, 'dd/MM/yyyy') }}</div>
            </div>
          </div>

          <!-- Body -->
          <div class="flex w-max min-w-full">
            
            <!-- Sticky Time Column -->
            <div class="w-14 md:w-16 flex-none bg-gray-50 border-r border-gray-200 relative sticky left-0 z-20" :style="{ height: `${24 * pxPerHour}px` }">
              <div v-for="hour in 24" :key="hour" 
                   class="absolute w-full text-right pr-1 md:pr-2 text-[10px] md:text-xs text-gray-500 -mt-2 md:-mt-2.5 font-medium"
                   :style="{ top: `${(hour - 1) * pxPerHour}px` }">
                {{ String(hour - 1).padStart(2, '0') }}:00
              </div>
            </div>

            <!-- Day Columns -->
            <div class="flex flex-1 relative">
              <div v-for="(day, dayIndex) in days" :key="dayIndex"
                   class="w-[calc(100vw-3.5rem)] sm:w-48 md:flex-1 min-w-[200px] border-l border-gray-200 relative day-column snap-start"
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
                  :class="{'opacity-50': mobileAction.type === 'MOVE' && mobileAction.step === 2 && mobileAction.horario?.id_horario === horario.id_horario}"
                  @mousedown="handleMouseDown"
                  @click="handleBlockClick($event, horario)"
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
                     class="absolute left-1 right-1 rounded-md opacity-80 z-50 pointer-events-none shadow-md overflow-hidden flex flex-col justify-center p-2 text-xs border-2"
                     :class="[
                       placementMode ? getPatientColor(placementPatient?.id_paciente).bg : (mobileAction.type ? getPatientColor(mobileAction.horario?.id_paciente).bg : getPatientColor(draggingHorario?.id_paciente).bg),
                       placementMode ? getPatientColor(placementPatient?.id_paciente).border : (mobileAction.type ? getPatientColor(mobileAction.horario?.id_paciente).border : getPatientColor(draggingHorario?.id_paciente).border),
                       placementMode ? getPatientColor(placementPatient?.id_paciente).text : (mobileAction.type ? getPatientColor(mobileAction.horario?.id_paciente).text : getPatientColor(draggingHorario?.id_paciente).text)
                     ]"
                     :style="{ 
                       top: `${dragGhost.top}px`, 
                       height: `${dragGhost.height}px`
                     }">
                     <div class="font-bold truncate leading-tight">{{ placementMode ? placementPatient?.nombre : (mobileAction.type ? mobileAction.horario?.nombre : draggingHorario?.nombre) }}</div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Mobile Unified Action Panel -->
    <div v-if="mobileAction.type" class="fixed bottom-4 right-4 left-4 md:hidden bg-white shadow-2xl rounded-xl border border-gray-200 p-4 z-50 animate-fade-in-up">
      <div class="flex items-center justify-between">
        <div v-if="mobileAction.step === 1">
          <p class="font-bold text-gray-800">¿Mover cita?</p>
          <p class="text-xs text-gray-500">{{ mobileAction.horario?.nombre }}</p>
        </div>
        <div v-else>
          <p class="font-bold text-blue-700">¿Fijar aquí?</p>
          <p class="text-xs text-gray-500" v-if="!mobileAction.pendingDate">Toca un cuadro en el calendario</p>
          <p class="text-xs text-blue-500 font-bold" v-else>{{ format(mobileAction.pendingDate, 'HH:mm') }}</p>
        </div>
        
        <div class="flex gap-2 shrink-0">
          <template v-if="mobileAction.step === 1">
            <button @click="mobileAction.step = 2" class="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold">Sí</button>
            <button @click="cancelMobileAction" class="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-bold">No</button>
          </template>
          <template v-else>
            <button @click="confirmMobileAction" :disabled="!mobileAction.pendingDate" class="bg-green-600 text-white px-4 py-2 rounded-lg font-bold disabled:opacity-50">Fijar</button>
            <button @click="cancelMobileAction" class="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-bold">Cancelar</button>
          </template>
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
