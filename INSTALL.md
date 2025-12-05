# 📸 Image Displayer Controller – Komplettes Installations- & Setup-Handbuch

Dieses Dokument führt dich **Schritt für Schritt** von einem **leeren Tiny-PC** bis zur **fertig laufenden Image-Display-Installation**.

Du brauchst:

- Einen Tiny-PC (z. B. Lenovo ThinkCentre oder HP Mini)
- Einen zweiten PC/Laptop für ISO-Download & GitHub
- Einen USB-Stick (mind. 8 GB)

---

## 🧩 Teil 1 – Ubuntu auf dem Tiny-PC installieren

> Kurz-Anleitung für Ubuntu Desktop (z. B. 24.04 LTS).  
> Details siehe offizielle Ubuntu-Dokumentation.

1. **Ubuntu ISO herunterladen**  
   ubuntu.com → *Download* → *Ubuntu Desktop LTS*  
   (z. B. `ubuntu-24.04-desktop-amd64.iso`)

2. **Boot-Stick erstellen**  
   - macOS: balenaEtcher  
   - Windows: Rufus  
   ISO auswählen → USB-Stick auswählen → Flash/Start

3. **Tiny-PC vorbereiten**
   - Monitor, Tastatur, Maus anschließen  
   - USB-Stick einstecken

4. **Vom USB-Stick booten**
   - Bootmenü: `F12`, `F2`, `DEL`  

5. **Ubuntu installieren**
   - „Install Ubuntu“  
   - Sprache/Tastatur: Deutsch  
   - „Normale Installation“  
   - Updates optional  
   - Festplatte löschen & installieren  
   - Benutzername: z. B. `kohlmann`

6. **Neustart → USB entfernen**

---

## 🌐 Teil 1.5 – Tiny-PC ins lokale WLAN/LAN bringen

### WLAN verbinden (Terminal)

```bash
nmcli dev wifi list
nmcli dev wifi connect "<SSID>" password "<PASSWORT>"
hostname -I
```

Wenn du eine IP wie `192.168.178.xxx` siehst → passt.

### LAN

Kabel einstecken → funktioniert automatisch.

Optional DHCP reset:

```bash
nmcli connection modify "Wired connection 1" ipv4.method auto
nmcli connection up "Wired connection 1"
```

---

## 🔑 Teil 1.6 – SSH aktivieren

```bash
sudo apt update
sudo apt install -y openssh-server
systemctl status ssh
```

---

## 🔌 Teil 1.7 – Vom Mac/PC verbinden

### macOS / Linux:

```bash
ssh kohlmann@192.168.178.xx
```

### Windows (PuTTY):

Host: `kohlmann@192.168.178.xx`  
Port: `22`

---

## 🔒 Teil 1.8 – Optional: Internet blockieren, LAN erlauben

```bash
sudo apt install -y ufw
sudo ufw default deny outgoing
sudo ufw default deny incoming
sudo ufw allow from 192.168.0.0/16
sudo ufw allow out to 192.168.0.0/16
sudo ufw enable
```

Für Updates:  
`sudo ufw disable` → danach wieder aktivieren.

---

## 🌐 Teil 2 – Projekt klonen

```bash
mkdir -p ~/projects
cd ~/projects

git clone https://github.com/kohlmann-dominik/image-displayer-controller.git imagedisplayer
cd imagedisplayer
```

Struktur:

```
~/projects/imagedisplayer/backend
~/projects/imagedisplayer/frontend
```

---

## ⚙️ Teil 3 – Backend installieren & builden

```bash
cd ~/projects/imagedisplayer/backend
npm install
npm run build
```

Ergebnis:

```
backend/dist/server.js
```

---

## 🏗 Teil 4 – Frontend installieren & builden

```bash
cd ~/projects/imagedisplayer/frontend
npm install
npm run build
```

Output:

```
frontend/dist/
```

---

## 🌐 Teil 5 – Frontend per Nginx ausliefern

### 5.1 Nginx installieren

```bash
sudo apt install -y nginx
```

### 5.2 Frontend-Build deployen

```bash
cd ~/projects/imagedisplayer/frontend
npm run build

sudo mkdir -p /var/www/imagedisplayer-frontend
sudo rsync -av --delete dist/ /var/www/imagedisplayer-frontend/
sudo systemctl reload nginx
```

### 5.3 Nginx-Konfiguration

**/etc/nginx/sites-available/imagedisplayer.conf**

```nginx
server {
    listen 80;
    server_name _;

    root /var/www/imagedisplayer-frontend;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API Proxy → Node.js Port 4000
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
    }

    # WebSocket Proxy
    location /ws {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
    }
}
```

Aktivieren:

```bash
sudo ln -s /etc/nginx/sites-available/imagedisplayer.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## ▶️ Teil 6 – Backend starten & testen

### 6.1 Manuell starten

```bash
cd ~/projects/imagedisplayer/backend
npm start
```

Backend läuft unter:

```
http://0.0.0.0:4000
```

### 6.2 Test auf dem Tiny-PC

```text
http://localhost/
```

= Vue-Frontend via Nginx

### 6.3 Test von Handy/iPad/Mac

```text
http://192.168.178.xx/
```

Frontend  
→ verwendet automatisch die API & WebSockets auf Port 4000

---

## ▶️ Teil 7 – Backend als systemd-Service

**/etc/systemd/system/imagedisplayer.service**

```ini
[Unit]
Description=Image Displayer Backend
After=network.target

[Service]
Type=simple
User=kohlmann
WorkingDirectory=/home/kohlmann/projects/imagedisplayer/backend
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Aktivieren & starten:

```bash
sudo systemctl daemon-reload
sudo systemctl enable imagedisplayer
sudo systemctl start imagedisplayer
sudo systemctl status imagedisplayer
```

---

## ✅ Fertig!

Du hast jetzt:

- Ubuntu frisch installiert  
- WLAN/LAN + SSH eingerichtet  
- Repo geklont  
- Backend & Frontend installiert  
- Frontend per Nginx deployed  
- Backend per systemd als Service eingerichtet  
- Zugriff im gesamten Heimnetz
