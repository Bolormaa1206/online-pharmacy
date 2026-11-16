import React, {useEffect, useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {
  Search, ShoppingCart, MapPin, UserRound, ClipboardList, ShieldCheck,
  Package, Plus, Minus, CheckCircle2, XCircle, HeartPulse, Stethoscope,
  LayoutDashboard, FileText, UsersRound,
} from 'lucide-react';
import './style.css';

const API = import.meta.env.VITE_API_URL || '/api';
const defaultValidUntil = () => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

async function request(path, options = {}) {
  const token = localStorage.getItem('pharmacy_token');
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
      ...options.headers,
    },
  });
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw Error('API сервер буруу хариу өглөө. Backend болон frontend server-ээ дахин асаана уу.');
  }
  let body;
  try { body = await res.json(); } catch { throw Error('API хариуг уншиж чадсангүй'); }
  if (!res.ok) throw Error(typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail));
  return body;
}

const money = n => new Intl.NumberFormat('mn-MN').format(n) + ' ₮';
const roleName = role => ({customer: 'Хэрэглэгч', doctor: 'Эмч', staff: 'Эм зүйч', admin: 'Админ'}[role] || role);
const prescriptionStatus = status => ({active: 'Хүчинтэй', reserved: 'Захиалгад хадгалсан', used: 'Ашигласан', expired: 'Хугацаа дууссан'}[status] || status);

function App() {
  const [page, setPage] = useState('catalog');
  const [medicines, setMedicines] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [pharmacies, setPharmacies] = useState([]);
  const [q, setQ] = useState('');
  const [cart, setCart] = useState([]);
  const [token, setToken] = useState(localStorage.getItem('pharmacy_token'));
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({name: '', email: '', password: ''});
  const [pickup, setPickup] = useState(true);
  const [address, setAddress] = useState('');
  const [orders, setOrders] = useState([]);
  const [myPrescriptions, setMyPrescriptions] = useState([]);
  const [staffOrders, setStaffOrders] = useState([]);
  const [staffInventory, setStaffInventory] = useState([]);
  const [patients, setPatients] = useState([]);
  const [doctorPrescriptions, setDoctorPrescriptions] = useState([]);
  const [adminSummary, setAdminSummary] = useState(null);
  const [rxForm, setRxForm] = useState({patient_email: '', medicine_id: '', dosage: '', quantity: 1, instructions: '', valid_until: defaultValidUntil(), note: ''});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  function message(text, kind = 'notice') {
    setNotice(kind === 'notice' ? text : '');
    setError(kind === 'error' ? text : '');
  }

  async function refresh() {
    try {
      const [m, i, p] = await Promise.all([request('/medicines'), request('/inventory'), request('/pharmacies')]);
      if (!Array.isArray(m) || !Array.isArray(i) || !Array.isArray(p)) throw Error('API өгөгдлийн формат буруу байна');
      setMedicines(m); setInventory(i); setPharmacies(p);
    } catch (e) { message(e.message, 'error'); }
  }

  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (token) {
      request('/me').then(setUser).catch(() => {
        localStorage.removeItem('pharmacy_token'); setToken(null); setUser(null);
      });
    }
  }, [token]);
  useEffect(() => {
    if (!user) return;
    if (page === 'orders' && user.role === 'customer') loadOrders();
    if (page === 'prescriptions' && user.role === 'customer') loadMyPrescriptions();
    if (page === 'staff' && user.role === 'staff') loadStaff();
    if (page === 'doctor' && user.role === 'doctor') loadDoctor();
    if (page === 'admin' && user.role === 'admin') loadAdmin();
  }, [page, user]);

  async function loadOrders() {
    try { setOrders(await request('/orders/mine')); } catch (e) { message(e.message, 'error'); }
  }
  async function loadMyPrescriptions() {
    try { setMyPrescriptions(await request('/prescriptions/mine')); } catch (e) { message(e.message, 'error'); }
  }
  async function loadStaff() {
    try {
      const [incoming, stock] = await Promise.all([request('/staff/orders'), request('/staff/inventory')]);
      setStaffOrders(incoming); setStaffInventory(stock);
    } catch (e) { message(e.message, 'error'); }
  }
  async function loadDoctor() {
    try {
      const [registeredPatients, prescriptions] = await Promise.all([request('/doctor/patients'), request('/doctor/prescriptions')]);
      setPatients(registeredPatients); setDoctorPrescriptions(prescriptions);
      setRxForm(prev => ({...prev, patient_email: prev.patient_email || registeredPatients[0]?.email || ''}));
    } catch (e) { message(e.message, 'error'); }
  }
  async function loadAdmin() {
    try { setAdminSummary(await request('/admin/summary')); } catch (e) { message(e.message, 'error'); }
  }

  async function submitAuth(e) {
    e.preventDefault(); setBusy(true);
    try {
      const payload = authMode === 'login' ? {email: authForm.email, password: authForm.password} : authForm;
      const result = await request(authMode === 'login' ? '/login' : '/register', {method: 'POST', body: JSON.stringify(payload)});
      localStorage.setItem('pharmacy_token', result.token);
      setToken(result.token); setUser(result.user); message('Амжилттай нэвтэрлээ');
      setPage({doctor: 'doctor', admin: 'admin', staff: 'staff'}[result.user.role] || 'catalog');
    } catch (e) { message(e.message, 'error'); }
    finally { setBusy(false); }
  }

  function logout() {
    localStorage.removeItem('pharmacy_token'); setToken(null); setUser(null); setPage('catalog'); message('Системээс гарлаа');
  }

  function add(item, medicine) {
    if (!user) { setPage('login'); return; }
    if (user.role !== 'customer') { message('Зөвхөн хэрэглэгч захиалга үүсгэнэ', 'error'); return; }
    if (item.stock <= 0) { message('Үлдэгдэлгүй', 'error'); return; }
    setCart(prev => {
      const old = prev.find(x => x.pharmacy_id === item.pharmacy_id && x.medicine_id === item.medicine_id);
      return old
        ? prev.map(x => x === old ? {...x, quantity: Math.min(item.stock, x.quantity + 1)} : x)
        : [...prev, {pharmacy_id: item.pharmacy_id, medicine_id: item.medicine_id, quantity: 1, price: item.price, name: medicine.name, pharmacy_name: item.pharmacy_name, prescription_required: medicine.prescription_required, stock: item.stock}];
    });
    message(medicine.prescription_required ? 'Сагсанд нэмлээ. Захиалах үед цахим жорыг автоматаар шалгана.' : 'Сагсанд нэмлээ');
  }

  function changeQty(target, diff) {
    setCart(prev => prev.map(x => x === target ? {...x, quantity: Math.min(x.stock, Math.max(0, x.quantity + diff))} : x).filter(x => x.quantity > 0));
  }

  async function checkout() {
    if (!user) { setPage('login'); return; }
    setBusy(true);
    try {
      const created = await request('/orders', {method: 'POST', body: JSON.stringify({items: cart.map(({pharmacy_id, medicine_id, quantity}) => ({pharmacy_id, medicine_id, quantity})), pickup, address, prescription_note: ''})});
      setCart([]); setAddress(''); message(`${created.length} эмийн санд захиалга илгээлээ. Эм зүйч баталгаажуулна.`); setPage('orders'); await loadOrders();
    } catch (e) { message(e.message, 'error'); }
    finally { setBusy(false); }
  }

  async function createPrescription(e) {
    e.preventDefault(); setBusy(true);
    try {
      const payload = {
        patient_email: rxForm.patient_email,
        valid_until: rxForm.valid_until,
        note: rxForm.note,
        items: [{medicine_id: Number(rxForm.medicine_id), dosage: rxForm.dosage, quantity: Number(rxForm.quantity), instructions: rxForm.instructions}],
      };
      await request('/doctor/prescriptions', {method: 'POST', body: JSON.stringify(payload)});
      setRxForm(prev => ({...prev, medicine_id: '', dosage: '', quantity: 1, instructions: '', valid_until: defaultValidUntil(), note: ''}));
      await loadDoctor(); message('Цахим жорыг өвчтөний бүртгэл рүү амжилттай илгээлээ');
    } catch (e) { message(e.message, 'error'); }
    finally { setBusy(false); }
  }

  async function decide(id, decision) {
    setBusy(true);
    try {
      await request(`/staff/orders/${id}/${decision}`, {method: 'PATCH'});
      await Promise.all([loadStaff(), refresh()]); message('Захиалгын төлөв шинэчлэгдлээ');
    } catch (e) { message(e.message, 'error'); }
    finally { setBusy(false); }
  }

  async function updateStock(inv) {
    const value = window.prompt(`${inv.pharmacy_name}: шинэ үлдэгдэл`, String(inv.stock));
    if (value === null) return;
    const stock = Number(value);
    if (!Number.isInteger(stock) || stock < 0) { message('Бүхэл эерэг тоо оруулна уу', 'error'); return; }
    try {
      await request(`/staff/inventory/${inv.id}`, {method: 'PATCH', body: JSON.stringify({stock, price: inv.price, expiry: inv.expiry})});
      await Promise.all([loadStaff(), refresh()]); message('Нөөц шинэчлэгдлээ');
    } catch (e) { message(e.message, 'error'); }
  }

  const filtered = useMemo(() => medicines.filter(m => (m.name + ' ' + m.category).toLowerCase().includes(q.toLowerCase())), [medicines, q]);
  const rxMedicines = medicines.filter(m => m.prescription_required);
  const total = cart.reduce((sum, x) => sum + x.price * x.quantity, 0);
  const count = cart.reduce((sum, x) => sum + x.quantity, 0);
  const nav = [
    ['catalog', 'Эм хайх', Search],
    ['pharmacies', 'Эмийн сан', MapPin],
    ...(!user || user.role === 'customer' ? [['cart', `Сагс (${count})`, ShoppingCart]] : []),
    ...(user?.role === 'customer' ? [['prescriptions', 'Миний цахим жор', FileText], ['orders', 'Миний захиалга', ClipboardList]] : []),
    ...(user?.role === 'doctor' ? [['doctor', 'Эмчийн хэсэг', Stethoscope]] : []),
    ...(user?.role === 'staff' ? [['staff', 'Эм зүйч', ShieldCheck]] : []),
    ...(user?.role === 'admin' ? [['admin', 'Админ', LayoutDashboard]] : []),
  ];

  return <>
    <header><div className="navwrap">
      <button className="brand" onClick={() => setPage('catalog')}><span className="brand-icon"><HeartPulse size={22}/></span><span>Эмийн сан <small>Онлайн захиалгын систем</small></span></button>
      <nav>{nav.map(([key, label, Icon]) => <button key={key} className={page === key ? 'selected' : ''} onClick={() => {
        if (key === 'cart' && !user) setPage('login'); else setPage(key);
      }}><Icon size={17}/><span>{label}</span></button>)}</nav>
      <button className="account" onClick={() => user ? logout() : setPage('login')}><UserRound size={17}/>{user ? `${user.name} · Гарах` : 'Нэвтрэх'}</button>
    </div></header>

    <main>
      <div className="alertspace">
        {notice && <div className="alert success"><CheckCircle2 size={18}/>{notice}<button onClick={() => setNotice('')}>×</button></div>}
        {error && <div className="alert failure"><XCircle size={18}/>{error}<button onClick={() => setError('')}>×</button></div>}
      </div>

      {page === 'catalog' && <>
        <section className="hero"><div><span className="eyebrow">ДИПЛОМЫН ТУРШИЛТЫН СИСТЕМ</span><h1>Хэрэгтэй эмээ нэг дороос<br/><em>хайж, харьцуулж, захиалаарай.</em></h1><p>Эмийн сангуудын үнэ, үлдэгдэл, байршлыг харьцуулан захиалга үүсгэх боломжтой.</p><div className="search"><Search color="#64748b" size={20}/><input value={q} onChange={e => setQ(e.target.value)} placeholder="Эмийн нэр эсвэл төрлөөр хайх..."/></div></div><div className="hero-art"><span>✚</span><p>Таны эрүүл мэнд<br/>бидний анхааралд</p></div></section>
        <div className="heading"><div><h2>Эмийн бүтээгдэхүүнүүд</h2><p>{filtered.length} бүтээгдэхүүн · Үнэ болон үлдэгдэл нь туршилтын өгөгдөл</p></div></div>
        <div className="productgrid">{filtered.map(m => {
          const offers = inventory.filter(i => i.medicine_id === m.id && i.stock > 0 && i.expiry >= new Date().toISOString().slice(0, 10));
          return <article className="product" key={m.id}><div className="medicine-icon"><Package size={34}/></div><div className="product-body"><span className="category">{m.category}</span><h3>{m.name}</h3>{m.prescription_required && <span className="rx">Цахим жор шаардлагатай</span>}<p className="muted">{offers.length} эмийн санд байна</p><div className="offers">{offers.length ? offers.map(o => <div className="offer" key={o.id}><div><b>{o.pharmacy_name}</b><small>Үлдэгдэл: {o.stock} ширхэг</small></div><div className="offer-end"><strong>{money(o.price)}</strong><button className="smallbtn" onClick={() => add(o, m)} title="Сагсанд нэмэх"><Plus size={17}/></button></div></div>) : <p className="muted">Одоогоор үлдэгдэлгүй</p>}</div></div></article>;
        })}</div>
      </>}

      {page === 'pharmacies' && <><div className="heading"><div><h1>Эмийн сангууд</h1><p>Доорх хаяг, цэгүүд нь зөвхөн туршилтын жишээ байршил юм.</p></div></div><div className="pharmacygrid">{pharmacies.map(p => <div className="panel" key={p.id}><div className="pin"><MapPin/></div><h3>{p.name}</h3><p>{p.address}</p><div className="mapframe"><iframe loading="lazy" title={p.name} src={`https://www.openstreetmap.org/export/embed.html?bbox=${p.lng - .008}%2C${p.lat - .005}%2C${p.lng + .008}%2C${p.lat + .005}&layer=mapnik&marker=${p.lat}%2C${p.lng}`}/></div><button className="outline" onClick={() => {setPage('catalog'); setQ('');}}>Эмүүдийг харах</button></div>)}</div></>}

      {page === 'login' && <div className="auth panel"><div className="pin"><UserRound/></div><h1>{authMode === 'login' ? 'Нэвтрэх' : 'Бүртгүүлэх'}</h1><p>Хэрэглэгч бүр өөрийн эрхээр нэвтэрнэ.</p><form onSubmit={submitAuth}>{authMode === 'register' && <label>Нэр<input required minLength="2" value={authForm.name} onChange={e => setAuthForm({...authForm, name: e.target.value})}/></label>}<label>Имэйл<input required type="email" value={authForm.email} onChange={e => setAuthForm({...authForm, email: e.target.value})}/></label><label>Нууц үг<input required type="password" minLength="8" value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})}/></label><button disabled={busy} className="primary" type="submit">{authMode === 'login' ? 'Нэвтрэх' : 'Бүртгүүлэх'}</button></form><button className="link" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>{authMode === 'login' ? 'Шинэ хэрэглэгч үү? Бүртгүүлэх' : 'Бүртгэлтэй юу? Нэвтрэх'}</button><div className="demo"><b>Туршилтын нэвтрэлт</b><br/>Хэрэглэгч: customer@demo.mn / DemoCustomer123!<br/>Эмч: doctor@demo.mn / DemoDoctor123!<br/>Админ: admin@demo.mn / DemoAdmin123!<br/>Эм зүйч: staff@demo.mn / DemoStaff123!</div></div>}

      {page === 'cart' && <><div className="heading"><div><h1>Миний сагс</h1><p>Өөр өөр эмийн сангаас сонгосон эмүүд тус тусдаа захиалга болно.</p></div></div>{cart.length ? <div className="twocol"><div className="panel">{cart.map((x, i) => <div className="cartline" key={i}><div className="medicine-icon tiny"><Package/></div><div className="grow"><b>{x.name}</b><small>{x.pharmacy_name}</small>{x.prescription_required && <span className="rx inline-rx">Цахим жор</span>}<strong>{money(x.price * x.quantity)}</strong></div><div className="quantity"><button onClick={() => changeQty(x, -1)}><Minus size={14}/></button>{x.quantity}<button onClick={() => changeQty(x, 1)}><Plus size={14}/></button></div></div>)}</div><div className="panel checkout"><h2>Захиалгын мэдээлэл</h2><div className="total"><span>Нийт дүн</span><b>{money(total)}</b></div><label className="radio"><input type="radio" checked={pickup} onChange={() => setPickup(true)}/> Очиж авах</label><label className="radio"><input type="radio" checked={!pickup} onChange={() => setPickup(false)}/> Хүргүүлэх (зөвхөн загвар)</label>{!pickup && <label>Хүргэлтийн хаяг<textarea value={address} onChange={e => setAddress(e.target.value)} placeholder="Хаяг"/></label>}<div className="disclaimer">Жороор олгох эм байвал систем таны эмчээс ирсэн хүчинтэй цахим жорыг автоматаар шалгана. Эм зүйч захиалгыг хянаж баталгаажуулна. Төлбөр, хүргэлт бодитоор хийгдэхгүй.</div><button className="primary" disabled={busy} onClick={checkout}>Захиалга илгээх</button></div></div> : <div className="empty panel"><ShoppingCart size={38}/><h3>Таны сагс хоосон байна</h3><button className="primary" onClick={() => setPage('catalog')}>Эм хайх</button></div>}</>}

      {page === 'prescriptions' && user?.role === 'customer' && <><div className="heading"><div><h1>Миний цахим жор</h1><p>Эмчийн бичиж илгээсэн жор болон ашиглалтын төлөв</p></div><button className="outline" onClick={loadMyPrescriptions}>Шинэчлэх</button></div>{myPrescriptions.length ? myPrescriptions.map(p => <PrescriptionCard key={p.id} prescription={p}/>) : <div className="empty panel"><FileText size={38}/><h3>Цахим жор ирээгүй байна</h3><p>Эмч таны бүртгэлтэй имэйл рүү жор илгээнэ.</p></div>}</>}

      {page === 'orders' && user?.role === 'customer' && <><div className="heading"><div><h1>Миний захиалгууд</h1><p>Захиалгын төлөв болон эмийн сангийн мэдээлэл</p></div><button className="outline" onClick={loadOrders}>Шинэчлэх</button></div>{orders.length ? orders.map(o => <OrderCard key={o.id} order={o}/>) : <div className="empty panel">Одоогоор захиалга байхгүй.</div>}</>}

      {page === 'doctor' && user?.role === 'doctor' && <><div className="heading"><div><h1>Эмчийн хэсэг</h1><p>Бүртгэлтэй өвчтөнд жороор олгох эмийн цахим жор бичиж илгээнэ.</p></div><button className="outline" onClick={loadDoctor}>Шинэчлэх</button></div><div className="twocol doctor-layout"><form className="panel form-grid" onSubmit={createPrescription}><div className="section-title"><div className="pin"><Stethoscope/></div><div><h2>Шинэ цахим жор</h2><p>Илгээсний дараа өвчтөний “Миний цахим жор” хэсэгт шууд харагдана.</p></div></div><label>Өвчтөн<select required value={rxForm.patient_email} onChange={e => setRxForm({...rxForm, patient_email: e.target.value})}><option value="">Өвчтөн сонгох</option>{patients.map(p => <option key={p.id} value={p.email}>{p.name} · {p.email}</option>)}</select></label><label>Жороор олгох эм<select required value={rxForm.medicine_id} onChange={e => setRxForm({...rxForm, medicine_id: e.target.value})}><option value="">Эм сонгох</option>{rxMedicines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><div className="form-row"><label>Тун, давтамж<input required minLength="2" value={rxForm.dosage} onChange={e => setRxForm({...rxForm, dosage: e.target.value})} placeholder="Ж: 500 мг, өдөрт 3 удаа"/></label><label>Тоо ширхэг<input required type="number" min="1" max="100" value={rxForm.quantity} onChange={e => setRxForm({...rxForm, quantity: e.target.value})}/></label></div><label>Хэрэглэх заавар<textarea value={rxForm.instructions} onChange={e => setRxForm({...rxForm, instructions: e.target.value})} placeholder="Ж: Хоолны дараа 7 хоног"/></label><label>Хүчинтэй огноо<input required type="date" min={new Date().toISOString().slice(0, 10)} value={rxForm.valid_until} onChange={e => setRxForm({...rxForm, valid_until: e.target.value})}/></label><label>Эмчийн тэмдэглэл<textarea value={rxForm.note} onChange={e => setRxForm({...rxForm, note: e.target.value})} placeholder="Нэмэлт тайлбар (заавал биш)"/></label><button className="primary" disabled={busy || !patients.length} type="submit">Цахим жор илгээх</button>{!patients.length && <p className="form-warning">Жор илгээхийн өмнө өвчтөн хэрэглэгчийн бүртгэл үүсгэсэн байх шаардлагатай.</p>}</form><div><h2 className="list-heading">Миний бичсэн жорууд</h2>{doctorPrescriptions.length ? doctorPrescriptions.map(p => <PrescriptionCard key={p.id} prescription={p} showPatient/>) : <div className="panel empty compact">Одоогоор жор бичээгүй байна.</div>}</div></div></>}

      {page === 'staff' && user?.role === 'staff' && <><div className="heading"><div><h1>Эм зүйчийн удирдлага</h1><p>{staffInventory[0]?.pharmacy_name || 'Харьяалах эмийн сан'} · Захиалга хянах, батлах, татгалзах болон нөөц шинэчлэх</p></div><button className="outline" onClick={() => {loadStaff(); refresh();}}>Шинэчлэх</button></div><h2>Ирсэн захиалгууд</h2>{staffOrders.length ? staffOrders.map(o => <div key={o.id}><OrderCard order={o}/>{o.status === 'pending' && <div className="actions"><button className="primary" disabled={busy} onClick={() => decide(o.id, 'approve')}>Баталгаажуулах</button><button className="danger" disabled={busy} onClick={() => decide(o.id, 'reject')}>Татгалзах</button></div>}</div>) : <div className="panel">Ирсэн захиалга байхгүй байна.</div>}<h2 className="space">Эмийн нөөц</h2><div className="panel table-scroll"><table><thead><tr><th>Эмийн сан</th><th>Эм</th><th>Үнэ</th><th>Үлдэгдэл</th><th>Дуусах хугацаа</th><th></th></tr></thead><tbody>{staffInventory.map(inv => <tr key={inv.id}><td>{inv.pharmacy_name}</td><td>{medicines.find(m => m.id === inv.medicine_id)?.name}</td><td>{money(inv.price)}</td><td>{inv.stock}</td><td>{inv.expiry}</td><td><button className="outline" onClick={() => updateStock(inv)}>Засах</button></td></tr>)}</tbody></table></div></>}

      {page === 'admin' && user?.role === 'admin' && <><div className="heading"><div><h1>Админы хяналтын хэсэг</h1><p>Системийн хэрэглэгч, захиалга, жор болон эмийн сангийн нэгдсэн мэдээлэл</p></div><button className="outline" onClick={loadAdmin}>Шинэчлэх</button></div>{adminSummary && <><div className="statgrid"><StatCard icon={UsersRound} label="Нийт хэрэглэгч" value={adminSummary.counts.users}/><StatCard icon={UserRound} label="Үйлчлүүлэгч" value={adminSummary.counts.customers}/><StatCard icon={ClipboardList} label="Захиалга" value={adminSummary.counts.orders}/><StatCard icon={FileText} label="Цахим жор" value={adminSummary.counts.prescriptions}/><StatCard icon={MapPin} label="Эмийн сан" value={adminSummary.counts.pharmacies}/></div><h2 className="space">Хэрэглэгчид</h2><div className="panel table-scroll"><table><thead><tr><th>ID</th><th>Нэр</th><th>Имэйл</th><th>Эрх</th><th>Эмийн сангийн ID</th></tr></thead><tbody>{adminSummary.users.map(u => <tr key={u.id}><td>#{u.id}</td><td>{u.name}</td><td>{u.email}</td><td><span className={`role role-${u.role}`}>{roleName(u.role)}</span></td><td>{u.pharmacy_id || '—'}</td></tr>)}</tbody></table></div><h2 className="space">Сүүлийн захиалгууд</h2>{adminSummary.orders.length ? adminSummary.orders.map(o => <OrderCard key={o.id} order={o}/>) : <div className="panel">Захиалга байхгүй байна.</div>}</>}</>}
    </main>
    <footer>© 2026 Онлайн эмийн сангийн захиалгын веб систем · Дипломын туршилтын прототип · Бодит эм худалдах үйлчилгээ биш</footer>
  </>;
}

function PrescriptionCard({prescription: p, showPatient = false}) {
  return <div className="panel prescription-card"><div className="orderhead"><div><h3>Цахим жор #{p.id}</h3><small>{new Date(p.created_at + 'Z').toLocaleString('mn-MN')} · Эмч: {p.doctor_name}</small>{showPatient && <small className="block">Өвчтөн: {p.patient_name} · {p.patient_email}</small>}</div><span className="valid-until">Хүчинтэй: {p.valid_until}</span></div>{p.items.map(item => <div className="rx-item" key={item.id}><div><b>{item.medicine_name}</b><small>{item.dosage} · {item.quantity} ширхэг</small>{item.instructions && <p>{item.instructions}</p>}</div><span className={`rx-status ${item.status}`}>{prescriptionStatus(item.status)}</span></div>)}{p.note && <p className="note">Эмчийн тэмдэглэл: {p.note}</p>}</div>;
}

function OrderCard({order: o}) {
  return <div className="panel order"><div className="orderhead"><div><h3>Захиалга #{o.id} · {o.pharmacy_name}</h3><small>{new Date(o.created_at + 'Z').toLocaleString('mn-MN')} · {o.customer_name}</small></div><span className={'status ' + o.status}>{o.status === 'pending' ? 'Шалгаж байна' : o.status === 'approved' ? 'Баталгаажсан' : 'Татгалзсан'}</span></div>{o.items.map((x, i) => <div className="orderitem" key={i}><span>{x.name} × {x.quantity}{x.prescription_id && <small className="block rx-link">Цахим жор #{x.prescription_id}</small>}</span><b>{money(x.quantity * x.unit_price)}</b></div>)}<div className="total"><span>{o.pickup ? 'Очиж авах' : 'Хүргүүлэх (туршилт)'}</span><strong>Нийт: {money(o.total)}</strong></div>{o.prescription_note && <p className="muted">Хуучин жорын тэмдэглэл: {o.prescription_note}</p>}</div>;
}

function StatCard({icon: Icon, label, value}) {
  return <div className="panel stat"><div className="pin"><Icon/></div><div><strong>{value}</strong><span>{label}</span></div></div>;
}

createRoot(document.getElementById('root')).render(<App/>);
