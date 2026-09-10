<script setup>
import { computed } from 'vue';
import { differenceInDays, parseISO, format, getHours, getMinutes, startOfDay } from 'date-fns';
import { getPatientColor, pxPerHour, pxPerMinute, blockDuration } from '../utils/constants';

const props = defineProps({
  horario: Object,
  startDate: Date,
  showDeleteId: Number
});

const emit = defineEmits(['mousedown', 'cambiar-estado', 'delete-click', 'confirm-delete', 'click']);

const blockStyle = computed(() => {
  const hour = getHours(props.horario.inicio);
  const minute = getMinutes(props.horario.inicio);
  const top = (hour * pxPerHour) + (minute * pxPerMinute);
  const height = blockDuration * pxPerMinute;

  const diffDays = differenceInDays(startOfDay(props.horario.inicio), startOfDay(props.startDate));
  const column = diffDays >= 0 && diffDays < 7 ? diffDays : -1;

  if (column === -1 && !props.horario.isDragging) return { display: 'none' };

  if (props.horario.estado === 'pendiente') {
    return {
      top: `${top}px`, height: `${height}px`, left: '4px', right: '4px', position: 'absolute',
      backgroundColor: '#fffbeb', borderColor: '#f59e0b', color: '#92400e', borderLeftWidth: '4px'
    };
  } else if (props.horario.estado === 'aceptado') {
    return {
      top: `${top}px`, height: `${height}px`, left: '4px', right: '4px', position: 'absolute',
      backgroundColor: '#ecfdf5', borderColor: '#10b981', color: '#065f46', borderLeftWidth: '4px'
    };
  }

  const colors = getPatientColor(props.horario.id_paciente);
  return {
    top: `${top}px`, height: `${height}px`, left: '4px', right: '4px', position: 'absolute',
    backgroundColor: colors.bg, borderColor: colors.border, color: colors.text, borderLeftWidth: '4px'
  };
});

const edad = computed(() => {
  if (!props.horario.f_nacimiento) return '';
  return Math.floor(differenceInDays(new Date(), parseISO(props.horario.f_nacimiento))/365.25);
});
</script>

<template>
  <div class="rounded text-xs cursor-move shadow-sm transition-opacity select-none group relative flex flex-col justify-between"
       :class="{'opacity-50': horario.isDragging}"
       :style="blockStyle"
       @mousedown="emit('mousedown', $event, horario)"
       @click="emit('click', $event)">
       
    <div class="absolute inset-0 p-1 overflow-hidden pointer-events-none rounded flex flex-col justify-between">
      <div>
        <div class="font-bold pr-4">{{ horario.nombre }}</div>
        <div class="opacity-90">{{ format(horario.inicio, 'HH:mm') }} - {{ format(horario.final, 'HH:mm') }}</div>
        <div class="opacity-80 truncate mt-1">
          {{ horario.nombre_tutor ? `Tutor: ${horario.nombre_tutor}` : (horario.f_nacimiento ? `Edad: ${edad} años` : '') }}
        </div>
      </div>
      
      <div v-if="horario.estado === 'pendiente'" class="flex gap-1 pointer-events-auto mt-1 z-10">
        <button @mousedown.stop @click.stop="emit('cambiar-estado', horario, 'aceptado')" class="flex-1 bg-green-500 hover:bg-green-600 text-white text-[10px] py-0.5 rounded shadow">✓</button>
        <button @mousedown.stop @click.stop="emit('cambiar-estado', horario, 'rechazado')" class="flex-1 bg-red-500 hover:bg-red-600 text-white text-[10px] py-0.5 rounded shadow">×</button>
      </div>
    </div>
    
    <button @mousedown.stop @click.stop="emit('delete-click', horario.id_horario)" 
            class="absolute top-1 right-1 text-gray-500 opacity-60 hover:text-red-600 hover:opacity-100 font-bold px-1 z-10 transition-colors">
      ×
    </button>
    
    <!-- Overlay flotante para eliminar -->
    <div v-if="showDeleteId === horario.id_horario"
         class="absolute inset-0 z-50 bg-white/95 backdrop-blur-sm shadow-xl rounded-md border-2 border-red-300 p-2 flex flex-col items-center justify-center gap-2 animate-fade-in text-center">
      <p class="text-xs font-semibold text-gray-800">¿Eliminar cita?</p>
      <div class="flex gap-2">
        <button @mousedown.stop="emit('confirm-delete', horario.id_horario)"
                @touchstart.stop.prevent="emit('confirm-delete', horario.id_horario)"
                class="bg-red-500 text-white px-3 py-1 rounded text-xs font-bold hover:bg-red-600 shadow-sm">
          Sí
        </button>
        <button @mousedown.stop="emit('delete-click', null)"
                @touchstart.stop.prevent="emit('delete-click', null)"
                class="bg-gray-200 text-gray-700 px-3 py-1 rounded text-xs font-bold hover:bg-gray-300 shadow-sm">
          No
        </button>
      </div>
    </div>
  </div>
</template>
