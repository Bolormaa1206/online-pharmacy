# Системийн архитектур

## Зорилго ба хамрах хүрээ

Энэ систем нь олон эмийн сангийн үнэ, үлдэгдлийг харьцуулж захиалга үүсгэх дипломын туршилтын прототип. Бодит төлбөр, хүргэлт болон цахим жорын улсын системтэй холболт хийхгүй.

## Бүрэлдэхүүн

- **React + Vite:** хэрэглэгч, эмч, эм зүйч, админы role-based интерфейс
- **FastAPI:** authentication, каталог, цахим жор, захиалга, нөөц, админы REST API
- **SQLAlchemy:** development үед SQLite, public deployment үед PostgreSQL
- **ItsDangerous token:** 24 цагийн хүчинтэй, гарын үсэгтэй session token

```mermaid
flowchart LR
    Browser[React хэрэглэгчийн интерфейс] -->|REST /api| API[FastAPI]
    API --> Auth[Authentication ба эрхийн шалгалт]
    API --> Prescriptions[Цахим жорын үйлчилгээ]
    API --> Orders[Захиалгын үйлчилгээ]
    API --> Catalog[Каталог ба нөөц]
    API --> Admin[Админы хяналт]
    Auth --> DB[(SQLite / PostgreSQL)]
    Prescriptions --> DB
    Orders --> DB
    Catalog --> DB
    Admin --> DB
```

## Өгөгдлийн загвар

```mermaid
erDiagram
    PHARMACY ||--o{ USER : employs
    USER ||--o{ ORDER : creates
    PHARMACY ||--o{ ORDER : receives
    PHARMACY ||--o{ INVENTORY : has
    MEDICINE ||--o{ INVENTORY : stocked_as
    ORDER ||--|{ ORDER_ITEM : contains
    MEDICINE ||--o{ ORDER_ITEM : ordered_as
    USER ||--o{ PRESCRIPTION : writes_as_doctor
    USER ||--o{ PRESCRIPTION : receives_as_patient
    PRESCRIPTION ||--|{ PRESCRIPTION_ITEM : contains
    MEDICINE ||--o{ PRESCRIPTION_ITEM : prescribed_as
    PRESCRIPTION_ITEM ||--o| PRESCRIPTION_USAGE : tracked_by
    ORDER_ITEM ||--o| PRESCRIPTION_USAGE : consumes

    USER {
        int id PK
        string email UK
        string role
        int pharmacy_id FK
    }
    PHARMACY {
        int id PK
        string name
        string address
    }
    MEDICINE {
        int id PK
        string name
        boolean prescription_required
    }
    INVENTORY {
        int id PK
        int pharmacy_id FK
        int medicine_id FK
        int price
        int stock
        string expiry
    }
    ORDER {
        int id PK
        int user_id FK
        int pharmacy_id FK
        string status
    }
    ORDER_ITEM {
        int id PK
        int order_id FK
        int medicine_id FK
        int quantity
        int unit_price
    }
    PRESCRIPTION {
        int id PK
        int doctor_id FK
        int patient_id FK
        string valid_until
        string note
    }
    PRESCRIPTION_ITEM {
        int id PK
        int prescription_id FK
        int medicine_id FK
        string dosage
        int quantity
        string instructions
    }
    PRESCRIPTION_USAGE {
        int id PK
        int prescription_item_id FK,UK
        int order_item_id FK,UK
        string status
    }
```

## Цахим жорын урсгал

1. `doctor` эрхтэй хэрэглэгч бүртгэлтэй `customer`-ийг сонгож, зөвхөн `prescription_required=true` эмд жор бичнэ.
2. Жор өвчтөний **Миний цахим жор** хэсэгт `active` төлөвтэй харагдана.
3. Өвчтөн жортой эм захиалахад сервер эм, тоо ширхэг, өвчтөн, хүчинтэй хугацаа, ашиглагдаагүй эсэхийг шалгана.
4. Тохирох жорыг захиалгын мөртэй нэг удаагийн холбоосоор холбож `reserved` төлөвт оруулна.
5. Эм зүйч захиалгыг баталбал холбоос `used`; татгалзвал холбоос устаж жор дахин `active` болно.
6. Хугацаа өнгөрсөн, ашигласан эсвэл хүрэлцэх тоо ширхэггүй жороор захиалга үүсгэхгүй.

## Захиалга батлах урсгал

1. Хэрэглэгч нөөц болон хугацааг шалгуулж `pending` захиалга үүсгэнэ.
2. Тухайн эмийн сангийн эм зүйч л уг захиалгыг харна.
3. Батлах үед сервер захиалгыг атомикаар `processing` төлөвт claim хийнэ.
4. Нөөц бүрийг `stock >= quantity` нөхцөлтэй атомик `UPDATE`-аар хасна.
5. Аль нэг нөөц хүрэлцэхгүй бол transaction бүхэлдээ rollback хийгдэж захиалга `pending` хэвээр үлдэнэ.
6. Амжилттай бол захиалга `approved`, татгалзвал `rejected` болно.

## Эрхийн загвар

- `customer`: каталог болон өөрт ирсэн цахим жорыг харах; захиалга үүсгэх үед жор автоматаар шалгуулах
- `doctor`: бүртгэлтэй хэрэглэгчийг хайх, цахим жор бичих, өөрийн бичсэн жорыг харах
- `staff`: зөвхөн `pharmacy_id`-аар харьяалсан эмийн сангийн захиалга, нөөцийг харах/өөрчлөх
- `admin`: системийн тоон хураангуй, хэрэглэгч болон сүүлийн захиалгуудыг харах
- Өөр эмийн сангийн resource-д хандахад мэдээлэл задруулахгүйгээр `404` буцаана.

## Production хувилбарт шаардлагатай ажил

- Database schema migration framework (Alembic)
- Улсын цахим жорын системтэй баталгаажсан интеграц, эмчийн лицензийн шалгалт
- MFA, login rate limiting, password reset, token revoke
- Audit log болон хувийн мэдээлэлд хандсан түүх
- HTTPS, secret manager, backup/restore төлөвлөгөө
- Төлбөр ба хүргэлтийн тусдаа интеграц
