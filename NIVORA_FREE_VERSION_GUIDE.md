# NIVORA ONE — ব্যবহার ও Source Copy Guide

## এই সংস্করণে কী আছে

NIVORA ONE-এর এই সংস্করণে আছে:

- Firebase email/password login
- Personal business data sync
- Product ও stock management
- Purchase এবং sales history
- Finance income/expense records
- Customer ও Baki records
- Orders ও tasks
- Business Radar early signals
- Fast-moving এবং slow-moving product analysis
- Stock coverage ও reorder estimate
- ৩০, ৯০ এবং ৩৬৫ দিনের sales run-rate planning
- NIVORA AI chat
- JSON data backup

## Business Radar কীভাবে ব্যবহার করবেন

1. Login করুন।
2. Business module-এ product এবং বর্তমান stock যোগ করুন।
3. Purchase tab-এ supplier, product, quantity, মোট ক্রয়মূল্য এবং তারিখ দিন।
4. Sales tab-এ customer, product, quantity, মোট বিক্রয়মূল্য এবং তারিখ দিন।
5. Home dashboard-এ Business Radar খুলুন।
6. Radar-এর signal, evidence, demand leaders এবং purchase planning দেখুন।
7. গুরুত্বপূর্ণ purchase বা business decision নেওয়ার আগে নিজের হিসাব যাচাই করুন।

Radar-এর ৩০/৯০/৩৬৫ দিনের সংখ্যা বর্তমান dated sales history-এর average daily run-rate থেকে তৈরি হয়। এটি market prediction, guaranteed forecast বা automatic order নয়। যথেষ্ট history না থাকলে Radar সেটি স্পষ্টভাবে দেখায়।

## Free version কীভাবে ব্যবহার করবেন

Replit-এর free workspace বা plan-এর availability, limits এবং expiry platform policy অনুযায়ী পরিবর্তিত হতে পারে। App code কোনো paid lock দিয়ে বন্ধ করা হয়নি। তাই free access বা workspace শেষ হওয়ার আগে source copy এবং data backup আলাদা করে রাখা উচিত।

### Source code copy

Project-এর source copy হিসেবে archive-এ মূল application files রাখা হয়:

- `index.html`
- `server.js`
- `ai-core.js`
- `api/`
- `package.json`
- `netlify/`
- `netlify.toml`
- `.replit`
- `replit.md`

এই archive-এ `.env`, secret value, API key, `.git`, cache বা installed dependency রাখা উচিত নয়। `GEMINI_API_KEY` নতুন workspace-এ Replit Secret হিসেবে আবার যোগ করতে হবে।

### Business data backup

App-এর Admin Panel → `ডেটা ব্যাকআপ (JSON)` চাপলে user data আলাদা JSON file হিসেবে download হবে। Source code archive এবং JSON data backup একই জিনিস নয়—দুটিই আলাদা করে সংরক্ষণ করুন।

## নিজের কম্পিউটারে চালানো

Node.js 20 বা তার পরের version লাগবে।

```bash
npm start
```

তারপর browser-এ local server-এর port খুলুন। AI ব্যবহার করতে হলে `GEMINI_API_KEY` server-side environment variable হিসেবে দিতে হবে। Firebase Authentication/Firestore ব্যবহার করতে হলে নিজের Firebase configuration এবং rules আলাদাভাবে configure করতে হবে।

## গুরুত্বপূর্ণ privacy note

- Source copy-তে কোনো secret value রাখা যাবে না।
- Firebase user data user-specific Firestore path-এ sync হয়।
- AI key browser-এ পাঠানো হয় না; server route থেকে ব্যবহার করা হয়।
- Radar কোনো external market data ব্যবহার করে না।