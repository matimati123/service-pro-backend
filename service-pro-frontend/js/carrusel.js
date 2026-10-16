// =============================================
// VOLTIA PRO SPA — carrusel.js
// Carrusel interactivo de Instalaciones y Reparaciones
// =============================================

const STORAGE_KEY = 'voltia_pro_galeria_usuario';

// Proyectos y trabajos predeterminados de alta calidad
const ITEMS_DEFAULT = [
  {
    id: 'def-1',
    titulo: 'Instalación de Tablero Certificado TE1',
    categoria: 'instalacion',
    categoriaNombre: 'Instalación',
    imagen: 'images/galeria-tablero.jpg',
    descripcion: 'Montaje y rotulado de tablero eléctrico general con protectores diferenciales Schneider y disyuntores normados SEC.',
    autor: 'Técnico Certificado',
    fecha: '14 Oct 2026'
  },
  {
    id: 'def-2',
    titulo: 'Sistema de Videovigilancia IP 4K',
    categoria: 'camaras',
    categoriaNombre: 'Cámaras',
    imagen: 'images/galeria-camaras.jpg',
    descripcion: 'Instalación de cámaras de seguridad domo exteriores antivandálicas con canalización metálica y monitoreo remoto.',
    autor: 'Equipo Voltia Pro',
    fecha: '10 Oct 2026'
  },
  {
    id: 'def-3',
    titulo: 'Iluminación Arquitectónica LED en Cielos',
    categoria: 'iluminacion',
    categoriaNombre: 'Iluminación',
    imagen: 'images/galeria-luces.jpg',
    descripcion: 'Diseño e instalación de perfiles de aluminio con tiras LED cálidas empotradas y regulación dimmeable para vivienda.',
    autor: 'Cliente Residencial',
    fecha: '05 Oct 2026'
  },
  {
    id: 'def-4',
    titulo: 'Reparación de Circuitos y Enchufes Inteligentes',
    categoria: 'reparacion',
    categoriaNombre: 'Reparación',
    imagen: 'images/galeria-enchufes.jpg',
    descripcion: 'Detección de sobrecalentamiento, reemplazo de cableado deteriorado y colocación de placas de enchufes con puertos USB.',
    autor: 'Técnico Autorizado',
    fecha: '01 Oct 2026'
  }
];

let currentIndex = 0;
let carruselItems = [];
let itemsFiltrados = [];
let filtroActual = 'todos';
let autoplayTimer = null;
let imagenBase64Temporal = '';

// Helper para escapar HTML y prevenir XSS
function escapeHtml(texto) {
  if (!texto) return '';
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Cargar items desde localStorage + predeterminados
function cargarItems() {
  const guardados = localStorage.getItem(STORAGE_KEY);
  let itemsUsuario = [];
  if (guardados) {
    try {
      itemsUsuario = JSON.parse(guardados);
    } catch (e) {
      itemsUsuario = [];
    }
  }
  carruselItems = [...itemsUsuario, ...ITEMS_DEFAULT];
  aplicarFiltro(filtroActual);
}

// Guardar nuevo item del usuario
function guardarItemUsuario(nuevoItem) {
  const guardados = localStorage.getItem(STORAGE_KEY);
  let itemsUsuario = [];
  if (guardados) {
    try { itemsUsuario = JSON.parse(guardados); } catch (e) { itemsUsuario = []; }
  }
  itemsUsuario.unshift(nuevoItem);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(itemsUsuario));
  } catch (err) {
    console.warn('Almacenamiento local lleno, usando memoria temporal.');
  }
  cargarItems();
}

// Filtrar items
function aplicarFiltro(categoria) {
  filtroActual = categoria;
  if (categoria === 'todos') {
    itemsFiltrados = [...carruselItems];
  } else {
    itemsFiltrados = carruselItems.filter(item => item.categoria === categoria);
  }
  currentIndex = 0;
  renderizarCarrusel();
}

// Renderizar tarjetas en el track
function renderizarCarrusel() {
  const track = document.getElementById('carrusel-track');
  const dotsContainer = document.getElementById('carrusel-dots');
  if (!track || !dotsContainer) return;

  track.innerHTML = '';
  dotsContainer.innerHTML = '';

  if (!itemsFiltrados.length) {
    track.innerHTML = `
      <div style="width:100%; text-align:center; padding: 40px 20px; color: var(--gris-texto);">
        <p style="font-size: 1.1rem; margin-bottom: 8px;">No hay imágenes en esta categoría aún.</p>
        <button class="btn-subir-foto" onclick="abrirModalSubirFoto()" style="font-size:0.85rem; padding:8px 18px;">
          ¡Sé el primero en compartir una foto!
        </button>
      </div>
    `;
    actualizarBotonesNav();
    return;
  }

  itemsFiltrados.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'carrusel-card';
    card.innerHTML = `
      <div class="carrusel-card-img-wrap" onclick="abrirLightbox(${index})">
        <img src="${item.imagen}" alt="${escapeHtml(item.titulo)}" class="carrusel-card-img" loading="lazy">
        <span class="carrusel-badge ${item.categoria}">${escapeHtml(item.categoriaNombre || item.categoria)}</span>
        <div class="carrusel-overlay-btn" title="Ver imagen ampliada">🔍</div>
      </div>
      <div class="carrusel-card-body">
        <h3>${escapeHtml(item.titulo)}</h3>
        <p>${escapeHtml(item.descripcion)}</p>
        <div class="carrusel-card-footer">
          <span class="carrusel-card-autor">👤 ${escapeHtml(item.autor || 'Cliente')}</span>
          <span class="carrusel-card-fecha">${escapeHtml(item.fecha || 'Reciente')}</span>
        </div>
      </div>
    `;
    track.appendChild(card);
  });

  // Generar dots
  const slidesVisibles = obtenerSlidesVisibles();
  const maxIndex = Math.max(0, itemsFiltrados.length - slidesVisibles);

  for (let i = 0; i <= maxIndex; i++) {
    const dot = document.createElement('button');
    dot.className = `carrusel-dot ${i === currentIndex ? 'active' : ''}`;
    dot.setAttribute('aria-label', `Ir a diapositiva ${i + 1}`);
    dot.addEventListener('click', () => {
      currentIndex = i;
      actualizarPosicionCarrusel();
    });
    dotsContainer.appendChild(dot);
  }

  actualizarPosicionCarrusel();
}

function obtenerSlidesVisibles() {
  const ancho = window.innerWidth;
  if (ancho <= 650) return 1;
  if (ancho <= 992) return 2;
  return 3;
}

function actualizarPosicionCarrusel() {
  const track = document.getElementById('carrusel-track');
  const cards = track ? track.querySelectorAll('.carrusel-card') : [];
  if (!track || !cards.length) return;

  const slidesVisibles = obtenerSlidesVisibles();
  const maxIndex = Math.max(0, itemsFiltrados.length - slidesVisibles);

  if (currentIndex > maxIndex) currentIndex = maxIndex;
  if (currentIndex < 0) currentIndex = 0;

  const cardWidth = cards[0].offsetWidth;
  const gap = 22; // Mismo gap que en el CSS
  const desplazamiento = currentIndex * (cardWidth + gap);

  track.style.transform = `translateX(-${desplazamiento}px)`;

  // Actualizar dots
  const dots = document.querySelectorAll('.carrusel-dot');
  dots.forEach((dot, idx) => {
    dot.classList.toggle('active', idx === currentIndex);
  });

  actualizarBotonesNav();
}

function actualizarBotonesNav() {
  const btnPrev = document.getElementById('carrusel-prev');
  const btnNext = document.getElementById('carrusel-next');
  if (!btnPrev || !btnNext) return;

  const slidesVisibles = obtenerSlidesVisibles();
  const maxIndex = Math.max(0, itemsFiltrados.length - slidesVisibles);

  btnPrev.disabled = currentIndex === 0;
  btnNext.disabled = currentIndex >= maxIndex;
}

function moverCarrusel(direccion) {
  const slidesVisibles = obtenerSlidesVisibles();
  const maxIndex = Math.max(0, itemsFiltrados.length - slidesVisibles);

  if (direccion === 1) {
    if (currentIndex < maxIndex) {
      currentIndex++;
    } else {
      currentIndex = 0; // Vuelve al inicio para loop suave
    }
  } else {
    if (currentIndex > 0) {
      currentIndex--;
    } else {
      currentIndex = maxIndex;
    }
  }
  actualizarPosicionCarrusel();
}

// Autoplay
function iniciarAutoplay() {
  detenerAutoplay();
  autoplayTimer = setInterval(() => {
    moverCarrusel(1);
  }, 4800);
}

function detenerAutoplay() {
  if (autoplayTimer) {
    clearInterval(autoplayTimer);
    autoplayTimer = null;
  }
}

// Lightbox
function abrirLightbox(index) {
  const item = itemsFiltrados[index];
  if (!item) return;

  const modal = document.getElementById('lightbox-modal');
  document.getElementById('lightbox-img').src = item.imagen;
  document.getElementById('lightbox-titulo').textContent = item.titulo;
  document.getElementById('lightbox-desc').textContent = item.descripcion;
  document.getElementById('lightbox-categoria').textContent = item.categoriaNombre || item.categoria;
  document.getElementById('lightbox-autor').textContent = `Por ${item.autor || 'Cliente'}`;
  document.getElementById('lightbox-fecha').textContent = item.fecha || 'Reciente';

  modal.style.display = 'flex';
  detenerAutoplay();
}

function cerrarLightbox() {
  const modal = document.getElementById('lightbox-modal');
  if (modal) modal.style.display = 'none';
  iniciarAutoplay();
}

// Modal para subir foto
function abrirModalSubirFoto() {
  const modal = document.getElementById('modal-subir-foto');
  if (!modal) return;

  // Si hay usuario logueado en sessionStorage, autocompletar su nombre
  try {
    const usuario = JSON.parse(sessionStorage.getItem('usuario') || '{}');
    const inputAutor = document.getElementById('foto-autor');
    if (usuario && usuario.nombre && inputAutor && !inputAutor.value) {
      inputAutor.value = usuario.nombre;
    }
  } catch (e) {}

  modal.style.display = 'flex';
  detenerAutoplay();
}

function cerrarModalSubirFoto() {
  const modal = document.getElementById('modal-subir-foto');
  if (modal) modal.style.display = 'none';
  limpiarFormularioSubir();
  iniciarAutoplay();
}

function limpiarFormularioSubir() {
  document.getElementById('form-subir-foto')?.reset();
  const preview = document.getElementById('dropzone-preview');
  const dropPrompt = document.getElementById('dropzone-prompt');
  if (preview) {
    preview.style.display = 'none';
    preview.src = '';
  }
  if (dropPrompt) dropPrompt.style.display = 'block';
  imagenBase64Temporal = '';
}

// Manejo de carga de archivos (Drag & Drop + Input File)
function procesarArchivoImagen(archivo) {
  if (!archivo || !archivo.type.startsWith('image/')) {
    alert('Por favor selecciona un archivo de imagen válido (JPG, PNG, WebP).');
    return;
  }

  // Límite de tamaño sugerido 6MB
  if (archivo.size > 6 * 1024 * 1024) {
    alert('La imagen seleccionada es muy grande. Intenta con una imagen de hasta 6MB.');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    imagenBase64Temporal = e.target.result;
    const preview = document.getElementById('dropzone-preview');
    const dropPrompt = document.getElementById('dropzone-prompt');
    if (preview && dropPrompt) {
      preview.src = imagenBase64Temporal;
      preview.style.display = 'block';
      dropPrompt.style.display = 'none';
    }
  };
  reader.readAsDataURL(archivo);
}

// Envío del formulario de nueva foto
function manejarSubmitFoto(e) {
  e.preventDefault();

  if (!imagenBase64Temporal) {
    alert('Por favor selecciona o arrastra una imagen de la instalación o reparación.');
    return;
  }

  const titulo = document.getElementById('foto-titulo').value.trim();
  const categoriaSelect = document.getElementById('foto-categoria');
  const categoria = categoriaSelect.value;
  const categoriaNombre = categoriaSelect.options[categoriaSelect.selectedIndex].text;
  const descripcion = document.getElementById('foto-descripcion').value.trim();
  const autor = document.getElementById('foto-autor').value.trim() || 'Cliente';

  if (!titulo) {
    alert('Por favor ingresa un título para la instalación o reparación.');
    return;
  }

  const nuevoItem = {
    id: 'user-' + Date.now(),
    titulo,
    categoria,
    categoriaNombre,
    imagen: imagenBase64Temporal,
    descripcion: descripcion || 'Nueva instalación realizada con éxito.',
    autor,
    fecha: new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
  };

  guardarItemUsuario(nuevoItem);
  cerrarModalSubirFoto();

  // Moverse al primer elemento para ver el nuevo trabajo recién subido
  currentIndex = 0;
  actualizarPosicionCarrusel();

  // Scroll suave hacia el carrusel
  const seccion = document.getElementById('galeria-trabajos');
  if (seccion) {
    seccion.scrollIntoView({ behavior: 'smooth' });
  }
}

// Configurar listeners e inicializar
document.addEventListener('DOMContentLoaded', () => {
  const btnPrev = document.getElementById('carrusel-prev');
  const btnNext = document.getElementById('carrusel-next');
  const wrapper = document.querySelector('.carrusel-wrapper');

  if (btnPrev) btnPrev.addEventListener('click', () => moverCarrusel(-1));
  if (btnNext) btnNext.addEventListener('click', () => moverCarrusel(1));

  // Pausa autoplay en hover
  if (wrapper) {
    wrapper.addEventListener('mouseenter', detenerAutoplay);
    wrapper.addEventListener('mouseleave', iniciarAutoplay);

    // Soporte para gestos táctiles (Swipe en móviles)
    let touchStartX = 0;
    let touchEndX = 0;

    wrapper.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      detenerAutoplay();
    }, { passive: true });

    wrapper.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      const diferencia = touchStartX - touchEndX;
      if (Math.abs(diferencia) > 40) {
        if (diferencia > 0) moverCarrusel(1);
        else moverCarrusel(-1);
      }
      iniciarAutoplay();
    }, { passive: true });
  }

  // Filtros
  const filtrosBtns = document.querySelectorAll('.filtro-carrusel-btn');
  filtrosBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filtrosBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cat = btn.getAttribute('data-categoria') || 'todos';
      aplicarFiltro(cat);
    });
  });

  // Dropzone drag & drop
  const dropzone = document.getElementById('dropzone-upload');
  const fileInput = document.getElementById('foto-input-file');

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        procesarArchivoImagen(e.target.files[0]);
      }
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        procesarArchivoImagen(e.dataTransfer.files[0]);
      }
    });
  }

  // Formulario submit
  const formSubir = document.getElementById('form-subir-foto');
  if (formSubir) formSubir.addEventListener('submit', manejarSubmitFoto);

  // Cerrar modals con tecla ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cerrarModalSubirFoto();
      cerrarLightbox();
    }
  });

  // Ajustar en redimensión de pantalla
  window.addEventListener('resize', () => {
    actualizarPosicionCarrusel();
  });

  // Carga inicial
  cargarItems();
  iniciarAutoplay();
});
