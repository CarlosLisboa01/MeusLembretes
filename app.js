// Configuração do Supabase
// 1) Crie um projeto no Supabase
// 2) Crie a tabela usando o arquivo schema.sql
// 3) Cole aqui a URL e a chave ANON pública do seu projeto
const SUPABASE_URL = "https://ncocucfqatapyllzrwsj.supabase.co"; // ex.: https://abcxyz.supabase.co
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jb2N1Y2ZxYXRhcHlsbHpyd3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxMTY1NTEsImV4cCI6MjA3MDY5MjU1MX0.NWMwA0enQ48xSIzmQtpVtUn5QvxEiDHp7dVggFWp8w0"; // ex.: eyJhbGciOi...

// Quando as credenciais não estiverem definidas, o app usa IndexedDB local para não bloquear
let supabaseClient = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Utilidades simples
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function showToast(message){
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=> toast.hidden = true, 2500);
}

// IndexedDB fallback para quando não há Supabase
const idb = {
  _db: null,
  async open(){
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("notes_db", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if(!db.objectStoreNames.contains("notes")){
          const store = db.createObjectStore("notes", { keyPath: "id", autoIncrement: true });
          store.createIndex("by_status", "status");
          store.createIndex("by_remind_at", "remind_at");
        }
      };
      req.onsuccess = () => { this._db = req.result; resolve(); };
      req.onerror = () => reject(req.error);
    });
  },
  async add(note){
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction("notes", "readwrite");
      const req = tx.objectStore("notes").add(note);
      req.onsuccess = () => resolve({ data: { id: req.result } });
      req.onerror = () => reject(req.error);
    });
  },
  async update(note){
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction("notes", "readwrite");
      const req = tx.objectStore("notes").put(note);
      req.onsuccess = () => resolve({ data: true });
      req.onerror = () => reject(req.error);
    });
  },
  async list(){
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction("notes", "readonly");
      const req = tx.objectStore("notes").getAll();
      req.onsuccess = () => resolve({ data: req.result });
      req.onerror = () => reject(req.error);
    });
  }
};

// Inicialização
document.addEventListener("DOMContentLoaded", async () => {
  if(!supabaseClient){
    $("#config-alert").hidden = false;
    await idb.open();
  }

  registerServiceWorker();
  setupNotificationPermissionButton();
  wireForm();
  // Filtro de status configurado uma única vez
  $("#filtro-status").onchange = () => renderNotes();
  await renderNotes();
  startReminderTicker();
});

function registerServiceWorker(){
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
}

function setupNotificationPermissionButton(){
  const btn = $("#btn-permitir-notificacoes");
  btn.addEventListener('click', async () => {
    try{
      const perm = await Notification.requestPermission();
      if(perm === 'granted') showToast('Notificações ativadas');
      else showToast('Notificações bloqueadas');
    }catch{ showToast('Seu navegador não suporta notificações'); }
  });
}

function wireForm(){
  const form = $("#form-nota");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const titulo = $("#titulo").value.trim();
    const conteudo = $("#conteudo").value.trim();
    const tipo = $$('input[name="tipo-lembrete"]').find(r=>r.checked)?.value || 'dias';
    const now = new Date();
    let remindAt = null;

    if(tipo === 'dias'){
      const dias = parseInt($("#dias").value || '1', 10);
      const target = new Date(now.getTime() + dias*24*60*60*1000);
      remindAt = target.toISOString();
    }else{
      const value = $("#datahora").value;
      if(value){ remindAt = new Date(value).toISOString(); }
    }

    const note = {
      title: titulo || 'Sem título',
      content: conteudo,
      remind_at: remindAt,
      status: 'pendente',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const savedId = await persistNote(note);
    if(savedId){ showToast('Anotação salva'); form.reset(); await renderNotes(); }
  });
}

async function persistNote(note){
  try{
    if(supabaseClient){
      const { data, error } = await supabaseClient.from('notes').insert(note).select('id').single();
      if(error) throw error; return data?.id;
    }else{
      const res = await idb.add(note); return res.data.id;
    }
  }catch(err){
    console.error(err); showToast('Erro ao salvar'); return null;
  }
}

async function listNotes(){
  try{
    if(supabaseClient){
      const { data, error } = await supabaseClient.from('notes').select('*').order('created_at', { ascending: false });
      if(error) throw error; return data || [];
    }else{
      const res = await idb.list();
      return (res.data || []).sort((a,b)=> new Date(b.created_at)-new Date(a.created_at));
    }
  }catch(err){ console.error(err); return []; }
}

async function updateNote(note){
  note.updated_at = new Date().toISOString();
  try{
    if(supabaseClient){
      const { error } = await supabaseClient.from('notes').update(note).eq('id', note.id);
      if(error) throw error; return true;
    }else{
      await idb.update(note); return true;
    }
  }catch(err){ console.error(err); return false; }
}

async function renderNotes(){
  const list = $("#lista-notas");
  const empty = $("#empty-state");
  list.innerHTML = '';
  const filtro = $("#filtro-status").value;
  let notes = await listNotes();
  if(filtro === 'pendentes') notes = notes.filter(n=> n.status === 'pendente');
  if(filtro === 'concluidas') notes = notes.filter(n=> n.status === 'concluida');

  if(notes.length === 0){ empty.hidden = false; return; } else { empty.hidden = true; }

  for(const n of notes){
    const li = document.createElement('li');
    li.className = 'note';
    li.innerHTML = `
      <div class="note-title">${escapeHtml(n.title)}</div>
      <div class="note-meta">
        ${n.remind_at ? `Lembrar: ${formatDateTime(n.remind_at)}` : 'Sem lembrete'} · 
        <span class="badge ${n.status}">${n.status}</span>
      </div>
      <div class="note-content">${escapeHtml(n.content || '')}</div>
      <div class="note-actions">
        <button class="btn btn-outline" data-action="notify">Testar notificação</button>
        ${n.status === 'pendente' ? '<button class="btn btn-primary" data-action="done">Marcar como concluída</button>' : ''}
        <button class="btn btn-ghost" data-action="delete">Excluir</button>
      </div>
    `;

    li.querySelector('[data-action="notify"]').addEventListener('click', ()=> triggerNotification(n));
    if(li.querySelector('[data-action="done"]')){
      li.querySelector('[data-action="done"]').addEventListener('click', async ()=>{
        n.status = 'concluida';
        await updateNote(n); await renderNotes();
      });
    }
    li.querySelector('[data-action="delete"]').addEventListener('click', async ()=>{
      const ok = await deleteNote(n.id);
      if(ok){ showToast('Anotação excluída'); await renderNotes(); }
    });
    list.appendChild(li);
  }
}

async function deleteNote(id){
  try{
    if(supabaseClient){
      const { error } = await supabaseClient.from('notes').delete().eq('id', id);
      if(error) throw error; return true;
    }else{
      // IndexedDB delete por id requer abrir transação e chamar delete
      await new Promise((resolve,reject)=>{
        const tx = idb._db.transaction('notes','readwrite');
        const req = tx.objectStore('notes').delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      return true;
    }
  }catch(err){ console.error(err); return false; }
}

function startReminderTicker(){
  // Checa imediatamente e depois no intervalo
  checkReminders();
  setInterval(checkReminders, 30 * 1000);
}

async function checkReminders(){
  const notes = await listNotes();
  const now = Date.now();
  for(const n of notes){
    if(!n.remind_at || n.status !== 'pendente') continue;
    const t = new Date(n.remind_at).getTime();
    const key = makeNotificationKey(n);
    if(t <= now && !isAlreadyNotified(key)){
      triggerNotification(n);
      markAsNotified(key);
    }
  }
}

function triggerNotification(note){
  if(!('Notification' in window)) return;
  if(Notification.permission !== 'granted') return;

  const title = `Lembrete: ${note.title}`;
  const options = {
    body: note.content || 'Você definiu um lembrete.',
    icon: './icons/icon-192.png',
    badge: './icons/badge-72.png',
    data: { url: location.href }
  };

  if(navigator.serviceWorker?.controller){
    navigator.serviceWorker.controller.postMessage({ type: 'show-notification', title, options });
  } else {
    new Notification(title, options);
  }
}

// Utils
function escapeHtml(str){
  return String(str).replace(/[&<>"]+/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));
}
function formatDateTime(iso){
  try{
    const d = new Date(iso);
    return d.toLocaleString();
  }catch{ return iso; }
}

// Persistência simples para não repetir notificações do mesmo lembrete
function makeNotificationKey(note){
  return `${note.id || 'local'}|${note.remind_at || 'none'}`;
}
function getNotifiedSet(){
  try{
    const raw = localStorage.getItem('notified_keys');
    return new Set(raw ? JSON.parse(raw) : []);
  }catch{ return new Set(); }
}
function saveNotifiedSet(set){
  try{
    localStorage.setItem('notified_keys', JSON.stringify(Array.from(set)));
  }catch{}
}
function isAlreadyNotified(key){
  return getNotifiedSet().has(key);
}
function markAsNotified(key){
  const s = getNotifiedSet();
  s.add(key);
  saveNotifiedSet(s);
}


