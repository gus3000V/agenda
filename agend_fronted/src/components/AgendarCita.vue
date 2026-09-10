<template>
  <div class="h-screen w-full bg-gray-50 flex flex-col font-sans overflow-hidden">
    
    <!-- Encabezado -->
    <header class="bg-blue-600 text-white px-4 md:px-6 py-4 shadow-md shrink-0 flex flex-col sm:flex-row sm:justify-between sm:items-center z-10">
      <div class="text-center sm:text-left">
        <h1 class="text-xl sm:text-2xl font-extrabold tracking-tight">Clínica Médica</h1>
        <p class="text-xs sm:text-sm text-blue-100 mt-1">Agenda tu cita seleccionando un horario libre</p>
      </div>
    </header>

    <!-- Cuadrícula Principal (Lunes a Sábado) -->
    <main class="flex-1 overflow-y-auto md:overflow-hidden p-2 sm:p-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 md:h-full">
        <!-- Columnas por Día -->
        <div v-for="dia in diasSemana" :key="dia.fechaStr" class="bg-white flex flex-col rounded-lg shadow-sm border border-gray-200 overflow-hidden h-auto md:h-full">
          
          <!-- Encabezado del Día -->
          <div class="bg-gray-100 text-center py-2 sm:py-3 shrink-0 border-b border-gray-200">
            <div class="font-bold text-gray-800 capitalize text-sm sm:text-base">{{ dia.nombreDia }}</div>
            <div class="text-xs sm:text-sm text-gray-500 font-medium">{{ dia.fechaCorta }}</div>
          </div>

          <!-- Bloques Libres -->
          <div class="md:flex-1 md:overflow-y-auto p-3 grid grid-cols-3 gap-2 md:flex md:flex-col md:space-y-2 md:grid-cols-none relative">
            <div v-if="dia.cargando && dia.disponibles.length === 0" class="col-span-3 md:col-span-1 flex justify-center items-center min-h-[50px] md:h-full text-gray-400">
              <span class="animate-pulse text-sm">Cargando...</span>
            </div>
            
            <template v-else>
              <button 
                v-for="slot in dia.disponibles" 
                :key="slot.hora"
                @click="slot.estado === 'libre' ? abrirFormulario(dia, slot.hora) : null"
                :disabled="slot.estado === 'pendiente'"
                :class="[
                  'w-full py-2 rounded-md text-sm font-semibold transition-all shadow-sm flex flex-col items-center justify-center',
                  slot.estado === 'libre' 
                    ? 'bg-emerald-50 hover:bg-emerald-500 hover:text-white text-emerald-700 border border-emerald-200 cursor-pointer' 
                    : 'bg-yellow-50 text-yellow-700 border border-yellow-300 opacity-80 cursor-not-allowed'
                ]"
              >
                <span>{{ slot.hora }}</span>
                <span v-if="slot.estado === 'pendiente'" class="text-[9px] sm:text-[10px] uppercase font-bold mt-0.5 text-center leading-none">En espera</span>
              </button>
              
              <div v-if="dia.disponibles.length === 0" class="col-span-3 md:col-span-1 flex flex-col items-center justify-center min-h-[80px] md:h-full text-gray-400">
                <span class="text-2xl sm:text-3xl mb-1 sm:mb-2">🗓️</span>
                <span class="text-xs sm:text-sm font-medium text-center">Sin citas<br>disponibles</span>
              </div>
            </template>
          </div>
        </div>
      </div>
    </main>

    <!-- Panel Lateral / Modal del Formulario -->
    <div v-if="modalAbierto" class="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex justify-center sm:justify-end z-40 transition-opacity">
      <div class="w-full h-full sm:max-w-md bg-white shadow-2xl flex flex-col animate-slide-in">
        
        <!-- Header del Formulario -->
        <div class="px-4 sm:px-6 py-4 bg-white border-b border-gray-200 flex justify-between items-center shrink-0">
          <h2 class="text-lg sm:text-xl font-bold text-gray-800">Completar Solicitud</h2>
          <button @click="cerrarFormulario" class="text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full p-2 transition-colors">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        
        <div class="p-4 sm:p-6 flex-1 overflow-y-auto bg-gray-50">
          <!-- Resumen de selección -->
          <div class="mb-4 sm:mb-6 p-3 sm:p-4 bg-blue-50 border border-blue-100 rounded-lg shadow-sm">
            <p class="text-xs sm:text-sm text-blue-800">Estás agendando cita para el:</p>
            <p class="text-base sm:text-lg font-bold text-blue-900 mt-1">
              {{ reservaActiva.dia.nombreDia }}, {{ reservaActiva.dia.fechaCorta }} a las {{ reservaActiva.hora }} hrs.
            </p>
          </div>

          <!-- Formulario -->
          <form @submit.prevent="enviarSolicitud" class="space-y-4 sm:space-y-5">
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1">Nombre Completo del Paciente *</label>
              <input type="text" v-model="form.nombre" required placeholder="Ej: Juan Pérez"
                     class="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm text-base sm:text-sm" />
            </div>
            
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1">Fecha de Nacimiento *</label>
              <input type="text" :value="form.f_nacimiento" @input="onFechaInput" required placeholder="DD/MM/AAAA"
                     class="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm text-base sm:text-sm" />
            </div>
            
            <div v-if="isMinor">
              <label class="block text-sm font-semibold text-gray-700 mb-1">Nombre del Tutor *</label>
              <input type="text" v-model="form.nombre_tutor" placeholder="Requerido para menores" :required="isMinor"
                     class="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm text-base sm:text-sm" />
            </div>
            
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1">Teléfono Móvil *</label>
              <input type="tel" v-model="form.telefono" required placeholder="Ej: 555-1234"
                     class="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm text-base sm:text-sm" />
            </div>
            
            <!-- Error local -->
            <div v-if="errorMsg" class="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm flex items-start">
              <span class="mr-2">⚠️</span> {{ errorMsg }}
            </div>

            <div class="pt-2 sm:pt-4">
              <button type="submit" :disabled="enviando" 
                      class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
                {{ enviando ? 'Procesando Solicitud...' : 'Confirmar Cita' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Toast de Éxito Flotante -->
    <div v-if="successMsg" class="fixed bottom-6 sm:bottom-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 sm:px-6 py-3 sm:py-4 rounded-full shadow-2xl z-50 flex items-center font-medium animate-fade-in-up text-sm sm:text-base w-11/12 sm:w-auto justify-center">
      <span class="bg-green-500 rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center mr-2 sm:mr-3 text-xs sm:text-base">✓</span>
      {{ successMsg }}
    </div>

  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import axios from 'axios';

// URL del servidor (público)
const apiPublicaURL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/public';

// ==========================================
// ESTADO Y REACTIVIDAD
// ==========================================
const diasSemana = ref([]);
const modalAbierto = ref(false);
const enviando = ref(false);
const errorMsg = ref('');
const successMsg = ref('');
let pollingInterval = null;

const reservaActiva = reactive({
  dia: null,
  hora: ''
});

const form = reactive({
  nombre: '',
  f_nacimiento: '',
  nombre_tutor: '',
  telefono: ''
});

const onFechaInput = (e) => {
  let val = e.target.value.replace(/\D/g, ''); // Solo números
  if (val.length > 8) val = val.slice(0, 8);
  if (val.length >= 5) {
    val = `${val.slice(0, 2)}/${val.slice(2, 4)}/${val.slice(4)}`;
  } else if (val.length >= 3) {
    val = `${val.slice(0, 2)}/${val.slice(2)}`;
  }
  form.f_nacimiento = val;
};

const isMinor = computed(() => {
  if (form.f_nacimiento.length !== 10) return false;
  const [dd, mm, yyyy] = form.f_nacimiento.split('/');
  const dateObj = new Date(`${yyyy}-${mm}-${dd}T12:00:00`);
  if (isNaN(dateObj.getTime())) return false;
  
  const hoy = new Date();
  let age = hoy.getFullYear() - dateObj.getFullYear();
  const m = hoy.getMonth() - dateObj.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < dateObj.getDate())) {
    age--;
  }
  return age < 18;
});

// ==========================================
// LÓGICA DE DÍAS Y CALENDARIO
// ==========================================
const inicializarDias = () => {
  const arr = [];
  const hoy = new Date();
  const nombres = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  
  let diasAgregados = 0;
  let diaActual = new Date(hoy);

  while (diasAgregados < 6) {
    if (diaActual.getDay() !== 0) { // Si no es domingo
      const yyyy = diaActual.getFullYear();
      const mm = String(diaActual.getMonth() + 1).padStart(2, '0');
      const dd = String(diaActual.getDate()).padStart(2, '0');
      
      arr.push({
        fechaStr: `${yyyy}-${mm}-${dd}`,
        fechaCorta: `${dd}/${mm}`,
        nombreDia: nombres[diaActual.getDay()],
        disponibles: [],
        cargando: true
      });
      diasAgregados++;
    }
    diaActual.setDate(diaActual.getDate() + 1);
  }
  diasSemana.value = arr;
};

// Traer la data de Axios para toda la semana al mismo tiempo
const cargarDisponibilidadMasiva = async (esPolling = false) => {
  const promesas = diasSemana.value.map(async (dia) => {
    if (!esPolling) dia.cargando = true;
    try {
      const { data } = await axios.get(`${apiPublicaURL}/disponibilidad`, { 
        params: { fecha: dia.fechaStr } 
      });
      dia.disponibles = data.disponibles || [];
    } catch (error) {
      console.error(`Fallo cargando citas de ${dia.fechaStr}:`, error);
    } finally {
      if (!esPolling) dia.cargando = false;
    }
  });

  await Promise.all(promesas);
};

onMounted(() => {
  inicializarDias();
  cargarDisponibilidadMasiva();
  
  // Polling cada 5 segundos para actualización en tiempo real
  pollingInterval = setInterval(() => {
    cargarDisponibilidadMasiva(true);
  }, 5000);
});

onUnmounted(() => {
  if (pollingInterval) clearInterval(pollingInterval);
});

// ==========================================
// MANEJO DEL FORMULARIO Y API POST
// ==========================================
const abrirFormulario = (dia, hora) => {
  reservaActiva.dia = dia;
  reservaActiva.hora = hora;
  errorMsg.value = '';
  modalAbierto.value = true;
};

const cerrarFormulario = () => {
  modalAbierto.value = false;
  Object.assign(form, { nombre: '', f_nacimiento: '', nombre_tutor: '', telefono: '' });
};

const enviarSolicitud = async () => {
  errorMsg.value = '';

  if (form.f_nacimiento.length !== 10) {
    errorMsg.value = 'Por favor ingresa una fecha de nacimiento válida (DD/MM/AAAA).';
    return;
  }

  enviando.value = true;

  try {
    const pad = (n) => String(n).padStart(2, '0');
    
    // Calcular inicio (local string format for DB)
    const inicioStr = `${reservaActiva.dia.fechaStr}T${reservaActiva.hora}:00`;
    const inicioDate = new Date(inicioStr);
    const dbInicio = `${reservaActiva.dia.fechaStr} ${reservaActiva.hora}:00`;
    
    // Calcular final (+45 mins)
    const finalDate = new Date(inicioDate.getTime() + 45 * 60000);
    const dbFinal = `${finalDate.getFullYear()}-${pad(finalDate.getMonth()+1)}-${pad(finalDate.getDate())} ${pad(finalDate.getHours())}:${pad(finalDate.getMinutes())}:00`;

    // Fecha Nacimiento DB
    const [dd, mm, yyyy] = form.f_nacimiento.split('/');
    const dbFecha = `${yyyy}-${mm}-${dd}`;

    const payload = {
      nombre: form.nombre,
      f_nacimiento: dbFecha,
      nombre_tutor: isMinor.value ? form.nombre_tutor : '',
      telefono: form.telefono,
      inicio: dbInicio,
      final: dbFinal
    };

    const res = await axios.post(`${apiPublicaURL}/solicitar`, payload);

    if (res.status === 200 || res.status === 201) {
      cerrarFormulario();
      
      successMsg.value = '¡Solicitud enviada! El consultorio confirmará en breve.';
      setTimeout(() => { successMsg.value = ''; }, 5000);
      
      await cargarDisponibilidadMasiva(true);
    }
  } catch (error) {
    if (error.response?.status === 429) {
      errorMsg.value = 'Se superó el límite de peticiones. Intenta de nuevo más tarde.';
    } else {
      errorMsg.value = 'Hubo un problema. Es posible que el horario ya se haya ocupado.';
    }
  } finally {
    enviando.value = false;
  }
};
</script>

<style scoped>
.animate-slide-in {
  animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
@keyframes slideInRight {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
.animate-fade-in-up {
  animation: fadeInUp 0.4s ease-out forwards;
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translate(-50%, 20px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}
</style>
