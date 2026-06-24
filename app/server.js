const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'spliteasy',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
});

// --- Health checks (used by the ALB target group + manual debugging) ---
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.get('/health/deep', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'unreachable' });
  }
});

// --- Balance calculation ---
// net > 0  => friend owes you `net`
// net < 0  => you owe friend `abs(net)`
async function getBalances() {
  const result = await pool.query(`
    SELECT
      p.id, p.name, p.avatar_color,
      COALESCE(SUM(CASE WHEN e.paid_by = 'you' THEN e.friend_share ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN e.paid_by = 'friend' THEN e.your_share ELSE 0 END), 0)
        - COALESCE((SELECT SUM(s.amount) FROM settlements s WHERE s.person_id = p.id), 0)
        AS net_balance,
      COUNT(e.id) AS expense_count
    FROM people p
    LEFT JOIN expenses e ON e.person_id = p.id
    GROUP BY p.id, p.name, p.avatar_color
    ORDER BY p.name ASC
  `);
  return result.rows.map(r => ({
    id: r.id,
    name: r.name,
    avatar_color: r.avatar_color,
    expense_count: Number(r.expense_count),
    net_balance: Number(r.net_balance),
  }));
}

app.get('/api/dashboard', async (req, res) => {
  try {
    const balances = await getBalances();
    const youAreOwed = balances.filter(b => b.net_balance > 0).reduce((s, b) => s + b.net_balance, 0);
    const youOwe = balances.filter(b => b.net_balance < 0).reduce((s, b) => s + Math.abs(b.net_balance), 0);
    res.json({
      people: balances,
      summary: {
        you_are_owed: Math.round(youAreOwed * 100) / 100,
        you_owe: Math.round(youOwe * 100) / 100,
        net: Math.round((youAreOwed - youOwe) * 100) / 100,
      },
    });
  } catch (err) {
    console.error('Error building dashboard', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// --- People ---
app.get('/api/people', async (req, res) => {
  try {
    res.json(await getBalances());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch people' });
  }
});

app.post('/api/people', async (req, res) => {
  const { name, avatar_color } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  try {
    const result = await pool.query(
      'INSERT INTO people (name, avatar_color) VALUES ($1, $2) RETURNING id, name, avatar_color',
      [name.trim(), avatar_color || '#6366f1']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating person', err);
    res.status(500).json({ error: 'Failed to create person' });
  }
});

app.delete('/api/people/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM people WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete person' });
  }
});

// --- Expenses (per person, with running history) ---
app.get('/api/people/:id/expenses', async (req, res) => {
  try {
    const expenses = await pool.query(
      `SELECT id, description, amount, paid_by, your_share, friend_share, expense_date, created_at
       FROM expenses WHERE person_id = $1 ORDER BY expense_date DESC, created_at DESC`,
      [req.params.id]
    );
    const settlements = await pool.query(
      `SELECT id, amount, note, settled_at FROM settlements WHERE person_id = $1 ORDER BY settled_at DESC`,
      [req.params.id]
    );
    res.json({ expenses: expenses.rows, settlements: settlements.rows });
  } catch (err) {
    console.error('Error fetching person history', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

app.post('/api/expenses', async (req, res) => {
  const { person_id, description, amount, paid_by, split_type, your_share, friend_share } = req.body;

  if (!person_id || !description || !amount || !paid_by) {
    return res.status(400).json({ error: 'person_id, description, amount, and paid_by are required' });
  }
  if (!['you', 'friend'].includes(paid_by)) {
    return res.status(400).json({ error: "paid_by must be 'you' or 'friend'" });
  }

  const total = Number(amount);
  let yShare, fShare;
  if (split_type === 'custom') {
    yShare = Number(your_share);
    fShare = Number(friend_share);
    if (Math.abs(yShare + fShare - total) > 0.01) {
      return res.status(400).json({ error: 'Custom shares must add up to the total amount' });
    }
  } else {
    // equal split, rounding the remainder onto the friend's share
    yShare = Math.round((total / 2) * 100) / 100;
    fShare = Math.round((total - yShare) * 100) / 100;
  }

  try {
    const result = await pool.query(
      `INSERT INTO expenses (person_id, description, amount, paid_by, your_share, friend_share)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, person_id, description, amount, paid_by, your_share, friend_share, expense_date`,
      [person_id, description.trim(), total, paid_by, yShare, fShare]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating expense', err);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

app.delete('/api/expenses/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM expenses WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

// --- Settlements ("settle up") ---
app.post('/api/settlements', async (req, res) => {
  const { person_id, amount, note } = req.body;
  if (!person_id || amount === undefined || amount === null) {
    return res.status(400).json({ error: 'person_id and amount are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO settlements (person_id, amount, note) VALUES ($1, $2, $3)
       RETURNING id, person_id, amount, note, settled_at`,
      [person_id, Number(amount), note || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error recording settlement', err);
    res.status(500).json({ error: 'Failed to record settlement' });
  }
});

app.listen(PORT, () => {
  console.log(`Payment Manager listening on port ${PORT}`);
});
