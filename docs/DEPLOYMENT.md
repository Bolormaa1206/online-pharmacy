# Render дээр үнэгүй public deployment хийх

Энэ төсөл production build үед React frontend болон FastAPI backend-ийг нэг Docker web service болгон ажиллуулна. Өгөгдлийг Render PostgreSQL-д хадгална.

```text
https://online-pharmacy-diplom.onrender.com
               ├── /           React frontend
               ├── /api/...    FastAPI API
               └── /docs       Swagger API documentation
```

## Урьдчилсан нөхцөл

- GitHub account
- Render account
- Төслийг GitHub repository-д push хийсэн байх

GitHub-д орохгүй файлуудыг `.gitignore` болон `.dockerignore` хамгаална. `.secret_key`, `pharmacy.db`, `.venv`, `node_modules`-ийг repository-д бүү нэм.

## 1. GitHub repository-д push хийх

GitHub дээр хоосон `online-pharmacy` repository үүсгээд төслийн root хавтсанд:

```bash
git init
git add .
git commit -m "Prepare online pharmacy diploma deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/online-pharmacy.git
git push -u origin main
```

`YOUR_USERNAME` хэсгийг өөрийн GitHub хэрэглэгчийн нэрээр солино.

## 2. Render Blueprint үүсгэх

1. [Render Dashboard](https://dashboard.render.com/) руу GitHub account-аар нэвтэрнэ.
2. **New → Blueprint** сонгоно.
3. `online-pharmacy` repository-г холбоно.
4. Blueprint file нь repository root дахь `render.yaml` байна.
5. **Apply** дарна.

`render.yaml` дараах хоёр resource-ийг автоматаар үүсгэнэ:

- `online-pharmacy-diplom`: үнэгүй Docker web service
- `online-pharmacy-db`: үнэгүй PostgreSQL database

`SECRET_KEY` автоматаар санамсаргүй утгатай үүснэ. `DATABASE_URL` нь PostgreSQL database-аас автоматаар холбогдоно. Нууц утгыг GitHub-д хадгалахгүй.

## 3. Deployment дуусахыг хүлээх

Эхний Docker build хэдэн минут үргэлжилж болно. Deploy амжилттай бол Render дараахтай төстэй public URL өгнө:

```text
https://online-pharmacy-diplom.onrender.com
```

Шалгах хаягууд:

```text
https://online-pharmacy-diplom.onrender.com/api/health
https://online-pharmacy-diplom.onrender.com/docs
```

## 4. Үндсэн урсгалыг шалгах

1. Frontend URL нээх
2. Demo эмчээр нэвтэрч demo хэрэглэгчид цахим жор илгээх
3. Demo хэрэглэгчээр нэвтэрч цахим жор ирснийг шалгах
4. Жортой эм сагсанд нэмээд захиалга үүсгэх
5. Тохирох demo эм зүйчээр нэвтэрч захиалга батлах
6. Нөөц хасагдаж, жор `used` төлөвтэй болсныг шалгах
7. Demo админаар нэвтэрч нэгдсэн хяналтын мэдээллийг шалгах

## Үнэгүй үйлчилгээний хязгаарлалт

- Backend 15 минут хүсэлтгүй үед унтана. Эхний хүсэлтээр дахин асахад ойролцоогоор нэг минут шаардагдаж болно.
- Free PostgreSQL database 30 хоногийн дараа хугацаа дуусна.
- Диплом хамгаалахаас 1–2 долоо хоногийн өмнө database үүсгэх нь тохиромжтой.
- Бодит өвчтөн, жор, төлбөрийн мэдээлэл оруулахгүй.

Дэлгэрэнгүй: [Render Free үйлчилгээ](https://render.com/docs/free), [Render Blueprint](https://render.com/docs/infrastructure-as-code).

## Дараагийн өөрчлөлтийг deploy хийх

Код өөрчлөөд GitHub руу push хийхэд Render автоматаар дахин deploy хийнэ:

```bash
git add .
git commit -m "Update application"
git push
```
