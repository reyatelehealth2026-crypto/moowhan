# ชอน

เว็บแอปสำหรับรวมข้อมูลการผลิต (ตัวอย่าง UI) พร้อม 3 แท็บ: อัปโหลดไฟล์, ตรวจสอบข้อมูล และสรุปผลรวม

## Requirements
- Node.js 18+ (แนะนำ LTS)

## ติดตั้งและรันในเครื่อง
```bash
npm install
npm run dev
```

## Build และ Preview
```bash
npm run build
npm run preview
```

## Deploy บน Vercel
1. สร้าง GitHub repo แล้ว push โปรเจคขึ้น GitHub
2. เข้า Vercel และกด **New Project**
3. เลือก repo นี้
4. ตั้งค่า:
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. กด Deploy

## หมายเหตุ
- หน้านี้ใช้ข้อมูลจำลองเพื่อเดโม UI/UX
# moowhan

## ข้อกำหนดเครื่องมือ

- Node.js >= 20.19 (CI ทดสอบบน Node 20 และ 22)
