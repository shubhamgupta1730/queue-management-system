import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'queue-manager-demo-secret-change-me';
const db = new Database(process.env.DB_FILE || './queue-manager.db');

db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS queues (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 manager_id INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(manager_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS tokens (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 token_number TEXT NOT NULL,
 person_name TEXT NOT NULL,
 position INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'WAITING',
 queue_id INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 called_at TEXT,
 served_at TEXT,
 cancelled_at TEXT,
 FOREIGN KEY(queue_id) REFERENCES queues(id) ON DELETE CASCADE
);
`);

const seed = db.prepare('SELECT id FROM users WHERE email=?').get('manager@queue.com');
if (!seed) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)').run('Queue Manager','manager@queue.com',hash);
}

app.use(cors());
app.use(express.json());

function auth(req,res,next){
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if(!token) return res.status(401).json({message:'Authentication required'});
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({message:'Invalid or expired token'}); }
}

function ownedQueue(id,userId){ return db.prepare('SELECT * FROM queues WHERE id=? AND manager_id=?').get(id,userId); }
function renumber(queueId){
  const rows = db.prepare("SELECT id FROM tokens WHERE queue_id=? AND status='WAITING' ORDER BY position,id").all(queueId);
  const update = db.prepare('UPDATE tokens SET position=? WHERE id=?');
  const tx = db.transaction(items => items.forEach((x,i)=>update.run(i+1,x.id)));
  tx(rows);
}
function now(){ return new Date().toISOString(); }

app.get('/api/health',(req,res)=>res.json({ok:true}));

app.post('/api/auth/login',(req,res)=>{
  const {email,password}=req.body || {};
  const user=db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if(!user || !bcrypt.compareSync(password || '',user.password_hash)) return res.status(401).json({message:'Invalid email or password'});
  const token=jwt.sign({id:user.id,name:user.name,email:user.email},JWT_SECRET,{expiresIn:'8h'});
  res.json({token,user:{id:user.id,name:user.name,email:user.email}});
});

app.get('/api/queues',auth,(req,res)=>{
  const queues=db.prepare(`SELECT q.*, (SELECT COUNT(*) FROM tokens t WHERE t.queue_id=q.id AND t.status='WAITING') waiting_count,
    (SELECT COUNT(*) FROM tokens t WHERE t.queue_id=q.id AND t.status='SERVED') served_count
    FROM queues q WHERE q.manager_id=? ORDER BY q.id DESC`).all(req.user.id);
  res.json(queues);
});

app.post('/api/queues',auth,(req,res)=>{
  const name=String(req.body?.name || '').trim();
  if(!name) return res.status(400).json({message:'Queue name is required'});
  const result=db.prepare('INSERT INTO queues(name,manager_id) VALUES(?,?)').run(name,req.user.id);
  res.status(201).json(db.prepare('SELECT * FROM queues WHERE id=?').get(result.lastInsertRowid));
});

app.get('/api/queues/:id',auth,(req,res)=>{
  const queue=ownedQueue(req.params.id,req.user.id);
  if(!queue) return res.status(404).json({message:'Queue not found'});
  const tokens=db.prepare("SELECT * FROM tokens WHERE queue_id=? ORDER BY CASE WHEN status='WAITING' THEN 0 ELSE 1 END, position, id DESC").all(queue.id);
  res.json({queue,tokens});
});

app.post('/api/queues/:id/tokens',auth,(req,res)=>{
  const queue=ownedQueue(req.params.id,req.user.id);
  if(!queue) return res.status(404).json({message:'Queue not found'});
  const personName=String(req.body?.personName || '').trim();
  if(!personName) return res.status(400).json({message:'Person name is required'});
  const last=db.prepare('SELECT token_number FROM tokens WHERE queue_id=? ORDER BY id DESC LIMIT 1').get(queue.id);
  const next=last ? Number(last.token_number.replace(/\D/g,'')) + 1 : 1;
  const number=`${queue.name.slice(0,3).toUpperCase().replace(/[^A-Z]/g,'Q')}-${String(next).padStart(3,'0')}`;
  const max=db.prepare("SELECT COALESCE(MAX(position),0) m FROM tokens WHERE queue_id=? AND status='WAITING'").get(queue.id).m;
  const result=db.prepare('INSERT INTO tokens(token_number,person_name,position,status,queue_id) VALUES(?,?,?,?,?)').run(number,personName,max+1,'WAITING',queue.id);
  res.status(201).json(db.prepare('SELECT * FROM tokens WHERE id=?').get(result.lastInsertRowid));
});

app.put('/api/tokens/:id/move',auth,(req,res)=>{
  const token=db.prepare(`SELECT t.* FROM tokens t JOIN queues q ON q.id=t.queue_id WHERE t.id=? AND q.manager_id=?`).get(req.params.id,req.user.id);
  if(!token || token.status!=='WAITING') return res.status(400).json({message:'Only waiting tokens can be moved'});
  const dir=req.body?.direction;
  const neighbor=dir==='up'
    ? db.prepare("SELECT * FROM tokens WHERE queue_id=? AND status='WAITING' AND position < ? ORDER BY position DESC LIMIT 1").get(token.queue_id,token.position)
    : db.prepare("SELECT * FROM tokens WHERE queue_id=? AND status='WAITING' AND position > ? ORDER BY position ASC LIMIT 1").get(token.queue_id,token.position);
  if(!neighbor) return res.json({message:'Already at the edge'});
  const tx=db.transaction(()=>{
    db.prepare('UPDATE tokens SET position=? WHERE id=?').run(neighbor.position,token.id);
    db.prepare('UPDATE tokens SET position=? WHERE id=?').run(token.position,neighbor.id);
  });
  tx();
  res.json({ok:true});
});

app.put('/api/queues/:id/serve-next',auth,(req,res)=>{
  const queue=ownedQueue(req.params.id,req.user.id);
  if(!queue) return res.status(404).json({message:'Queue not found'});
  const next=db.prepare("SELECT * FROM tokens WHERE queue_id=? AND status='WAITING' ORDER BY position,id LIMIT 1").get(queue.id);
  if(!next) return res.status(400).json({message:'No waiting tokens'});
  db.prepare("UPDATE tokens SET status='SERVING', called_at=? WHERE id=?").run(now(),next.id);
  renumber(queue.id);
  res.json(db.prepare('SELECT * FROM tokens WHERE id=?').get(next.id));
});

app.put('/api/tokens/:id/complete',auth,(req,res)=>{
  const token=db.prepare(`SELECT t.* FROM tokens t JOIN queues q ON q.id=t.queue_id WHERE t.id=? AND q.manager_id=?`).get(req.params.id,req.user.id);
  if(!token || token.status!=='SERVING') return res.status(400).json({message:'Token is not being served'});
  db.prepare("UPDATE tokens SET status='SERVED', served_at=? WHERE id=?").run(now(),token.id);
  res.json({ok:true});
});

app.put('/api/tokens/:id/cancel',auth,(req,res)=>{
  const token=db.prepare(`SELECT t.* FROM tokens t JOIN queues q ON q.id=t.queue_id WHERE t.id=? AND q.manager_id=?`).get(req.params.id,req.user.id);
  if(!token || !['WAITING','SERVING'].includes(token.status)) return res.status(400).json({message:'Token cannot be cancelled'});
  db.prepare("UPDATE tokens SET status='CANCELLED', cancelled_at=? WHERE id=?").run(now(),token.id);
  renumber(token.queue_id);
  res.json({ok:true});
});

app.get('/api/analytics/:id',auth,(req,res)=>{
  const queue=ownedQueue(req.params.id,req.user.id);
  if(!queue) return res.status(404).json({message:'Queue not found'});
  const stats=db.prepare(`SELECT
    COUNT(*) total,
    SUM(CASE WHEN status='WAITING' THEN 1 ELSE 0 END) waiting,
    SUM(CASE WHEN status='SERVING' THEN 1 ELSE 0 END) serving,
    SUM(CASE WHEN status='SERVED' THEN 1 ELSE 0 END) served,
    SUM(CASE WHEN status='CANCELLED' THEN 1 ELSE 0 END) cancelled
    FROM tokens WHERE queue_id=?`).get(queue.id);
  const waits=db.prepare(`SELECT AVG((julianday(called_at)-julianday(created_at))*1440) avg_wait FROM tokens WHERE queue_id=? AND called_at IS NOT NULL`).get(queue.id);
  const recent=db.prepare(`SELECT substr(created_at,1,10) day, COUNT(*) count FROM tokens WHERE queue_id=? GROUP BY substr(created_at,1,10) ORDER BY day DESC LIMIT 7`).all(queue.id).reverse();
  res.json({stats,avgWaitMinutes: waits.avg_wait || 0,trend:recent});
});

app.use((err,req,res,next)=>{ console.error(err); res.status(500).json({message:'Internal server error'}); });
app.listen(PORT,()=>console.log(`Queue Manager API running on http://localhost:${PORT}`));
