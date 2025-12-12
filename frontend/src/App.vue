<script setup lang="ts">
import { RouterView } from "vue-router"
</script>

<template>
  <div class="ios-statusbar-shim" aria-hidden="true"></div>
  <router-view />
</template>

<style>
.ios-statusbar-shim {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;

  /* iOS Safe Area Höhe */
  height: env(safe-area-inset-top);

  /* Farbe kommt aus CSS Variable */
  background: var(--statusbar-bg, #287ffd);

  z-index: 9999;
  pointer-events: none;
}
</style>