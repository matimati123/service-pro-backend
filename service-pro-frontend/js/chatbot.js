// =============================================
// SERVICE PRO SPA — Chatbot
// Verifica sesión JWT antes de enviar mensaje
// =============================================

const chatbotData = [
  {
    pregunta: "¿Cuáles son los servicios disponibles?",
    respuesta: "Ofrecemos instalación de cámaras de seguridad, instalación de enchufes e interruptores, y sistemas de alumbrado interior y exterior. 💡"
  },
  {
    pregunta: "¿Cómo solicito un servicio?",
    respuesta: "Haz clic en 'Solicitar Servicio' en la página principal y completa el formulario. Nos contactaremos contigo a la brevedad. ⚡"
  },
  {
    pregunta: "¿Cuál es el horario de atención?",
    respuesta: "Atendemos de lunes a viernes de 9:00 a 18:00 hrs y sábados de 9:00 a 13:00 hrs. 🕘"
  },
  {
    pregunta: "¿Tienen garantía los trabajos?",
    respuesta: "Sí, todos nuestros trabajos cuentan con garantía. Si tienes algún problema después de la instalación, contáctanos y lo resolvemos. ✅"
  },
  {
    pregunta: "¿En qué zonas trabajan?",
    respuesta: "Actualmente prestamos servicios en toda la Región Metropolitana de Santiago. 📍"
  },
  {
    pregunta: "¿Cómo me contacto con ustedes?",
    respuesta: "Puedes llamarnos al +56 9 1234 5678, escribirnos a contacto@servicepro.cl o visitar nuestra página de Contacto. 📞"
  },
  {
    pregunta: "¿Cuánto demora el servicio?",
    respuesta: "Instalaciones simples como enchufes se realizan el mismo día. Trabajos más complejos como cámaras pueden tomar 1 a 2 días. 🔧"
  },
  {
    pregunta: "¿Cómo es el proceso de cotización?",
    respuesta: "Un técnico evalúa el trabajo en terreno y entrega una cotización personalizada sin costos ocultos. 📋"
  }
];

// =============================================
// OBTENER USUARIO LOGUEADO DESDE JWT
// =============================================
function obtenerUsuario() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;

    // Decodificar payload del JWT (sin verificar firma, solo leer datos)
    const payload = JSON.parse(atob(token.split('.')[1]));

    // Verificar que no haya expirado
    if (payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// =============================================
// CREAR HTML DEL CHATBOT
// =============================================
function crearChatbot() {
  const html = `
    <div id="chatbot-widget">
      <button id="chatbot-toggle" onclick="toggleChatbot()" title="¿Necesitas ayuda?">
        <span id="chatbot-icon-open">💬</span>
        <span id="chatbot-icon-close" style="display:none;">✕</span>
      </button>

      <div id="chatbot-window" style="display:none;">

        <div id="chatbot-header">
          <div id="chatbot-header-info">
            <div id="chatbot-avatar">⚡</div>
            <div>
              <div id="chatbot-nombre">Service Pro SPA</div>
              <div id="chatbot-estado">● En línea</div>
            </div>
          </div>
          <button onclick="toggleChatbot()" id="chatbot-close-btn">✕</button>
        </div>

        <div id="chatbot-mensajes"></div>

        <div id="chatbot-input-area">
          <div id="chatbot-input-label">¿Tienes otro problema? Escríbenos</div>
          <div id="chatbot-input-row">
            <input
              type="text"
              id="chatbot-input"
              placeholder="Escribe tu consulta aquí..."
              onkeydown="if(event.key==='Enter') enviarMensajeLibre()"
              maxlength="300"
            />
            <button id="chatbot-send-btn" onclick="enviarMensajeLibre()">➤</button>
          </div>
        </div>

      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  iniciarChat();
}

// =============================================
// INICIAR CHAT
// =============================================
function iniciarChat() {
  const mensajes = document.getElementById('chatbot-mensajes');
  mensajes.innerHTML = '';

  const usuario = obtenerUsuario();

  if (usuario) {
    agregarMsgBot(`¡Hola <strong>${usuario.nombre}</strong>! 👋 ¿En qué puedo ayudarte?`);
  } else {
    agregarMsgBot('¡Hola! 👋 Soy el asistente de <strong>Service Pro SPA</strong>. ¿En qué puedo ayudarte?');
  }

  agregarMsgBot('Selecciona una pregunta frecuente:');

  const contenedor = document.createElement('div');
  contenedor.id = 'chatbot-preguntas';
  chatbotData.forEach((item, index) => {
    const btn = document.createElement('button');
    btn.className = 'chatbot-pregunta-btn';
    btn.textContent = item.pregunta;
    btn.onclick = () => responder(index);
    contenedor.appendChild(btn);
  });
  mensajes.appendChild(contenedor);
  mensajes.scrollTop = mensajes.scrollHeight;
}

// =============================================
// RESPONDER PREGUNTA FRECUENTE
// =============================================
function responder(index) {
  const item = chatbotData[index];
  const mensajes = document.getElementById('chatbot-mensajes');
  const preguntas = document.getElementById('chatbot-preguntas');
  if (preguntas) preguntas.style.display = 'none';

  agregarMsgUser(item.pregunta);
  mostrarTyping(() => {
    agregarMsgBot(item.respuesta);
    agregarMsgBot('¿Tienes alguna otra consulta? Puedes escribirla abajo 👇');
    mensajes.scrollTop = mensajes.scrollHeight;
  });
}

// =============================================
// ENVIAR MENSAJE LIBRE
// =============================================
function enviarMensajeLibre() {
  const input = document.getElementById('chatbot-input');
  const texto = input.value.trim();
  if (!texto) return;

  // Verificar si está logueado
  const usuario = obtenerUsuario();

  if (!usuario) {
    agregarMsgUser(texto);
    input.value = '';
    mostrarTyping(() => {
      agregarMsgBot('Para enviar un mensaje necesitas iniciar sesión. 🔐');

      // Botón de redirigir al login
      const mensajes = document.getElementById('chatbot-mensajes');
      const btn = document.createElement('button');
      btn.className = 'chatbot-pregunta-btn';
      btn.textContent = '👉 Ir al Login';
      btn.onclick = () => window.location.href = 'login.html';
      mensajes.appendChild(btn);
      mensajes.scrollTop = mensajes.scrollHeight;
    });
    return;
  }

  agregarMsgUser(texto);
  input.value = '';

  mostrarTyping(() => {
    fetch('https://service-pro-backend-production.up.railway.app/mensajes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        nombre: usuario.nombre,
        email: usuario.email,
        mensaje: texto
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.ok) {
        agregarMsgBot('✅ Tu mensaje fue recibido. Nuestro equipo lo revisará y te contactaremos pronto.');
      } else {
        agregarMsgBot('❌ Hubo un problema al enviar tu mensaje. Intenta nuevamente.');
      }
    })
    .catch(() => {
      agregarMsgBot('❌ No se pudo conectar con el servidor. Intenta más tarde.');
    });
  });
}

// =============================================
// HELPERS
// =============================================
function agregarMsgBot(html) {
  const mensajes = document.getElementById('chatbot-mensajes');
  const div = document.createElement('div');
  div.className = 'chatbot-msg bot';
  div.innerHTML = html;
  mensajes.appendChild(div);
  mensajes.scrollTop = mensajes.scrollHeight;
}

function agregarMsgUser(texto) {
  const mensajes = document.getElementById('chatbot-mensajes');
  const div = document.createElement('div');
  div.className = 'chatbot-msg user';
  div.textContent = texto;
  mensajes.appendChild(div);
  mensajes.scrollTop = mensajes.scrollHeight;
}

function mostrarTyping(callback) {
  const mensajes = document.getElementById('chatbot-mensajes');
  const typing = document.createElement('div');
  typing.className = 'chatbot-msg bot chatbot-typing';
  typing.innerHTML = '<span></span><span></span><span></span>';
  mensajes.appendChild(typing);
  mensajes.scrollTop = mensajes.scrollHeight;
  setTimeout(() => {
    typing.remove();
    callback();
  }, 1000);
}

// =============================================
// ABRIR / CERRAR
// =============================================
function toggleChatbot() {
  const ventana = document.getElementById('chatbot-window');
  const iconOpen = document.getElementById('chatbot-icon-open');
  const iconClose = document.getElementById('chatbot-icon-close');
  const abierto = ventana.style.display === 'flex';
  ventana.style.display = abierto ? 'none' : 'flex';
  ventana.style.flexDirection = abierto ? '' : 'column';
  iconOpen.style.display = abierto ? 'inline' : 'none';
  iconClose.style.display = abierto ? 'none' : 'inline';
}

document.addEventListener('DOMContentLoaded', crearChatbot);
