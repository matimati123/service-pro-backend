// =============================================
// VOLTIA PRO SPA — menu-movil.js
// Agrega el botón hamburguesa (☰) en celular a las páginas que no lo traen
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('header');
  const nav = header ? header.querySelector('nav') : null;
  if (!header || !nav) return;
  if (header.querySelector('.hamburger')) return; // ya lo tiene (ej. index.html)

  // Botón ☰ (solo se ve en pantallas chicas; el CSS lo oculta en computador)
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'hamburger';
  boton.setAttribute('aria-label', 'Menú');
  boton.setAttribute('aria-expanded', 'false');
  for (let i = 0; i < 3; i++) boton.appendChild(document.createElement('span'));
  header.appendChild(boton);

  function cerrar() {
    nav.classList.remove('open');
    boton.classList.remove('active');
    boton.setAttribute('aria-expanded', 'false');
  }

  // Abrir / cerrar con el botón
  boton.addEventListener('click', () => {
    const abierto = nav.classList.toggle('open');
    boton.classList.toggle('active', abierto);
    boton.setAttribute('aria-expanded', String(abierto));
  });

  nav.addEventListener('click', (e) => {
    // Cerrar al tocar un enlace del menú
    if (e.target.closest('a')) { cerrar(); return; }
    // Cerrar al tocar el fondo oscuro (fuera del panel)
    if (e.clientX < nav.getBoundingClientRect().left) cerrar();
  });

  // Si la pantalla se agranda (ej. girar el celular), volver al menú normal
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) cerrar();
  });
});