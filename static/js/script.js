const search = document.getElementById('movieSearch');
const suggestions = document.getElementById('suggestions');
const recommendBtn = document.getElementById('recommendBtn');
const result = document.getElementById('result');
const selectedTitle = document.getElementById('selectedTitle');
const selectedMeta = document.getElementById('selectedMeta');
const recommendations = document.getElementById('recommendations');
const historyEl = document.getElementById('history');
const toast = document.getElementById('toast');
let selected = '';
let timer;

search.addEventListener('input', () => {
  clearTimeout(timer);
  selected = '';
  recommendBtn.disabled = true;
  const q = search.value.trim();
  if (q.length < 2) { suggestions.innerHTML = ''; return; }
  timer = setTimeout(() => doSearch(q), 250);
});

async function doSearch(q) {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  const data = await res.json();
  suggestions.innerHTML = '';
  if (!data.success) return;
  data.results.slice(0, 8).forEach(movie => {
    const el = document.createElement('div');
    el.className = 'suggestion';
    el.textContent = movie.title;
    el.onclick = () => {
      selected = movie.title;
      search.value = movie.title;
      suggestions.innerHTML = '';
      recommendBtn.disabled = false;
    };
    suggestions.appendChild(el);
  });
}

search.addEventListener('keydown', e => {
  if (e.key === 'Enter' && search.value.trim()) {
    if (!selected) selected = search.value.trim();
    getRecommendations();
  }
});

recommendBtn.onclick = getRecommendations;

async function getRecommendations() {
  const title = selected || search.value.trim();
  if (!title) return;
  recommendBtn.disabled = true;
  recommendBtn.textContent = 'Working...';
  try {
    const res = await fetch('/api/recommend', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({title})});
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Unable to recommend');
    selectedTitle.textContent = data.selected.title;
    selectedMeta.innerHTML = `${data.selected.genres}<br>⭐ ${data.selected.avg_rating.toFixed(2)} • ${data.selected.rating_count} ratings`;
    recommendations.innerHTML = data.recommendations.map(m => `
      <article class="movie"><h3>${escapeHtml(m.title)}</h3><div class="genres">${escapeHtml(m.genres)}</div><div class="stats"><span>⭐ ${m.avg_rating.toFixed(2)}</span><span>${m.rating_count} ratings</span><span class="score">${Math.round(m.similarity*100)}% match</span></div></article>
    `).join('');
    result.classList.remove('hidden');
    loadHistory();
  } catch(e) { showToast(e.message); }
  finally { recommendBtn.disabled = false; recommendBtn.textContent = 'Recommend'; }
}

async function loadHistory() {
  const res = await fetch('/api/history');
  const data = await res.json();
  historyEl.innerHTML = data.history.length ? data.history.map(h => `<div class="history-row"><div><div class="history-title">${escapeHtml(h.selected_movie)}</div><div class="history-time">${escapeHtml(h.created_at)}</div></div><div class="history-time">${h.recommendation_count} recommendations</div></div>`).join('') : '<div class="empty">No recommendations yet.</div>';
}

document.getElementById('clearHistory').onclick = async () => {
  await fetch('/api/history', {method:'DELETE'});
  loadHistory();
  showToast('History cleared');
};

function escapeHtml(v){return String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
function showToast(msg){toast.textContent=msg;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1800)}
loadHistory();
