# Complete Deployment Guide — MyShop E-Commerce

## 🔎 Step 0 — AWS Security Group (do this first)

EC2 Console → your instance → **Security** tab → Security Group → **Inbound rules** → **Edit**:

| Type  | Port | Source         |
|-------|------|----------------|
| SSH   | 22   | My IP          |
| HTTP  | 80   | 0.0.0.0/0      |
| HTTPS | 443  | 0.0.0.0/0      |

Save. **Do NOT open 3000 or 3306.**

---

## 🖥️ Step 1 — SSH In and Confirm Public IP

```bash
ssh -i ~/Downloads/<your-key>.pem ubuntu@<EC2_PUBLIC_IP>

# On the server
curl -s ifconfig.me; echo
```

Note the output — this is your `<EC2_PUBLIC_IP>` for every step below.

---

## 📦 Step 2 — Install Node.js 20, MySQL, Nginx, Build Tools

```bash
sudo apt update && sudo apt upgrade -y

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v      # v20.x.x
npm -v       # 10.x.x

# MySQL
sudo apt install -y mysql-server
sudo systemctl enable --now mysql

# Nginx
sudo apt install -y nginx
sudo systemctl enable --now nginx

# Build tools for native modules (bcrypt etc.)
sudo apt install -y build-essential python3

# Confirm
mysql --version
nginx -v
systemctl is-active mysql nginx    # both "active"
```

---

## 🗄️ Step 3 — Secure MySQL

```bash
sudo mysql_secure_installation
```

Answers:
- VALIDATE PASSWORD COMPONENT: **Y**
- Password policy: **2** (STRONG)
- Set root password — **choose your own strong password, save it in a password manager**
- Remove anonymous users: **Y**
- Disallow root login remotely: **Y**
- Remove test database: **Y**
- Reload privilege tables: **Y**

---

## 🗄️ Step 4 — Create Database and User

```bash
sudo mysql
```

Inside the MySQL prompt (**choose your own strong password**):

```sql
CREATE DATABASE IF NOT EXISTS ecommerce_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'ecommerce_user'@'localhost'
  IDENTIFIED BY '<SET_A_STRONG_PASSWORD_HERE>';

GRANT ALL PRIVILEGES ON ecommerce_db.* TO 'ecommerce_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Test:

```bash
mysql -u ecommerce_user -p ecommerce_db -e "SHOW TABLES;"
```

(Empty result is fine — tables come in the next step.)

---

## 📤 Step 5 — Get the Project onto the Server

**Preferred — clone from GitHub:**

```bash
cd /home/ubuntu
git clone https://github.com/Narenrohitha/Ecommerce_Site_Code.git Ecommerce_Site_Code
cd Ecommerce_Site_Code
ls -la
```

You should see: `README.md`, `config/`, `database/`, `middleware/`, `package.json`, `public/`, `routes/`, `server.js`, `views/`.

**Alternative — scp from your laptop:**

```bash
scp -i ~/Downloads/<your-key>.pem -r ~/Downloads/Ecommerce_Site_Code ubuntu@<EC2_PUBLIC_IP>:/home/ubuntu/
```

---

## 🗃️ Step 6 — Load the Database Schema

```bash
cd /home/ubuntu/Ecommerce_Site_Code
mysql -u ecommerce_user -p ecommerce_db < database/schema.sql
```

Verify:

```bash
mysql -u ecommerce_user -p ecommerce_db -e "SHOW TABLES;"
```

Expected: `users`, `categories`, `products`, `orders`, `order_items`, `sessions` (and possibly `cart`).

**If it errors**, paste the error — MySQL 8 sometimes needs tweaks for old `schema.sql` files.

---

## ⚙️ Step 7 — Create and Fill `.env`

```bash
cd /home/ubuntu/Ecommerce_Site_Code
cp .env.example .env
nano .env
```

Paste, then **replace every `<…>` placeholder with a real value you generate yourself**:

```env
# Server
NODE_ENV=production
PORT=3000
APP_URL=http://<EC2_PUBLIC_IP>

# MySQL
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=ecommerce_user
DB_PASSWORD=<SET_A_STRONG_PASSWORD_HERE>
DB_NAME=ecommerce_db

# Session
SESSION_SECRET=<PASTE_GENERATED_HEX_HERE>

# Admin bootstrap (created on first start — change the password after first login)
ADMIN_EMAIL=<your-admin-email>
ADMIN_PASSWORD=<SET_A_STRONG_PASSWORD_HERE>
ADMIN_NAME=Admin
```

Generate `SESSION_SECRET` **in a second shell** (or before opening nano):

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Copy the output → paste after `SESSION_SECRET=`.

Save: `Ctrl+O`, `Enter`, `Ctrl+X`. Then:

```bash
chmod 600 .env
```

> ⚠️ `.env` is already in `.gitignore` — never commit it.

---

## 📥 Step 8 — Install Dependencies

```bash
cd /home/ubuntu/Ecommerce_Site_Code
npm install --production
```

If `bcrypt` (or any native module) fails:

```bash
sudo apt install -y build-essential python3
npm install --production
```

---

## 🧪 Step 9 — Test the App Manually (Do Not Skip)

```bash
cd /home/ubuntu/Ecommerce_Site_Code
node server.js
```

Expected output (something like):

```
DB connected
Session store ready
Server listening on port 3000
```

**In a second SSH session:**

```bash
curl -I http://localhost:3000/
curl http://localhost:3000/ | head -20
```

- First → `HTTP/1.1 200 OK` or `302 Found`
- Second → HTML

**If it crashed**, the error tells you exactly what's wrong:

| Error | Fix |
|-------|-----|
| `Access denied for user 'ecommerce_user'` | Wrong `DB_PASSWORD` in `.env` |
| `Unknown database 'ecommerce_db'` | Re-run Step 4 |
| `Table 'ecommerce_db.users' doesn't exist` | Re-run Step 6 |
| `Cannot find module 'xyz'` | Re-run `npm install --production` |
| `listen EADDRINUSE` | Something else on 3000 — `sudo lsof -i :3000` |

Stop the app with `Ctrl+C` in the first session.

---

## 🔄 Step 10 — Run With PM2

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the app
cd /home/ubuntu/Ecommerce_Site_Code
pm2 start server.js --name myshop

# Verify
pm2 status          # myshop should be "online"
pm2 logs myshop --lines 30 --nostream

# Persist across reboots
pm2 save
pm2 startup
```

`pm2 startup` prints a line like:

```
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

**Copy and run that exact line.** Then verify:

```bash
systemctl status pm2-ubuntu | head -5     # active (running)
pm2 status                                 # myshop online
```

⚠️ **Rule from last time:** never run `pm2 start` in a plain shell after this. To change the app later, use `pm2 restart myshop` or `pm2 reload myshop`, then `pm2 save`.

---

## 🌐 Step 11 — Nginx Reverse Proxy

```bash
sudo nano /etc/nginx/sites-available/myshop
```

Paste (**replace `<EC2_PUBLIC_IP>` with your actual public IP**):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name <EC2_PUBLIC_IP>;

    access_log /var/log/nginx/myshop-access.log;
    error_log  /var/log/nginx/myshop-error.log;

    client_max_body_size 10M;

    # Static assets served by Nginx directly
    location /css/ {
        alias /home/ubuntu/Ecommerce_Site_Code/public/css/;
        expires 7d;
        access_log off;
    }

    location /uploads/ {
        alias /home/ubuntu/Ecommerce_Site_Code/public/uploads/;
        expires 30d;
        access_log off;
    }

    # Everything else → Node.js
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

Save, then enable:

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/myshop /etc/nginx/sites-enabled/myshop
sudo nginx -t
sudo systemctl reload nginx
```

---

## 🔥 Step 12 — UFW Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status
```

---

## ✅ Step 13 — Test the Full Stack

From the server:

```bash
curl -I http://localhost
curl -I http://localhost/login
```

Both should return `HTTP/1.1 200 OK`.

From your browser:

```
http://<EC2_PUBLIC_IP>
```

You should see the e-commerce homepage.

**Admin flow test:**

1. `http://<EC2_PUBLIC_IP>/login`
2. Log in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set in `.env`
3. `http://<EC2_PUBLIC_IP>/admin/dashboard` — stats appear
4. `/admin/categories` — add a category
5. `/admin/products/new` — add a product with image
6. Customer flow: register → browse → add to cart → checkout (COD) → confirm order at `/admin/orders`

---

## 🔐 Step 14 — Verify Persistence Across Reboot

```bash
sudo reboot
```

Wait ~30 seconds, SSH back in:

```bash
pm2 status                     # myshop online
systemctl status pm2-ubuntu    # active (running)
curl -I http://localhost       # 200 OK
```

If all three pass, the app survives reboots.

---

## 🔁 Step 15 — Updating the App Later

On your laptop:

```bash
cd ~/Downloads/Ecommerce_Site_Code
git add .
git commit -m "Describe your change"
git push
```

On the server:

```bash
cd /home/ubuntu/Ecommerce_Site_Code
git pull
npm install --production
pm2 restart myshop
```

---

## 🩺 Troubleshooting Quick Reference

**502 Bad Gateway**
```bash
pm2 status
pm2 logs myshop --lines 30 --nostream
sudo tail -20 /var/log/nginx/myshop-error.log
```

**Unstyled page (no CSS)**
```bash
curl -I http://<EC2_PUBLIC_IP>/css/style.css
ls -la /home/ubuntu/Ecommerce_Site_Code/public/css/
```

**403 on uploads**
```bash
chmod -R 755 /home/ubuntu/Ecommerce_Site_Code/public/uploads/
```

**DB errors**
```bash
mysql -u ecommerce_user -p ecommerce_db -e "SHOW TABLES;"
pm2 logs myshop --lines 50 --nostream | grep -i -E "mysql|db|error"
```

**Verify port 3000 not exposed publicly** (should time out from outside, work on localhost):
```bash
curl -I http://localhost:3000    # works
```
