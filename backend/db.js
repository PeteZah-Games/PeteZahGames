import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'users.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    username TEXT,
    bio TEXT,
    avatar_url TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

try {
  const tableInfo = db.prepare('PRAGMA table_info(users)').all();
  const columnNames = tableInfo.map((col) => col.name);
  const hasExistingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count > 0;

  if (!columnNames.includes('email_verified')) {
    db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0');
    if (hasExistingUsers) db.exec('UPDATE users SET email_verified = 1');
  }
  if (!columnNames.includes('verification_token')) {
    db.exec('ALTER TABLE users ADD COLUMN verification_token TEXT');
  }
  if (!columnNames.includes('is_admin')) {
    db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0');
  }
  if (!columnNames.includes('school')) {
    db.exec('ALTER TABLE users ADD COLUMN school TEXT');
  }
  if (!columnNames.includes('age')) {
    db.exec('ALTER TABLE users ADD COLUMN age INTEGER');
  }
  if (!columnNames.includes('ip')) {
    db.exec('ALTER TABLE users ADD COLUMN ip TEXT');
  }
  if (!columnNames.includes('banned')) {
    db.exec('ALTER TABLE users ADD COLUMN banned INTEGER DEFAULT 0');
  }
  if (!columnNames.includes('display_name')) {
    db.exec('ALTER TABLE users ADD COLUMN display_name TEXT');
  }
  if (!columnNames.includes('status')) {
    db.exec('ALTER TABLE users ADD COLUMN status TEXT');
  }
  if (!columnNames.includes('location')) {
    db.exec('ALTER TABLE users ADD COLUMN location TEXT');
  }
  if (!columnNames.includes('website')) {
    db.exec('ALTER TABLE users ADD COLUMN website TEXT');
  }
  if (!columnNames.includes('profile_color')) {
    db.exec("ALTER TABLE users ADD COLUMN profile_color TEXT DEFAULT '#4d8dff'");
  }
  if (!columnNames.includes('banner_url')) {
    db.exec('ALTER TABLE users ADD COLUMN banner_url TEXT');
  }
  if (!columnNames.includes('favorite_music')) {
    db.exec("ALTER TABLE users ADD COLUMN favorite_music TEXT DEFAULT '[]'");
  }
  if (!columnNames.includes('profile_public')) {
    db.exec('ALTER TABLE users ADD COLUMN profile_public INTEGER DEFAULT 1');
  }
  if (!columnNames.includes('show_activity')) {
    db.exec('ALTER TABLE users ADD COLUMN show_activity INTEGER DEFAULT 1');
  }
  if (!columnNames.includes('verification_expires')) {
    db.exec('ALTER TABLE users ADD COLUMN verification_expires INTEGER');
  }
  if (!columnNames.includes('totp_secret')) {
    db.exec('ALTER TABLE users ADD COLUMN totp_secret TEXT');
  }
  if (!columnNames.includes('totp_enabled')) {
    db.exec('ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0');
  }
  if (!columnNames.includes('totp_pending_secret')) {
    db.exec('ALTER TABLE users ADD COLUMN totp_pending_secret TEXT');
  }
  if (!columnNames.includes('showcase_badges')) {
    db.exec("ALTER TABLE users ADD COLUMN showcase_badges TEXT DEFAULT NULL");
  }
} catch (error) {
  console.error('Migration error:', error);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS changelog (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (author_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    localstorage_data TEXT,
    theme TEXT DEFAULT 'dark',
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS likes (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(type, target_id, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS banned_ips (
    ip TEXT PRIMARY KEY,
    banned_at INTEGER NOT NULL,
    banned_by TEXT
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cap_nonces (
    sig TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cap_tokens (
    token_key TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS firefox_vm_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    username TEXT,
    day TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    ended_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_ffvm_day ON firefox_vm_sessions(day);
  CREATE INDEX IF NOT EXISTS idx_ffvm_started ON firefox_vm_sessions(started_at);
  CREATE INDEX IF NOT EXISTS idx_ffvm_user ON firefox_vm_sessions(user_id);

  CREATE TABLE IF NOT EXISTS link_claims (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    blocker TEXT NOT NULL,
    link TEXT NOT NULL,
    claimed_at INTEGER NOT NULL,
    week_start INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_link_claims_user_week ON link_claims(user_id, week_start);
  CREATE INDEX IF NOT EXISTS idx_link_claims_claimed ON link_claims(claimed_at);
  CREATE INDEX IF NOT EXISTS idx_link_claims_blocker ON link_claims(blocker, claimed_at);

  CREATE TABLE IF NOT EXISTS game_plays (
    game_id TEXT PRIMARY KEY,
    label TEXT,
    image_url TEXT,
    plays INTEGER NOT NULL DEFAULT 0,
    last_played_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_game_plays_plays ON game_plays(plays DESC);

  CREATE TABLE IF NOT EXISTS user_game_plays (
    user_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    plays INTEGER NOT NULL DEFAULT 0,
    last_played_at INTEGER,
    PRIMARY KEY (user_id, game_id)
  );

  CREATE TABLE IF NOT EXISTS user_stats (
    user_id TEXT PRIMARY KEY,
    time_ms INTEGER NOT NULL DEFAULT 0,
    games_played INTEGER NOT NULL DEFAULT 0,
    unique_games INTEGER NOT NULL DEFAULT 0,
    vm_sessions INTEGER NOT NULL DEFAULT 0,
    last_heartbeat INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_achievements (
    user_id TEXT NOT NULL,
    achievement_id TEXT NOT NULL,
    unlocked_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, achievement_id)
  );

  CREATE TABLE IF NOT EXISTS user_proxy_hosts (
    user_id TEXT NOT NULL,
    host TEXT NOT NULL,
    PRIMARY KEY (user_id, host)
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_ip ON users(ip);
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_cap_nonces_exp ON cap_nonces(expires_at);
  CREATE INDEX IF NOT EXISTS idx_cap_tokens_exp ON cap_tokens(expires_at);
`);

try {
  const statsCols = db.prepare('PRAGMA table_info(user_stats)').all().map((c) => c.name);
  const addStatCol = (name, ddl) => {
    if (!statsCols.includes(name)) db.exec(`ALTER TABLE user_stats ADD COLUMN ${ddl}`);
  };
  addStatCol('ai_messages', 'ai_messages INTEGER NOT NULL DEFAULT 0');
  addStatCol('chat_messages', 'chat_messages INTEGER NOT NULL DEFAULT 0');
  addStatCol('proxy_hosts', 'proxy_hosts INTEGER NOT NULL DEFAULT 0');
  addStatCol('bookmarks', 'bookmarks INTEGER NOT NULL DEFAULT 0');
  addStatCol('playlists', 'playlists INTEGER NOT NULL DEFAULT 0');
  addStatCol('profile_views', 'profile_views INTEGER NOT NULL DEFAULT 0');
  addStatCol('streak_days', 'streak_days INTEGER NOT NULL DEFAULT 0');
  addStatCol('last_active_day', 'last_active_day TEXT');
} catch (e) {
  console.error('user_stats migration error:', e);
}

try {
  const annCols = db.prepare('PRAGMA table_info(announcements)').all().map((c) => c.name);
  if (!annCols.includes('target_user_id')) {
    db.exec('ALTER TABLE announcements ADD COLUMN target_user_id TEXT');
  }
  if (!annCols.includes('target_ips')) {
    db.exec('ALTER TABLE announcements ADD COLUMN target_ips TEXT');
  }
  if (!annCols.includes('important')) {
    db.exec('ALTER TABLE announcements ADD COLUMN important INTEGER DEFAULT 0');
  }
} catch (e) {
  console.error('announcements migration error:', e);
}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      actor_id TEXT,
      ref_type TEXT NOT NULL,
      ref_id TEXT NOT NULL,
      body TEXT,
      created_at INTEGER NOT NULL,
      read INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read);
  `);
} catch (e) {
  console.error('notifications migration error:', e);
}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ad_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      day TEXT NOT NULL,
      hour INTEGER NOT NULL,
      kind TEXT NOT NULL,
      context TEXT NOT NULL,
      visitor TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ad_events_day_kind ON ad_events(day, kind);
    CREATE INDEX IF NOT EXISTS idx_ad_events_ts ON ad_events(ts);
    CREATE INDEX IF NOT EXISTS idx_ad_events_visitor_day ON ad_events(visitor, day);
  `);
} catch (e) {
  console.error('ad_events migration error:', e);
}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      preview TEXT NOT NULL,
      messages_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_ai_convos_user_updated ON ai_conversations(user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS ai_prompt_samples (
      id TEXT PRIMARY KEY,
      preview TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_prompts_created ON ai_prompt_samples(created_at DESC);

    CREATE TABLE IF NOT EXISTS ai_conversation_shares (
      token TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_ai_shares_convo ON ai_conversation_shares(conversation_id);
  `);
} catch (e) {
  console.error('ai_conversations migration error:', e);
}

export default db;