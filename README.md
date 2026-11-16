# Онлайн эмийн сангийн захиалгын веб систем

Дипломын туршилтын прототип. Бодит эмийн сан, эмч, өвчтөний өгөгдөл ашиглаагүй. Жишээ үнэ, жишээ байршилтай. Бодит эм худалдаа, төлбөр, хүргэлт хийгдэхгүй.

## MacBook (macOS) дээр ажиллуулах

Шаардлага: Python 3.10+ (`python3 --version`), Node.js 18+ (`node --version`), npm (`npm --version`).

**Terminal цонх 1:**

```bash
cd ~/Downloads/online-pharmacy/backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

Backend API: http://127.0.0.1:8000/docs

**Terminal цонх 2:**

```bash
cd ~/Downloads/online-pharmacy/frontend
npm install
npm run dev
```

Frontend: http://127.0.0.1:5173

> ZIP-ээ Downloads хавтаст задлаагүй бол өөрийн задласан замыг `cd` командад ашиглана. Mac дээр Downloads хавтсан дотор `online-pharmacy` хавтас гарсан эсэхийг шалгаарай.

## Турших дараалал

1. `doctor@demo.mn` эмчээр нэвтэрч `customer@demo.mn` хэрэглэгчид Амоксициллины цахим жор бичиж илгээх.
2. Хэрэглэгчээр нэвтэрч **Миний цахим жор** хэсэгт жор ирснийг шалгах.
3. Эм хайх → эмийн сан бүрийн үнэ/үлдэгдлийг харьцуулах → жортой эмийг сагсанд нэмэх.
4. Захиалга илгээхэд систем хүчинтэй, ашиглагдаагүй цахим жорыг автоматаар холбож `reserved` төлөвт оруулна.
5. Захиалсан эмийн сантай тохирох эм зүйчээр нэвтэрч захиалгыг батлах эсвэл татгалзах.
6. Баталбал нөөц хасагдаж жор `used`, татгалзвал жор дахин ашиглах боломжтой `active` болно.
7. `admin@demo.mn` админаар нэвтэрч хэрэглэгч, захиалга, жор, эмийн сангийн нэгдсэн мэдээллийг шалгах.

## Архитектур

- React + Vite (frontend)
- Python + FastAPI + SQLAlchemy (backend)
- SQLite development үед (`backend/pharmacy.db` автоматаар үүснэ), PostgreSQL public deployment үед
- REST API `/api/...`
- Дөрвөн эрх: хэрэглэгч, эмч, эм зүйч, админ
- Seed өгөгдөл автоматаар үүснэ (3 жишээ эмийн сан, 6 эм, demo эрхүүд)

## Demo эрхүүд

| Эрх | Имэйл | Нууц үг | Үндсэн боломж |
|---|---|---|---|
| Хэрэглэгч | `customer@demo.mn` | `DemoCustomer123!` | Цахим жор харах, эм захиалах |
| Эмч | `doctor@demo.mn` | `DemoDoctor123!` | Бүртгэлтэй өвчтөнд цахим жор илгээх |
| Админ | `admin@demo.mn` | `DemoAdmin123!` | Нэгдсэн тоо, хэрэглэгч, захиалга харах |

### Эм зүйчийн demo эрх

| Эмийн сан | Имэйл | Нууц үг |
|---|---|---|
| Энхмэнд эмийн сан | `staff@demo.mn` | `DemoStaff123!` |
| Амар Фарм эмийн сан | `staff-b@demo.mn` | `DemoStaff123!` |
| Итгэл Мед эмийн сан | `staff-c@demo.mn` | `DemoStaff123!` |

Эм зүйч бүр зөвхөн өөрийн эмийн сангийн захиалга болон нөөцийг удирдана. Өмнөх хувилбарын SQLite database байвал `pharmacy_id` багана автоматаар нэмэгдэнэ.

## Автомат тест

```bash
cd ~/Downloads/online-pharmacy/backend
source .venv/bin/activate
python -m unittest -v
```

Тест нь input validation, эмийн сан хоорондын эрхийн тусгаарлалт, цахим жорын төлөв, админы хураангуй, захиалга батлах болон transaction rollback-ийг шалгана. Архитектур ба ERD-г [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)-ээс харна уу.

## API хаягийн тохиргоо

Development үед Vite `/api` хүсэлтийг `http://127.0.0.1:8000` руу proxy хийнэ. Тусдаа API домэйн ашиглах бол frontend ажиллуулахын өмнө `VITE_API_URL` тохируулна:

```bash
VITE_API_URL=https://api.example.mn/api npm run build
```

## Үнэгүй public deployment

Төсөл нь Docker болон `render.yaml` Blueprint ашиглан Render дээр нэг public холбоосоор ажиллахад бэлэн. Production үед frontend, backend нэг домэйн ашиглах бөгөөд өгөгдөл PostgreSQL-д хадгалагдана.

Алхамчилсан заавар: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)

## Анхааруулга

Энэ бол зөвхөн **дипломын демо**. Demo эрх нийтэд ил байгаа бөгөөд authentication workflow хялбаршуулсан. Цахим жор нь зөвхөн энэ системийн дотоод туршилтын өгөгдөл бөгөөд улсын цахим жорын системтэй холбогдоогүй. Захиалга батлах үеийн нөөцийн өөрчлөлт атомик боловч pending захиалгад нөөц урьдчилан reserve хийхгүй. Бодит хэрэглээнд нэвтрүүлэхийн өмнө эмчийн эрхийн баталгаажуулалт, MFA, audit log, rate limiting, мэдээлэл шифрлэлт, нөөцлөлт болон хууль эрх зүйн шаардлагыг тусад нь хэрэгжүүлэх шаардлагатай. Бодит өвчтөн, жор, төлбөрийн мэдээлэл оруулахгүй.
