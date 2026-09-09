import { ref } from 'vue';
import { set } from 'date-fns';
import { pxPerHour, pxPerMinute, blockDuration } from '../utils/constants';

export function useDragAndDrop(days, scrollContainerRef) {
  const draggingHorario = ref(null);
  const dragGhost = ref({ visible: false, top: 0, dayIndex: 0 });
  const hoverLineTop = ref(-1);
  let dragOffset = { y: 0 };

  let lastClientX = 0;
  let lastClientY = 0;
  let autoScrollRAF = null;
  let onGlobalMouseMoveHandler = null;

  const startAutoScroll = () => {
    if (autoScrollRAF) return;
    
    const scroll = () => {
      if (!scrollContainerRef.value || (!draggingHorario.value && !dragGhost.value.visible)) {
        autoScrollRAF = null;
        return;
      }
      
      const rect = scrollContainerRef.value.getBoundingClientRect();
      const threshold = 60;
      let speed = 0;
      
      if (lastClientY < rect.top + threshold) {
        speed = -15; // scroll up
      } else if (lastClientY > rect.bottom - threshold) {
        speed = 15; // scroll down
      }
      
      if (speed !== 0) {
        scrollContainerRef.value.scrollTop += speed;
        recalculatePositions(lastClientX, lastClientY);
        autoScrollRAF = requestAnimationFrame(scroll);
      } else {
        autoScrollRAF = null;
      }
    };
    
    autoScrollRAF = requestAnimationFrame(scroll);
  };

  const stopAutoScroll = () => {
    if (autoScrollRAF) {
      cancelAnimationFrame(autoScrollRAF);
      autoScrollRAF = null;
    }
  };

  const recalculatePositions = (clientX, clientY) => {
    const dayColumns = document.querySelectorAll('.day-column');
    let targetDayIndex = -1;
    let relativeY = 0;

    for (let i = 0; i < dayColumns.length; i++) {
      const rect = dayColumns[i].getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right) {
        targetDayIndex = i;
        relativeY = clientY - rect.top;
        break;
      }
    }

    if (targetDayIndex !== -1) {
      const snapPixels = 5 * pxPerMinute; 
      let yWithoutOffset = relativeY;
      
      if (draggingHorario.value) {
        yWithoutOffset -= dragOffset.y;
      }
      
      const snappedY = Math.max(0, Math.round(yWithoutOffset / snapPixels) * snapPixels);

      dragGhost.value = {
        visible: true,
        top: snappedY,
        dayIndex: targetDayIndex
      };
      hoverLineTop.value = dragGhost.value.top;
    }
  };

  const onGlobalMouseMove = (event) => {
    lastClientX = event.clientX;
    lastClientY = event.clientY;
    
    recalculatePositions(lastClientX, lastClientY);
    startAutoScroll();
  };

  const bindGlobalEvents = () => {
    onGlobalMouseMoveHandler = onGlobalMouseMove;
    document.addEventListener('mousemove', onGlobalMouseMoveHandler);
  };

  const unbindGlobalEvents = () => {
    if (onGlobalMouseMoveHandler) {
      document.removeEventListener('mousemove', onGlobalMouseMoveHandler);
      onGlobalMouseMoveHandler = null;
    }
    stopAutoScroll();
  };

  const onMouseDown = (event, horario) => {
    draggingHorario.value = horario;
    dragOffset.y = event.offsetY; 
    horario.isDragging = true;
  };

  const getNewDateFromGhost = () => {
    const newTop = dragGhost.value.top;
    const totalMinutes = newTop / pxPerMinute;
    const newHours = Math.floor(totalMinutes / 60);
    const newMinutes = totalMinutes % 60;

    return set(days.value[dragGhost.value.dayIndex], {
      hours: newHours,
      minutes: newMinutes,
      seconds: 0,
      milliseconds: 0
    });
  };

  const cleanUpDrag = () => {
    if (draggingHorario.value) {
      draggingHorario.value.isDragging = false;
    }
    draggingHorario.value = null;
    dragGhost.value.visible = false;
    hoverLineTop.value = -1;
  };

  const onDayMouseMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - rect.top;
    
    const snapPixels = 5 * pxPerMinute;
    const snappedY = Math.max(0, Math.round(y / snapPixels) * snapPixels);
    
    hoverLineTop.value = snappedY;
  };

  const onDayMouseLeave = () => {
    if (!draggingHorario.value && !dragGhost.value.visible) {
      hoverLineTop.value = -1;
    }
  };

  return {
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
  };
}
