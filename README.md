# MyShop — E-Commerce Website (No Payment Gateway / Cash on Delivery)

A full-stack e-commerce site built with **Node.js, Express, MySQL, and EJS**.
No payment gateway is integrated — checkout is **Cash on Delivery (COD)** only.

## Features
- Customer: register/login, browse products by category, search, product detail,
  cart, checkout (COD), order history
- Admin panel: dashboard with stats, product CRUD with image upload, category CRUD,
  order status management
- MySQL-backed sessions (persist across server restarts)
- Stock is checked and decremented on order placement (using a DB transaction)

## Tech Stack
- Node.js + Express
- MySQL (via `mysql2`)
- EJS templates + Bootstrap 5 (CDN)
- express-session + express-mysql-session
- bcryptjs for password hashing
- multer for product image uploads

---

## 1. Local project structure

```
ecommerce-app/
├── package.json
├── .env.example
├── server.js
├── config/db.js
├── database/schema.sql
├── middleware/auth.js
├── routes/ (auth, products, cart, orders, admin)
├── public/ (css, uploads)
└── views/ (EJS templates, including views/admin/*)
```

---

## 2. Deploying on a fresh AWS EC2 Ubuntu server

These steps assume **Ubuntu 22.04 / 24.04** on an EC2 instance, and that you already
have SSH access (`ssh -i your-key.pem ubuntu@your-ec2-ip`).

### Step 1 — Launch & secure the EC2 instance
1. Launch an Ubuntu EC2 instance (t2.small/t3.small or larger recommended).
2. In the instance's **Security Group**, open these inbound ports:
   - `22` (SSH) — your IP only
   - `80` (HTTP) — 0.0.0.0/0
   - `443` (HTTPS) — 0.0.0.0/0 (if you'll add SSL)
   - Do **not** expose port `3000` or `3306` publicly.

### Step 2 — Update the server & install Node.js
```bash
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

### Step 3 — Install and secure MySQL
```bash
sudo apt install -y mysql-server
sudo systemctl enable mysql
sudo systemctl start mysql

# Secure the installation (set root password, remove test DB, etc.)
sudo mysql_secure_installation
```

Create the application database and a dedicated MySQL user:
```bash
sudo mysql -u root -p
```
Inside the MySQL prompt:
```sql
CREATE DATABASE ecommerce_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'ecommerce_user'@'localhost' IDENTIFIED BY 'YOUR_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON ecommerce_db.* TO 'ecommerce_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### Step 4 — Upload the project to the server
From your local machine (where you extracted this project):
```bash
scp -i your-key.pem -r ecommerce-app ubuntu@your-ec2-ip:/home/ubuntu/
```
Or use `git clone` if you push this project to your own repository.

### Step 5 — Import the database schema
```bash
cd /home/ubuntu/ecommerce-app
mysql -u ecommerce_user -p ecommerce_db < database/schema.sql
```

### Step 6 — Configure environment variables
```bash
cp .env.example .env
nano .env
```
Fill in real values, especially:
```
DB_USER=ecommerce_user
DB_PASSWORD=YOUR_STRONG_PASSWORD
DB_NAME=ecommerce_db
SESSION_SECRET=<generate a long random string>
ADMIN_EMAIL=you@yourdomain.com
ADMIN_PASSWORD=<a strong password>
```
The admin account in `.env` is created automatically the first time the app starts.

### Step 7 — Install dependencies
```bash
cd /home/ubuntu/ecommerce-app
npm install --production
```

### Step 8 — Test run
```bash
node server.js
```
Visit `http://your-ec2-ip:3000` briefly to confirm it works, then stop it (Ctrl+C).
You should be able to log in at `/login` with the admin credentials from `.env`.

### Step 9 — Run the app permanently with PM2
```bash
sudo npm install -g pm2
cd /home/ubuntu/ecommerce-app
pm2 start server.js --name myshop
pm2 save
pm2 startup   # run the command it prints, to enable startup on reboot
```
Useful PM2 commands:
```bash
pm2 status
pm2 logs myshop
pm2 restart myshop
```

### Step 10 — Install & configure Nginx as a reverse proxy
```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/myshop
```
Paste:
```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;   # or your EC2 public IP

    client_max_body_size 10M;

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
    }
}
```
Enable it:
```bash
sudo ln -s /etc/nginx/sites-available/myshop /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```
Now the site is reachable on port 80 at your domain or EC2 public IP.

### Step 11 — (Recommended) Enable free HTTPS with Let's Encrypt
Only if you have a real domain name pointed at the server:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```
Certbot edits your Nginx config automatically and sets up auto-renewal.

### Step 12 — Firewall (optional, if using ufw)
```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

---

## 3. Post-deployment checklist
- [ ] Log in to `/admin/dashboard` with the admin account from `.env`
- [ ] Add categories at `/admin/categories`
- [ ] Add products with images at `/admin/products/new`
- [ ] Place a test order as a customer and confirm it appears in `/admin/orders`
- [ ] Change `ADMIN_PASSWORD` after first login if desired, and rotate `SESSION_SECRET`
- [ ] Set up regular MySQL backups (`mysqldump`) — see below

## 4. Backing up the database
```bash
mysqldump -u ecommerce_user -p ecommerce_db > backup_$(date +%F).sql
```
Consider a cron job to automate this and copy backups to S3.

## 5. Updating the app later
```bash
cd /home/ubuntu/ecommerce-app
git pull            # or re-upload changed files
npm install --production
pm2 restart myshop
```

## 6. Notes on "no payment gateway"
- Checkout only supports **Cash on Delivery**. `orders.payment_method` is stored as `cod`.
- If you later want to add a real gateway (Stripe, Razorpay, PayPal, etc.), you'd add
  a new route/integration in `routes/orders.js` and update the checkout view — this
  build intentionally leaves that out per your request.
