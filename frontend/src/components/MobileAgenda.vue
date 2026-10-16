<script setup>
import { ref, computed, watch } from 'vue';
import { format } from 'date-fns';
import { createHorario, updateHorarioInicio, updateHorarioEstado, deleteHorario } from '../services/apiService';
const props = defineProps({ horarios: Array, placementMode: Boolean, placementPatient: Object, placementEspecialidad: String });
const emit = defineEmits(['refresh-data', 'cancel-placement']);
const day = ref(format(new Date(), 'yyyy-MM-dd'));
const time = ref('09:00');
const moving = ref(null);
const deleting = ref(null);
const busy = ref(false);
const error = ref('');
const daily = computed(() => props.horarios.filter(h => format(h.inicio, 'yyyy-MM-dd') === day.value && h.estado !== 'rechazado').sort((a, b) => a.inicio - b.inicio));
watch(() => props.placementMode, () => { moving.value = null; deleting.value = null; error.value = ''; });
async function run(action) {
  if (busy.value) return;
  busy.value = true; error.value = '';
  try { await action(); emit('refresh-data'); moving.value = null; deleting.value = null; return true; }
  catch (e) { error.value = e.message; return false; }
  finally { busy.value = false; }
}
async function save() {
  const start = `${day.value}T${time.value}:00`;
  const ok = await run(() => props.placementMode
    ? createHorario(props.placementPatient.id_paciente, start, props.placementEspecialidad)
    : updateHorarioInicio(moving.value.id_horario, start));
  if (ok && props.placementMode) emit('cancel-placement');
}
function cancel() { moving.value = null; error.value = ''; emit('cancel-placement'); }
</script>

<template>
  <section class="lg:hidden flex-1 min-h-0 overflow-y-auto p-4 pb-28 space-y-4" aria-label="Agenda diaria">
    <label class="block font-semibold text-gray-700">Día de la agenda
      <input type="date" v-model="day" required class="mt-2 w-full rounded-xl border border-gray-300 p-3 bg-white" />
    </label>
    <p role="status" class="text-sm text-gray-500">{{ daily.length }} citas para este día</p>
    <p v-if="error" role="alert" class="rounded-xl bg-red-50 text-red-800 p-3">{{ error }}</p>
    <form v-if="placementMode || moving" @submit.prevent="save" class="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
      <h2 class="font-bold">{{ placementMode ? 'Nueva cita' : 'Mover cita' }}</h2>
      <p>{{ placementMode ? placementPatient?.nombre : moving.nombre }}</p>
      <p class="text-sm">Selecciona el día arriba y la hora aquí.</p>
      <label class="block">Hora <input v-model="time" type="time" required class="w-full mt-1 p-3 border rounded-lg bg-white" /></label>
      <div class="flex gap-2">
        <button :disabled="busy || !day" class="flex-1 rounded-lg bg-blue-600 text-white p-3">{{ busy ? 'Guardando…' : 'Guardar cita' }}</button>
        <button type="button" :disabled="busy" @click="cancel" class="rounded-lg border p-3">Cancelar</button>
      </div>
    </form>
    <p v-if="!daily.length" class="rounded-xl border border-dashed p-6 text-center text-gray-500">No hay citas. Usa el botón + para agendar.</p>
    <article v-for="h in daily" :key="h.id_horario" class="rounded-xl border bg-white p-4 shadow-sm space-y-3">
      <div class="flex justify-between gap-2">
        <p class="font-bold text-blue-800">{{ format(h.inicio, 'HH:mm') }} – {{ format(h.final, 'HH:mm') }}</p>
        <span class="text-xs rounded-full px-2 py-1" :class="h.estado === 'pendiente' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'">{{ h.estado === 'pendiente' ? 'Pendiente' : 'Aceptada' }}</span>
      </div>
      <h2 class="font-semibold break-words">{{ h.nombre }}</h2>
      <p class="text-sm text-gray-600">{{ h.especialidad }}<span v-if="h.nombre_tutor"> · Tutor: {{ h.nombre_tutor }}</span></p>
      <a v-if="h.telefono" :href="`tel:${h.telefono.replace(/[^+\d]/g, '')}`" class="inline-block text-blue-700 underline py-2">{{ h.telefono }}</a>
      <div v-if="h.estado === 'pendiente'" class="flex gap-2">
        <button :disabled="busy" @click="run(() => updateHorarioEstado(h.id_horario, 'aceptado'))" class="flex-1 p-3 rounded-lg bg-emerald-100 text-emerald-900">Aceptar</button>
        <button :disabled="busy" @click="run(() => updateHorarioEstado(h.id_horario, 'rechazado'))" class="flex-1 p-3 rounded-lg bg-red-50 text-red-800">Rechazar</button>
      </div>
      <div v-if="deleting === h.id_horario" class="rounded-lg bg-red-50 p-3">
        <p>¿Eliminar esta cita?</p>
        <button :disabled="busy" @click="run(() => deleteHorario(h.id_horario))" class="p-3 text-red-800 font-bold">Sí, eliminar</button>
        <button :disabled="busy" @click="deleting = null" class="p-3">Cancelar</button>
      </div>
      <div v-else class="flex gap-2">
        <button :disabled="busy || placementMode" @click="moving = h; time = format(h.inicio, 'HH:mm'); $el.scrollTop = 0" class="flex-1 rounded-lg border p-3">Mover</button>
        <button :disabled="busy" @click="deleting = h.id_horario" class="flex-1 rounded-lg border p-3 text-red-700">Eliminar</button>
      </div>
    </article>
  </section>
</template>
