from __future__ import annotations
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
import hashlib, hmac, os, re, secrets
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import create_engine, ForeignKey, String, Integer, Float, DateTime, Boolean, func, inspect, select, update, UniqueConstraint
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, Session, sessionmaker
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

ROOT = Path(__file__).resolve().parent
database_url = os.getenv('DATABASE_URL', f"sqlite:///{ROOT / 'pharmacy.db'}")
if database_url.startswith('postgres://'):
    database_url = database_url.replace('postgres://', 'postgresql+psycopg://', 1)
elif database_url.startswith('postgresql://'):
    database_url = database_url.replace('postgresql://', 'postgresql+psycopg://', 1)
connect_args = {"check_same_thread": False} if database_url.startswith('sqlite') else {}
engine = create_engine(database_url, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(engine)
SECRET_FILE = ROOT / '.secret_key'
secret_key = os.getenv('SECRET_KEY')
if not secret_key:
    if not SECRET_FILE.exists():
        SECRET_FILE.write_text(secrets.token_urlsafe(48))
        SECRET_FILE.chmod(0o600)
    secret_key = SECRET_FILE.read_text().strip()
signer = URLSafeTimedSerializer(secret_key)

class Base(DeclarativeBase): pass
class User(Base):
    __tablename__ = 'users'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(250))
    role: Mapped[str] = mapped_column(String(30), default='customer')
    pharmacy_id: Mapped[Optional[int]] = mapped_column(ForeignKey('pharmacies.id'), nullable=True)
class Pharmacy(Base):
    __tablename__ = 'pharmacies'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    address: Mapped[str] = mapped_column(String(250))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
class Medicine(Base):
    __tablename__ = 'medicines'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(130), index=True)
    category: Mapped[str] = mapped_column(String(100))
    prescription_required: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[str] = mapped_column(String(500), default='')
class Inventory(Base):
    __tablename__ = 'inventory'
    id: Mapped[int] = mapped_column(primary_key=True)
    pharmacy_id: Mapped[int] = mapped_column(ForeignKey('pharmacies.id'))
    medicine_id: Mapped[int] = mapped_column(ForeignKey('medicines.id'))
    price: Mapped[int] = mapped_column(Integer)
    stock: Mapped[int] = mapped_column(Integer)
    expiry: Mapped[str] = mapped_column(String(10))
    __table_args__ = (UniqueConstraint('pharmacy_id','medicine_id'),)
class Order(Base):
    __tablename__='orders'
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'))
    pharmacy_id: Mapped[int] = mapped_column(ForeignKey('pharmacies.id'))
    status: Mapped[str] = mapped_column(String(30), default='pending')
    pickup: Mapped[bool] = mapped_column(Boolean, default=True)
    address: Mapped[str] = mapped_column(String(250), default='')
    prescription_note: Mapped[str] = mapped_column(String(1000), default='')
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )
class OrderItem(Base):
    __tablename__='order_items'
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey('orders.id'))
    medicine_id: Mapped[int] = mapped_column(ForeignKey('medicines.id'))
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[int] = mapped_column(Integer)
class Prescription(Base):
    __tablename__='prescriptions'
    id: Mapped[int] = mapped_column(primary_key=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey('users.id'))
    patient_id: Mapped[int] = mapped_column(ForeignKey('users.id'))
    note: Mapped[str] = mapped_column(String(1000), default='')
    valid_until: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )
class PrescriptionItem(Base):
    __tablename__='prescription_items'
    id: Mapped[int] = mapped_column(primary_key=True)
    prescription_id: Mapped[int] = mapped_column(ForeignKey('prescriptions.id'))
    medicine_id: Mapped[int] = mapped_column(ForeignKey('medicines.id'))
    dosage: Mapped[str] = mapped_column(String(200))
    quantity: Mapped[int] = mapped_column(Integer)
    instructions: Mapped[str] = mapped_column(String(500), default='')
class PrescriptionUsage(Base):
    __tablename__='prescription_usage'
    id: Mapped[int] = mapped_column(primary_key=True)
    prescription_item_id: Mapped[int] = mapped_column(ForeignKey('prescription_items.id'), unique=True)
    order_item_id: Mapped[int] = mapped_column(ForeignKey('order_items.id'), unique=True)
    status: Mapped[str] = mapped_column(String(30), default='reserved')

app = FastAPI(title='Online Pharmacy Demo API', version='2.0')
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173','http://127.0.0.1:5173'], allow_credentials=True, allow_methods=['*'], allow_headers=['*'])

def db():
    with SessionLocal() as session: yield session

def hash_password(password: str) -> str:
    salt = os.urandom(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 260000)
    return f'{salt.hex()}:{key.hex()}'

def verify_password(password: str, saved: str) -> bool:
    try:
        salt, digest = saved.split(':')
        key = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 260000)
        return hmac.compare_digest(key, bytes.fromhex(digest))
    except (ValueError, TypeError): return False

class Register(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=5, max_length=200)
    password: str = Field(min_length=8, max_length=128)

    @field_validator('name')
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError('Нэр хамгийн багадаа 2 тэмдэгт байна')
        return value

    @field_validator('email')
    @classmethod
    def clean_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', value):
            raise ValueError('Имэйл хаягийн формат буруу')
        return value

class Login(BaseModel):
    email: str = Field(min_length=5, max_length=200)
    password: str = Field(min_length=1, max_length=128)

    @field_validator('email')
    @classmethod
    def clean_email(cls, value: str) -> str:
        return Register.clean_email(value)

class CartItem(BaseModel):
    pharmacy_id: int
    medicine_id: int
    quantity: int = Field(ge=1, le=100)
class Checkout(BaseModel):
    items: list[CartItem] = Field(min_length=1, max_length=50)
    pickup: bool = True
    address: str = Field(default='', max_length=250)
    prescription_note: str = Field(default='', max_length=1000)
class StockEdit(BaseModel):
    stock: int = Field(ge=0)
    price: int = Field(ge=1)
    expiry: str = Field(pattern=r'^\d{4}-\d{2}-\d{2}$')
class PrescriptionMedicineInput(BaseModel):
    medicine_id: int
    dosage: str = Field(min_length=2, max_length=200)
    quantity: int = Field(ge=1, le=100)
    instructions: str = Field(default='', max_length=500)
class PrescriptionCreate(BaseModel):
    patient_email: str = Field(min_length=5, max_length=200)
    valid_until: str = Field(pattern=r'^\d{4}-\d{2}-\d{2}$')
    note: str = Field(default='', max_length=1000)
    items: list[PrescriptionMedicineInput] = Field(min_length=1, max_length=20)

    @field_validator('patient_email')
    @classmethod
    def clean_email(cls, value: str) -> str:
        return Register.clean_email(value)


def auth(authorization: Optional[str] = Header(None), session: Session = Depends(db)) -> User:
    if not authorization or not authorization.startswith('Bearer '): raise HTTPException(401, 'Нэвтрэх шаардлагатай')
    try: user_id = signer.loads(authorization[7:], max_age=60*60*24)
    except (BadSignature, SignatureExpired): raise HTTPException(401, 'Нэвтрэх хугацаа дууссан')
    user = session.get(User, user_id)
    if not user: raise HTTPException(401, 'Хэрэглэгч олдсонгүй')
    return user

def staff(user: User = Depends(auth)):
    if user.role != 'staff': raise HTTPException(403, 'Зөвхөн эм зүйчийн эрхтэй')
    if user.pharmacy_id is None: raise HTTPException(403, 'Эмийн сангийн харьяалал тохируулаагүй')
    return user

def doctor(user: User = Depends(auth)):
    if user.role != 'doctor': raise HTTPException(403, 'Зөвхөн эмчийн эрхтэй')
    return user

def admin(user: User = Depends(auth)):
    if user.role != 'admin': raise HTTPException(403, 'Зөвхөн админы эрхтэй')
    return user

def medicine_view(m): return {'id':m.id,'name':m.name,'category':m.category,'prescription_required':m.prescription_required,'description':m.description}
def inventory_view(inv, session):
    p = session.get(Pharmacy,inv.pharmacy_id)
    return {'id':inv.id,'pharmacy_id':p.id,'pharmacy_name':p.name,'address':p.address,'lat':p.lat,'lng':p.lng,'medicine_id':inv.medicine_id,'price':inv.price,'stock':inv.stock,'expiry':inv.expiry}

def prescription_view(prescription, session):
    doctor_user=session.get(User,prescription.doctor_id)
    patient=session.get(User,prescription.patient_id)
    items=session.scalars(select(PrescriptionItem).where(PrescriptionItem.prescription_id==prescription.id)).all()
    today=datetime.now().date().isoformat()
    item_views=[]
    for item in items:
        medicine=session.get(Medicine,item.medicine_id)
        usage=session.scalar(select(PrescriptionUsage).where(PrescriptionUsage.prescription_item_id==item.id))
        status=usage.status if usage else ('expired' if prescription.valid_until<today else 'active')
        item_views.append({'id':item.id,'medicine_id':item.medicine_id,'medicine_name':medicine.name,'dosage':item.dosage,'quantity':item.quantity,'instructions':item.instructions,'status':status})
    return {'id':prescription.id,'doctor_name':doctor_user.name,'patient_name':patient.name,'patient_email':patient.email,'note':prescription.note,'valid_until':prescription.valid_until,'created_at':prescription.created_at.isoformat(),'items':item_views}

def order_view(order, session):
    p=session.get(Pharmacy,order.pharmacy_id)
    customer=session.get(User,order.user_id)
    items=session.scalars(select(OrderItem).where(OrderItem.order_id==order.id)).all()
    item_views=[]
    for item in items:
        usage=session.scalar(select(PrescriptionUsage).where(PrescriptionUsage.order_item_id==item.id))
        prescription_id=None
        if usage:
            prescription_item=session.get(PrescriptionItem,usage.prescription_item_id)
            prescription_id=prescription_item.prescription_id
        item_views.append({'medicine_id':item.medicine_id,'name':session.get(Medicine,item.medicine_id).name,'quantity':item.quantity,'unit_price':item.unit_price,'prescription_id':prescription_id})
    return {'id':order.id,'pharmacy_id':order.pharmacy_id,'pharmacy_name':p.name,'customer_name':customer.name,'status':order.status,'pickup':order.pickup,'address':order.address,'prescription_note':order.prescription_note,'created_at':order.created_at.isoformat(),'items':item_views, 'total':sum(i.quantity*i.unit_price for i in items)}

@app.get('/api/health')
def health(): return {'ok': True}
@app.post('/api/register')
def register(data:Register, session:Session=Depends(db)):
    email=data.email
    if session.scalar(select(User).where(User.email==email)): raise HTTPException(409,'Имэйл бүртгэлтэй байна')
    user=User(name=data.name,email=email,password_hash=hash_password(data.password),role='customer')
    session.add(user)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409,'Имэйл бүртгэлтэй байна')
    session.refresh(user)
    return {'token':signer.dumps(user.id),'user':{'id':user.id,'name':user.name,'role':user.role}}
@app.post('/api/login')
def login(data:Login,session:Session=Depends(db)):
    user=session.scalar(select(User).where(User.email==data.email))
    if not user or not verify_password(data.password,user.password_hash): raise HTTPException(401,'Имэйл эсвэл нууц үг буруу')
    return {'token':signer.dumps(user.id),'user':{'id':user.id,'name':user.name,'role':user.role}}
@app.get('/api/me')
def me(user:User=Depends(auth)):
    return {'id':user.id,'name':user.name,'email':user.email,'role':user.role,'pharmacy_id':user.pharmacy_id}
@app.get('/api/pharmacies')
def pharmacies(session:Session=Depends(db)):
    return [{'id':p.id,'name':p.name,'address':p.address,'lat':p.lat,'lng':p.lng} for p in session.scalars(select(Pharmacy)).all()]
@app.get('/api/medicines')
def medicines(q:str='',session:Session=Depends(db)):
    records=session.scalars(select(Medicine).where(Medicine.name.ilike(f'%{q}%')).order_by(Medicine.name)).all()
    return [medicine_view(m) for m in records]
@app.get('/api/inventory')
def inventory(medicine_id:Optional[int]=None,pharmacy_id:Optional[int]=None,session:Session=Depends(db)):
    statement=select(Inventory)
    if medicine_id:statement=statement.where(Inventory.medicine_id==medicine_id)
    if pharmacy_id:statement=statement.where(Inventory.pharmacy_id==pharmacy_id)
    return [inventory_view(i,session) for i in session.scalars(statement.order_by(Inventory.price)).all()]
@app.post('/api/orders')
def checkout(data:Checkout,user:User=Depends(auth),session:Session=Depends(db)):
    if user.role!='customer':raise HTTPException(403,'Зөвхөн хэрэглэгч захиалга үүсгэнэ')
    if not data.pickup and not data.address.strip():raise HTTPException(400,'Хүргэлтийн хаяг оруулна уу')
    grouped={}
    for item in data.items:
        key=(item.pharmacy_id,item.medicine_id)
        grouped[key]=grouped.get(key,0)+item.quantity
    if any(v>100 for v in grouped.values()):raise HTTPException(400,'Нэг эмийн тоо хэтэрсэн')
    by_pharmacy={}
    selected_prescriptions=set()
    today=datetime.now().date().isoformat()
    for (pharmacy_id,medicine_id),quantity in grouped.items():
        inv=session.scalar(select(Inventory).where(Inventory.pharmacy_id==pharmacy_id,Inventory.medicine_id==medicine_id))
        med=session.get(Medicine,medicine_id)
        if not inv or not med:raise HTTPException(404,'Эмийн нөөц олдсонгүй')
        if inv.stock < quantity or inv.expiry < today:raise HTTPException(400,f'{med.name}: нөөц хүрэлцэхгүй эсвэл хугацаа дууссан')
        prescription_item=None
        if med.prescription_required:
            statement=(
                select(PrescriptionItem)
                .join(Prescription,Prescription.id==PrescriptionItem.prescription_id)
                .outerjoin(PrescriptionUsage,PrescriptionUsage.prescription_item_id==PrescriptionItem.id)
                .where(
                    Prescription.patient_id==user.id,
                    Prescription.valid_until>=today,
                    PrescriptionItem.medicine_id==medicine_id,
                    PrescriptionItem.quantity>=quantity,
                    PrescriptionUsage.id.is_(None),
                )
                .order_by(Prescription.valid_until,PrescriptionItem.id)
            )
            if selected_prescriptions:
                statement=statement.where(PrescriptionItem.id.not_in(selected_prescriptions))
            prescription_item=session.scalar(statement)
            if not prescription_item:raise HTTPException(400,f'{med.name}: хүчинтэй цахим жор олдсонгүй')
            selected_prescriptions.add(prescription_item.id)
        by_pharmacy.setdefault(pharmacy_id,[]).append((inv,quantity,prescription_item))
    results=[]
    for pharmacy_id,entries in by_pharmacy.items():
        order=Order(user_id=user.id,pharmacy_id=pharmacy_id,pickup=data.pickup,address=data.address.strip(),prescription_note=data.prescription_note.strip())
        session.add(order);session.flush()
        for inv,quantity,prescription_item in entries:
            order_item=OrderItem(order_id=order.id,medicine_id=inv.medicine_id,quantity=quantity,unit_price=inv.price)
            session.add(order_item);session.flush()
            if prescription_item:
                session.add(PrescriptionUsage(prescription_item_id=prescription_item.id,order_item_id=order_item.id,status='reserved'))
        results.append(order)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409,'Цахим жор өөр захиалгад ашиглагдсан байна')
    return [order_view(o,session) for o in results]
@app.get('/api/orders/mine')
def my_orders(user:User=Depends(auth),session:Session=Depends(db)):
    if user.role!='customer':raise HTTPException(403,'Зөвхөн хэрэглэгчийн захиалга')
    return [order_view(o,session) for o in session.scalars(select(Order).where(Order.user_id==user.id).order_by(Order.id.desc())).all()]
@app.get('/api/prescriptions/mine')
def my_prescriptions(user:User=Depends(auth),session:Session=Depends(db)):
    if user.role!='customer':raise HTTPException(403,'Зөвхөн хэрэглэгчийн цахим жор')
    statement=select(Prescription).where(Prescription.patient_id==user.id).order_by(Prescription.id.desc())
    return [prescription_view(p,session) for p in session.scalars(statement).all()]
@app.get('/api/doctor/patients')
def doctor_patients(q:str='',_:User=Depends(doctor),session:Session=Depends(db)):
    statement=select(User).where(User.role=='customer')
    if q.strip():
        term=f'%{q.strip()}%'
        statement=statement.where((User.name.ilike(term))|(User.email.ilike(term)))
    return [{'id':u.id,'name':u.name,'email':u.email} for u in session.scalars(statement.order_by(User.name).limit(100)).all()]
@app.get('/api/doctor/prescriptions')
def doctor_prescriptions(user:User=Depends(doctor),session:Session=Depends(db)):
    statement=select(Prescription).where(Prescription.doctor_id==user.id).order_by(Prescription.id.desc())
    return [prescription_view(p,session) for p in session.scalars(statement).all()]
@app.post('/api/doctor/prescriptions')
def create_prescription(data:PrescriptionCreate,user:User=Depends(doctor),session:Session=Depends(db)):
    try:valid_date=datetime.strptime(data.valid_until,'%Y-%m-%d').date()
    except ValueError:raise HTTPException(400,'Жорын хүчинтэй огноо буруу')
    if valid_date<datetime.now().date():raise HTTPException(400,'Жорын хүчинтэй хугацаа өнгөрсөн байна')
    patient=session.scalar(select(User).where(User.email==data.patient_email,User.role=='customer'))
    if not patient:raise HTTPException(404,'Бүртгэлтэй хэрэглэгч олдсонгүй')
    if len({item.medicine_id for item in data.items})!=len(data.items):raise HTTPException(400,'Нэг эмийг жорд давхар оруулахгүй')
    medicines_by_id={m.id:m for m in session.scalars(select(Medicine).where(Medicine.id.in_([item.medicine_id for item in data.items]))).all()}
    if len(medicines_by_id)!=len(data.items):raise HTTPException(404,'Эм олдсонгүй')
    if any(not medicines_by_id[item.medicine_id].prescription_required for item in data.items):raise HTTPException(400,'Зөвхөн жороор олгох эм сонгоно уу')
    prescription=Prescription(doctor_id=user.id,patient_id=patient.id,note=data.note.strip(),valid_until=data.valid_until)
    session.add(prescription);session.flush()
    for item in data.items:
        session.add(PrescriptionItem(prescription_id=prescription.id,medicine_id=item.medicine_id,dosage=item.dosage.strip(),quantity=item.quantity,instructions=item.instructions.strip()))
    session.commit();session.refresh(prescription)
    return prescription_view(prescription,session)
@app.get('/api/admin/summary')
def admin_summary(_:User=Depends(admin),session:Session=Depends(db)):
    counts={
        'users':session.scalar(select(func.count()).select_from(User)),
        'customers':session.scalar(select(func.count()).select_from(User).where(User.role=='customer')),
        'orders':session.scalar(select(func.count()).select_from(Order)),
        'prescriptions':session.scalar(select(func.count()).select_from(Prescription)),
        'pharmacies':session.scalar(select(func.count()).select_from(Pharmacy)),
    }
    users=[{'id':u.id,'name':u.name,'email':u.email,'role':u.role,'pharmacy_id':u.pharmacy_id} for u in session.scalars(select(User).order_by(User.id.desc()).limit(100)).all()]
    orders=[order_view(o,session) for o in session.scalars(select(Order).order_by(Order.id.desc()).limit(50)).all()]
    return {'counts':counts,'users':users,'orders':orders}
@app.get('/api/staff/orders')
def staff_orders(user:User=Depends(staff),session:Session=Depends(db)):
    statement=select(Order).where(Order.pharmacy_id==user.pharmacy_id).order_by(Order.id.desc())
    return [order_view(o,session) for o in session.scalars(statement).all()]
@app.get('/api/staff/inventory')
def staff_inventory(user:User=Depends(staff),session:Session=Depends(db)):
    statement=select(Inventory).where(Inventory.pharmacy_id==user.pharmacy_id).order_by(Inventory.id)
    return [inventory_view(i,session) for i in session.scalars(statement).all()]
@app.patch('/api/staff/orders/{order_id}/{decision}')
def decide(order_id:int,decision:str,user:User=Depends(staff),session:Session=Depends(db)):
    if decision not in ('approve','reject'): raise HTTPException(400,'Буруу шийдвэр')
    order=session.scalar(select(Order).where(Order.id==order_id,Order.pharmacy_id==user.pharmacy_id))
    if not order:raise HTTPException(404,'Захиалга олдсонгүй')
    claimed=session.execute(
        update(Order)
        .where(Order.id==order_id,Order.pharmacy_id==user.pharmacy_id,Order.status=='pending')
        .values(status='processing')
    )
    if claimed.rowcount!=1:
        session.rollback()
        raise HTTPException(409,'Шийдвэрлэгдсэн захиалга')
    if decision=='approve':
        for item in session.scalars(select(OrderItem).where(OrderItem.order_id==order.id)).all():
            changed=session.execute(
                update(Inventory)
                .where(
                    Inventory.pharmacy_id==order.pharmacy_id,
                    Inventory.medicine_id==item.medicine_id,
                    Inventory.stock>=item.quantity,
                    Inventory.expiry>=datetime.now().date().isoformat(),
                )
                .values(stock=Inventory.stock-item.quantity)
            )
            if changed.rowcount!=1:
                session.rollback()
                raise HTTPException(409,'Үлдэгдэл хүрэлцэхгүй эсвэл хугацаа дууссан')
            usage=session.scalar(select(PrescriptionUsage).where(PrescriptionUsage.order_item_id==item.id))
            if usage:usage.status='used'
    else:
        order_item_ids=select(OrderItem.id).where(OrderItem.order_id==order.id)
        for usage in session.scalars(select(PrescriptionUsage).where(PrescriptionUsage.order_item_id.in_(order_item_ids))).all():
            session.delete(usage)
    order.status='approved' if decision=='approve' else 'rejected'
    session.commit()
    session.refresh(order)
    return order_view(order,session)
@app.patch('/api/staff/inventory/{inventory_id}')
def update_stock(inventory_id:int,data:StockEdit,user:User=Depends(staff),session:Session=Depends(db)):
    inv=session.scalar(select(Inventory).where(Inventory.id==inventory_id,Inventory.pharmacy_id==user.pharmacy_id))
    if not inv:raise HTTPException(404,'Нөөц олдсонгүй')
    try:datetime.strptime(data.expiry,'%Y-%m-%d')
    except ValueError:raise HTTPException(400,'Хугацааны формат буруу')
    inv.stock=data.stock;inv.price=data.price;inv.expiry=data.expiry
    session.commit()
    return inventory_view(inv,session)

def migrate_schema():
    """Apply small, idempotent upgrades for existing demo SQLite databases."""
    user_columns={column['name'] for column in inspect(engine).get_columns('users')}
    if 'pharmacy_id' not in user_columns:
        with engine.begin() as connection:
            connection.exec_driver_sql(
                'ALTER TABLE users ADD COLUMN pharmacy_id INTEGER REFERENCES pharmacies(id)'
            )

def seed():
    Base.metadata.create_all(engine)
    migrate_schema()
    with SessionLocal() as s:
        pharmacy_specs=[
            ('Энэрэл Фарм эмийн сан','Улаанбаатар, Сүхбаатар дүүрэг, 1-р хороо',47.9184,106.9177),
            ('Түмэн Эрүүл эмийн сан','Улаанбаатар, Баянзүрх дүүрэг, 4-р хороо',47.9213,106.9472),
            ('Саруул Фарм эмийн сан','Улаанбаатар, Чингэлтэй дүүрэг, 3-р хороо',47.9285,106.9050),
        ]
        ps=list(s.scalars(select(Pharmacy).order_by(Pharmacy.id)).all())
        for index,(name,address,lat,lng) in enumerate(pharmacy_specs):
            if index < len(ps):
                pharmacy=ps[index]
                pharmacy.name=name
                pharmacy.address=address
                pharmacy.lat=lat
                pharmacy.lng=lng
            else:
                pharmacy=Pharmacy(name=name,address=address,lat=lat,lng=lng)
                s.add(pharmacy)
                ps.append(pharmacy)
        s.flush()
        ps=ps[:len(pharmacy_specs)]

        medicine_specs=[
            ('Парацетамол 500 мг','Өвчин намдаах эм',False,'Халууралт болон хөнгөн өвдөлтийн үед хэрэглэдэг эм'),
            ('Ибупрофен 200 мг','Өвчин намдаах эм',False,'Өвдөлт, үрэвсэл намдаах үйлчилгээтэй эм'),
            ('Витамин C 500 мг','Амин дэм',False,'Өдөр тутмын витамин C-ийн нэмэлт'),
            ('Лоратадин 10 мг','Харшлын эм',False,'Харшлын шинж тэмдгийг багасгахад хэрэглэнэ'),
            ('Амоксициллин 500 мг','Антибиотик эм',True,'Зөвхөн эмчийн цахим жороор олгоно'),
            ('Омепразол 20 мг','Хоол боловсруулах эм',False,'Ходоодны хүчил ихсэх үед хэрэглэдэг эм'),
            ('Цетиризин 10 мг','Харшлын эм',False,'Улирлын болон бусад харшлын шинж тэмдэгт хэрэглэнэ'),
            ('Магни B6','Амин дэм',False,'Магни болон B6 аминдэмийн нэмэлт'),
            ('Фамотидин 20 мг','Хоол боловсруулах эм',False,'Ходоодны хүчил ялгаралтыг бууруулах эм'),
            ('Диклофенак 50 мг','Өвчин намдаах эм',True,'Зөвхөн эмчийн цахим жороор олгоно'),
            ('Цефалексин 500 мг','Антибиотик эм',True,'Зөвхөн эмчийн цахим жороор олгоно'),
            ('Азитромицин 250 мг','Антибиотик эм',True,'Зөвхөн эмчийн цахим жороор олгоно'),
            ('Амлодипин 5 мг','Зүрх судасны эм',True,'Зөвхөн эмчийн цахим жороор олгоно'),
            ('Метформин 500 мг','Чихрийн шижингийн эм',True,'Зөвхөн эмчийн цахим жороор олгоно'),
            ('Аспирин 100 мг','Зүрх судасны эм',True,'Зөвхөн эмчийн цахим жороор олгоно'),
        ]
        ms=[]
        for name,category,prescription_required,description in medicine_specs:
            medicine=s.scalar(select(Medicine).where(Medicine.name==name))
            if not medicine:
                medicine=Medicine(name=name)
                s.add(medicine)
            medicine.category=category
            medicine.prescription_required=prescription_required
            medicine.description=description
            ms.append(medicine)
        s.flush()

        for pi,pharmacy in enumerate(ps):
            for mi,medicine in enumerate(ms):
                inventory=s.scalar(select(Inventory).where(
                    Inventory.pharmacy_id==pharmacy.id,
                    Inventory.medicine_id==medicine.id,
                ))
                if not inventory:
                    s.add(Inventory(
                        pharmacy_id=pharmacy.id,
                        medicine_id=medicine.id,
                        price=1800+mi*920+pi*370,
                        stock=8+((mi*3+pi*5)%24),
                        expiry='2029-12-31',
                    ))

        demo_staff=[
            ('Эм зүйч А. Мөнхзул','staff@demo.mn'),
            ('Эм зүйч Д. Нарантуяа','staff-b@demo.mn'),
            ('Эм зүйч Б. Тэмүүлэн','staff-c@demo.mn'),
        ]
        for pharmacy,(name,email) in zip(ps,demo_staff):
            user=s.scalar(select(User).where(User.email==email))
            if user:
                user.name=name
                user.role='staff'
                user.pharmacy_id=pharmacy.id
            else:
                s.add(User(name=name,email=email,password_hash=hash_password('DemoStaff123!'),role='staff',pharmacy_id=pharmacy.id))

        demo_accounts=[
            ('Бат-Эрдэнийн Номин','customer@demo.mn','DemoCustomer123!','customer'),
            ('Дотрын эмч Б. Энхтөр','doctor@demo.mn','DemoDoctor123!','doctor'),
            ('Админ Г. Солонго','admin@demo.mn','DemoAdmin123!','admin'),
        ]
        for name,email,password,role in demo_accounts:
            user=s.scalar(select(User).where(User.email==email))
            if user:
                user.name=name
                user.role=role
                user.pharmacy_id=None
            else:
                s.add(User(name=name,email=email,password_hash=hash_password(password),role=role))
        s.commit()
seed()

FRONTEND_DIST = ROOT.parent / 'frontend' / 'dist'
if FRONTEND_DIST.exists():
    app.mount('/', StaticFiles(directory=FRONTEND_DIST, html=True), name='frontend')
