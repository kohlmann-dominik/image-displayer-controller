# 📸 Image Displayer Controller – Komplettes Installations- & Setup‑Handbuch

Dieses Dokument führt dich **Schritt für Schritt** von einem **leeren Tiny‑PC** bis zur **fertig laufenden Image‑Display‑Installation**.

Du brauchst:

- Einen Tiny‑PC (z. B. Lenovo ThinkCentre M710q)
- Einen zweiten PC/Laptop für den USB‑Stick & GitHub
- Einen USB‑Stick (mind. 8 GB)

---

## 🧩 Teil 1 – Ubuntu auf dem Tiny‑PC installieren

> Dies ist eine **Kurz-Anleitung** für Ubuntu Desktop (z. B. 24.04 LTS).  
> Im Zweifel immer die offiziellen Ubuntu‑Anleitungen verwenden.

1. **Ubuntu ISO herunterladen**  
   - Am Laptop/PC auf ubuntu.com → *Download* → *Ubuntu Desktop LTS*  
   - ISO‑Datei speichern (z. B. `ubuntu-24.04-desktop-amd64.iso`)

2. **Boot‑Stick erstellen (z. B. auf macOS)**  
   - „balenaEtcher“ oder „Rufus“ (Windows) installieren  
   - Tool starten → ISO auswählen → USB‑Stick auswählen → „Flash“/„Start“

3. **Tiny‑PC vorbereiten**  
   - Tiny‑PC ausschalten  
   - Monitor, Tastatur, Maus anschließen  
   - USB‑Stick einstecken

4. **Vom USB‑Stick booten**  
   - Tiny‑PC einschalten und **Boot‑Menü‑Taste** drücken (oft `F12`, `F2` oder `DEL`)  
   - USB‑Stick als Boot‑Medium wählen

5. **Ubuntu installieren**  
   - „Try or Install Ubuntu“ → „Install Ubuntu“  
   - Sprache: Deutsch  
   - Tastaturlayout: Deutsch  
   - Installationstyp: „Normale Installation“  
   - Updates & Drittanbieter‑Software: **nicht auswählen, da kein Internet**  
   - Festplattenauswahl: Für den Tiny‑PC meist „Festplatte löschen und Ubuntu installieren“  
   - Benutzername & Passwort vergeben (z. B. Benutzer `display`)

6. **Neustart**  
   - Nach Abschluss → neu starten, USB‑Stick entfernen  
   - Mit deinem Benutzer am frisch installierten Ubuntu anmelden

---

## 🌐 Teil 1.5 – Tiny‑PC ins lokale WLAN/LAN bringen (ULTRA-EINFACH)

Damit dein Tablet & dein Mac später den Image‑Displayer erreichen können, musst du den Tiny‑PC ins **lokale Heimnetzwerk** bringen.  
Wir machen das **so simpel wie möglich**, aber **Shell-basiert**, damit du gleichzeitig Linux‑Praxis bekommst.

### 🟦 WLAN verbinden (Shell)
1. Verfügbare WLANs anzeigen:
   ```bash
   nmcli dev wifi list
   ```
2. Verbinden:
   ```bash
   nmcli dev wifi connect "<SSID>" password "<WLAN_Passwort>"
   ```
3. Prüfen:
   ```bash
   nmcli connection show
   hostname -I
   ```

Wenn du eine IP wie `192.168.x.x` siehst → perfekt.

---

### 🟩 LAN (Ethernet) verwenden
Kabel anstecken → funktioniert sofort.

Manuell (optional):

**DHCP:**
```bash
nmcli connection modify "Wired connection 1" ipv4.method auto
nmcli connection up "Wired connection 1"
```

**Statische IP (optional):**
```bash
nmcli connection modify "Wired connection 1" ipv4.method manual ipv4.addresses 192.168.0.50/24 ipv4.gateway 192.168.0.1 ipv4.dns 192.168.0.1
nmcli connection up "Wired connection 1"
```

---

## 🔑 Teil 1.6 – SSH aktivieren (für Mac Terminal / Windows PuTTY)

### Installieren (mit Internet):
```bash
sudo apt update
sudo apt install openssh-server
```

### Installieren (OHNE Internet – offline)
1. Am Haupt-PC `openssh-server_*.deb` herunterladen  
2. Per USB oder SCP auf den Tiny‑PC kopieren  
3. Dann installieren:
   ```bash
   sudo dpkg -i openssh-server*.deb
   sudo apt --fix-broken install
   ```

### Prüfen:
```bash
systemctl status ssh
```

---

## 🔌 Teil 1.7 – Vom Mac oder Windows aus verbinden

### Mac:
```bash
ssh display@192.168.0.50
```
oder:
```bash
ssh -i ~/.ssh/id_ed25519 display@192.168.0.50
```

### Windows (PuTTY):
- Hostname: `display@192.168.0.50`
- Port: `22`
- „Open“

---

## 🔒 Teil 1.8 – Optional: Internet deaktivieren, LAN erlauben (Firewall)

Wenn der Tiny‑PC **nur** im lokalen Netzwerk erreichbar sein soll:

```bash
sudo apt install ufw
sudo ufw default deny outgoing
sudo ufw default deny incoming
sudo ufw allow from 192.168.0.0/16
sudo ufw allow out to 192.168.0.0/16
sudo ufw enable
```

Damit:
- ❌ kein Internet  
- ✔️ erreichbar im Heimnetz für Handy/Tablet/Mac  
- ✔️ sicher & abgeschottet

---

## 🌐 Teil 2 – Vorbereitung auf dem Haupt-PC (ohne Internet auf Tiny-PC)

Da der Tiny‑PC **kein Internet** hat, bereiten wir alle benötigten Dateien auf deinem Haupt-PC vor.

1. **Repository herunterladen**  
   - Klone das Repository auf deinem Haupt-PC (mit Internetzugang):
     ```bash
     git clone https://github.com/kohlmann-dominik/image-displayer-controller.git
     ```
   - Alternativ kannst du das Repo auf GitHub als ZIP herunterladen und entpacken.

2. **Node-Module für Backend und Frontend herunterladen**  
   - Wechsle in den Backend-Ordner und lade die Node-Module:
     ```bash
     cd image-displayer-controller/backend
     npm install
     ```
   - Wechsle in den Frontend-Ordner und lade die Node-Module:
     ```bash
     cd ../frontend
     npm install
     ```

3. **Optional: Node.js Installer herunterladen**  
   - Lade den Node.js LTS Installer als `.deb`-Paket von https://nodejs.org/en/download/ herunter, passend zu deiner Ubuntu-Version und Architektur.  
   - Speichere die Datei, um sie später auf den Tiny-PC zu übertragen.  
   - Alternativ kannst du Node.js offline per `.deb`-Paket oder lokalem Installer installieren.

---

## 🔄 Teil 3 – Dateien auf den Tiny-PC übertragen

Übertrage nun das vorbereitete Projekt und Node.js Installer auf den Tiny-PC.

1. **Dateien kopieren mit SCP**  
   - Vom Haupt-PC aus kannst du die Dateien mit `scp` auf den Tiny-PC übertragen. Beispiel:
     ```bash
     scp -r image-displayer-controller display@<TINY-PC-IP>:/home/display/
     scp node-vXX.X.X-linux-x64.deb display@<TINY-PC-IP>:/home/display/
     ```
   - Ersetze `<TINY-PC-IP>` durch die IP-Adresse des Tiny-PCs im lokalen Netzwerk.  
   - Stelle sicher, dass SSH auf dem Tiny-PC aktiviert ist und du Zugriff hast.

2. **Node.js offline installieren**  
   - Melde dich per SSH oder direkt am Tiny-PC an.  
   - Installiere Node.js mit dem übertragenen `.deb`-Paket:
     ```bash
     sudo dpkg -i node-vXX.X.X-linux-x64.deb
     sudo apt-get install -f
     ```
   - Prüfe die Installation:
     ```bash
     node -v
     npm -v
     ```

3. **Git installieren (offline)**  
   - Wenn Git noch nicht installiert ist, kannst du es über die Ubuntu-Installations-USB oder lokale Paketquellen installieren:  
     ```bash
     sudo apt install git
     ```
   - Dies benötigt keine Internetverbindung, wenn die Ubuntu-Installation bereits die Paketquellen enthält.

---

## ⚙️ Teil 4 – Projekt installieren (Backend & Frontend)

Wir gehen davon aus, dass du jetzt im Projektordner bist:

```bash
cd ~/image-displayer-controller
```

### 4.1 Backend installieren

```bash
cd backend
# Node modules sind bereits vorhanden, kein npm install nötig
```

> Die Node-Module wurden bereits auf dem Haupt-PC heruntergeladen und übertragen.

### 4.2 Frontend installieren

```bash
cd ../frontend
# Node modules sind bereits vorhanden, kein npm install nötig
```

> Die Node-Module wurden bereits auf dem Haupt-PC heruntergeladen und übertragen.

---

## 🏗 Teil 5 – Frontend builden & mit Backend verbinden

1. **Frontend builden**
   ```bash
   cd ~/image-displayer-controller/frontend
   npm run build
   ```

   Danach liegt der fertige Build in:
   ```bash
   ~/image-displayer-controller/frontend/dist/
   ```

2. **Build in das Backend kopieren**

   ```bash
   cd ~/image-displayer-controller
   mkdir -p backend/public/app
   cp -r frontend/dist/* backend/public/app/
   ```

   Damit kann das Backend die gebaute Vue‑App statisch unter `/app` ausliefern.

---

## ▶️ Teil 6 – Backend starten & Funktion testen

1. **Backend starten**
   ```bash
   cd ~/image-displayer-controller/backend
   npm start
   ```

   Der Server läuft standardmäßig auf Port `5000`.

2. **Aufruf im Browser am Tiny‑PC**

   - Browser öffnen (Firefox/Chrome)  
   - Adresse eingeben:
     ```text
     http://localhost:5000/app/
     ```
   - Die ControlView sollte erscheinen, du kannst Szenen hochladen und die Display‑Ansicht testen.

3. **Aufruf von einem anderen Gerät im WLAN**

   1. IP des Tiny‑PC herausfinden:
      ```bash
      hostname -I
      ```
      Beispiel-Ausgabe: `192.168.0.42`

   2. Am Handy/Tablet im gleichen WLAN im Browser:
      ```text
      http://192.168.0.42:5000/app/
      ```

---

## 🔁 Teil 7 – Autostart auf dem Tiny‑PC mit systemd

Damit der Backend‑Server nach einem Neustart automatisch startet, richtest du einen systemd‑Dienst ein.

1. **service‑Datei anlegen**
   ```bash
   sudo nano /etc/systemd/system/image-displayer.service
   ```

2. **Folgenden Inhalt einfügen (Benutzer anpassen)**

   ```ini
   [Unit]
   Description=Image Displayer Controller
   After=network.target

   [Service]
   Type=simple
   User=DEIN_UBUNTU_BENUTZERNAME
   WorkingDirectory=/home/DEIN_UBUNTU_BENUTZERNAME/image-displayer-controller/backend
   ExecStart=/usr/bin/npm start
   Restart=on-failure
   Environment=NODE_ENV=production

   [Install]
   WantedBy=multi-user.target
   ```

   - `DEIN_UBUNTU_BENUTZERNAME` durch deinen echten Benutzer ersetzen  
     (z. B. `display` oder `dominikkohlmann`)

3. **Dienst aktivieren & starten**

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable image-displayer
   sudo systemctl start image-displayer
   ```

4. **Status prüfen**

   ```bash
   systemctl status image-displayer
   ```

   Wenn alles ok ist, sollte der Service als „active (running)“ angezeigt werden.

---

## 🔒 Teil 8 – Optional: Internet nach der Installation wieder kappen

Wenn der Tiny‑PC nur im lokalen Netzwerk erreichbar sein soll:

### Variante sehr simpel

- **Ethernet‑Kabel abstecken**  
- Wi‑Fi deaktivieren (falls vorhanden) über das Netzwerk‑Symbol oben rechts

Dann ist der PC nur noch über direkt verbundene Netzwerke erreichbar (z. B. später wieder per Kabel oder über ein isoliertes WLAN/VLAN, wenn du das einrichtest).

### Variante mit Firewall (ufw) – LAN erlauben, Internet blocken

> Nur nutzen, wenn du dich mit Netzwerk & Firewall ein wenig wohl fühlst.

1. **ufw installieren**
   ```bash
   sudo apt install -y ufw
   ```

2. **Standard: alles blocken**
   ```bash
   sudo ufw default deny outgoing
   sudo ufw default deny incoming
   ```

3. **Lokales Netz freigeben (Beispiel 192.168.0.0/16)**
   ```bash
   sudo ufw allow from 192.168.0.0/16
   sudo ufw allow out to 192.168.0.0/16
   ```

4. **Firewall aktivieren**
   ```bash
   sudo ufw enable
   ```

Damit:

- ist der Tiny‑PC **innerhalb deines Heimnetzwerks** erreichbar  
- hat aber **keinen direkten Zugriff mehr ins Internet**

---

## 🧹 Teil 9 – Medien & Git (Hinweis)

Im Projekt werden Bilder/Videos **nicht** versioniert, nur die Ordnerstruktur:

- `backend/public/images/`
- `backend/public/images/thumbnails/`

Dafür liegen `.gitkeep`‑Dateien in den Ordnern. In deiner `.gitignore` sind Medien bereits ausgeschlossen.

---

## ✅ Fertig!

Du hast jetzt:

- Ubuntu auf dem Tiny‑PC installiert  
- Node.js, Git & alle Dependencies eingerichtet  
- Das `image-displayer-controller`‑Projekt geklont  
- Frontend gebaut und ins Backend integriert  
- Einen Autostart‑Service konfiguriert  
- Optional den Internetzugang wieder eingeschränkt

Damit ist dein Image Displayer Controller sauber reproduzierbar und auf jedem neuen Gerät installierbar.