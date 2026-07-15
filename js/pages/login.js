/**
 * pages/login.js
 * --------------
 * Qué hace: controla index.html. Construye los formularios de login y
 * registro dinámicamente (requisito #8), y llama a auth.js para autenticar
 * contra la API real. Si ya hay una sesión válida, redirige directo al
 * dashboard para no obligar a re-loguearse en cada visita.
 */

import { login, register, isAuthenticated } from '../auth.js';
import { escapeHtml } from '../ui.js';

const container = document.getElementById('auth-form-container');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');

// Si ya existe una sesión vigente, no tiene sentido mostrar el login.
if (isAuthenticated()) {
  window.location.href = 'dashboard.html';
}

let mode = 'login';

function renderForm() {
  container.innerHTML = '';

  const form = document.createElement('form');
  form.noValidate = true;

  if (mode === 'register') {
    form.appendChild(buildField('name', 'Nombre completo', 'text'));
  }
  form.appendChild(buildField('email', 'Correo electrónico', 'email'));
  form.appendChild(buildField('password', 'Contraseña', 'password'));

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn btn--primary';
  submitBtn.style.width = '100%';
  submitBtn.textContent = mode === 'login' ? 'Ingresar' : 'Crear cuenta';
  form.appendChild(submitBtn);

  const feedback = document.createElement('div');
  feedback.id = 'auth-feedback';
  feedback.setAttribute('role', 'alert');

  form.addEventListener('submit', (evt) => handleSubmit(evt, submitBtn, feedback));

  container.append(form, feedback);
}

function buildField(name, label, type) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const id = `field-${name}`;
  wrap.innerHTML = `<label for="${id}">${escapeHtml(label)}</label>`;
  const input = document.createElement('input');
  input.id = id;
  input.name = name;
  input.type = type;
  input.required = true;
  input.autocomplete = type === 'password' ? 'current-password' : 'on';
  wrap.appendChild(input);
  return wrap;
}

async function handleSubmit(evt, submitBtn, feedback) {
  evt.preventDefault();
  feedback.innerHTML = '';
  const formData = new FormData(evt.target);
  const email = formData.get('email');
  const password = formData.get('password');
  const name = formData.get('name');

  submitBtn.disabled = true;
  submitBtn.textContent = mode === 'login' ? 'Ingresando...' : 'Creando cuenta...';

  try {
    if (mode === 'login') {
      await login({ email, password });
    } else {
      await register({ name, email, password });
    }
    window.location.href = 'dashboard.html';
  } catch (err) {
    feedback.innerHTML = `<div class="banner banner--error"><span aria-hidden="true">⚠️</span><span>${escapeHtml(err.message)}</span></div>`;
    submitBtn.disabled = false;
    submitBtn.textContent = mode === 'login' ? 'Ingresar' : 'Crear cuenta';
  }
}

tabLogin.addEventListener('click', () => {
  mode = 'login';
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  tabLogin.setAttribute('aria-selected', 'true');
  tabRegister.setAttribute('aria-selected', 'false');
  renderForm();
});

tabRegister.addEventListener('click', () => {
  mode = 'register';
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  tabRegister.setAttribute('aria-selected', 'true');
  tabLogin.setAttribute('aria-selected', 'false');
  renderForm();
});

renderForm();
