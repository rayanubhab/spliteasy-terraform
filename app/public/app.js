const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#34d399', '#22d3ee', '#f87171', '#a3e635'];

let state = {
  people: [],
  selectedColor: AVATAR_COLORS[0],
  currentDetailPersonId: null,
};

// ---------- Helpers ----------
function fmt(n) {
  const v = Number(n);
  return (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(2);
}

function initials(name) {
  return name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2200);
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

// ---------- API ----------
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Request failed');
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---------- Dashboard / friends list ----------
async function loadDashboard() {
  try {
    const data = await api('/api/dashboard');
    state.people = data.people;
    document.getElementById('summaryOwed').textContent = fmt(data.summary.you_are_owed);
    document.getElementById('summaryOwe').textContent = fmt(data.summary.you_owe);
    const netEl = document.getElementById('summaryNet');
    netEl.textContent = fmt(data.summary.net);
    netEl.style.color = data.summary.net >= 0 ? 'var(--green)' : 'var(--red)';
    renderFriends();
  } catch (err) {
    showToast('Could not load dashboard');
  }
}

function renderFriends() {
  const grid = document.getElementById('friendsGrid');
  const empty = document.getElementById('emptyState');
  grid.innerHTML = '';

  if (state.people.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  state.people.forEach(p => {
    const card = document.createElement('div');
    card.className = 'friend-card';
    card.onclick = () => openDetail(p.id);

    const balanceClass = p.net_balance > 0.005 ? 'owed' : p.net_balance < -0.005 ? 'owe' : 'settled';
    const balanceText = p.net_balance > 0.005
      ? `owes you ${fmt(p.net_balance)}`
      : p.net_balance < -0.005
        ? `you owe ${fmt(Math.abs(p.net_balance))}`
        : 'settled up';

    card.innerHTML = `
      <div class="avatar" style="background:${p.avatar_color}">${initials(p.name)}</div>
      <div class="friend-info">
        <div class="friend-name">${escapeHtml(p.name)}</div>
        <div class="friend-meta">${p.expense_count} expense${p.expense_count === 1 ? '' : 's'}</div>
      </div>
      <div class="balance-pill ${balanceClass}">${balanceClass === 'settled' ? 'Settled' : fmt(Math.abs(p.net_balance))}</div>
    `;
    grid.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Add Friend ----------
function buildColorPicker() {
  const picker = document.getElementById('colorPicker');
  picker.innerHTML = '';
  AVATAR_COLORS.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch' + (color === state.selectedColor ? ' selected' : '');
    swatch.style.background = color;
    swatch.onclick = () => {
      state.selectedColor = color;
      buildColorPicker();
    };
    picker.appendChild(swatch);
  });
}

document.getElementById('addFriendBtn').addEventListener('click', () => {
  document.getElementById('friendForm').reset();
  state.selectedColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
  buildColorPicker();
  openModal('friendModalOverlay');
});

document.getElementById('friendForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('friendName').value.trim();
  if (!name) return;
  try {
    await api('/api/people', { method: 'POST', body: JSON.stringify({ name, avatar_color: state.selectedColor }) });
    closeModal('friendModalOverlay');
    showToast(`Added ${name}`);
    loadDashboard();
  } catch (err) {
    showToast(err.message);
  }
});

// ---------- Add Expense ----------
function populatePersonSelect(preselectId) {
  const select = document.getElementById('expensePerson');
  select.innerHTML = state.people.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  if (preselectId) select.value = preselectId;
}

document.getElementById('addExpenseBtn').addEventListener('click', () => {
  if (state.people.length === 0) {
    showToast('Add a friend first');
    return;
  }
  openAddExpense();
});

function openAddExpense(preselectId) {
  document.getElementById('expenseForm').reset();
  populatePersonSelect(preselectId);
  setSegment('paidBySegment', 'you');
  setSegment('splitTypeSegment', 'equal');
  document.getElementById('customSplitFields').style.display = 'none';
  document.getElementById('splitPreview').classList.remove('visible');
  openModal('expenseModalOverlay');
}

function setSegment(groupId, value) {
  const group = document.getElementById(groupId);
  group.querySelectorAll('.segment').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === value);
  });
}

document.querySelectorAll('.segmented').forEach(group => {
  group.addEventListener('click', (e) => {
    const btn = e.target.closest('.segment');
    if (!btn) return;
    setSegment(group.id, btn.dataset.value);
    if (group.id === 'splitTypeSegment') {
      const isCustom = btn.dataset.value === 'custom';
      document.getElementById('customSplitFields').style.display = isCustom ? 'grid' : 'none';
    }
    updateSplitPreview();
  });
});

['expenseAmount', 'yourShare', 'friendShare'].forEach(id => {
  document.getElementById(id).addEventListener('input', updateSplitPreview);
});

function getActiveSegment(groupId) {
  return document.querySelector(`#${groupId} .segment.active`).dataset.value;
}

function updateSplitPreview() {
  const amount = parseFloat(document.getElementById('expenseAmount').value) || 0;
  const splitType = getActiveSegment('splitTypeSegment');
  const paidBy = getActiveSegment('paidBySegment');
  const preview = document.getElementById('splitPreview');

  if (amount <= 0) { preview.classList.remove('visible'); return; }

  let yourShare, friendShare;
  if (splitType === 'custom') {
    yourShare = parseFloat(document.getElementById('yourShare').value) || 0;
    friendShare = parseFloat(document.getElementById('friendShare').value) || 0;
  } else {
    yourShare = Math.round((amount / 2) * 100) / 100;
    friendShare = Math.round((amount - yourShare) * 100) / 100;
  }

  const payer = paidBy === 'you' ? 'You' : 'They';
  const net = paidBy === 'you' ? friendShare : -yourShare;
  const netText = net > 0
    ? `they owe you <strong>${fmt(net)}</strong>`
    : net < 0
      ? `you owe them <strong>${fmt(Math.abs(net))}</strong>`
      : `you're <strong>even</strong> on this one`;

  preview.innerHTML = `${payer} paid ${fmt(amount)}. Your share ${fmt(yourShare)}, their share ${fmt(friendShare)} — ${netText}.`;
  preview.classList.add('visible');
}

document.getElementById('expenseForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    person_id: document.getElementById('expensePerson').value,
    description: document.getElementById('expenseDescription').value.trim(),
    amount: parseFloat(document.getElementById('expenseAmount').value),
    paid_by: getActiveSegment('paidBySegment'),
    split_type: getActiveSegment('splitTypeSegment'),
    your_share: document.getElementById('yourShare').value,
    friend_share: document.getElementById('friendShare').value,
  };
  try {
    await api('/api/expenses', { method: 'POST', body: JSON.stringify(payload) });
    closeModal('expenseModalOverlay');
    showToast('Expense added');
    loadDashboard();
    if (state.currentDetailPersonId === Number(payload.person_id)) {
      openDetail(payload.person_id);
    }
  } catch (err) {
    showToast(err.message);
  }
});

// ---------- Friend detail ----------
async function openDetail(personId) {
  state.currentDetailPersonId = Number(personId);
  const person = state.people.find(p => p.id === Number(personId));
  if (!person) return;

  document.getElementById('detailAvatar').style.background = person.avatar_color;
  document.getElementById('detailAvatar').textContent = initials(person.name);
  document.getElementById('detailName').textContent = person.name;

  const balanceEl = document.getElementById('detailBalance');
  if (person.net_balance > 0.005) {
    balanceEl.textContent = `Owes you ${fmt(person.net_balance)}`;
    balanceEl.className = 'detail-balance owed';
  } else if (person.net_balance < -0.005) {
    balanceEl.textContent = `You owe ${fmt(Math.abs(person.net_balance))}`;
    balanceEl.className = 'detail-balance owe';
  } else {
    balanceEl.textContent = 'All settled up';
    balanceEl.className = 'detail-balance settled';
  }

  try {
    const { expenses, settlements } = await api(`/api/people/${personId}/expenses`);
    renderHistory(expenses, settlements);
  } catch (err) {
    showToast('Could not load history');
  }

  openModal('detailModalOverlay');
}

function renderHistory(expenses, settlements) {
  const list = document.getElementById('historyList');
  list.innerHTML = '';

  const items = [
    ...expenses.map(e => ({ type: 'expense', ...e, sortDate: e.expense_date })),
    ...settlements.map(s => ({ type: 'settlement', ...s, sortDate: s.settled_at })),
  ].sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));

  if (items.length === 0) {
    list.innerHTML = `<div class="friend-meta" style="padding:12px 0;">No history yet.</div>`;
    return;
  }

  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'history-item';

    if (item.type === 'expense') {
      const net = item.paid_by === 'you' ? Number(item.friend_share) : -Number(item.your_share);
      const cls = net > 0 ? 'owed' : net < 0 ? 'owe' : '';
      const date = new Date(item.expense_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      row.innerHTML = `
        <div class="history-item-left">
          <div class="history-item-desc">${escapeHtml(item.description)}</div>
          <div class="history-item-meta">${date} · ${item.paid_by === 'you' ? 'You paid' : 'They paid'} ${fmt(item.amount)}</div>
        </div>
        <div class="history-item-right">
          <div class="history-item-amount ${cls}">${net === 0 ? 'even' : fmt(net)}</div>
          <button class="history-delete" data-id="${item.id}">remove</button>
        </div>
      `;
      row.querySelector('.history-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        await api(`/api/expenses/${item.id}`, { method: 'DELETE' });
        showToast('Expense removed');
        loadDashboard();
        openDetail(state.currentDetailPersonId);
      });
    } else {
      const date = new Date(item.settled_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const direction = item.amount > 0 ? 'They paid you' : 'You paid them';
      row.innerHTML = `
        <div class="history-item-left">
          <div class="history-item-desc">${direction}${item.note ? ' · ' + escapeHtml(item.note) : ''}</div>
          <div class="history-item-meta">${date} · settlement</div>
        </div>
        <div class="history-item-right">
          <div class="history-item-amount settlement">${fmt(Math.abs(item.amount))}</div>
        </div>
      `;
    }
    list.appendChild(row);
  });
}

document.getElementById('deleteFriendBtn').addEventListener('click', async () => {
  const person = state.people.find(p => p.id === state.currentDetailPersonId);
  if (!person) return;
  if (!confirm(`Remove ${person.name} and all their expense history? This can't be undone.`)) return;
  await api(`/api/people/${person.id}`, { method: 'DELETE' });
  closeModal('detailModalOverlay');
  showToast('Friend removed');
  loadDashboard();
});

// ---------- Settle up ----------
document.getElementById('settleUpBtn').addEventListener('click', () => {
  const person = state.people.find(p => p.id === state.currentDetailPersonId);
  if (!person) return;
  document.getElementById('settleForm').reset();
  document.getElementById('settleAmount').value = Math.abs(person.net_balance).toFixed(2) || '';
  setSegment('settleDirectionSegment', person.net_balance >= 0 ? 'friend_paid' : 'you_paid');
  document.getElementById('settleHint').textContent = person.net_balance > 0.005
    ? `${person.name} owes you ${fmt(person.net_balance)}.`
    : person.net_balance < -0.005
      ? `You owe ${person.name} ${fmt(Math.abs(person.net_balance))}.`
      : `You're already settled up with ${person.name}.`;
  openModal('settleModalOverlay');
});

document.getElementById('settleForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const person = state.people.find(p => p.id === state.currentDetailPersonId);
  const amountAbs = parseFloat(document.getElementById('settleAmount').value);
  const direction = getActiveSegment('settleDirectionSegment');
  const amount = direction === 'friend_paid' ? amountAbs : -amountAbs;
  const note = document.getElementById('settleNote').value.trim();

  try {
    await api('/api/settlements', {
      method: 'POST',
      body: JSON.stringify({ person_id: person.id, amount, note }),
    });
    closeModal('settleModalOverlay');
    showToast('Payment recorded');
    await loadDashboard();
    openDetail(person.id);
  } catch (err) {
    showToast(err.message);
  }
});

// ---------- Init ----------
loadDashboard();
