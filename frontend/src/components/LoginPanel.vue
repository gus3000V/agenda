<script setup>
import { ref } from 'vue';

const emit = defineEmits(['login']);
const pinInput = ref('');

const login = () => {
  if (pinInput.value.trim() !== '') {
    emit('login', pinInput.value);
  }
};
</script>

<template>
  <div class="h-screen flex items-center justify-center bg-gray-100 relative">
    <div class="bg-white p-8 rounded-lg shadow-md w-96">
      <h2 class="text-2xl font-bold mb-6 text-center text-gray-800">Panel de Administración</h2>
      <form @submit.prevent="login">
        <div class="mb-4">
          <label class="block text-gray-700 text-sm font-bold mb-2">PIN de Acceso</label>
          <input type="password" v-model="pinInput" required
                 class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
        <button type="submit" class="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded hover:bg-blue-700">
          Entrar
        </button>
      </form>
    </div>
  </div>
</template>
