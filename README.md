# 🔒 PraxChat

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-19.0-61dafb.svg)
![Vite](https://img.shields.io/badge/Vite-Bundler-646CFF.svg)
![Supabase](https://img.shields.io/badge/Supabase-RLS%20%26%20Realtime-3ecf8e.svg)
![Clerk](https://img.shields.io/badge/Auth-Clerk-6c47ff.svg)
![Security](https://img.shields.io/badge/Security-E2EE-red.svg)


> [!WARNING]
> This application is a **DEMO** project created for educational and portfolio purposes. While it implements real security protocols, it is not intended for production use without further auditing and infrastructure hardening.

**PraxChat** is a secure, modern, and high-performance real-time messaging application built for privacy. It features **End-to-End Encryption (E2EE)** based on the Signal Protocol (Double Ratchet + X3DH), ensuring that only you and the recipient can read your messages.

## ✨ Features

- **🔐 End-to-End Encryption**: Messages are encrypted on the client using `libsodium` (ChaCha20-Poly1305) and the Signal Protocol (Double Ratchet). Not even the server can read them.
- **💬 Real-Time Messaging**: Instant delivery and typing indicators powered by Supabase Realtime.
- **📞 Voice & Video Calls**: P2P Audio and Video calls using `PeerJS`.
- **📂 Secure File Sharing**: Send images and files that are encrypted before upload.
- **👤 Robust Authentication**: seamless identity management via **Clerk**, tightly integrated with Supabase RLS.
- **🛡️ Data Security**: Strict Row Level Security (RLS) policies ensuring data isolation.
- **📱 Responsive UI**: Beautiful, dark-mode-first interface built with **Tailwind CSS**.

## 👨‍💻 Author

**Upjeet Baswan**


## 🛠️ Tech Stack

- **Frontend:** React 19, Vite, Tailwind CSS 4
- **Backend / DB:** Supabase (PostgreSQL, Realtime, Storage, Edge Functions)
- **Authentication:** Clerk + Supabase Integration
- **Cryptography:** `libsodium-wrappers`, Signal Protocol Algorithm (Custom Implementation)
- **P2P:** PeerJS for WebRTC calls
- **State Management:** React Context + Hooks

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- A **Supabase** Project
- A **Clerk** Application

### 1. Clone & Install
```bash
git clone https://github.com/yourusername/praxchat.git
cd praxchat
npm install
```

### 2. Environment Variables
Create a `.env.local` file in the root directory:

```env
# Clerk
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...

# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Database Setup (Supabase)
Navigate to your Supabase SQL Editor and run the contents of [`schema.sql`](./schema.sql).
This will:
- Create all necessary tables (`profiles`, `messages`, `devices`, etc.)
- Enable Row Level Security (RLS)
- Set up Realtime publications
- Create the Storage bucket for attachments

> **Note:** You must configure Clerk to create a JWT Template named `supabase` that includes the user's `id` and `email` claims.

### 4. Run Locally
```bash
npm run dev
```

## 🛡️ Security Architecture
PraxChat uses a **Three-Layer Security Model**:
1.  **Identity Layer (Clerk):** Validates user identity and issues JWTs.
2.  **Access Layer (Supabase RLS):** The database rejects any query that doesn't match the user's ID or conversation membership policies.
3.  **Data Privacy Layer (Client-Side E2EE):** All message content and file attachments are encrypted *before* leaving the user's device. The database only sees ciphertext.

## 🤝 Contributing
Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License
This project is licensed under the [MIT License](LICENSE).
