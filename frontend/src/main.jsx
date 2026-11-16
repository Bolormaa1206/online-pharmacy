import React, {useEffect, useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {
  Search, ShoppingCart, MapPin, UserRound, ClipboardList, ShieldCheck,
  Package, Plus, Minus, CheckCircle2, XCircle, HeartPulse, Stethoscope,
  LayoutDashboard, FileText, UsersRound, CreditCard, Truck,
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
const prescriptionStatus = status => ({active: 'Хүчинтэй', reserved: 'Эмийн санд хүсэлт илгээсэн', used: 'Эм олгосон', expired: 'Хугацаа дууссан'}[status] || status);
const orderStatus = status => ({pending: 'Эм зүйч шалгаж байна', approved: 'Баталгаажсан · төлбөр хүлээж байна', paid: 'Төлбөр төлсөн', preparing: 'Эмийг бэлтгэж байна', ready: 'Очиж авахад бэлэн', out_for_delivery: 'Хүргэлтэд гарсан', completed: 'Хүлээлгэн өгсөн', rejected: 'Татгалзсан'}[status] || status);

function App() {
  const [page, setPage] = useState('catalog');
  const [medicines, setMedicines] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [pharmacies, setPharmacies] = useState([]);
  const [q, setQ] = useState('');
  const [visibleCount, setVisibleCount] = useState(6);
  const [cart, setCart] = useState([]);
  const [cartNotice, setCartNotice] = useState('');
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
  const [rxForm, setRxForm] = useState({patient_email: '', medicine_id: '', units_per_dose: 1, times_per_day: 2, duration_days: 3, instructions: '', valid_until: defaultValidUntil(), note: ''});
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
  useEffect(() => { setVisibleCount(6); }, [q]);
  useEffect(() => {
    if (!cartNotice) return undefined;
    const timeout = window.setTimeout(() => setCartNotice(''), 2200);
    return () => window.clearTimeout(timeout);
  }, [cartNotice]);
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
    if (medicine.prescription_required) { message('Жороор олгох эмийг “Миний цахим жор” хэсгээс эмийн сан сонгон захиална'); setPage('prescriptions'); return; }
    if (item.stock <= 0) { message('Үлдэгдэлгүй', 'error'); return; }
    setCart(prev => {
      const old = prev.find(x => x.pharmacy_id === item.pharmacy_id && x.medicine_id === item.medicine_id);
      return old
        ? prev.map(x => x === old ? {...x, quantity: Math.min(item.stock, x.quantity + 1)} : x)
        : [...prev, {pharmacy_id: item.pharmacy_id, medicine_id: item.medicine_id, quantity: 1, price: item.price, name: medicine.name, pharmacy_name: item.pharmacy_name, prescription_required: medicine.prescription_required, stock: item.stock}];
    });
    setCartNotice('Сагсанд тань нэмэгдлээ');
  }

  function choosePrescriptionOffer(item, offer) {
    if (!user) { setPage('login'); return; }
    const medicine = medicines.find(m => m.id === item.medicine_id);
    if (!medicine || offer.stock < item.required_packs) { message('Сонгосон эмийн санд жорт бичсэн савлагааны нөөц хүрэлцэхгүй байна', 'error'); return; }
    setCart(prev => [
      ...prev.filter(x => x.prescription_item_id !== item.id),
      {
        pharmacy_id: offer.pharmacy_id,
        medicine_id: item.medicine_id,
        prescription_item_id: item.id,
        quantity: item.required_packs,
        price: offer.price,
        name: item.medicine_name,
        pharmacy_name: offer.pharmacy_name,
        prescription_required: true,
        locked_quantity: true,
        required_units: item.required_units,
        units_per_pack: item.units_per_pack,
        unit_label: item.unit_label,
        stock: offer.stock,
      },
    ]);
    setCartNotice('Жортой эм сагсанд нэмэгдлээ');
    setPage('cart');
  }

  function changeQty(target, diff) {
    setCart(prev => prev.map(x => x === target ? {...x, quantity: Math.min(x.stock, Math.max(0, x.quantity + diff))} : x).filter(x => x.quantity > 0));
  }

  async function checkout() {
    if (!user) { setPage('login'); return; }
    setBusy(true);
    try {
      const created = await request('/orders', {method: 'POST', body: JSON.stringify({items: cart.map(({pharmacy_id, medicine_id, quantity, prescription_item_id}) => ({pharmacy_id, medicine_id, quantity, prescription_item_id})), pickup, address, prescription_note: ''})});
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
        items: [{medicine_id: Number(rxForm.medicine_id), units_per_dose: Number(rxForm.units_per_dose), times_per_day: Number(rxForm.times_per_day), duration_days: Number(rxForm.duration_days), instructions: rxForm.instructions}],
      };
      await request('/doctor/prescriptions', {method: 'POST', body: JSON.stringify(payload)});
      setRxForm(prev => ({...prev, medicine_id: '', units_per_dose: 1, times_per_day: 2, duration_days: 3, instructions: '', valid_until: defaultValidUntil(), note: ''}));
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

  async function pay(id) {
    setBusy(true);
    try {
      await request(`/orders/${id}/pay`, {method: 'PATCH'});
      await loadOrders(); message('Туршилтын төлбөр амжилттай төлөгдлөө. Эмийн сан эмийг бэлтгэнэ.');
    } catch (e) { message(e.message, 'error'); }
    finally { setBusy(false); }
  }

  async function advance(id) {
    setBusy(true);
    try {
      await request(`/staff/orders/${id}/fulfillment/advance`, {method: 'PATCH'});
      await loadStaff(); message('Захиалгын гүйцэтгэлийн төлөв шинэчлэгдлээ');
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
  const visibleMedicines = filtered.slice(0, visibleCount);
  const rxMedicines = medicines.filter(m => m.prescription_required);
  const total = cart.reduce((sum, x) => sum + x.price * x.quantity, 0);
  const deliveryFee = pickup ? 0 : new Set(cart.map(x => x.pharmacy_id)).size * 5000;
  const count = cart.reduce((sum, x) => sum + x.quantity, 0);
  const selectedRxMedicine = medicines.find(m => m.id === Number(rxForm.medicine_id));
  const calculatedUnits = Number(rxForm.units_per_dose) * Number(rxForm.times_per_day) * Number(rxForm.duration_days);
  const calculatedPacks = selectedRxMedicine ? Math.ceil(calculatedUnits / selectedRxMedicine.units_per_pack) : 0;
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
      {cartNotice && <div className="cart-toast"><CheckCircle2 size={19}/><span>{cartNotice}</span></div>}

      {page === 'catalog' && <>
        <section className="hero"><div><span className="eyebrow">ОНЛАЙН ЭМИЙН САНГИЙН СИСТЕМ</span><h1>Хэрэгтэй эмээ нэг дороос<br/><em>хайж, харьцуулж, захиалаарай.</em></h1><p>Эмийн сангуудын үнэ, үлдэгдэл, байршлыг харьцуулан захиалга үүсгэх боломжтой.</p><div className="search"><Search color="#64748b" size={20}/><input value={q} onChange={e => setQ(e.target.value)} placeholder="Эмийн нэр эсвэл төрлөөр хайх..."/></div></div><div className="hero-art"><span>✚</span><p>Та эрүүл мэнддээ<br/>анхаараарай</p></div></section>
        <div className="heading"><div><h2>Эмийн бүтээгдэхүүнүүд</h2><p>{filtered.length} бүтээгдэхүүн · Эмийн сангуудын үнэ болон үлдэгдэл</p></div></div>
        <div className="productgrid">{visibleMedicines.map(m => {
          const offers = inventory.filter(i => i.medicine_id === m.id && i.stock > 0 && i.expiry >= new Date().toISOString().slice(0, 10));
          return <article className="product" key={m.id}><div className="medicine-icon"><Package size={34}/></div><div className="product-body"><span className="category">{m.category}</span><h3>{m.name}</h3><small className="pack-info">1 савлагаа = {m.units_per_pack} {m.unit_label}</small>{m.prescription_required && <span className="rx">Цахим жор шаардлагатай</span>}<p className="muted">{offers.length} эмийн санд байна</p><div className="offers">{offers.length ? offers.map(o => <div className="offer" key={o.id}><div><b>{o.pharmacy_name}</b><small>Үлдэгдэл: {o.stock} савлагаа</small></div><div className="offer-end"><strong>{money(o.price)}</strong><button className="smallbtn" onClick={() => add(o, m)} title={m.prescription_required ? 'Цахим жороос сонгох' : 'Сагсанд нэмэх'}><Plus size={17}/></button></div></div>) : <p className="muted">Одоогоор үлдэгдэлгүй</p>}</div></div></article>;
        })}</div>
        {visibleCount < filtered.length && <div className="load-more-wrap"><button className="load-more" onClick={() => setVisibleCount(count => count + 6)}>Илүү ихийг харах <span>{Math.min(6, filtered.length - visibleCount)}</span></button></div>}
      </>}

      {page === 'pharmacies' && <><div className="heading"><div><h1>Эмийн сангууд</h1><p>Салбаруудын хаяг болон байршлын мэдээлэл</p></div></div><div className="pharmacygrid">{pharmacies.map(p => <div className="panel" key={p.id}><div className="pin"><MapPin/></div><h3>{p.name}</h3><p>{p.address}</p><div className="mapframe"><iframe loading="lazy" title={p.name} src={`https://www.openstreetmap.org/export/embed.html?bbox=${p.lng - .008}%2C${p.lat - .005}%2C${p.lng + .008}%2C${p.lat + .005}&layer=mapnik&marker=${p.lat}%2C${p.lng}`}/></div><button className="outline" onClick={() => {setPage('catalog'); setQ('');}}>Эмүүдийг харах</button></div>)}</div></>}

      {page === 'login' && <div className="auth panel"><div className="pin"><UserRound/></div><h1>{authMode === 'login' ? 'Нэвтрэх' : 'Бүртгүүлэх'}</h1><p>Хэрэглэгч бүр өөрийн эрхээр нэвтэрнэ.</p><form onSubmit={submitAuth}>{authMode === 'register' && <label>Нэр<input required minLength="2" value={authForm.name} onChange={e => setAuthForm({...authForm, name: e.target.value})}/></label>}<label>Имэйл<input required type="email" value={authForm.email} onChange={e => setAuthForm({...authForm, email: e.target.value})}/></label><label>Нууц үг<input required type="password" minLength="8" value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})}/></label><button disabled={busy} className="primary" type="submit">{authMode === 'login' ? 'Нэвтрэх' : 'Бүртгүүлэх'}</button></form><button className="link" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>{authMode === 'login' ? 'Шинэ хэрэглэгч үү? Бүртгүүлэх' : 'Бүртгэлтэй юу? Нэвтрэх'}</button></div>}

      {page === 'cart' && <><div className="heading"><div><h1>Миний сагс</h1><p>Өөр өөр эмийн сангаас сонгосон эмүүд тус тусдаа захиалга, хүргэлт болно.</p></div></div>{cart.length ? <div className="twocol"><div className="panel">{cart.map((x, i) => <div className="cartline" key={i}><div className="medicine-icon tiny"><Package/></div><div className="grow"><b>{x.name}</b><small>{x.pharmacy_name}</small>{x.prescription_required && <><span className="rx inline-rx">Цахим жор</span><small>Шаардлагатай: {x.required_units} {x.unit_label} · {x.quantity} савлагаа</small></>}<strong>{money(x.price * x.quantity)}</strong></div>{x.locked_quantity ? <span className="fixed-qty">{x.quantity} савлагаа</span> : <div className="quantity"><button onClick={() => changeQty(x, -1)}><Minus size={14}/></button>{x.quantity}<button onClick={() => changeQty(x, 1)}><Plus size={14}/></button></div>}</div>)}</div><div className="panel checkout"><h2>Захиалгын мэдээлэл</h2><div className="summary-line"><span>Эмийн дүн</span><b>{money(total)}</b></div><label className="radio"><input type="radio" checked={pickup} onChange={() => setPickup(true)}/> Очиж авах</label><label className="radio"><input type="radio" checked={!pickup} onChange={() => setPickup(false)}/> Хүргүүлэх</label>{!pickup && <><label>Хүргэлтийн хаяг<textarea value={address} onChange={e => setAddress(e.target.value)} placeholder="Хаяг"/></label><div className="summary-line"><span>Хүргэлт · {new Set(cart.map(x => x.pharmacy_id)).size} эмийн сан</span><b>{money(deliveryFee)}</b></div></>}<div className="total"><span>Нийт төлөх</span><b>{money(total + deliveryFee)}</b></div><div className="disclaimer">Эмийн сан бүр тусдаа захиалга үүсгэнэ. Эм зүйч баталгаажуулсны дараа төлбөр төлнө. Хүргэлт сонговол эмийн сан бүрийн 5,000₮ хүргэлтийн төлбөр тусдаа тооцогдоно. Энэ дипломын хувилбарт төлбөр туршилтаар баталгаажна.</div><button className="primary" disabled={busy} onClick={checkout}>Эмийн санд хүсэлт илгээх</button></div></div> : <div className="empty panel"><ShoppingCart size={38}/><h3>Таны сагс хоосон байна</h3><button className="primary" onClick={() => setPage('catalog')}>Эм хайх</button></div>}</>}

      {page === 'prescriptions' && user?.role === 'customer' && <><div className="heading"><div><h1>Миний цахим жор</h1><p>Жор дээр дарж эмийн сан, үнэ, үлдэгдлээс сонгон хүсэлт илгээнэ.</p></div><button className="outline" onClick={loadMyPrescriptions}>Шинэчлэх</button></div>{myPrescriptions.length ? myPrescriptions.map(p => <PrescriptionCard key={p.id} prescription={p} inventory={inventory} onChoose={choosePrescriptionOffer}/>) : <div className="empty panel"><FileText size={38}/><h3>Цахим жор ирээгүй байна</h3><p>Эмч таны бүртгэлтэй имэйл рүү жор илгээнэ.</p></div>}</>}

      {page === 'orders' && user?.role === 'customer' && <><div className="heading"><div><h1>Миний захиалгууд</h1><p>Баталгаажсан захиалгын төлбөрийг эхэлж төлөөд, дараа нь эмээ авна.</p></div><button className="outline" onClick={loadOrders}>Шинэчлэх</button></div>{orders.length ? orders.map(o => <div key={o.id}><OrderCard order={o}/>{o.status === 'approved' && <div className="actions"><button className="primary" disabled={busy} onClick={() => pay(o.id)}><CreditCard size={17}/> Туршилтын төлбөр төлөх · {money(o.total)}</button></div>}</div>) : <div className="empty panel">Одоогоор захиалга байхгүй.</div>}</>}

      {page === 'doctor' && user?.role === 'doctor' && <><div className="heading"><div><h1>Эмчийн хэсэг</h1><p>Тунгийн давтамж, хоногоор нийт хэрэглэх хэмжээ болон савлагааг автоматаар тооцно.</p></div><button className="outline" onClick={loadDoctor}>Шинэчлэх</button></div><div className="twocol doctor-layout"><form className="panel form-grid" onSubmit={createPrescription}><div className="section-title"><div className="pin"><Stethoscope/></div><div><h2>Шинэ цахим жор</h2><p>Илгээсний дараа өвчтөний “Миний цахим жор” хэсэгт шууд харагдана.</p></div></div><label>Өвчтөн<select required value={rxForm.patient_email} onChange={e => setRxForm({...rxForm, patient_email: e.target.value})}><option value="">Өвчтөн сонгох</option>{patients.map(p => <option key={p.id} value={p.email}>{p.name} · {p.email}</option>)}</select></label><label>Жороор олгох эм<select required value={rxForm.medicine_id} onChange={e => setRxForm({...rxForm, medicine_id: e.target.value})}><option value="">Эм сонгох</option>{rxMedicines.map(m => <option key={m.id} value={m.id}>{m.name} · {m.units_per_pack} {m.unit_label}/савлагаа</option>)}</select></label><div className="dose-grid"><label>Нэг удаад<input required type="number" min="1" max="20" value={rxForm.units_per_dose} onChange={e => setRxForm({...rxForm, units_per_dose: e.target.value})}/><small>{selectedRxMedicine?.unit_label || 'ширхэг'}</small></label><label>Өдөрт<input required type="number" min="1" max="12" value={rxForm.times_per_day} onChange={e => setRxForm({...rxForm, times_per_day: e.target.value})}/><small>удаа</small></label><label>Хугацаа<input required type="number" min="1" max="90" value={rxForm.duration_days} onChange={e => setRxForm({...rxForm, duration_days: e.target.value})}/><small>хоног</small></label></div>{selectedRxMedicine && <div className="calculation"><b>{rxForm.units_per_dose} × {rxForm.times_per_day} × {rxForm.duration_days} = {calculatedUnits} {selectedRxMedicine.unit_label}</b><span>1 савлагаа = {selectedRxMedicine.units_per_pack} {selectedRxMedicine.unit_label} → олгох: <strong>{calculatedPacks} савлагаа</strong></span></div>}<label>Хэрэглэх заавар<textarea value={rxForm.instructions} onChange={e => setRxForm({...rxForm, instructions: e.target.value})} placeholder="Ж: Хоолны дараа ууна"/></label><label>Хүчинтэй огноо<input required type="date" min={new Date().toISOString().slice(0, 10)} value={rxForm.valid_until} onChange={e => setRxForm({...rxForm, valid_until: e.target.value})}/></label><label>Эмчийн тэмдэглэл<textarea value={rxForm.note} onChange={e => setRxForm({...rxForm, note: e.target.value})} placeholder="Нэмэлт тайлбар (заавал биш)"/></label><button className="primary" disabled={busy || !patients.length} type="submit">Цахим жор илгээх</button>{!patients.length && <p className="form-warning">Жор илгээхийн өмнө өвчтөн хэрэглэгчийн бүртгэл үүсгэсэн байх шаардлагатай.</p>}</form><div><h2 className="list-heading">Миний бичсэн жорууд</h2>{doctorPrescriptions.length ? doctorPrescriptions.map(p => <PrescriptionCard key={p.id} prescription={p} showPatient/>) : <div className="panel empty compact">Одоогоор жор бичээгүй байна.</div>}</div></div></>}

      {page === 'staff' && user?.role === 'staff' && <><div className="heading"><div><h1>Эм зүйчийн удирдлага</h1><p>{staffInventory[0]?.pharmacy_name || 'Харьяалах эмийн сан'} · Зөвхөн өөрийн эмийн санд ирсэн хүсэлтийг шалгаж, олголтыг дуусгана.</p></div><button className="outline" onClick={() => {loadStaff(); refresh();}}>Шинэчлэх</button></div><h2>Ирсэн захиалгууд</h2>{staffOrders.length ? staffOrders.map(o => <div key={o.id}><OrderCard order={o}/>{o.status === 'pending' && <div className="actions"><button className="primary" disabled={busy} onClick={() => decide(o.id, 'approve')}>Жор шалгаж баталгаажуулах</button><button className="danger" disabled={busy} onClick={() => decide(o.id, 'reject')}>Татгалзах</button></div>}{['paid','preparing','ready','out_for_delivery'].includes(o.status) && <div className="actions"><button className="primary" disabled={busy} onClick={() => advance(o.id)}>{o.status === 'paid' ? 'Бэлтгэж эхлэх' : o.status === 'preparing' ? (o.pickup ? 'Авахад бэлэн болгох' : 'Хүргэлтэд гаргах') : o.pickup ? 'Хүлээлгэн өгсөн' : 'Хүргэгдсэн'}</button></div>}</div>) : <div className="panel">Ирсэн захиалга байхгүй байна.</div>}<h2 className="space">Эмийн нөөц</h2><div className="panel table-scroll"><table><thead><tr><th>Эмийн сан</th><th>Эм</th><th>Үнэ</th><th>Үлдэгдэл</th><th>Дуусах хугацаа</th><th></th></tr></thead><tbody>{staffInventory.map(inv => <tr key={inv.id}><td>{inv.pharmacy_name}</td><td>{medicines.find(m => m.id === inv.medicine_id)?.name}</td><td>{money(inv.price)}</td><td>{inv.stock} савлагаа</td><td>{inv.expiry}</td><td><button className="outline" onClick={() => updateStock(inv)}>Засах</button></td></tr>)}</tbody></table></div></>}

      {page === 'admin' && user?.role === 'admin' && <><div className="heading"><div><h1>Админы хяналтын хэсэг</h1><p>Системийн хэрэглэгч, захиалга, жор болон эмийн сангийн нэгдсэн мэдээлэл</p></div><button className="outline" onClick={loadAdmin}>Шинэчлэх</button></div>{adminSummary && <><div className="statgrid"><StatCard icon={UsersRound} label="Нийт хэрэглэгч" value={adminSummary.counts.users}/><StatCard icon={UserRound} label="Үйлчлүүлэгч" value={adminSummary.counts.customers}/><StatCard icon={ClipboardList} label="Захиалга" value={adminSummary.counts.orders}/><StatCard icon={FileText} label="Цахим жор" value={adminSummary.counts.prescriptions}/><StatCard icon={MapPin} label="Эмийн сан" value={adminSummary.counts.pharmacies}/></div><h2 className="space">Хэрэглэгчид</h2><div className="panel table-scroll"><table><thead><tr><th>ID</th><th>Нэр</th><th>Имэйл</th><th>Эрх</th><th>Эмийн сангийн ID</th></tr></thead><tbody>{adminSummary.users.map(u => <tr key={u.id}><td>#{u.id}</td><td>{u.name}</td><td>{u.email}</td><td><span className={`role role-${u.role}`}>{roleName(u.role)}</span></td><td>{u.pharmacy_id || '—'}</td></tr>)}</tbody></table></div><h2 className="space">Сүүлийн захиалгууд</h2>{adminSummary.orders.length ? adminSummary.orders.map(o => <OrderCard key={o.id} order={o}/>) : <div className="panel">Захиалга байхгүй байна.</div>}</>}</>}
    </main>
    <footer>© 2026 Онлайн эмийн сангийн захиалгын веб систем</footer>
  </>;
}

function PrescriptionCard({prescription: p, showPatient = false, inventory = [], onChoose}) {
  const [openItem, setOpenItem] = useState(null);
  return <div className="panel prescription-card"><div className="orderhead"><div><h3>Цахим жор #{p.id}</h3><small>{new Date(p.created_at + 'Z').toLocaleString('mn-MN')} · Эмч: {p.doctor_name}</small>{showPatient && <small className="block">Өвчтөн: {p.patient_name} · {p.patient_email}</small>}</div><span className="valid-until">Хүчинтэй: {p.valid_until}</span></div>{p.items.map(item => {
    const offers = inventory.filter(i => i.medicine_id === item.medicine_id && i.stock >= item.required_packs && i.expiry >= new Date().toISOString().slice(0, 10));
    return <div className="rx-item-wrap" key={item.id}><div className="rx-item"><div><b>{item.medicine_name}</b><small>{item.dosage} · Нийт <strong>{item.required_units} {item.unit_label}</strong></small><small>1 савлагаа = {item.units_per_pack} {item.unit_label} · Олгох хэмжээ: <strong>{item.required_packs} савлагаа</strong></small>{item.instructions && <p>{item.instructions}</p>}</div><div className="rx-item-actions"><span className={`rx-status ${item.status}`}>{prescriptionStatus(item.status)}</span>{onChoose && item.status === 'active' && <button className="outline" onClick={() => setOpenItem(openItem === item.id ? null : item.id)}>Эмийн сан сонгох</button>}</div></div>{openItem === item.id && <div className="rx-offers"><h4>Үнэ, үлдэгдлээс сонгоно уу</h4>{offers.length ? offers.map(offer => <button className="rx-offer" key={offer.id} onClick={() => onChoose(item, offer)}><span><b>{offer.pharmacy_name}</b><small>{offer.address} · {offer.stock} савлагаа</small></span><strong>{money(offer.price * item.required_packs)}<small>{item.required_packs} савлагаа</small></strong></button>) : <p className="muted">Жорт бичсэн хэмжээгээр нөөцтэй эмийн сан алга байна.</p>}</div>}</div>;
  })}{p.note && <p className="note">Эмчийн тэмдэглэл: {p.note}</p>}</div>;
}

function OrderCard({order: o}) {
  return <div className="panel order"><div className="orderhead"><div><h3>Захиалга #{o.id} · {o.pharmacy_name}</h3><small>{new Date(o.created_at + 'Z').toLocaleString('mn-MN')} · {o.customer_name}</small></div><span className={'status ' + o.status}>{orderStatus(o.status)}</span></div>{o.items.map((x, i) => <div className="orderitem" key={i}><span>{x.name} × {x.quantity} савлагаа{x.prescription_id && <span className="prescription-detail"><small className="block rx-link">Цахим жор #{x.prescription_id} · хүчинтэй: {x.prescription_valid_until}</small><small>{x.prescription_dosage} · Нийт {x.required_units} {x.unit_label}</small>{x.prescription_instructions && <small>Заавар: {x.prescription_instructions}</small>}</span>}</span><b>{money(x.quantity * x.unit_price)}</b></div>)}<div className="order-summary"><div><span>Эмийн дүн</span><b>{money(o.subtotal)}</b></div>{!o.pickup && <div><span>Хүргэлтийн төлбөр</span><b>{money(o.delivery_fee)}</b></div>}<div className="grand-total"><span>{o.pickup ? 'Очиж авах' : <><Truck size={15}/> Хүргүүлэх</>}</span><strong>Нийт: {money(o.total)}</strong></div></div>{!o.pickup && <p className="address">Хүргэх хаяг: {o.address}</p>}<div className={`payment-badge ${o.payment_status}`}><CreditCard size={15}/>{o.payment_status === 'paid' ? 'Төлбөр төлсөн' : o.status === 'rejected' ? 'Төлбөр төлөхгүй' : 'Төлбөр төлөөгүй'}</div>{o.prescription_note && <p className="muted">Жорын тэмдэглэл: {o.prescription_note}</p>}</div>;
}

function StatCard({icon: Icon, label, value}) {
  return <div className="panel stat"><div className="pin"><Icon/></div><div><strong>{value}</strong><span>{label}</span></div></div>;
}

createRoot(document.getElementById('root')).render(<App/>);
