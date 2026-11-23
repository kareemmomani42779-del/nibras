نبراس: النشر على GitHub ثم Render

1) GitHub: افتح github.com > New repository > سمّه nibras > اضغط "uploading an existing file" > جرّ كل الملفات (بعد فك الضغط) > Commit.
2) مفتاح API: من console.anthropic.com أنشئ مفتاحاً وضيف رصيداً صغيراً، وحدد سقف إنفاق شهري.
3) Render: render.com > New > Web Service > اربط مستودع nibras.
   - Runtime: Node
   - Build Command: npm install
   - Start Command: npm start
   - Environment: أضف ANTHROPIC_API_KEY ومعه المفتاح
   ثم Deploy. بيعطيك رابط مثل nibras.onrender.com.
4) استبدل YOUR-DOMAIN.com برابطك الحقيقي في index.html وrobots.txt وsitemap.xml (تعديل مباشر من GitHub).
5) جوجل: search.google.com/search-console > أضف الموقع > أرسل sitemap.xml.

ملاحظة: الخطة المجانية في Render بتنام بعد فترة خمول، وأول فتح بياخد حوالي دقيقة.
