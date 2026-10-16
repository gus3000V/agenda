<script setup>
import { ref, watch, nextTick } from 'vue';
import { format } from 'date-fns';
import { updateHorarioInicio, deleteHorario, convertToSeries, changeOccurrence } from '../services/apiService';
const props = defineProps({ appointment: Object, initialAction: String, proposedDate: Date });
const emit = defineEmits(['close', 'saved']);
const dialog = ref(null);
const action = ref('move');
const scope = ref('one');
const date = ref('');
const time = ref('');
const end = ref('');
const confirmExceptions = ref(false);
const busy = ref(false);
const error = ref('');
watch(() => props.appointment, async h => {
  if (!h) { dialog.value?.close(); return; }
  action.value = props.initialAction || 'move'; scope.value = 'one'; error.value = ''; confirmExceptions.value = false;
  date.value = format(props.proposedDate || h.inicio, 'yyyy-MM-dd');
  time.value = format(props.proposedDate || h.inicio, 'HH:mm');
  end.value = h.fecha_fin || '';
  await nextTick(); dialog.value.showModal();
}, { immediate: true });
const close = () => { if (!busy.value) emit('close'); };
async function save() {
  if (busy.value) return;
  busy.value = true; error.value = '';
  const h = props.appointment;
  try {
    const inicio = `${date.value}T${time.value}:00`;
    if (h.recurrente) {
      await changeOccurrence(h.id_serie, h.fecha_original, {
        action: action.value, scope: scope.value, inicio, fecha_fin: end.value || null,
        confirm_exceptions: confirmExceptions.value
      });
    } else if (action.value === 'convert') await convertToSeries(h.id_horario, end.value);
    else if (action.value === 'cancel') await deleteHorario(h.id_horario);
    else await updateHorarioInicio(h.id_horario, inicio);
    emit('saved'); emit('close');
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
</script>

<template>
  <dialog ref="dialog" @cancel.prevent="close" aria-label="Editar cita" class="m-auto w-[calc(100%-2rem)] max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl p-5 shadow-xl backdrop:bg-gray-900/50">
    <form v-if="appointment" @submit.prevent="save" class="space-y-4">
      <div class="flex justify-between items-start gap-3">
        <div><h2 class="font-bold text-xl">Editar cita</h2><p>{{ appointment.nombre }}</p></div>
        <button type="button" :disabled="busy" @click="close" aria-label="Cerrar editor" class="p-2">✕</button>
      </div>
      <p class="text-sm text-gray-600">{{ format(appointment.inicio, 'dd/MM/yyyy HH:mm') }} · {{ appointment.recurrente ? 'Repetición semanal' : appointment.especialidad }}</p>
      <label class="block text-sm font-medium">Acción
        <select v-model="action" :disabled="busy" class="mt-1 w-full rounded-lg border p-3 bg-white">
          <option value="move">Cambiar horario</option>
          <option value="cancel">Cancelar cita</option>
          <option v-if="!appointment.recurrente && appointment.especialidad === 'fonoaudiologia' && appointment.estado === 'aceptado'" value="convert">Repetir semanalmente desde esta cita</option>
        </select>
      </label>
      <label v-if="appointment.recurrente" class="block text-sm font-medium">Aplicar a
        <select v-model="scope" :disabled="busy" class="mt-1 w-full rounded-lg border p-3 bg-white">
          <option value="one">Solo esta cita</option>
          <option value="following">Esta y las siguientes</option>
        </select>
      </label>
      <div v-if="action === 'move'" class="grid grid-cols-2 gap-3">
        <label class="text-sm">Fecha<input v-model="date" :disabled="busy" required type="date" class="mt-1 w-full min-w-0 border rounded-lg p-2" /></label>
        <label class="text-sm">Hora<input v-model="time" :disabled="busy" required type="time" class="mt-1 w-full min-w-0 border rounded-lg p-2" /></label>
      </div>
      <label v-if="action === 'convert' || (appointment.recurrente && scope === 'following' && action === 'move')" class="block text-sm">Última fecha de la repetición (opcional)
        <input v-model="end" :disabled="busy" type="date" :min="action === 'convert' ? format(appointment.inicio, 'yyyy-MM-dd') : date" class="mt-1 w-full rounded-lg border p-3" />
      </label>
      <p v-if="action === 'convert'" class="text-sm bg-blue-50 p-3 rounded-lg">Esta cita será el inicio de una serie. Las otras citas existentes no se convertirán automáticamente. Si alguna coincide, se mostrará un conflicto.</p>
      <p v-if="action === 'cancel'" class="text-sm bg-red-50 p-3 rounded-lg">{{ appointment.recurrente && scope === 'following' ? 'Se finalizará la serie antes de esta cita. Las citas anteriores conservarán su horario.' : 'Se cancelará únicamente esta cita y se liberará su horario.' }}</p>
      <label v-if="appointment.recurrente && scope === 'following'" class="flex items-start gap-2 text-sm">
        <input v-model="confirmExceptions" :disabled="busy" type="checkbox" class="mt-1" />
        Reemplazar también los cambios y cancelaciones puntuales de este tramo, si existen.
      </label>
      <p v-if="error" role="alert" class="text-sm text-red-800 bg-red-50 p-3 rounded-lg">{{ error }}</p>
      <div class="flex gap-2">
        <button type="submit" :disabled="busy" class="flex-1 bg-blue-600 text-white rounded-lg p-3">{{ busy ? 'Guardando…' : action === 'cancel' ? 'Confirmar cancelación' : 'Guardar cambios' }}</button>
        <button type="button" :disabled="busy" @click="close" class="rounded-lg border p-3">Volver</button>
      </div>
    </form>
  </dialog>
</template>
