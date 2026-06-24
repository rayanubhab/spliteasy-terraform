-- Splitwise-style payment manager, single-user perspective: every expense
-- and settlement is between "you" (the logged-in user, implicit) and one
-- "person" (a friend). No groups - each row is a pairwise relationship.

CREATE TABLE IF NOT EXISTS people (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    avatar_color TEXT NOT NULL DEFAULT '#6366f1',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    paid_by TEXT NOT NULL CHECK (paid_by IN ('you', 'friend')),
    your_share NUMERIC(10,2) NOT NULL CHECK (your_share >= 0),
    friend_share NUMERIC(10,2) NOT NULL CHECK (friend_share >= 0),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settlements (
    id SERIAL PRIMARY KEY,
    person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    -- positive amount = friend paid you (reduces what they owe you)
    -- negative amount = you paid friend (reduces what you owe them)
    amount NUMERIC(10,2) NOT NULL,
    note TEXT,
    settled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_person ON expenses(person_id);
CREATE INDEX IF NOT EXISTS idx_settlements_person ON settlements(person_id);
