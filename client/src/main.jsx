import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BarChart,Bar,XAxis,YAxis,Tooltip,ResponsiveContainer,LineChart,Line,CartesianGrid} from 'recharts';
import {ArrowDown,ArrowUp,CheckCircle2,ChevronRight,Clock3,LogOut,Plus,RefreshCw,Trash2,Users,LayoutDashboard} from 'lucide-react';
import './styles.css';

const API='http://localhost:5000/api';
async function api(path,options={}){
  const token=localStorage.getItem('queue_token');
  const res=await fetch(API+path,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.message||'Request failed');
  return data;
}

function Login({onLogin}){
 const [email,setEmail]=useState('manager@queue.com'),[password,setPassword]=useState('admin123'),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 async function submit(e){e.preventDefault();setLoading(true);setError('');try{const d=await api('/auth/login',{method:'POST',body:JSON.stringify({email,password})});localStorage.setItem('queue_token',d.token);localStorage.setItem('queue_user',JSON.stringify(d.user));onLogin(d.user)}catch(e){setError(e.message)}finally{setLoading(false)}}
 return <div className="login-shell"><div className="login-card"><div className="brand-mark">Q</div><h1>QueueFlow</h1><p className="muted">Smart queue management for busy teams.</p><form onSubmit={submit}><label>Email<input value={email} onChange={e=>setEmail(e.target.value)} type="email"/></label><label>Password<input value={password} onChange={e=>setPassword(e.target.value)} type="password"/></label>{error&&<div className="error">{error}</div>}<button className="primary full" disabled={loading}>{loading?'Signing in…':'Sign in'}</button></form><div className="demo">Demo: manager@queue.com / admin123</div></div></div>
}

function App(){
 const [user,setUser]=useState(()=>JSON.parse(localStorage.getItem('queue_user')||'null')); const [queues,setQueues]=useState([]); const [selected,setSelected]=useState(null); const [tab,setTab]=useState('dashboard'); const [error,setError]=useState('');
 async function loadQueues(){try{setQueues(await api('/queues'));setError('')}catch(e){setError(e.message)}}
 useEffect(()=>{if(user)loadQueues()},[user]);
 if(!user) return <Login onLogin={setUser}/>;
 function logout(){localStorage.clear();setUser(null)}
 return <div className="app"><aside><div className="logo"><span>Q</span> QueueFlow</div><div className="side-title">Workspace</div><button className={tab==='dashboard'?'nav active':'nav'} onClick={()=>setTab('dashboard')}><LayoutDashboard size={18}/>Dashboard</button><div className="side-title">Queues</div>{queues.map(q=><button key={q.id} className={tab==='queue'&&selected?.id===q.id?'nav active':'nav'} onClick={()=>{setSelected(q);setTab('queue')}}><ChevronRight size={16}/><span>{q.name}</span><b>{q.waiting_count}</b></button>)}<button className="new-queue" onClick={async()=>{const name=prompt('Queue name');if(!name)return;try{const q=await api('/queues',{method:'POST',body:JSON.stringify({name})});setQueues(x=>[q,...x]);setSelected(q);setTab('queue')}catch(e){alert(e.message)}}}><Plus size={16}/>New queue</button><div className="side-bottom"><div className="user"><div className="avatar">{user.name?.[0]||'M'}</div><div><strong>{user.name}</strong><small>{user.email}</small></div></div><button className="logout" onClick={logout}><LogOut size={16}/>Logout</button></div></aside><main><header><div><h2>{tab==='dashboard'?'Dashboard':selected?.name||'Queue'}</h2><p>{tab==='dashboard'?'Overview of your queue operations':'Manage waiting customers and service flow'}</p></div><button className="icon-btn" onClick={loadQueues}><RefreshCw size={18}/></button></header>{error&&<div className="error global">{error}</div>}{tab==='dashboard'?<Dashboard queues={queues}/>:selected?<QueueView queue={selected} onRefresh={loadQueues}/>:null}</main></div>
}

function Dashboard({queues}){const total=queues.reduce((a,q)=>a+q.waiting_count,0),served=queues.reduce((a,q)=>a+q.served_count,0);return <section><div className="cards"><Stat icon={<Users/>} label="Waiting now" value={total}/><Stat icon={<CheckCircle2/>} label="Served total" value={served}/><Stat icon={<LayoutDashboard/>} label="Active queues" value={queues.length}/><Stat icon={<Clock3/>} label="Status" value="Live"/></div><div className="panel"><div className="panel-head"><div><h3>Queue snapshot</h3><p>Current waiting load across all queues</p></div></div>{queues.length===0?<Empty text="Create your first queue to get started."/>:<div className="queue-grid">{queues.map(q=><div className="queue-card" key={q.id}><div className="q-icon">{q.name[0]}</div><div className="q-info"><strong>{q.name}</strong><span>{q.waiting_count} waiting · {q.served_count} served</span></div><div className="q-count">{q.waiting_count}</div></div>)}</div>}</div></section>}
function Stat({icon,label,value}){return <div className="stat"><div className="stat-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong></div></div>}

function QueueView({queue,onRefresh}){const [data,setData]=useState(null),[analytics,setAnalytics]=useState(null),[name,setName]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function load(){setData(await api(`/queues/${queue.id}`));setAnalytics(await api(`/analytics/${queue.id}`))}
 useEffect(()=>{load()},[queue.id]);
 async function act(path,method='PUT',body={}){setBusy(true);setMessage('');try{await api(path,{method,body:JSON.stringify(body)});await load();onRefresh()}catch(e){setMessage(e.message)}finally{setBusy(false)}}
 if(!data)return <div className="loading">Loading queue…</div>;
 const waiting=data.tokens.filter(t=>t.status==='WAITING'),serving=data.tokens.filter(t=>t.status==='SERVING');
 return <section><div className="action-row"><form className="add-form" onSubmit={async e=>{e.preventDefault();if(!name.trim())return;await act(`/queues/${queue.id}/tokens`,'POST',{personName:name});setName('')}}><input placeholder="Person name" value={name} onChange={e=>setName(e.target.value)}/><button className="primary"><Plus size={17}/>Add token</button></form><button className="serve" disabled={busy||!waiting.length} onClick={()=>act(`/queues/${queue.id}/serve-next`)}><CheckCircle2 size={18}/>Serve next</button></div>{message&&<div className="error global">{message}</div>}<div className="queue-layout"><div className="panel queue-panel"><div className="panel-head"><div><h3>Waiting queue <span className="pill">{waiting.length}</span></h3><p>Move customers with the arrows. First token is served next.</p></div></div>{serving.length>0&&<div className="serving"><div><span>Currently serving</span><strong>{serving[0].token_number}</strong><small>{serving[0].person_name}</small></div><button onClick={()=>act(`/tokens/${serving[0].id}/complete`)}></button></div>}{waiting.length===0?<Empty text="No customers waiting."/>:<div className="token-list">{waiting.map((t,i)=><div className={'token '+(i===0?'next':'')} key={t.id}><div className="position">{i+1}</div><div className="token-main"><strong>{t.token_number}</strong><span>{t.person_name}</span></div><div className="wait">{formatWait(t.created_at)}</div><button className="mini" disabled={i===0||busy} onClick={()=>act(`/tokens/${t.id}/move`, 'PUT',{direction:'up'})}><ArrowUp size={16}/></button><button className="mini" disabled={i===waiting.length-1||busy} onClick={()=>act(`/tokens/${t.id}/move`, 'PUT',{direction:'down'})}><ArrowDown size={16}/></button><button className="mini danger" disabled={busy} onClick={()=>act(`/tokens/${t.id}/cancel`)}><Trash2 size={16}/></button></div>)}</div>}</div><Analytics data={analytics}/></div></section>}
function Analytics({data}){if(!data)return null;return <div className="panel analytics"><div className="panel-head"><div><h3>Analytics</h3><p>Queue performance</p></div></div><div className="analytics-stats"><div><span>Avg wait</span><strong>{Number(data.avgWaitMinutes).toFixed(1)}m</strong></div><div><span>Served</span><strong>{data.stats.served||0}</strong></div><div><span>Cancelled</span><strong>{data.stats.cancelled||0}</strong></div></div><div className="chart"><ResponsiveContainer width="100%" height={190}><LineChart data={data.trend}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="day"/><YAxis allowDecimals={false}/><Tooltip/><Line type="monotone" dataKey="count" stroke="#5b5bd6" strokeWidth={3}/></LineChart></ResponsiveContainer></div></div>}
function Empty({text}){return <div className="empty">{text}</div>}
function formatWait(created){const mins=Math.max(0,Math.floor((Date.now()-new Date(created).getTime())/60000));return mins<1?'Now':`${mins}m`}

createRoot(document.getElementById('root')).render(<App/>);
