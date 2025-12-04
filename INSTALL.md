## 🏗 Teil 5 – Frontend builden & mit Backend verbinden

1. **Frontend builden**
   ```bash
   cd ~/projects/imagedisplayer/frontend
   npm run build
   ```

   Danach liegt der fertige Build in:
   ```bash
   ~/projects/imagedisplayer/frontend/dist/
   ```

2. **Build nach /var/www deployen (Nginx)**

   Da das Frontend über Nginx ausgeliefert wird, wird der Build nach /var/www/imagedisplayer-frontend/ synchronisiert.

   ```bash
   cd ~/projects/imagedisplayer/frontend
   npm run build

   sudo rsync -av --delete dist/ /var/www/imagedisplayer-frontend/
   sudo systemctl reload nginx
   ```

---

## ▶️ Teil 6 – Backend starten & Funktion testen

1. **Backend starten**
   ```bash
   cd ~/image-displayer-controller/backend
   npm start
   ```

   Der Server läuft standardmäßig auf Port `4000`.

2. **Aufruf im Browser am Tiny‑PC**

   - Browser öffnen (Firefox/Chrome)  
   - Adresse eingeben:
     ```text
     http://localhost:4000
     ```
   - Die ControlView sollte erscheinen, du kannst Szenen hochladen und die Display‑Ansicht testen.

   Hinweis: Das eigentliche Frontend erreichst du über Nginx unter `/`. Der Backend-Server läuft auf Port 4000 und stellt die API bereit.

3. **Aufruf von einem anderen Gerät im WLAN**

   1. IP des Tiny‑PC herausfinden:
      ```bash
      hostname -I
      ```
      Beispiel-Ausgabe: `192.168.0.42`

   2. Am Handy/Tablet im gleichen WLAN im Browser:
      ```text
      http://192.168.0.42:4000
      ```